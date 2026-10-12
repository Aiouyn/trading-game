import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { defaultConfig } from './config';
import { halfSpread, impact, liquidationEquity, marginalImpact, openAccount, permanentMove, placeOrder } from './trading';
import type { WorldState } from './types';

/**
 * Shared permanent-impact tally (Ledger, 2026-10-09): permanent impact is charged on the ASSET's notional traded
 * today per side across ALL accounts, so one order, N accounts and 720 clips of the same total lift the price the
 * same, and a whale plus an alt can't beat one account trading the same total.
 * Tolerances: same-tick splits across accounts, |ratio - 1| <= 0.01 (orders in one tick differ only in their
 * per-order temporary impact, which moves the notional, not the curve); 720 clips over a day, |ratio - 1| <= 0.05
 * (the pull to value decays early clips during the day: 0.979 on SYN).
 */
const cfg = defaultConfig(); // 720 ticks per game day
const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);

/** total units: about $1M, divisible by 7200 for whole-share stocks so Q/2, Q/10, Q/100 and Q/720 are whole */
function units(id: string): number {
  const def = cfg.assets.find((a) => a.id === id)!;
  const u = 1e6 / def.initialPrice;
  return def.qtyStep === 1 ? Math.max(7200, Math.floor(u / 7200) * 7200) : u;
}

/** lift of lnP at the end of game day 0 vs a no-trade world: `accounts` accounts each buy Q/accounts at tick 1,
 *  or (clips) one account sends 720 clips of Q/720, one per tick */
function lift(id: string, accounts: number, clips = false): number {
  const Q = units(id);
  let s = createWorld('tally', cfg);
  let n = createWorld('tally', cfg);
  for (let k = 0; k < accounts; k++) s = openAccount(s, `a${k}`, 3e6);
  const i = idx(s, id);
  for (let t = 0; t < cfg.ticksPerDay; t++) {
    if (clips) s = placeOrder(s, { playerId: 'a0', assetId: id, side: 'buy', type: 'market', qty: Q / 720 }).state;
    else if (t === 0) for (let k = 0; k < accounts; k++) s = placeOrder(s, { playerId: `a${k}`, assetId: id, side: 'buy', type: 'market', qty: Q / accounts }).state;
    s = step(s).state;
    n = step(n).state;
  }
  let held = 0;
  for (const a of Object.values(s.accounts)) held += a.positions[id]?.qty ?? 0;
  expect(held).toBeCloseTo(Q, 6);
  return s.assets[i]!.lnP - n.assets[i]!.lnP;
}

describe('shared impact tally: splitting across accounts or clips saves nothing', () => {
  for (const id of ['SYN', 'AURH']) {
    it(`impact_split_accounts (${id}): one order vs N = 2, 10, 100 accounts vs 720 clips`, { timeout: 120_000 }, () => {
      const one = lift(id, 1);
      expect(one).toBeGreaterThan(0);
      const rows: string[] = [`one ${one.toExponential(4)}`];
      for (const N of [2, 10, 100]) {
        const r = lift(id, N) / one;
        rows.push(`N=${N} ratio ${r.toFixed(4)}`);
        expect(Math.abs(r - 1)).toBeLessThanOrEqual(0.01);
      }
      const c = lift(id, 1, true) / one;
      rows.push(`720 clips ratio ${c.toFixed(4)}`);
      expect(Math.abs(c - 1)).toBeLessThanOrEqual(0.05);
      console.log(`impact_split_accounts ${id}: ${rows.join(', ')}`);
    });
  }

  it('the second account pays the marginal curve on top of the first: D is the asset total, not the account total', () => {
    let s = openAccount(openAccount(createWorld('tally-d', defaultConfig({ ticksPerDay: 24 })), 'A', 1e7), 'B', 1e7);
    const i = idx(s, 'OSTV');
    s = placeOrder(s, { playerId: 'A', assetId: 'OSTV', side: 'buy', type: 'market', qty: 3000 }).state;
    s = step(s).state;
    const dA = s.assets[i]!.dayTraded!.buy;
    s = placeOrder(s, { playerId: 'B', assetId: 'OSTV', side: 'buy', type: 'market', qty: 3000 }).state;
    const r = step(s);
    const noFill = step({ ...s, orders: s.orders.filter((o) => o.status !== 'open') }).state;
    const f = r.fills[0]!;
    expect(f.playerId).toBe('B');
    expect(r.state.assets[i]!.lnP - noFill.assets[i]!.lnP).toBeCloseTo(permanentMove(r.state, i, 'buy', dA, f.qty * f.price), 14);
    expect(r.state.assets[i]!.dayTraded!.buy).toBeCloseTo(dA + f.qty * f.price, 6);
  });

});

