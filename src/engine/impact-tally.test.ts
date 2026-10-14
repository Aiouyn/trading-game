import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { defaultConfig } from './config';
import { halfSpread, impact, IMPACT_HALF_LIFE, liquidationEquity, marginalImpact, openAccount, permanentMove, placeOrder } from './trading';
import type { WorldState } from './types';

/**
 * Impact tallies. The permanent move stays on the asset's shared rolling tally (R-9-1c): every account's flow and the
 * pools' closing flow, half-life 360 ticks. One order and N accounts splitting the same block move the price the same.
 * Temporary impact is the account's own memory (R-10-1): one account's clips still cost one order, and another account
 * does not pay the first account's flow. A window of clips over a day pays on the decayed own tally.
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

describe('impact tally: splitting one block over accounts (R-9-1c, one shared tally per asset)', () => {
  for (const id of ['SYN', 'AURH']) {
    it(`impact_split_accounts (${id}): one order vs N = 2, 10, 100 accounts move the price the same`, { timeout: 120_000 }, () => {
      const one = lift(id, 1);
      expect(one).toBeGreaterThan(0);
      const rows: string[] = [`one ${one.toExponential(4)}`];
      for (const N of [2, 10, 100]) {
        const r = lift(id, N) / one;
        rows.push(`N=${N} ratio ${r.toFixed(4)}`);
        expect(Math.abs(r - 1)).toBeLessThanOrEqual(0.01);
      }
      console.log(`impact_split_accounts ${id}: ${rows.join(', ')}`);
    });
  }

  it('a second account pays on the flow of the first account: the asset tally holds both fills, and the move of B is charged on the notional of A', () => {
    let s = openAccount(openAccount(createWorld('tally-d', defaultConfig({ ticksPerDay: 24 })), 'A', 1e7), 'B', 1e7);
    const i = idx(s, 'OSTV');
    s = placeOrder(s, { playerId: 'A', assetId: 'OSTV', side: 'buy', type: 'market', qty: 3000 }).state;
    const first = step(s);
    const fa = first.fills[0]!;
    expect(fa.playerId).toBe('A');
    s = placeOrder(first.state, { playerId: 'B', assetId: 'OSTV', side: 'buy', type: 'market', qty: 3000 }).state;
    const r = step(s);
    const noFill = step({ ...s, orders: s.orders.filter((o) => o.status !== 'open') }).state;
    const f = r.fills[0]!;
    expect(f.playerId).toBe('B');
    const decayed = fa.qty * fa.mid * Math.pow(0.5, (f.tick - fa.tick) / IMPACT_HALF_LIFE);
    expect(r.state.assets[i]!.lnP - noFill.assets[i]!.lnP).toBeCloseTo(permanentMove(r.state, i, 'buy', decayed, f.qty * f.mid), 14);
    expect(r.state.assets[i]!.impactTally!.buy).toBeCloseTo(decayed + f.qty * f.mid, 6);
    expect(r.state.assets[i]!.impactTally!.sell).toBe(0);
  });
});

describe('impact tally: 720 clips of one account', () => {
  for (const id of ['SYN', 'AURH']) {
    // The lift after the day's last tick, against one order: the clips' charges land later in the window, so less of their
    // permanent move has decayed by the reading (measured 1.095 SYN, 1.122 AURH). The window gate is clip.test.ts (<= 1.5).
    it(`720 clips over one game day (${id}): lift ratio stays in a band around one order (the window gate is clip.test.ts)`, { timeout: 120_000 }, () => {
      const one = lift(id, 1);
      const c = lift(id, 1, true) / one;
      console.log(`clips over a day ${id}: lift ratio ${c.toFixed(4)}`);
      expect(c).toBeGreaterThan(0.9);
      expect(c).toBeLessThan(1.25);
    });
  }
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
    it(`impact_alt_hunt (${id}): two accounts move the price like one and pay only their own impact (R-10-1)`, { timeout: 120_000 }, () => {
      for (const seed of ['hunt-1', 'hunt-2', 'hunt-3']) {
        for (const exitTick of [10, 720 + 1]) { // same-day exit, and next game day's open
          const two = hunt(seed, id, exitTick, ['A', 'B']);
          const one = hunt(seed, id, exitTick, ['C', 'C']);
          const tol = 1e-9 * cfgAdv(id);
          console.log(`impact_alt_hunt ${id} ${seed} exit@${exitTick}: realized A+B ${two.profit.toFixed(2)} vs one ${one.profit.toFixed(2)}; best summed liquidation mark ${two.bestLiq.toFixed(2)} vs ${one.bestLiq.toFixed(2)}; summed peaks over start ${two.peak.toFixed(2)} vs ${one.peak.toFixed(2)}`);
          // the price path is the same tick for tick: the permanent move still stacks on the shared tally (R-10-1)
          expect(two.path).toEqual(one.path);
          // each account pays only its own temporary impact, so the pair loses less on the fills than one account
          expect(two.profit).toBeGreaterThan(one.profit);
          // liquidationEquity is per account, so two accounts' marks each assume only their own exit and their sum sits
          // above one account selling the whole block. That is a mark, not realized profit (above).
          expect(two.peak).toBeLessThanOrEqual(Math.max(0, two.bestLiq) + tol);
        }
      }
    });
  }
});
function cfgAdv(id: string) { return cfg.assets.find((a) => a.id === id)!.advNotional ?? 1e9; }

/**
 * Temporary impact is the account's own memory (R-10-1). One account's clips in one tick still cost one order.
 * N accounts do not: each pays only its own slice, so splitting across accounts is cheaper on the fill. The permanent
 * move stays shared (the lift tests above). The 3x ADV cap stays on the per-tick tally.
 * Cost = sum over fills of qty * |price - mid| where mid is the tick's pre-trade mid (tickTraded.lnMid):
 * half spread plus temporary impact, all in. Tolerance for one account's same-tick splits: |ratio - 1| <= 0.01.
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
    it(`temp_split_same_tick (${id}): one order = 720 clips in one tick, one account, total temporary cost`, { timeout: 60_000 }, () => {
      const one = sameTick(id, 1, 1);
      const r = sameTick(id, 1, 720);
      const ratio = r.cost / one.cost;
      console.log(`temp_split_same_tick ${id}: one order ${(1e4 * one.cost / one.notional).toFixed(3)} bp, 720 clips in one tick ratio ${ratio.toFixed(4)}`);
      expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.01);
    });

    it(`temp_split_same_tick (${id}): N accounts pay only their own impact, so the total is below one order (R-10-1)`, { timeout: 60_000 }, () => {
      const one = sameTick(id, 1, 1);
      const rows = [`one order ${(1e4 * one.cost / one.notional).toFixed(3)} bp`];
      let prev = 1;
      for (const n of [2, 10, 100]) {
        const r = sameTick(id, n, 1);
        const ratio = r.cost / one.cost;
        rows.push(`N=${n} ratio ${ratio.toFixed(4)}`);
        // half the cost is the spread, which does not shrink, so the ratio stays above 1/sqrt(N). It stays under one order.
        expect(ratio).toBeLessThan(prev);
        expect(ratio).toBeGreaterThan(1 / Math.sqrt(n) * 0.5);
        expect(ratio).toBeLessThan(0.95);
        prev = ratio;
      }
      console.log(`temp_split_same_tick ${id} [own only]: ${rows.join(', ')}`);
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
      // was ratio < 0.75 (the per-tick tally let a day of clips dodge the impact: about 1/sqrt(720) of one order). R-9-1c keeps
      // the window on the asset's shared tally, decayed by half every 360 ticks: a day of clips pays on what the tally still
      // holds, so it costs about 8-10% less than one order (the decay is the discount, measured 0.92 SYN, 0.91 AURH). Pinned
      // as a band, not as equality: below one order, never above it.
      expect(ratio).toBeGreaterThanOrEqual(0.85);
      expect(ratio).toBeLessThanOrEqual(1.0);
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

  it('temp_whale_alt_same_tick: two accounts pay only their own impact; one account\'s two orders still cost one order (R-10-1)', () => {
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
        // one account's two orders in one tick still cost the combined order
        expect(Math.abs(one / single - 1)).toBeLessThanOrEqual(1e-4);
        // two accounts do not pay each other's impact
        expect(two).toBeLessThan(one);
      }
    }
  });
});
