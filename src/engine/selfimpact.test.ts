import { describe, expect, it } from 'vitest';
import { createWorld, quote, shockPrice, shockValue, step, stepMany } from './sim';
import { defaultConfig } from './config';
import { universeConfig } from './universe';
import { commission, estimateFill, halfSpread, impact, liquidationEquity, markCapOn, openAccount, permanentMove, placeOrder, portfolio, tradingConfig } from './trading';
import type { WorldConfig, WorldState } from './types';
import { clipDay, median } from './hunt-helpers';

/**
 * Clip splitting (Ledger, 2026-10-09). Tape's harness used SYN; this engine has SYN (Synapse, crypto,
 * $300M ADV, the thinnest book in the default universe), so it is the main case. AURH (Aurelius Holdings,
 * $72M ADV, the smallest-ADV stock) is checked too, in whole shares.
 *
 * Tape (hunts v1): the ratio and peak checks run on tape-01..tape-20 on defaultConfig (the bare engine), on
 * tape-01..tape-05 on universeConfig with ecology off (the bare impact law), and on tape-01..tape-20 on universeConfig
 * with full ecology (the game path). The full-ecology gate is the intraday peak lift, not the close, as Ledger decided;
 * the close ratio is logged as info. Phase 1 F5/F6: the AURH tape-10 peak ratio was 2.74 because the ecology book was
 * anchored AFTER the first tick's fills (sim.ts ecologyStep): a one-clip day anchored on its own tick-1 impact, the value
 * pool sold it back at the close, and the many-clip day did not. Anchored before the fills, the 20-seed ratios are all in band.
 */
const NOTIONAL = 1e6;
const cfg = defaultConfig(); // the real 720 ticks per game day
const uniCfg = universeConfig({ ticksPerDay: 720 }); // the game path
const uniNoEco = universeConfig({ ticksPerDay: 720, ecology: undefined }); // the universe with the bare impact law
const SEEDS = Array.from({ length: 20 }, (_, k) => `tape-${String(k + 1).padStart(2, '0')}`);
const UNI_SEEDS = SEEDS.slice(0, 5);

function idx(s: WorldState, id: string) { return s.config.assets.findIndex((a) => a.id === id); }

/** lnP at the end of game day 0 after buying `units` either in one order at tick 1 or in 720 equal clips, one per tick */
/** the shared clip day (clipDay in hunt-helpers.ts, the same code the harness reads), with the bought size checked */
function dayLift(id: string, clips: number, c: WorldConfig = cfg, seed = 'clip') {
  const r = clipDay(id, clips, c, seed, NOTIONAL);
  expect(r.qty).toBeCloseTo(r.total, 6);
  return { lift: r.lift, peak: r.peak, state: r.state, marks: r.marks, mids: r.mids };
}

