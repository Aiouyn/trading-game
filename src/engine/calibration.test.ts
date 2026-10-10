import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { DEFAULT_REGIMES, defaultConfig, expectedVol, idioLoading, normalizeLoadings, regimeShockSd } from './config';
import { closePrint, ecologyWeight } from './ecology';
import { universeConfig } from './universe';
import type { AssetDef, RegimeDef, RegimeId, WorldState } from './types';

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
    // jump variance: 6 · (0.5 · 2 · 0.01 + 0.5 · 2 · 0.01) = 0.12; diffusion 0.04
    expect(full).toBeCloseTo(Math.sqrt(0.04 + 0.12), 12);
    expect(printed).toBeCloseTo(Math.sqrt(0.04 + 0.25 * 0.12), 12);
  });

  it('closePrint is the live jumpImmediate off the ecology, the newsPrint share in full mode, 1 in the bare engine', () => {
    expect(closePrint(defaultConfig())).toBe(1);
    expect(closePrint(universeConfig())).toBe(0.5);
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

  it('the GARCH input removes the unprinted part of a jump: a jump-only asset keeps h near 1', () => {
    // Before dayGap, each jump left a -30% residual in the GARCH day return, and h ran to its cap (9) with vol 1e-6.
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