/** Whale A buys, alt B buys right after (same asset, same day); both sell out. Compare with ONE account doing the
 *  same orders. Returns profit (cash after exit - cash before) and the best combined liquidation mark. */
function hunt(seed: string, id: string, exitTick: number, accts: [string, string]) {
  const def = cfg.assets.find((a) => a.id === id)!;
  const adv = def.advNotional ?? 1e9;
  const qty = (usd: number) => (def.qtyStep === 1 ? Math.floor(usd / def.initialPrice) : usd / def.initialPrice);
  const qA = qty(0.05 * adv), qB = qty(0.02 * adv);
  const cash = 0.2 * adv;
  let s = createWorld(seed, cfg);
  for (const p of new Set(accts)) s = openAccount(s, p, cash);
  const start = Object.values(s.accounts).reduce((x, a) => x + a.cash, 0);
  let bestLiq = -Infinity, peak = 0;
  const path: number[] = [];
  for (let t = 1; t <= exitTick + 2; t++) {
    if (t === 1) s = placeOrder(s, { playerId: accts[0], assetId: id, side: 'buy', type: 'market', qty: qA }).state;
    if (t === 2) s = placeOrder(s, { playerId: accts[1], assetId: id, side: 'buy', type: 'market', qty: qB }).state;
    if (t === exitTick) s = placeOrder(s, { playerId: accts[0], assetId: id, side: 'sell', type: 'market', qty: qA }).state;
    if (t === exitTick + 1) s = placeOrder(s, { playerId: accts[1], assetId: id, side: 'sell', type: 'market', qty: qB }).state;
    s = step(s).state;
    path.push(s.assets[idx(s, id)]!.lnP);
    const ids = [...new Set(accts)];
    bestLiq = Math.max(bestLiq, ids.reduce((x, p) => x + liquidationEquity(s, p), 0));
    peak = Math.max(peak, ids.reduce((x, p) => x + s.accounts[p]!.peakEquity, 0));
  }
  for (const a of Object.values(s.accounts)) expect(a.positions[id]?.qty ?? 0).toBeCloseTo(0, 6);
  const end = Object.values(s.accounts).reduce((x, a) => x + a.cash, 0);
  return { profit: end - start, bestLiq: bestLiq - start, peak: peak - start, path };
}

describe('whale + alt hunt', () => {
  for (const id of ['SYN', 'AURH']) {
    it(`impact_alt_hunt (${id}): whale A then alt B never beats one account with the same total`, { timeout: 120_000 }, () => {
      for (const seed of ['hunt-1', 'hunt-2', 'hunt-3']) {
        for (const exitTick of [10, 720 + 1]) { // same-day exit, and next game day's open
          const two = hunt(seed, id, exitTick, ['A', 'B']);
          const one = hunt(seed, id, exitTick, ['C', 'C']);
          const tol = 1e-9 * cfgAdv(id);
          console.log(`impact_alt_hunt ${id} ${seed} exit@${exitTick}: realized A+B ${two.profit.toFixed(2)} vs one ${one.profit.toFixed(2)}; best summed liquidation mark ${two.bestLiq.toFixed(2)} vs ${one.bestLiq.toFixed(2)}; summed peaks over start ${two.peak.toFixed(2)} vs ${one.peak.toFixed(2)}`);
          // the price path is the same tick for tick: B's buy pays the marginal curve on top of A's
          expect(two.path).toEqual(one.path);
          // realized profit after selling out can't beat one account with the same total
          expect(two.profit).toBeLessThanOrEqual(one.profit + tol);
          // KNOWN, not an impact leak: liquidationEquity is per account, so two accounts' marks each assume only
          // their own exit and their sum sits above one account selling the whole block (temporary impact is per
          // order). It never turns into realized profit (above), and no peak is above its account's start.
          expect(two.peak).toBeLessThanOrEqual(Math.max(0, two.bestLiq) + tol);
        }
      }
    });
  }
});
function cfgAdv(id: string) { return cfg.assets.find((a) => a.id === id)!.advNotional ?? 1e9; }

