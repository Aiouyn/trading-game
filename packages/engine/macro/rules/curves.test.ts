// T04-07 pure curve pieces used by T04-09 (OIS, term premium, breakeven, basis).
import { describe, expect, it } from 'vitest';
import { BLOC_DEFAULTS } from '../blocs';
import { breakevenAt, crossCurrencyBasis, forwardRate, nInfinity, oisZero, termPremium10, termPremiumAt } from './curves';

const E = { 1: 0.02, 2: 0.03, 4: 0.04, 8: 0.05 } as const;
describe('T04-07 curves (pure)', () => {
  it('forward path: knots, linear between, 2^(−(s−2)/2) tail toward nInf', () => {
    expect([0, 0.25, 0.5, 1, 2].map((s) => forwardRate(s, 0.01, E, 0.04))).toEqual([0.01, 0.02, 0.03, 0.04, 0.05]);
    expect(forwardRate(0.125, 0.01, E, 0.04)).toBeCloseTo(0.015, 15);
    expect(forwardRate(1.5, 0.01, E, 0.04)).toBeCloseTo(0.045, 15);
    expect(forwardRate(4, 0.01, E, 0.04)).toBeCloseTo(0.045, 12);
    expect(nInfinity(0.005, 0.02)).toBe(0.025);
  });
  it('OIS: flat path → flat; overnight single trapezoid; 1y trapezoid on the weekly grid', () => {
    const F = { 1: 0.03, 2: 0.03, 4: 0.03, 8: 0.03 } as const;
    expect(oisZero(1, 0.03, F, 0.03)).toBeCloseTo(0.03, 12);
    expect(oisZero(1 / 364, 0.01, E, 0.04)).toBeCloseTo(0.01 + (0.04 / 364) / 2, 12);
    expect(oisZero(0.25, 0.01, E, 0.04)).toBeCloseTo(0.015, 12);
  });
  it('TP10: base at neutral inputs; gap, debt, QE, fear terms; clamp', () => {
    const b = { b: 'FDL' as const, piE5: 0.02, target: 0.02, debtGdp: 1, dStar: 1, qeHoldingsGdp: 0, fear: 50, shockSum: 0 }, d = BLOC_DEFAULTS.FDL;
    expect(termPremium10(b)).toBeCloseTo(d.tpBase, 12);
    expect(termPremium10({ ...b, piE5: 0.03 }) - termPremium10(b)).toBeCloseTo(0.0025, 12);
    expect(termPremium10({ ...b, piE5: 0.01 }) - termPremium10(b)).toBeCloseTo(0.0025, 12);
    expect(termPremium10({ ...b, debtGdp: 1.5 }) - termPremium10(b)).toBeCloseTo(0.0015, 12);
    expect(termPremium10({ ...b, fear: 60 }) - termPremium10(b)).toBeCloseTo(d.tpFear, 12);
    expect(termPremium10({ ...b, shockSum: 1 })).toBe(0.04);
    expect(termPremium10({ ...b, shockSum: -1 })).toBe(-0.01);
  });
  it('TP at τ: 10y gives tp10; breakeven 1y = π_e1, 10y = 0.6π_e5 + 0.4π_e1 + irp, linear between', () => {
    expect(termPremiumAt(0.01, 10)).toBeCloseTo(0.01, 12);
    expect(breakevenAt(0.5, 0.02, 0.03, 0.001)).toBe(0.02);
    expect(breakevenAt(10, 0.02, 0.03, 0.001)).toBeCloseTo(0.027, 12);
    expect(breakevenAt(5.5, 0.02, 0.03, 0.001)).toBeCloseTo(0.0235, 12);
    expect(breakevenAt(30, 0.02, 0.03, 0.001)).toBeCloseTo(0.027, 12);
  });
  it('basis: FDL 0; EUN at FSI 0.5 −0.0017; SRL at 0.2 −0.006; swap line floors at −0.0025', () => {
    expect(crossCurrencyBasis('FDL', 0.9, false)).toBe(0);
    expect(crossCurrencyBasis('EUN', 0.5, false)).toBeCloseTo(-0.0017, 12);
    expect(crossCurrencyBasis('EUN', 0.2, false)).toBeCloseTo(-0.0005, 12);
    expect(crossCurrencyBasis('SRL', 0.2, false)).toBeCloseTo(-0.006, 12);
    expect(crossCurrencyBasis('SRL', 0.2, true)).toBe(-0.0025);
  });
});