describe('self impact: clips cost the same permanent impact as one order', () => {
  for (const id of ['SYN', 'AURH']) {
    it(`self_impact_clip_ratio (${id}, defaultConfig, tape-01..20): 720 clips vs 1 clip, same notional, lift ratio in (0.75, 1.5]`, { timeout: 60_000 }, () => {
      const ratios: number[] = [];
      for (const seed of SEEDS) {
        const one = dayLift(id, 1, cfg, seed);
        const many = dayLift(id, 720, cfg, seed);
        expect(one.lift).toBeGreaterThan(0);
        const ratio = many.lift / one.lift;
        ratios.push(ratio);
        expect(ratio).toBeLessThanOrEqual(1.5);
        expect(ratio).toBeGreaterThan(0.75);
      }
      console.log(`self_impact_clip_ratio ${id} defaultConfig 20 seeds: median ${median(ratios).toFixed(4)}, min ${Math.min(...ratios).toFixed(4)}, max ${Math.max(...ratios).toFixed(4)}`);
    });
  }

  // The impact law itself (universe, ecology off): splitting into 720 clips lifts the close as much as one order.
  for (const id of ['SYN', 'AURH']) {
    it(`self_impact_clip_ratio (${id}, universeConfig 720 ticks, ecology off, tape-01..05): lift ratio in (0.75, 1.5]`, { timeout: 60_000 }, () => {
      const ratios: number[] = [];
      for (const seed of UNI_SEEDS) {
        const one = dayLift(id, 1, uniNoEco, seed);
        const many = dayLift(id, 720, uniNoEco, seed);
        expect(one.lift).toBeGreaterThan(0);
        const ratio = many.lift / one.lift;
        ratios.push(ratio);
        expect(ratio).toBeLessThanOrEqual(1.5);
        expect(ratio).toBeGreaterThan(0.75);
      }
      console.log(`self_impact_clip_ratio ${id} universe ecology-off 5 seeds: median ${median(ratios).toFixed(4)}, min ${Math.min(...ratios).toFixed(4)}, max ${Math.max(...ratios).toFixed(4)}`);
    });
  }

  // The game path (universe, full ecology). The gate is the intraday peak lift ratio, two-sided per seed: the largest lnP
  // move the day reaches, before the closing auction can revert it. Under full ecology the auction sets the close, so the
  // close ratio of two small one-day lifts is noisy and is logged as info only. 20 seeds. Before the F5/F6 fix (the ecology
  // book anchored after tick 1's fills) the AURH peak ratio was 0.83 to 2.74 (tape-10 2.74) and the one-clip close lift was
  // <= 0 on 3 of 20 SYN and 4 of 20 AURH seeds. After it, the 20-seed peak ratios are 0.967 to 1.010 (SYN) and 0.982 to 0.999
  // (AURH), the close ratio median is 0.997 (Ledger's 0.997 sign-off), and the one-clip close lift is positive on all 20.
  // No legitimate tail was found, so the band is the same (0.75, 1.5] on every seed, not a percentile band.
  for (const id of ['SYN', 'AURH']) {
    it(`self_impact_peak_ratio (${id}, universeConfig 720 ticks, full ecology, tape-01..20): intraday peak lift ratio in (0.75, 1.5]`, { timeout: 180_000 }, () => {
      const peakRatios: number[] = [];
      const closeRatios: number[] = [];
      for (const seed of SEEDS) {
        const one = dayLift(id, 1, uniCfg, seed);
        const many = dayLift(id, 720, uniCfg, seed);
        expect(one.peak).toBeGreaterThan(0);
        const ratio = many.peak / one.peak;
        peakRatios.push(ratio);
        closeRatios.push(many.lift / one.lift);
        expect(ratio).toBeLessThanOrEqual(1.5);
        expect(ratio).toBeGreaterThan(0.75);
      }
      console.log(`self_impact_peak_ratio ${id} universe full-ecology 20 seeds: peak ratio median ${median(peakRatios).toFixed(4)}, per seed ${peakRatios.map((x) => x.toFixed(3)).join(' ')}; info close-lift ratio median ${median(closeRatios).toFixed(4)}, per seed ${closeRatios.map((x) => x.toFixed(3)).join(' ')}`);
    });
  }

  it('self_mark_peak_pump (SYN, tape-01..20): peak after the clip buy is not above the position marked on an unpushed tape', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      for (const clips of [720, 1]) {
        const r = dayLift('SYN', clips, cfg, seed);
        const acct = r.state.accounts.p1!;
        const unpumped = Math.max(3 * NOTIONAL, ...r.marks);
        expect(acct.peakEquity).toBeLessThanOrEqual(unpumped + 1e-6);
        expect(portfolio(r.state, 'p1').peakEquity).toBeLessThanOrEqual(unpumped + 1e-6);
        // the mid you pushed is above that mark; the peak is not built on it
        if (clips === 720) expect(Math.max(...r.mids)).toBeGreaterThan(unpumped);
        if (seed === SEEDS[0]) console.log(`self_mark_peak_pump SYN ${seed} clips=${clips}: peak ${acct.peakEquity.toFixed(2)}, best no-pump mark ${unpumped.toFixed(2)}, best mid mark ${Math.max(...r.mids).toFixed(2)}, liquidation now ${liquidationEquity(r.state, 'p1').toFixed(2)}`);
      }
    }
  });

  it('self_mark_peak_pump (SYN, universeConfig, tape-01..05): peak after the clip buy is not above the unpushed mark', { timeout: 60_000 }, () => {
    for (const seed of UNI_SEEDS) {
      for (const clips of [720, 1]) {
        const r = dayLift('SYN', clips, uniCfg, seed);
        const acct = r.state.accounts.p1!;
        const unpumped = Math.max(3 * NOTIONAL, ...r.marks);
        expect(acct.peakEquity).toBeLessThanOrEqual(unpumped + 1e-6);
        expect(portfolio(r.state, 'p1').peakEquity).toBeLessThanOrEqual(unpumped + 1e-6);
      }
    }
  });
});

