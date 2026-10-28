import { describe, expect, it } from 'vitest';
import { dmath } from '@tycoon/engine-core';
import { crossRate, currentAccount, policySurprisePp, pppLn, realGap, stepFairValue, surpriseStep } from './fxFair';

const base = { iX: 0.095, iFdl: 0.03, pppLn: 0, ca: -0.02, dRA: 0, dLnEnergy: 0, surpriseX: 0, surpriseFdl: 0, shocks: 0, b: 'SRL' as const };
describe('T04-14 fair value', () => {
  it('SRL day step, i 0.095 vs 0.03, PPP = F, CA −0.02 → Δln F = −0.000116758', () => {
    expect(stepFairValue(0, base, {} as never)).toBeCloseTo(-0.000116758, 9);
    expect(stepFairValue(0.1, { ...base, pppLn: 0.1 }, {} as never) - 0.1).toBeCloseTo(-0.000116758, 9);
    expect(stepFairValue(0.3, { ...base, b: 'FDL' }, {} as never)).toBe(0);
  });
  it('PPP after FDL CPI 102 and SRL CPI 110 = ln PPP0 + ln 1.02 − ln 1.10', () => {
    expect(pppLn(0.2, 102, 100, 110, 100)).toBeCloseTo(0.2 + dmath.ln(1.02) - dmath.ln(1.1), 12);
  });
  it('q̃ sign: spot above PPP-implied is positive (X overvalued) and lowers the current account', () => {
    expect(realGap(0.1, 110, 100, 0)).toBeGreaterThan(0);
    expect(realGap(-0.2, 100, 100, 0)).toBeCloseTo(-0.2, 12);
    expect(currentAccount('SRL', 0.1, 0, 0, 100)).toBeCloseTo(-0.02 - 0.03, 12);
  });
  it('surprise +0.25 pp at an SRL meeting → +0.0075 on ln F', () => {
    const pp = policySurprisePp(0.0925, 0.09);
    expect(pp).toBeCloseTo(0.25, 12);
    expect(surpriseStep(0.1, pp, 0)).toBeCloseTo(0.1075, 12);
    expect(surpriseStep(0.1, 0, pp)).toBeCloseTo(0.0925, 12);
  });
  it('04#28 no cross-rate arbitrage over random spot vectors', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return 0.01 + 100 * seed / 2147483648; };
    for (let i = 0; i < 500; i++) {
      const a = rnd(), b = rnd(), c = rnd();
      expect(Math.abs(crossRate(a, b) * crossRate(b, c) - crossRate(a, c)) / crossRate(a, c)).toBeLessThan(1e-12);
      expect(crossRate(a, a)).toBe(1);
    }
  });
});
