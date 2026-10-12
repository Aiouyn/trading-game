import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { defaultConfig } from './config';
import { universeConfig } from './universe';
import { crowdHoldings, estimateFill, guardedMark, halfSpread, impact, liquidationEquity, openAccount, placeOrder, setAccountPermissions, tradingConfig } from './trading';
import type { WorldConfig, WorldState } from './types';

/**
 * Alt-lifted peak (ROADMAP "Must-fix before online ranking", Tape hunt `alt_lifts_whale_mark_peak`), ported from
 * engine-staging. Peak equity, rank and licences read liquidation value: each account's pro-rata share of the WHOLE
 * crowd's exit in that asset (every same-side holding closed together: half spread + square-root impact on the crowd's
 * quantity, own fee). Shorts exit the crowd short the same way. On top, the C5 mark guard (config.markGuard, on in the
 * game universe) holds peak marks at the close before a one-sided pump or dump.
 */
const GUARD = { thr: 0.25, K: 0.5 };
const cfg = defaultConfig(); // 720 ticks per game day, no guard
const gcfg: WorldConfig = { ...cfg, markGuard: GUARD };
const MODES = [['plain', cfg], ['guard', gcfg]] as const;
const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);
const adv = (id: string) => cfg.assets.find((a) => a.id === id)!.advNotional ?? 1e9;
const qtyOf = (id: string, usd: number) => { const d = cfg.assets.find((a) => a.id === id)!; return d.qtyStep === 1 ? Math.floor(usd / d.initialPrice) : usd / d.initialPrice; };
const feeMin = (s: WorldState, id: string) => { const f = tradingConfig(s).fees; return (f[s.config.assets[idx(s, id)]!.assetClass] ?? f.stock).min; };

