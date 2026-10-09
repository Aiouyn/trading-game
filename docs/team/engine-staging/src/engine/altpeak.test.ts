import { describe, expect, it } from 'vitest';
import { createWorld, enterSimMode, quote, step } from './sim';
import { defaultConfig } from './config';
import { cappedMark, setMarkCapVariant, crowdLong, estimateFill, halfSpread, impact, liquidationEquity, markCapOn, openAccount, placeOrder, publicValue, tradingConfig } from './trading';
import type { WorldState } from './types';

/**
 * Alt-lifted peak (ROADMAP "Must-fix before online ranking", Tape hunt `alt_lifts_whale_mark_peak`): peak equity,
 * rank and licenses read liquidation value, and liquidation value is each account's pro-rata share of the WHOLE
 * crowd's exit in that asset (every account's same-side holding sold together: half spread + square-root impact on
 * the crowd's quantity, own fee). Checked in the legacy engine and in full ecology (the new-world default).
 */
const cfg = defaultConfig(); // 720 ticks per game day
const MODES = [['off', { ecology: 'off' as const }], ['full', {}]] as const;
const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);
const adv = (id: string) => cfg.assets.find((a) => a.id === id)!.advNotional ?? 1e9;
const qtyOf = (id: string, usd: number) => { const d = cfg.assets.find((a) => a.id === id)!; return d.qtyStep === 1 ? Math.floor(usd / d.initialPrice) : usd / d.initialPrice; };
const feeMin = (s: WorldState, id: string) => tradingConfig(s).fees[s.config.assets[idx(s, id)]!.assetClass].min;

/** Tape's repro: whale A buys 5% ADV at tick 1, alt B 2% ADV at tick 2, both sell out (A at exitTick, B one tick later).
 *  `accts` ['C','C'] = one account doing all of it. Returns summed peaks over start and realized profit. */
function hunt(mode: object, seed: string, id: string, exitTick: number, accts: [string, string]) {
  const qA = qtyOf(id, 0.05 * adv(id)), qB = qtyOf(id, 0.02 * adv(id));
  let s = createWorld(seed, cfg, mode);
  for (const p of new Set(accts)) s = openAccount(s, p, 0.2 * adv(id));
  const ids = [...new Set(accts)];
  const start = ids.reduce((x, p) => x + s.accounts[p]!.cash, 0);
  for (let t = 1; t <= exitTick + 2; t++) {
    if (t === 1) s = placeOrder(s, { playerId: accts[0], assetId: id, side: 'buy', type: 'market', qty: qA }).state;
    if (t === 2) s = placeOrder(s, { playerId: accts[1], assetId: id, side: 'buy', type: 'market', qty: qB }).state;
    if (t === exitTick) s = placeOrder(s, { playerId: accts[0], assetId: id, side: 'sell', type: 'market', qty: qA }).state;
    if (t === exitTick + 1) s = placeOrder(s, { playerId: accts[1], assetId: id, side: 'sell', type: 'market', qty: qB }).state;
    s = step(s).state;
  }
  return { peak: ids.reduce((x, p) => x + s.accounts[p]!.peakEquity, 0) - start, profit: ids.reduce((x, p) => x + s.accounts[p]!.cash, 0) - start };
}

/** main A buys `aUsd` at tick 1 and holds; optionally alt B buys `bUsd` at tick 3 and holds (or sells at `bSell`). A's peak after `ticks`. */
function mainPeak(mode: object, seed: string, id: string, aUsd: number, bUsd: number, ticks: number, bSell?: number) {
  let s = openAccount(openAccount(createWorld(seed, cfg, mode), 'A', 2 * aUsd), 'B', 2 * Math.max(bUsd, 1));
  const qB = qtyOf(id, bUsd);
  for (let t = 1; t <= ticks; t++) {
    if (t === 1) s = placeOrder(s, { playerId: 'A', assetId: id, side: 'buy', type: 'market', qty: qtyOf(id, aUsd) }).state;
    if (t === 3 && qB > 0) s = placeOrder(s, { playerId: 'B', assetId: id, side: 'buy', type: 'market', qty: qB }).state;
    if (bSell !== undefined && t === bSell && qB > 0) s = placeOrder(s, { playerId: 'B', assetId: id, side: 'sell', type: 'market', qty: s.accounts.B!.positions[id]?.qty ?? qB }).state;
    s = step(s).state;
  }
  return s.accounts.A!.peakEquity;
}