/**
 * Temporary impact is charged on the asset's shared same-tick tally (Ledger, 2026-10-09) and, from R-9-1 (Phase 9 rulings),
 * on the shared same-DAY tally of player fills at mid (dayMidTraded). The 3x ADV cap stays on the per-tick tally.
 * Cost = sum over fills of qty * |price - mid| where mid is the tick's pre-trade mid (tickTraded.lnMid):
 * half spread plus temporary impact, all in. Tolerance for same-tick splits: |ratio - 1| <= 0.01.
 */
function sameTick(id: string, accounts: number, ordersEach: number, seed = 'temp') {
  const Q = units(id);
  let s = createWorld(seed, cfg);
  for (let k = 0; k < accounts; k++) s = openAccount(s, `a${k}`, 3e6);
  const per = Q / accounts / ordersEach;
  for (let k = 0; k < accounts; k++) for (let c = 0; c < ordersEach; c++) s = placeOrder(s, { playerId: `a${k}`, assetId: id, side: 'buy', type: 'market', qty: per }).state;
  const r = step(s);
  const i = idx(r.state, id);
  const mid0 = Math.exp(r.state.assets[i]!.tickTraded!.lnMid);
  let qty = 0, cost = 0;
  for (const f of r.fills) { qty += f.qty; cost += f.qty * (f.price - mid0); }
  expect(qty).toBeCloseTo(Q, 6);
  expect(r.fills.length).toBe(accounts * ordersEach);
  return { cost, notional: Q * mid0, state: r.state, i };
}