describe('daily cumulative impact accounting', () => {
  const small = () => openAccount(createWorld('acct', defaultConfig({ ticksPerDay: 24 })), 'p1', 1e7);

  it('splits add up: f(a+b) path equals one order of a+b, per side, and resets when the day rolls', () => {
    let s = small();
    const i = idx(s, 'OSTV');
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'buy', type: 'market', qty: 3000 }).state;
    s = step(s).state;
    const t1 = s.assets[i]!.dayTraded!;
    expect(t1.day).toBe(0);
    expect(t1.sell).toBe(0);
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'buy', type: 'market', qty: 3000 }).state;
    s = step(s).state;
    const t2 = s.assets[i]!.dayTraded!;
    expect(t2.buy).toBeGreaterThan(t1.buy * 1.9);
    // sum of the two log moves equals one move on the total (log1p of increments ~ increments)
    const whole = permanentMove(s, i, 'buy', 0, t2.buy);
    const split = permanentMove(s, i, 'buy', 0, t1.buy) + permanentMove(s, i, 'buy', t1.buy, t2.buy - t1.buy);
    expect(split / whole).toBeGreaterThan(0.999);
    expect(split / whole).toBeLessThan(1.001);
    // sells keep their own total
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'sell', type: 'market', qty: 1000 }).state;
    s = step(s).state;
    expect(s.assets[i]!.dayTraded!.sell).toBeGreaterThan(0);
    expect(s.assets[i]!.dayTraded!.buy).toBe(t2.buy);
    // next game day starts from zero
    s = stepMany(s, 24 - 3).state;
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'buy', type: 'market', qty: 10 }).state;
    s = step(s).state;
    const t3 = s.assets[i]!.dayTraded!;
    expect(t3.day).toBe(1);
    expect(t3.sell).toBe(0);
    expect(t3.buy).toBeLessThan(t1.buy / 100);
  });

  it('a fill moves lnP by exactly sign · log1p(f(after) − f(before))', () => {
    let s = small();
    const i = idx(s, 'OSTV');
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'buy', type: 'market', qty: 2000 }).state;
    const withFill = step(s);
    const noFill = step({ ...s, orders: [] }).state;
    const f = withFill.fills[0]!;
    const expected = permanentMove(withFill.state, i, 'buy', 0, f.qty * f.price);
    expect(withFill.state.assets[i]!.lnP - noFill.assets[i]!.lnP).toBeCloseTo(expected, 14);
    const share = tradingConfig(s).permanentImpactShare;
    expect(expected).toBeCloseTo(Math.log1p(share * impact(withFill.state, i, f.qty * f.price)), 14);
  });

  it('an old save without dayTraded trades as if nothing was traded today; a stale account-keyed field is ignored', () => {
    let s = small();
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'buy', type: 'market', qty: 2000 }).state;
    const legacy: WorldState = JSON.parse(JSON.stringify(s));
    legacy.assets.forEach((a) => { delete a.dayTraded; });
    expect(step(legacy).state).toEqual(step(s).state);
    const stale: WorldState = JSON.parse(JSON.stringify(s));
    // the retired per-account field is not in Account any more; a save that still carries it must be ignored
    (stale.accounts.p1 as unknown as Record<string, unknown>).dayTraded = { OSTV: { day: 0, buy: 1e12, sell: 1e12 } };
    expect(step(stale).state.assets).toEqual(step(s).state.assets);
  });

  it('a world where nobody trades prices exactly as before', () => {
    const a = stepMany(createWorld('idle', defaultConfig({ ticksPerDay: 24 })), 24 * 10).state;
    const b = stepMany(openAccount(createWorld('idle', defaultConfig({ ticksPerDay: 24 })), 'p1'), 24 * 10).state;
    expect(b.assets).toEqual(a.assets);
    expect(b.accounts.p1!.peakEquity).toBe(5000);
  });

  it('liquidationEquity is cash plus a full sell at estimateFill, below the mid mark', () => {
    let s = small();
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'buy', type: 'market', qty: 2000 }).state;
    s = step(s).state;
    const a = s.accounts.p1!;
    const qty = a.positions.OSTV!.qty;
    const sell = estimateFill(s, { assetId: 'OSTV', side: 'sell', qty });
    // full ecology (the new-world default) caps the pre-exit mark at the public fair value: min(price, quote().fundamental)
    const i = idx(s, 'OSTV'), q = quote(s, 'OSTV'), p = Math.min(q.price, q.fundamental);
    const px = p * (1 - (halfSpread(s, i) + impact(s, i, qty * p)));
    const capped = qty * px - commission(s, s.config.assets[i]!, qty * px);
    expect(liquidationEquity(s, 'p1')).toBeCloseTo(a.cash + (markCapOn(s) ? capped : sell.total), 9);
    expect(liquidationEquity(s, 'p1')).toBeLessThan(portfolio(s, 'p1').equity);
    expect(portfolio(s, 'p1').liquidationEquity).toBeCloseTo(liquidationEquity(s, 'p1'), 9);
    expect(() => liquidationEquity(s, 'nobody')).toThrow();
  });
});

