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

import { buildCurve, impliedHawk, marketPath, stepHHat, type CurveBuildInputs } from './curves';
import { coeffsFromHawk, ruleRate, type PublishedData } from './cb';
import { termPremiumAt as tpAt } from './curves';
import { sovSpread } from './sovCredit';
import { cbWorld } from '../testkit/cbWorld';
import type { SovereignCreditState } from '../schema';

const W0 = cbWorld([]);
W0.nums({ macro_cb_phi_fs: 1.5, macro_cb_smoothing: 0.5, macro_cb_max_step: 0.005, macro_cb_max_step_wide: 0.0075 });   // as cb.test / guidance.test
const P = W0.ctx.params;
const flat = (r: number) => ([1, 2, 4, 8] as const).map((h) => ({ horizonQuarters: h, rate: r }));
const ss = (over: Partial<CurveBuildInputs> = {}): CurveBuildInputs => ({ b: 'FDL', i: 0.0275, cred: 0.8, dotsPath: flat(0.0275), modelPathRates: flat(0.0275), rStarCb: 0.0075,
  piE1: 0.02, piE5: 0.02, tp: { b: 'FDL', piE5: 0.02, target: 0.02, debtGdp: 0.95, dStar: 1.10, qeHoldingsGdp: 0, fear: 50, shockSum: 0 },
  sov: { hazard: 0.0005 } as SovereignCreditState, liq: 0, conv: 0.002, fsi: 0, swapLineActive: false, hHat: 0.5, inversionDays: 0, p: P, ...over });
describe('T04-07 ĥ, market path, buildCurve', () => {
  const d: PublishedData = { piCb: 0.03, xGdpPub: 0, uPub: BLOC_DEFAULTS.FDL.nairu, fsi: 0, depYoy: 0 };
  const smoothed = (h: number, iPrev: number, rs: number) => { const c = coeffsFromHawk('FDL', h, 'DUAL', P); return iPrev + c.rho * (ruleRate(rs, d, 0.02, BLOC_DEFAULTS.FDL.nairu, 'FDL', c).iStar - iPrev); };
  it('impliedHawk: 0.0275 → 0.03 at π_cb 0.03, x 0 returns the root within 1e−9; no root → nearer endpoint; stepHHat(0.5, 0.9) = 0.58', () => {
    const h = impliedHawk(0.0275, 0.03, 0, d, 0.02, BLOC_DEFAULTS.FDL.nairu, 'FDL', 'DUAL', P);
    expect(h).toBeGreaterThan(0); expect(h).toBeLessThan(1);
    expect(Math.abs(smoothed(h, 0.0275, 0) - 0.03)).toBeLessThan(1e-9);
    expect(impliedHawk(0.0275, 0.10, 0, d, 0.02, BLOC_DEFAULTS.FDL.nairu, 'FDL', 'DUAL', P)).toBe(1);
    expect(impliedHawk(0.0275, -0.05, 0, d, 0.02, BLOC_DEFAULTS.FDL.nairu, 'FDL', 'DUAL', P)).toBe(0);
    expect(stepHHat(0.5, 0.9)).toBeCloseTo(0.58, 15);
  });
  it('marketPath: E_h = cred·dots + (1 − cred)·model', () => {
    expect(marketPath(0.75, flat(0.04), flat(0.02)).map((x) => x.rate)).toEqual([0.035, 0.035, 0.035, 0.035].map((y) => expect.closeTo(y, 15)));
    expect(marketPath(0.5, [{ horizonQuarters: 1, rate: 0.04 }], flat(0.02))[0]!.rate).toBeCloseTo(0.03, 15);
    expect(marketPath(0.5, [{ horizonQuarters: 1, rate: 0.04 }], flat(0.02))[3]!.rate).toBe(0.02);
  });
  it('04#17 FU steady state: OIS 0.0275 at every node, card node yields, endpoints, NS residuals ≤ 2 bp', () => {
    const c = buildCurve(ss(), 100);
    for (const o of c.ois) expect(o.yield).toBeCloseTo(0.0275, 12);
    expect(c.tp10).toBeCloseTo(0.00455, 9);
    expect(c.nodes.map((n) => n.yield)).toEqual([0.0259863, 0.0262744, 0.0268005, 0.0276784, 0.0293367, 0.0303500, 0.0307541].map((y) => expect.closeTo(y, 7)));
    const y0 = c.nodes[0]!.yield, o0 = c.ois[0]!.yield;
    expect(Math.abs(y0 - o0 - (tpAt(c.tp10, 0.25) + sovSpread(0.25, 0.0005, 0.6) + 0 - 0.002))).toBeLessThan(1e-9);
    expect(Math.abs(y0 - o0)).toBeLessThanOrEqual(0.0025);
    expect(Math.abs(c.nodes[6]!.yield - (c.nInf + tpAt(c.tp10, 30) + sovSpread(30, 0.0005, 0.6) - 0.002))).toBeLessThanOrEqual(0.0005);
    const { L, S, C } = c.ns as unknown as { L: number; S: number; C: number };
    expect([L, S, C].map((x) => x)).toEqual([0.0312191, -0.0056675, -0.0000633].map((x) => expect.closeTo(x, 7)));
    expect(c.marketImplied.map((x) => x.rate)).toEqual([0.0275, 0.0275, 0.0275, 0.0275]);
    expect(c.breakeven[5]!.yield).toBeCloseTo(0.02 + 0.002, 12);
    expect([c.id, c.tick, c.hHat, c.inversionDays, c.nInf]).toEqual(['FDL', 100, 0.5, 0, 0.0275]);
  });
  it('04#18 curve half: path 0.0275 → 0.0300 lifts OIS(2) 23.44 bp, OIS(10) 11.45 bp; Δy(2) ∈ [5, 25] bp and Δy(10) < Δy(2)', () => {
    const a = buildCurve(ss(), 100), b = buildCurve(ss({ dotsPath: flat(0.03), modelPathRates: flat(0.03) }), 100);
    const at = (c: typeof a, k: 'ois' | 'nodes', t: number) => c[k].find((n) => n.tenorYears === t)!.yield;
    expect((at(b, 'ois', 2) - at(a, 'ois', 2)) * 1e4).toBeCloseTo(23.44, 2);
    expect((at(b, 'ois', 10) - at(a, 'ois', 10)) * 1e4).toBeCloseTo(11.45, 2);
    const d2 = at(b, 'nodes', 2) - at(a, 'nodes', 2), d10 = at(b, 'nodes', 10) - at(a, 'nodes', 10);
    expect(d2).toBeGreaterThanOrEqual(0.0005); expect(d2).toBeLessThanOrEqual(0.0025); expect(d10).toBeLessThan(d2);
    expect(b.tp10).toBe(a.tp10);
  });
});