describe('alt-lifted peak: liquidation is a share of the whole crowd exit', () => {
  for (const [name, mode] of MODES) {
    for (const id of ['SYN', 'AURH']) {
      it(`${name} ${id}: whale + alt summed peaks never beat one account holding the same block`, { timeout: 180_000 }, () => {
        for (const seed of ['hunt-1', 'hunt-2', 'hunt-3']) {
          for (const exitTick of [10, 721]) {
            const two = hunt(mode, seed, id, exitTick, ['A', 'B']);
            const one = hunt(mode, seed, id, exitTick, ['C', 'C']);
            console.log(`alt_lifts_whale_mark_peak ${name} ${id} ${seed} exit@${exitTick}: summed peaks over start A+B ${two.peak.toFixed(2)} vs one ${one.peak.toFixed(2)}; realized ${two.profit.toFixed(2)} vs ${one.profit.toFixed(2)}`);
            // tolerance: the second account's minimum fee (fees are per account) plus float noise
            expect(two.peak).toBeLessThanOrEqual(one.peak + 2 * feeMin(createWorld('f', cfg), id) + 1e-9 * adv(id));
          }
        }
      });

      it(`${name} ${id}: an alt's buy (held, or sold later) never lifts the main's peak`, { timeout: 180_000 }, () => {
        for (const seed of ['pump-1', 'pump-2']) {
          for (const bFrac of [0.02, 0.2, 1, 3]) {
            const alone = mainPeak(mode, seed, id, 0.05 * adv(id), 0, 1500);
            const held = mainPeak(mode, seed, id, 0.05 * adv(id), bFrac * adv(id), 1500);
            const sold = mainPeak(mode, seed, id, 0.05 * adv(id), bFrac * adv(id), 1500, 740);
            console.log(`alt_pump ${name} ${id} ${seed} alt ${bFrac}xADV: main peak alone ${alone.toFixed(2)}, alt holds ${held.toFixed(2)}, alt sells next day ${sold.toFixed(2)}`);
            expect(held).toBeLessThanOrEqual(alone + 1e-9 * adv(id));
            expect(sold).toBeLessThanOrEqual(alone + 1e-9 * adv(id));
          }
        }
      });
    }
  }

  it('one account holding Q marks the same as N accounts holding Q/N (fees aside)', () => {
    for (const [, mode] of MODES) {
      for (const id of ['SYN', 'AURH', 'HLCN']) {
        const Q0 = qtyOf(id, 0.1 * adv(id));
        for (const n of [2, 10]) {
          // whole-share assets: Q must split evenly into N whole-share orders, so round it down to a multiple of N
          const whole = cfg.assets[cfg.assets.findIndex((a) => a.id === id)]!.qtyStep === 1;
          const q = whole ? Math.floor(Q0 / n) : Q0 / n;
          const Q = whole ? q * n : Q0;
          let one = openAccount(createWorld('nq', cfg, mode), 'one', 0.3 * adv(id));
          let many = createWorld('nq', cfg, mode);
          for (let k = 0; k < n; k++) many = openAccount(many, `m${k}`, 0.3 * adv(id) / n);
          one = placeOrder(one, { playerId: 'one', assetId: id, side: 'buy', type: 'market', qty: Q }).state;
          for (let k = 0; k < n; k++) many = placeOrder(many, { playerId: `m${k}`, assetId: id, side: 'buy', type: 'market', qty: q }).state;
          for (let t = 0; t < 30; t++) { one = step(one).state; many = step(many).state; }
          // gross exit value per unit (liq − cash + own fee) / held: identical for every holder in a world, and equal to
          // the per-unit price of ONE account selling the whole crowd quantity (exact, same world)
          const perUnit = (s: WorldState, p: string) => {
            const a = s.accounts[p]!, held = a.positions[id]!.qty;
            const px = exitPrice(s, id, crowdLong(s).get(id)!);
            return { u: (liquidationEquity(s, p) - a.cash + feeOn(s, id, held, px)) / held, px };
          };
          const u1 = perUnit(one, 'one');
          expect(u1.u).toBeCloseTo(u1.px, 9);
          for (let k = 0; k < n; k++) expect(perUnit(many, `m${k}`).u).toBeCloseTo(perUnit(many, 'm0').px, 9);
          // across the two worlds only the fill path differs (N sequential fills vs one), so the marks agree to ~1e-4
          expect(Math.abs(perUnit(many, 'm0').u / u1.u - 1)).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('a single account (solo) marks exactly as before (off), or at min(price, public fair value) before the exit (full)', () => {
    for (const [name, mode] of MODES) {
      let s = openAccount(createWorld('solo', cfg, mode), 'p', 1e6);
      s = placeOrder(s, { playerId: 'p', assetId: 'SYN', side: 'buy', type: 'market', qty: qtyOf('SYN', 2e5) }).state;
      s = placeOrder(s, { playerId: 'p', assetId: 'HLCN', side: 'buy', type: 'market', qty: qtyOf('HLCN', 2e5) }).state;
      expect(markCapOn(s)).toBe(name === 'full');
      for (let t = 0; t < 800; t++) {
        s = step(s).state;
        if (t % 97 !== 0) continue;
        const a = s.accounts.p!;
        let old = a.cash, capped = a.cash;
        for (const [assetId, pos] of Object.entries(a.positions)) {
          old += estimateFill(s, { assetId, side: 'sell', qty: pos.qty }).total;
          const px = exitPrice(s, assetId, pos.qty);
          capped += pos.qty * px - feeOn(s, assetId, pos.qty, px);
        }
        expect(liquidationEquity(s, 'p')).toBe(name === 'full' ? capped : old);
      }
    }
  });

  it('the cap reads exactly the public fair value players see (quote().fundamental), and only in full / sim', () => {
    const shadowCfg = defaultConfig({ ecology: { mode: 'shadow' } as WorldState['config']['ecology'] });
    for (const [name, c, mode] of [['full', cfg, {}], ['off', cfg, { ecology: 'off' as const }], ['shadow', shadowCfg, {}], ['h25', cfg, { ecology: 'hybrid25' as const }]] as const) {
      let s = createWorld('pub', c, mode);
      for (let t = 0; t < 1500; t++) {
        s = step(s).state;
        if (t % 113 !== 0) continue;
        cfg.assets.forEach((d, i) => expect(publicValue(s, i)).toBe(quote(s, d.id).fundamental));
      }
      expect(markCapOn(s)).toBe(name === 'full');
      expect(markCapOn(enterSimMode(s))).toBe(true);
      // the ecology's internal value line (lnVe) only exists when valueVolScale ≠ 1; at full defaults it is absent,
      // so the pools trade toward the same public lnV the cap reads
      // the pools' value line at the close is the live (public) lnV whenever lnVe is absent or equal to it
      for (const e of s.ecology?.assets ?? []) if (e.lnVe !== undefined) expect(e.lnVe).toBe(e.lnV);
    }
  });
});

/** reference exit price per unit for `qty` sold together: off = estimateFill; full = min(public price, public fair value)
 *  from quote(), then half spread + square-root impact at that price */
function exitPrice(s: WorldState, id: string, qty: number): number {
  if (!markCapOn(s)) return estimateFill(s, { assetId: id, side: 'sell', qty }).price;
  const i = idx(s, id), q = quote(s, id), p = Math.min(q.price, q.fundamental);
  return p * (1 - (halfSpread(s, i) + impact(s, i, qty * p)));
}

function feeOn(s: WorldState, id: string, qty: number, price: number) {
  const f = tradingConfig(s).fees[s.config.assets[idx(s, id)]!.assetClass];
  return Math.max(f.min, f.rate * qty * price);
}

describe('internal mark-cap variants (harness knob, default strict cap)', () => {
  const pump = (mode: object, v?: Parameters<typeof setMarkCapVariant>[1]) => {
    let s = openAccount(openAccount(createWorld('mcv-1', cfg, mode), 'A', 1e6), 'B', 2 * adv('AURH'));
    if (v) setMarkCapVariant(s.config, v);
    for (let t = 1; t <= 40; t++) {
      if (t === 3) s = placeOrder(s, { playerId: 'B', assetId: 'AURH', side: 'buy', type: 'market', qty: qtyOf('AURH', adv('AURH')) }).state;
      s = step(s).state;
    }
    return s;
  };
  it('registering A is identical to not registering (default unchanged)', () => {
    expect(JSON.stringify(pump({}, { kind: 'A' }))).toBe(JSON.stringify(pump({})));
  });
  it('C writes a guard only in full; off is byte-identical whatever the variant', () => {
    const full = pump({}, { kind: 'C', thr: 0.25 });
    expect(full.assets[idx(full, 'AURH')]!.markGuard).toBeDefined();
    const off = { ecology: 'off' as const };
    expect(JSON.stringify(pump(off, { kind: 'D', thr: 0.25, band: 0.08 }))).toBe(JSON.stringify(pump(off)));
  });
  it('the guard caps at the previous close for the flagged day and the next, not after', () => {
    const s = pump({}, { kind: 'C', thr: 0.25 });
    const i = idx(s, 'AURH');
    const g = s.assets[i]!.markGuard!;
    expect(g.untilDay).toBe(1);
    expect(cappedMark(s, i)).toBeLessThanOrEqual(Math.exp(g.lnAnchor) + 1e-12);
    const later = { ...s, tick: 2 * cfg.ticksPerDay + 5 };
    expect(cappedMark(later, i)).toBe(Math.exp(later.assets[i]!.lnP));
  });
});

describe('internal mark variant C5 (rolling 5-day trigger)', () => {
  const slow = (mode: object, v: Parameters<typeof setMarkCapVariant>[1] | undefined, perDay: number, days: number) => {
    let s = openAccount(createWorld('mcv-5', cfg, mode), 'B', 2 * adv('AURH'));
    if (v) setMarkCapVariant(s.config, v);
    const opens: number[] = [];
    for (let t = 1; t <= days * cfg.ticksPerDay; t++) {
      if (t % cfg.ticksPerDay === 3) s = placeOrder(s, { playerId: 'B', assetId: 'AURH', side: 'buy', type: 'market', qty: qtyOf('AURH', perDay * adv('AURH')) }).state;
      s = step(s).state;
      if (t % cfg.ticksPerDay === 1) opens.push(s.assets[idx(s, 'AURH')]!.lnOpen);
    }
    return { s, opens };
  };
  it('0.15x ADV a day never trips the 1-day rule, but the 5-day rule fires at K=0.5 and anchors before the pump', () => {
    const c = slow({}, { kind: 'C', thr: 0.25 }, 0.15, 5).s;
    expect(c.assets[idx(c, 'AURH')]!.markGuard).toBeUndefined();
    const { s, opens } = slow({}, { kind: 'C5', thr: 0.25, K: 0.5 }, 0.15, 5);
    const a = s.assets[idx(s, 'AURH')]!;
    expect(a.markFlow!.net.length).toBe(5);
    expect(a.markGuard!.anchorDay).toBeLessThanOrEqual(0);     // window reaches back before the first flow: anchor = day 0's open
    expect(a.markGuard!.lnAnchor).toBe(opens[0]);
    expect(a.markGuard!.untilDay).toBe(5);
    expect(cappedMark(s, idx(s, 'AURH'))).toBeLessThanOrEqual(Math.exp(opens[0]!) + 1e-12);
  });
  it('off stays byte-identical under C5', () => {
    const off = { ecology: 'off' as const };
    expect(JSON.stringify(slow(off, { kind: 'C5', thr: 0.25, K: 0.5 }, 0.15, 2).s)).toBe(JSON.stringify(slow(off, undefined, 0.15, 2).s));
  });
});