describe('shockValue (test-only)', () => {
  it('moves lnV only, leaves lnP and the input alone', () => {
    const s0 = stepMany(createWorld('sv', defaultConfig({ ticksPerDay: 24 })), 24).state;
    const before = JSON.stringify(s0);
    const s1 = shockValue(s0, 'HLCN', 0.1);
    expect(JSON.stringify(s0)).toBe(before);
    const i = idx(s0, 'HLCN');
    expect(s1.assets[i]!.lnV - s0.assets[i]!.lnV).toBeCloseTo(Math.log(1.1), 12);
    expect(s1.assets[i]!.lnP).toBe(s0.assets[i]!.lnP);
    s1.assets.forEach((a, j) => { if (j !== i) expect(a).toBe(s0.assets[j]); });
    // the pull then walks the price toward the new value
    const later = stepMany(s1, 24 * 5).state.assets[i]!.lnP - stepMany(s0, 24 * 5).state.assets[i]!.lnP;
    expect(later).toBeGreaterThan(0);
  });
  it('rejects unknown assets and impossible moves, like shockPrice', () => {
    const s0 = createWorld('sv', defaultConfig({ ticksPerDay: 24 }));
    expect(() => shockValue(s0, 'NOPE', 0.1)).toThrow();
    expect(() => shockValue(s0, 'HLCN', -1)).toThrow();
    expect(() => shockValue(s0, 'HLCN', Number.NaN)).toThrow();
    expect(() => shockPrice(s0, 'NOPE', 0.1)).toThrow();
  });
});

/**
 * F5/F6 root cause (AURH tape-10, peak ratio 2.74). A fresh ecology book is created on the first tick, and it was anchored on
 * the state AFTER that tick's fills. A player's tick-1 impact then became the day's value anchor: the value pool sold it
 * back at the close, so a one-clip day closed below its intraday peak and a 720-clip day did not. The anchor is now the
 * priced state before the fills, so the same tick-1 buy leaves the book where it is in a world with nobody trading.
 */
describe('ecology anchor: a fresh book is set before the first tick\'s fills', () => {
  it('a tick-1 buy does not move the new book\'s core or close; its flow still enters as own flow', () => {
    const c = universeConfig({ ticksPerDay: 720 });
    const i = c.assets.findIndex((a) => a.id === 'AURH');
    const px = c.assets[i]!.initialPrice;
    const nobody = openAccount(createWorld('anchor', c), 'p1', 3e6);
    const buyer = placeOrder(nobody, { playerId: 'p1', assetId: 'AURH', side: 'buy', type: 'market', qty: Math.floor(1e6 / px) }).state;
    const a = step(buyer);
    const b = step(nobody);
    expect(a.fills.length).toBeGreaterThan(0);
    expect(a.state.ecology!.assets[i]!.core).toBe(b.state.ecology!.assets[i]!.core);
    expect(a.state.ecology!.assets[i]!.lnS).toBe(b.state.ecology!.assets[i]!.lnS);
    expect(a.state.ecology!.assets[i]!.own).toBeGreaterThan(0);
    expect(b.state.ecology!.assets[i]!.own).toBe(0);
  });
});