import { blocShockSum, recomputeCurve } from './curves';
import { cbRow } from '../testkit/cbWorld';
import { macroTables, type CurveState, type PublicMacroView } from '../schema';
describe('T04-07 recomputeCurve (store)', () => {
  const world = (shocks: unknown[] = []) => {
    const w = cbWorld([cbRow('FDL', { policyRate: 0.0275, credibility: 0.8, hawkishness: 0.5, mandate: 'DUAL', rStarBias: 0, dots: flat(0.0275), swapLinesOut: [] } as never)], 100);
    w.nums({ macro_cb_phi_fs: 1.5, macro_cb_smoothing: 0.5, macro_cb_max_step: 0.005, macro_cb_max_step_wide: 0.0075 });
    w.put(macroTables.bloc.name, { id: 'FDL', bloc: 'FDL', rStar: 0.0075, inflationExp1y: 0.02, inflationExp5y5y: 0.02, outputGap: 0, gapEstNoise: 0, dep: 0, shocks,
      fiscal: { debtGdp: 0.95 }, sovereign: { hazard: 0.0005, liquidityPremium: 0, convenienceYield: 0.002, spread10y: 0.0003, pd1y: 0.0005 } } as never);
    w.put(macroTables.global.name, { id: 'GLOBAL', fearIndex: 50, financialStressIndex: 0 } as never);
    w.put(macroTables.publicView.name, { id: 'FDL', bloc: 'FDL', prints: { CPI: null, JOBS: null }, qeHoldingsGdp: 0 } as never);
    return w;
  };
  it('04#17 through the store: mac.curve and the public curve block match buildCurve; ĥ 0.5 and 0 inversion days at genesis, then kept', () => {
    const w = world(), c = recomputeCurve(w.ctx, 'FDL', 'DAY_CLOSE');
    expect(c).toEqual(buildCurve(ss(), 100));
    expect(w.rows(macroTables.curve.name)).toEqual([c]);
    const v = w.rows(macroTables.publicView.name)[0] as PublicMacroView;
    expect([v.curve, v.ois, v.breakeven10y, v.termPremium10y, v.sovereignSpread10y, v.sovereignPd1y, v.marketImpliedPath]).toEqual([c.nodes, c.ois, c.breakeven[5]!.yield, c.tp10, 0.0003, 0.0005, c.marketImplied]);
    w.put(macroTables.curve.name, { ...c, hHat: 0.7, inversionDays: 3 } as CurveState);
    const c2 = recomputeCurve(w.ctx, 'FDL', 'RELEASE');
    expect([c2.hHat, c2.inversionDays]).toEqual([0.7, 3]);
  });
  it('tp10 shocks feed the term premium (stand-in for T04-18 activeShockSum)', () => {
    const sh = { id: 's', target: 'tp10', value: 0.001, startTick: 0, endTick: 10_000, shape: 'STEP', halfLifeDays: 0 };
    expect(blocShockSum([sh, { ...sh, target: 'x' }] as never, 'tp10', 100)).toBe(0.001);
    expect(recomputeCurve(world([sh]).ctx, 'FDL', 'DAY_CLOSE').tp10).toBeCloseTo(buildCurve(ss(), 100).tp10 + 0.001, 12);
  });
});
