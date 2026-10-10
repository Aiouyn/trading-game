import { describe, expect, it } from 'vitest';
import { DEFAULT_REGIMES, DEFAULT_REGIME_SHARES, expectedVol, ratePassThrough } from './config';
import { DEFAULT_RATES } from './rates';
import { regimeTimeShares } from './regimeShares';
import { RATE_VAR_SEED, RATE_VAR_YEARS, RATE_YIELD_DAILY_VAR, simulateYieldVariance } from './ratevar';
import { universeConfig } from './universe';
import type { AssetDef, RegimeId } from './types';

const RGS = Object.keys(DEFAULT_REGIMES) as RegimeId[];

describe('regimeTimeShares', () => {
  it('matches the closed form of the default chain: embedded law times mean stay, normalized', () => {
    // expansion -> overheating 0.8 / contraction 0.2; overheating -> contraction 0.85 / expansion 0.15;
    // contraction -> recovery 1; recovery -> expansion 0.9 / contraction 0.1. Embedded law: e_E = 1, e_O = 0.8, e_C = e_R = (1 - 0.12) / 0.9.
    const eCR = (1 - 0.15 * 0.8) / 0.9;
    const days = { expansion: 567 * 1, overheating: 189 * 0.8, contraction: 189 * eCR, recovery: 189 * eCR };
    const total = Object.values(days).reduce((a, b) => a + b, 0);
    const shares = regimeTimeShares(DEFAULT_REGIMES);
    for (const id of RGS) expect(shares[id]).toBeCloseTo(days[id] / total, 12);
    expect(RGS.reduce((a, id) => a + shares[id], 0)).toBeCloseTo(1, 12);
    expect(DEFAULT_REGIME_SHARES.expansion).toBeCloseTo(shares.expansion, 14);
  });
});

describe('rate-shock table (ratevar.ts)', () => {
  it('is the rates layer simulated at the generated length and seed (regenerate: scripts/balance/rate-var.ts)', () => {
    const { variance } = simulateYieldVariance(DEFAULT_RATES, DEFAULT_REGIMES, RATE_VAR_YEARS, RATE_VAR_SEED);
    for (const id of RGS) {
      for (const k of ['y2', 'y10', 'y30'] as const) {
        const want = RATE_YIELD_DAILY_VAR[id][k];
        expect(Math.abs(variance[id][k] - want) / want).toBeLessThan(1e-9);
      }
    }
  }, 30000);

  it('is deterministic for a given seed', () => {
    const a = simulateYieldVariance(DEFAULT_RATES, DEFAULT_REGIMES, 20, 'det');
    const b = simulateYieldVariance(DEFAULT_RATES, DEFAULT_REGIMES, 20, 'det');
    expect(a.variance).toEqual(b.variance);
    expect(a.days).toEqual(b.days);
  });

  it('gives every regime a positive daily variance for every yield', () => {
    for (const id of RGS) for (const k of ['y2', 'y10', 'y30'] as const) expect(RATE_YIELD_DAILY_VAR[id][k]).toBeGreaterThan(0);
  });
});

describe('expectedVol rate term (V1-PHASE1 F13)', () => {
  const av10 = universeConfig().assets.find((a) => a.id === 'AV10') as AssetDef;

  it('pass-through is (print² + (1 − print)²): full print 1, half print 0.5, 0.7 print 0.58', () => {
    expect(ratePassThrough(1)).toBe(1);
    expect(ratePassThrough(0.5)).toBeCloseTo(0.5, 15);
    expect(ratePassThrough(0.7)).toBeCloseTo(0.58, 15);
  });

  it('adds D² x the mixed daily yield variance x 252 x pass-through to the variance (no regime)', () => {
    const mix = RGS.reduce((a, id) => a + DEFAULT_REGIME_SHARES[id] * RATE_YIELD_DAILY_VAR[id].y10, 0);
    const base = expectedVol({ ...av10, duration: 0, yieldKey: undefined });
    expect(expectedVol(av10, undefined, 1, 0.5) ** 2).toBeCloseTo(base ** 2 + 8.5 ** 2 * mix * 252 * 0.5, 14);
    expect(expectedVol(av10, undefined, 1, 1) ** 2).toBeCloseTo(base ** 2 + 8.5 ** 2 * mix * 252, 14);
  });

  it('uses the regime table when a regime is given (its yield variance, its jump multiplier)', () => {
    const r = DEFAULT_REGIMES.contraction;
    const want = Math.sqrt((av10.vol * r.volMult) ** 2 + 8.5 ** 2 * RATE_YIELD_DAILY_VAR.contraction.y10 * 252);
    expect(expectedVol(av10, r)).toBeCloseTo(want, 14);
  });

  it('leaves a stock with no duration unchanged by the rate table', () => {
    const stock = { ...av10, duration: undefined, yieldKey: undefined, jumpsPerYear: 0 } as AssetDef;
    expect(expectedVol(stock, undefined, 1, 0.5)).toBeCloseTo(stock.vol, 14);
  });
});