describe('shared per-tick temporary impact', () => {
  for (const id of ['SYN', 'AURH']) {
    it(`temp_split_same_tick (${id}): one order = N accounts (2, 10, 100) = 720 clips, total temporary cost`, { timeout: 60_000 }, () => {
      const one = sameTick(id, 1, 1);
      const rows = [`one order ${(1e4 * one.cost / one.notional).toFixed(3)} bp`];
      for (const [n, c] of [[2, 1], [10, 1], [100, 1], [1, 720]] as const) {
        const r = sameTick(id, n, c);
        const ratio = r.cost / one.cost;
        rows.push(`${c > 1 ? `${c} clips` : `N=${n}`} ratio ${ratio.toFixed(4)}`);
        expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.01);
      }
      console.log(`temp_split_same_tick ${id}: ${rows.join(', ')}`);
    });
  }

  it('a lone fill prices exactly as before: half spread + impact(q * mid) off the current mid', () => {
    let s = openAccount(createWorld('temp-lone', defaultConfig({ ticksPerDay: 24 })), 'p', 1e7);
    s = placeOrder(s, { playerId: 'p', assetId: 'OSTV', side: 'buy', type: 'market', qty: 3000 }).state;
    const r = step(s);
    const i = idx(r.state, 'OSTV');
    const pre = step({ ...s, orders: [] }).state; // same tick, no fill
    const m = Math.exp(pre.assets[i]!.lnP);
    // to rounding: the fill and the test's formula associate the same terms in a different order (1 ulp apart after F14)
    const want = m * (1 + halfSpread(pre, i) + impact(pre, i, 3000 * m));
    expect(Math.abs(r.fills[0]!.price - want) / want).toBeLessThan(1e-14);
    expect(marginalImpact(pre, i, 0, 3000 * m)).toBe(impact(pre, i, 3000 * m));
  });

  for (const id of ['SYN', 'AURH']) {
    it(`temp_split_across_ticks (${id}): R-9-1, the same total over the 720 ticks of one day pays the same temporary impact as one order`, { timeout: 60_000 }, () => {
      const one = sameTick(id, 1, 1);
      const Q = units(id);
      let s = openAccount(createWorld('temp', cfg), 'a0', 3e6);
      let cost = 0, notional = 0;
      for (let t = 0; t < 720; t++) {
        s = placeOrder(s, { playerId: 'a0', assetId: id, side: 'buy', type: 'market', qty: Q / 720 }).state;
        const r = step(s);
        s = r.state;
        const mid0 = Math.exp(s.assets[idx(s, id)]!.tickTraded!.lnMid);
        for (const f of r.fills) { cost += f.qty * (f.price - mid0); notional += f.qty * mid0; }
      }
      const ratio = (cost / notional) / (one.cost / one.notional);
      console.log(`temp_split_across_ticks ${id}: one order ${(1e4 * one.cost / one.notional).toFixed(3)} bp over mid, 720 ticks ${(1e4 * cost / notional).toFixed(3)} bp, ratio ${ratio.toFixed(4)}`);
      // was ratio < 0.75 (the per-tick tally let a day of clips dodge the impact: about 1/sqrt(720) of one order). R-9-1 charges
      // the day's marginal curve, so the day costs what one order costs. The residue is the mid drifting through the day (each
      // fill's cost is measured against its own mid).
      expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.03);
    });
  }

  it('temp_cap_shared: the 3x ADV per-tick cap is shared across accounts, like one big order', () => {
    const id = 'SYN';
    const def = cfg.assets.find((a) => a.id === id)!;
    const adv = def.advNotional!;
    const tickFill = (orders: [string, number][]) => {
      let s = createWorld('temp-cap', cfg);
      for (const [p] of orders) if (!s.accounts[p]) s = openAccount(s, p, 10 * adv);
      for (const [p, usd] of orders) s = placeOrder(s, { playerId: p, assetId: id, side: 'buy', type: 'market', qty: usd / def.initialPrice }).state;
      const r = step(s);
      const i = idx(r.state, id);
      const mid0 = Math.exp(r.state.assets[i]!.tickTraded!.lnMid);
      const filled = r.fills.reduce((x, f) => x + f.qty, 0) * mid0;
      const r2 = step(r.state);
      return { filled, open: r.state.orders.filter((o) => o.status === 'open').length, filled2: r2.fills.reduce((x, f) => x + f.qty, 0) * mid0 };
    };
    const big = tickFill([['A', 4 * adv]]); // today's single order: 3 ADV now, the rest next tick
    const two = tickFill([['A', 2 * adv], ['B', 2 * adv]]); // two accounts: shared cap, same split
    console.log(`temp_cap_shared SYN: one 4-ADV order fills ${(big.filled / adv).toFixed(4)} ADV this tick, ${(big.filled2 / adv).toFixed(4)} next; two 2-ADV accounts fill ${(two.filled / adv).toFixed(4)} ADV this tick, ${(two.filled2 / adv).toFixed(4)} next`);
    expect(big.filled).toBeLessThanOrEqual(3 * adv * (1 + 1e-9));
    expect(two.filled).toBeLessThanOrEqual(3 * adv * (1 + 1e-9));
    expect(two.filled / big.filled).toBeCloseTo(1, 6);
    expect(big.open).toBe(1);
    expect(two.open).toBe(1); // B's remainder waits, it is not rejected
    expect(two.filled2).toBeGreaterThan(0.9 * adv);
  });

  it('temp_whale_alt_same_tick: whale A plus alt B in one tick cost no less than one account', () => {
    for (const id of ['SYN', 'AURH', 'OSTV']) {
      for (const seed of ['hunt-1', 'hunt-2', 'tape-01']) {
        const def = cfg.assets.find((a) => a.id === id)!;
        const adv = def.advNotional!;
        const qty = (usd: number) => (def.qtyStep === 1 ? Math.floor(usd / def.initialPrice) : usd / def.initialPrice);
        const run = (ids: [string, string]) => {
          let s = createWorld(seed, cfg);
          for (const p of new Set(ids)) s = openAccount(s, p, adv);
          s = placeOrder(s, { playerId: ids[0], assetId: id, side: 'buy', type: 'market', qty: qty(0.05 * adv) }).state;
          s = placeOrder(s, { playerId: ids[1], assetId: id, side: 'buy', type: 'market', qty: qty(0.02 * adv) }).state;
          const r = step(s);
          return r.fills.reduce((x, f) => x + f.qty * f.price + f.fee, 0);
        };
        const two = run(['A', 'B']);
        const one = run(['C', 'C']);
        let s = openAccount(createWorld(seed, cfg), 'C', adv);
        s = placeOrder(s, { playerId: 'C', assetId: id, side: 'buy', type: 'market', qty: qty(0.05 * adv) + qty(0.02 * adv) }).state;
        const single = step(s).fills.reduce((x, f) => x + f.qty * f.price + f.fee, 0);
        expect(two).toBeGreaterThanOrEqual(one * (1 - 1e-12));
        expect(Math.abs(two / single - 1)).toBeLessThanOrEqual(1e-4); // fees differ only by a per-order minimum
      }
    }
  });
});