/** Tape's repro: whale A buys 5% ADV at tick 1, alt B 2% ADV at tick 2, both sell out. ['C','C'] = one account. */
function hunt(c: WorldConfig, seed: string, id: string, exitTick: number, accts: [string, string]) {
  const qA = qtyOf(id, 0.05 * adv(id)), qB = qtyOf(id, 0.02 * adv(id));
  let s = createWorld(seed, c);
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

/** main A buys `aUsd` at tick 1 and holds; alt B buys `bUsd` at tick 3 and holds (or sells at `bSell`). A's peak after `ticks`. */
function mainPeak(c: WorldConfig, seed: string, id: string, aUsd: number, bUsd: number, ticks: number, bSell?: number) {
  let s = openAccount(openAccount(createWorld(seed, c), 'A', 2 * aUsd), 'B', 2 * Math.max(bUsd, 1));
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
  for (const [name, c] of MODES) {
    for (const id of ['SYN', 'AURH']) {
      // R-9-1c: one tally per asset, so the alt's fills pay on the whale's flow and the whale-plus-alt peak never beats one account's.
      it(`${name} ${id}: whale + alt summed peaks never beat one account holding the same block`, { timeout: 180_000 }, () => {
        for (const seed of ['hunt-1', 'hunt-2']) {
          for (const exitTick of [10, 721]) {
            const two = hunt(c, seed, id, exitTick, ['A', 'B']);
            const one = hunt(c, seed, id, exitTick, ['C', 'C']);
            // tolerance: the second account's minimum fee (fees are per account) plus float noise
            expect(two.peak).toBeLessThanOrEqual(one.peak + 2 * feeMin(createWorld('f', cfg), id) + 1e-9 * adv(id));
            expect(two.profit).toBeLessThanOrEqual(one.profit + 1e-9 * adv(id));
          }
        }
      });

      // R-9-1c: the alt's buy pays on the shared tally the whale's buy built, so it never lifts the main's peak.
      it(`${name} ${id}: an alt's buy (held, or sold later) never lifts the main's peak`, { timeout: 180_000 }, () => {
        for (const seed of ['pump-1', 'pump-2']) {
          for (const bFrac of [0.02, 0.2, 1, 3]) {
            const alone = mainPeak(c, seed, id, 0.05 * adv(id), 0, 1500);
            const held = mainPeak(c, seed, id, 0.05 * adv(id), bFrac * adv(id), 1500);
            const sold = mainPeak(c, seed, id, 0.05 * adv(id), bFrac * adv(id), 1500, 740);
            expect(held).toBeLessThanOrEqual(alone + 1e-9 * adv(id));
            expect(sold).toBeLessThanOrEqual(alone + 1e-9 * adv(id));
          }
        }
      });
    }
  }

  // R-9-1c: N accounts holding Q/N each pay on the asset's shared tally, so their per-unit marks match one account's (fees aside).
  it('one account holding Q marks the same per unit as N accounts holding Q/N (fees aside)', () => {
    for (const id of ['SYN', 'AURH', 'HLCN']) {
      const Q0 = qtyOf(id, 0.1 * adv(id));
      for (const n of [2, 10]) {
        const whole = cfg.assets[idx(createWorld('x', cfg), id)]!.qtyStep === 1;
        const q = whole ? Math.floor(Q0 / n) : Q0 / n;
        const Q = whole ? q * n : Q0;
        let one = openAccount(createWorld('nq', cfg), 'one', 0.3 * adv(id));
        let many = createWorld('nq', cfg);
        for (let k = 0; k < n; k++) many = openAccount(many, `m${k}`, 0.3 * adv(id) / n);
        one = placeOrder(one, { playerId: 'one', assetId: id, side: 'buy', type: 'market', qty: Q }).state;
        for (let k = 0; k < n; k++) many = placeOrder(many, { playerId: `m${k}`, assetId: id, side: 'buy', type: 'market', qty: q }).state;
        for (let t = 0; t < 30; t++) { one = step(one).state; many = step(many).state; }
        const perUnit = (s: WorldState, p: string) => {
          const a = s.accounts[p]!, held = a.positions[id]!.qty;
          const px = estimateFill(s, { assetId: id, side: 'sell', qty: crowdHoldings(s)[id]!.long }).price;
          return { u: (liquidationEquity(s, p) - a.cash + feeOn(s, id, held, px)) / held, px };
        };
        const u1 = perUnit(one, 'one');
        expect(u1.u).toBeCloseTo(u1.px, 9);
        for (let k = 0; k < n; k++) expect(perUnit(many, `m${k}`).u).toBeCloseTo(perUnit(many, 'm0').px, 9);
        expect(Math.abs(perUnit(many, 'm0').u / u1.u - 1)).toBeLessThan(1e-3);
      }
    }
  });

  it('a lone account marks exactly at estimateFill of its whole position', () => {
    let s = openAccount(createWorld('solo', cfg), 'p', 1e6);
    s = placeOrder(s, { playerId: 'p', assetId: 'SYN', side: 'buy', type: 'market', qty: qtyOf('SYN', 2e5) }).state;
    s = placeOrder(s, { playerId: 'p', assetId: 'HLCN', side: 'buy', type: 'market', qty: qtyOf('HLCN', 2e5) }).state;
    for (let t = 0; t < 800; t++) {
      s = step(s).state;
      if (t % 97 !== 0) continue;
      const a = s.accounts.p!;
      let old = a.cash;
      for (const [assetId, pos] of Object.entries(a.positions)) old += estimateFill(s, { assetId, side: 'sell', qty: pos.qty }).total;
      expect(liquidationEquity(s, 'p')).toBeCloseTo(old, 6);
    }
  });

  it('shorts exit the crowd short: a short marks at the buy-back price of every short together', () => {
    let s = createWorld('short', cfg);
    for (const p of ['s1', 's2']) s = setAccountPermissions(openAccount(s, p, 1e6), p, { maxLeverage: 2, canShort: true });
    const id = 'AURH';
    const q = qtyOf(id, 1e5);
    for (const p of ['s1', 's2']) s = placeOrder(s, { playerId: p, assetId: id, side: 'sell', type: 'market', qty: q }).state;
    s = step(s).state;
    const crowd = crowdHoldings(s)[id]!;
    expect(crowd.short).toBe(2 * q);
    const i = idx(s, id), m = Math.exp(s.assets[i]!.lnP);
    const px = m * (1 + halfSpread(s, i) + impact(s, i, 2 * q * m));
    const a = s.accounts.s1!;
    expect(liquidationEquity(s, 's1')).toBeCloseTo(a.cash - q * px - feeOn(s, id, q, px), 6);
  });
});

