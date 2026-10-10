import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { DEFAULT_REGIMES, DEFAULT_REGIME_SHARES, defaultConfig, expectedVol, idioLoading, normalizeLoadings, regimeShockSd } from './config';
import { closePrint, ecologyWeight } from './ecology';
import { universeConfig } from './universe';
import type { AssetDef, RegimeDef, RegimeId, WorldConfig, WorldState } from './types';

/**
 * Calibration closure (V1 Phase 1, F1). Each test isolates one component of the close-to-close vol that the vol-ratio
 * band compares with expectedVol. The measured component is the engine's; the expectation is the closed form.
 */

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const diffs = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]!);
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

function frozenRegimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, volMult: 1, jumpMult: 1, jumpUpShift: 0, marketLoadMult: 1, idioMult: 1, meanDays: 1e12 };
  }
  return out;
}

function stock(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'e', initialPrice: 100, sharesOutstanding: 1e6,
    vol: 0.3, drift: 0, cycleBeta: 0, wMarket: 0.55, wSector: 0.45, wCrypto: 0,
    halfLifeDays: 20, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, ...extra,
  });
}

describe('close print share (F1: jumps print partly at once)', () => {
  it('expectedVol scales the jump variance by the print share squared', () => {
    const a = stock('J', { vol: 0.2, jumpsPerYear: 6, jumpUpMean: 0.1, jumpDownMean: 0.1 });
    const full = expectedVol(a);
    const printed = expectedVol(a, undefined, 0.5);
    // diffusion 0.04. Jump variance: 6 · E[J²] = 6 · (0.5 · 2 · 0.01 + 0.5 · 2 · 0.01) = 0.12 in an expansion, and with no regime
    // the intensity is the time average of jumpMult over the default regimes (regimeShares.ts): 0.12 · Σ share · jumpMult.
    const mixJump = 0.12 * (Object.keys(DEFAULT_REGIMES) as RegimeId[]).reduce((acc, id) => acc + DEFAULT_REGIME_SHARES[id] * DEFAULT_REGIMES[id].jumpMult, 0);
    expect(full).toBeCloseTo(Math.sqrt(0.04 + mixJump), 12);
    expect(printed).toBeCloseTo(Math.sqrt(0.04 + 0.25 * mixJump), 12);
  });

  it('closePrint is the live jumpImmediate off the ecology, the newsPrint share in full mode, 1 in the bare engine', () => {
    expect(closePrint(defaultConfig())).toBe(1);
    // universe.ts: the closing auction prints the day's news in full (newsPrint 1, V1-PHASE1 F2)
    expect(closePrint(universeConfig())).toBe(1);
    expect(ecologyWeight(universeConfig())).toBe(1);
    expect(closePrint(universeConfig({ ecology: undefined }))).toBe(0.7);
  });

  it('a jump-only asset realizes the printed share of its jump variance (close-to-close, daily)', () => {
    // no diffusion, no pull to speak of (half-life 1e6 days), symmetric jumps, so the day's close-to-close variance
    // is the printed part of the jumps that landed that day: jumpImmediate² · λ · E[J²] / 252
    const a = stock('JO', { vol: 1e-6, jumpsPerYear: 200, jumpUpMean: 0.02, jumpDownMean: 0.02, halfLifeDays: 1e6 });
    const cfg = defaultConfig({ ticksPerDay: 24, assets: [a], indices: [], regimes: frozenRegimes(), jumpImmediate: 0.7, catalysts: undefined });
    let s: WorldState = createWorld('print-share', cfg);
    const closes: number[] = [];
    for (let d = 0; d < 252 * 10; d++) { s = stepMany(s, 24).state; closes.push(s.assets[0]!.lnP); }
    const realized = sd(diffs(closes)) ** 2 * 252;
    const expected = 200 * (0.5 * 2 * 0.02 ** 2 + 0.5 * 2 * 0.02 ** 2) * 0.7 ** 2;
    expect(realized / expected).toBeGreaterThan(0.8);
    expect(realized / expected).toBeLessThan(1.2);
  });

  it('the GARCH input has no jump term: a jump-only asset keeps h near 1', () => {
    // The GARCH reads dayDiff (diffusive shocks only). Before that, each jump's unprinted 30% was a residual in the day
    // return and h ran to its cap (9) with vol 1e-6. Here the diffusion is 1e-6, so h must stay at the mean of 1.
    const a = stock('JG', { vol: 1e-6, jumpsPerYear: 200, jumpUpMean: 0.02, jumpDownMean: 0.02, halfLifeDays: 1e6 });
    const cfg = defaultConfig({ ticksPerDay: 24, assets: [a], indices: [], regimes: frozenRegimes(), jumpImmediate: 0.7, catalysts: undefined });
    let s: WorldState = createWorld('garch-gap', cfg);
    let hMax = 0;
    for (let d = 0; d < 200; d++) { s = stepMany(s, 24).state; hMax = Math.max(hMax, s.assets[0]!.h); }
    expect(hMax).toBeLessThan(4);
  });
});