function feeOn(s: WorldState, id: string, qty: number, price: number) {
  const fees = tradingConfig(s).fees;
  const f = fees[s.config.assets[idx(s, id)]!.assetClass] ?? fees.stock;
  return Math.max(f.min, f.rate * qty * price);
}

describe('C5 mark guard (Quant\'s alt-peak rule, on in the game universe)', () => {
  it('the game universe ships the guard at thr 0.25, K 0.5', () => {
    expect(universeConfig().markGuard).toEqual(GUARD);
  });

  const pump = (c: WorldConfig, side: 'buy' | 'sell' = 'buy') => {
    let s = openAccount(openAccount(createWorld('mcv-1', c), 'A', 1e6), 'B', 2 * adv('AURH'));
    if (side === 'sell') s = setAccountPermissions(s, 'B', { maxLeverage: 3, canShort: true });
    for (let t = 1; t <= 40; t++) {
      if (t === 3) s = placeOrder(s, { playerId: 'B', assetId: 'AURH', side, type: 'market', qty: qtyOf('AURH', adv('AURH')) }).state;
      s = step(s).state;
    }
    return s;
  };

  it('without config.markGuard nothing is written', () => {
    const s = pump(cfg);
    expect(s.assets.every((a) => a.markGuard === undefined && a.markFlow === undefined)).toBe(true);
  });

  it('a 1-ADV pump holds long marks at the previous close for the flagged day and the next, not after', () => {
    const s = pump(gcfg);
    const i = idx(s, 'AURH');
    const g = s.assets[i]!.markGuard!;
    expect(g.dir).toBe(1);
    expect(g.untilDay).toBe(1);
    expect(guardedMark(s, i, 1)).toBeLessThanOrEqual(Math.exp(g.lnAnchor) + 1e-12);
    expect(guardedMark(s, i, -1)).toBe(Math.exp(s.assets[i]!.lnP)); // shorts aren't held by a buy pump
    const later = { ...s, tick: 2 * cfg.ticksPerDay + 5 };
    expect(guardedMark(later, i, 1)).toBe(Math.exp(later.assets[i]!.lnP));
  });

  it('a 1-ADV dump holds short marks at the previous close (symmetric)', () => {
    const s = pump(gcfg, 'sell');
    const i = idx(s, 'AURH');
    const g = s.assets[i]!.markGuard!;
    expect(g.dir).toBe(-1);
    expect(guardedMark(s, i, -1)).toBeGreaterThanOrEqual(Math.exp(g.lnAnchor) - 1e-12);
  });

  const slow = (c: WorldConfig, perDay: number, days: number) => {
    let s = openAccount(createWorld('mcv-5', c), 'B', 2 * adv('AURH'));
    const opens: number[] = [];
    for (let t = 1; t <= days * cfg.ticksPerDay; t++) {
      if (t % cfg.ticksPerDay === 3) s = placeOrder(s, { playerId: 'B', assetId: 'AURH', side: 'buy', type: 'market', qty: qtyOf('AURH', perDay * adv('AURH')) }).state;
      s = step(s).state;
      if (t % cfg.ticksPerDay === 1) opens.push(s.assets[idx(s, 'AURH')]!.lnOpen);
    }
    return { s, opens };
  };

  it('a slow pump (0.15 ADV a day) never trips the 1-day rule, but the 5-day rule fires and anchors before the pump', () => {
    const { s, opens } = slow(gcfg, 0.15, 5);
    const a = s.assets[idx(s, 'AURH')]!;
    expect(a.markFlow!.net.length).toBe(5);
    expect(a.markGuard!.anchorDay).toBeLessThanOrEqual(0);
    expect(a.markGuard!.lnAnchor).toBe(opens[0]);
    expect(a.markGuard!.untilDay).toBe(5);
    expect(guardedMark(s, idx(s, 'AURH'), 1)).toBeLessThanOrEqual(Math.exp(opens[0]!) + 1e-12);
    const two = slow(gcfg, 0.15, 2).s; // 0.30 ADV over 2 days: under K, no guard
    expect(two.assets[idx(two, 'AURH')]!.markGuard).toBeUndefined();
  });
});