describe('regime shock sd (F1: GARCH standardizes by the full regime sd)', () => {
  it('is 1 in the expansion and below 1 in a contraction for an idio-heavy asset', () => {
    const a = stock('R', { wMarket: 0.15, wSector: 0.5 });
    expect(regimeShockSd(a, DEFAULT_REGIMES.expansion)).toBeCloseTo(1, 12);
    const c = DEFAULT_REGIMES.contraction;
    const expected = Math.sqrt((0.15 * c.marketLoadMult) ** 2 + 0.5 ** 2 + (idioLoading(a) * c.idioMult) ** 2);
    expect(regimeShockSd(a, c)).toBeCloseTo(expected, 12);
    expect(regimeShockSd(a, c)).toBeLessThan(1);
  });
});

describe('GARCH identity (F1: the input is the diffusive innovation, so E[z^2 | h] = h)', () => {
  /**
   * c = mean(z^2) / mean(h) over game days, z = dayDiff / (vol · volMult · regimeShockSd · sqrt(dt)). dayDiff holds the
   * day's per-tick diffusive shocks, read at the day's close (the next day's first tick resets it). GARCH's mean is
   * E[h] = (1 - a - b) / (1 - b - a c), so c = 1 gives E[h] = 1. Before the input change, a 0.5-day stablecoin read c = 26
   * and a 60-day biotech read c = 1.16 (live close-to-close residuals, not diffusion).
   */
  function garchC(a: AssetDef, days: number, extra: Partial<WorldConfig> = {}, ticksPerDay = 12): number {
    const cfg = defaultConfig({ ticksPerDay, assets: [a], indices: [], ...extra });
    let s: WorldState = createWorld(`garch-c-${a.id}`, cfg);
    const z2: number[] = [];
    const hs: number[] = [];
    for (let d = 0; d < days; d++) {
      s = stepMany(s, ticksPerDay).state;
      const rg = cfg.regimes[s.regime]!;
      const z = s.assets[0]!.dayDiff! / (a.vol * rg.volMult * regimeShockSd(a, rg) * Math.sqrt(1 / cfg.daysPerYear));
      z2.push(z * z);
      hs.push(s.assets[0]!.h);
    }
    return mean(z2) / mean(hs);
  }

  it('a fast-reverting, jump-heavy asset (0.5-day half-life, 12 jumps a year, 70% printed) is unbiased', () => {
    const a = stock('FR', {
      vol: 0.3, halfLifeDays: 0.5, jumpsPerYear: 12, jumpUpMean: 0.05, jumpDownMean: 0.08,
    });
    const c = garchC(a, 1500, { jumpImmediate: 0.7, permanentShare: 0.9, jumpPermanent: 1 });
    expect(c).toBeGreaterThan(0.9);
    expect(c).toBeLessThan(1.1);
  });

  it('an idio-heavy asset across the default regimes (contraction idio 0.6) is unbiased', () => {
    const a = stock('ID', { vol: 0.5, wMarket: 0.15, wSector: 0.5, jumpsPerYear: 6 });
    const c = garchC(a, 1500);
    expect(c).toBeGreaterThan(0.9);
    expect(c).toBeLessThan(1.1);
  });
});

describe('closePrint blend (F1 review: the hybrid close is part live, part auction)', () => {
  it('the print share is the same blend as the close: (1 - w) x jumpImmediate + w x newsPrint', () => {
    expect(closePrint(universeConfig({ ecology: { mode: 'hybrid', weight: 0.25 } }))).toBeCloseTo(0.75 * 0.7 + 0.25 * 0.5, 12);
    expect(closePrint(universeConfig({ ecology: { mode: 'full', weight: 1 } }))).toBe(0.5);
  });
});

/**
 * Bare-engine golden. The bare path (defaultConfig, 17 assets, seed golden-bare, 400 game days at 24 ticks) is pinned to a
 * fingerprint of lnP, h and lnV. Calibration changes move it on purpose (the GARCH input, regimeShockSd); a change that
 * moves it without a matching measured reason is a regression. Update the constant only with the measured reason in the
 * commit body. Fingerprint at the dayDiff GARCH input (V1-PHASE1 F1): fa2ca82e; re-pinned to 461b6a16 for the Ito centring of the
 * price transient (sim.ts, V1-PHASE1 F14: the price drift gains 0.5 sigma^2 (1 - perm^2), so lnP - lnV is a zero-mean OU).
 */
describe('bare engine golden (pins the bare price path)', () => {
  it('400 game days of defaultConfig at seed golden-bare reproduce the fingerprint', () => {
    const cfg = defaultConfig({ ticksPerDay: 24 });
    let s: WorldState = createWorld('golden-bare', cfg);
    s = stepMany(s, 24 * 400).state;
    let h = 2166136261;
    const sig = s.assets.map((a) => `${a.id}:${a.lnP.toFixed(12)}:${a.h.toFixed(12)}:${a.lnV.toFixed(12)}`).join('|');
    for (const c of sig) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    expect((h >>> 0).toString(16).padStart(8, '0')).toBe('461b6a16');
  });
});
