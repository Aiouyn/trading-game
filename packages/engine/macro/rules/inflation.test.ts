// T04-05 inflation tests: 04#8, worked examples of §3.5 (core step, headline, clamps, effective FX).
import { describe, expect, it } from 'vitest';
import { dmath, type ParamsView } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { BLOC_ORDER, type BlocId, type BlocMacroState, type GlobalMacroState } from '../schema';
import { coreTarget, effectiveDepreciation, effectiveFxLn, headlineLevel, headlineYoy, priceIndexOf, stepCore, stepCoreLevel, stepExpectations } from './inflation';

/** The 23 DEFAULT from the T04-05 pack's parameter table. */
const PARAMS: Record<string, number> = { macro_phillips_slope: 0.25 };
const pv = { num: (k: string) => { const v = PARAMS[k]; if (v === undefined) throw new Error(`no param ${k}`); return v; } } as unknown as ParamsView;
const rec = <T>(f: (b: BlocId) => T): Record<BlocId, T> => ({ FDL: f('FDL'), EUN: f('EUN'), PYN: f('PYN'), NKR: f('NKR'), SRL: f('SRL') });

/** §3.5 pure run: energy shock lifts headline by `shock` for `shockDays`, core follows π_core* = π_e1 (x = 0, dep = 0, ε = 0).
 *  Each day updates from yesterday's state (headline = yesterday's π_core + shock; core target from yesterday's π_e1): this is the
 *  ordering that reproduces the card's reference numbers (1.09e−5, 0.004235, 0.005843). */
function run(cred: number, days: number, shockDays: number, shock = 0.03): { dE5: number; peak: number } {
  const target = 0.02; let core = target; let e1 = target; let e5 = target; let peak = 0;
  for (let d = 0; d < days; d++) {
    const r = stepExpectations(e1, e5, core + (d < shockDays ? shock : 0), target, cred);
    core = stepCore(core, coreTarget(e1, 0, 0.05, 0, pv), 0);
    e1 = r.piE1; e5 = r.piE5; peak = Math.max(peak, e5 - target);
  }
  return { dE5: e5 - target, peak };
}

describe('T04-05 inflation (04 §3.5)', () => {
  it('04#8 credibility anchors long expectations: cred 0.9 moves π_e5 by < 0.3 pp; cred 0.3 by far more', () => {
    const hi = run(0.9, 364, 364); const lo = run(0.3, 364, 364);
    expect(hi.dE5).toBeCloseTo(1.09e-5, 7);
    expect(hi.dE5).toBeLessThan(0.003);
    expect(lo.dE5).toBeCloseTo(0.004235, 6);
    expect(run(0.3, 4 * 364, 364).peak).toBeCloseTo(0.005843, 6);
    expect(lo.dE5).toBeGreaterThan(0.003);
    expect(lo.dE5).toBeGreaterThan(300 * hi.dE5);
  });
  // §3.5 formulas cannot reach the 04#8 literal "more than 0.8 pp" with cred 0.3 (peak 0.5843 pp): spec contradiction, reported.
  it.fails('04#8 literal band (spec contradiction): cred 0.3 moves π_e5 by more than 0.8 pp', () => {
    expect(run(0.3, 4 * 364, 364).peak).toBeGreaterThan(0.008);
  });

  it('worked core step: π_core 0.02, target* 0.0275 (π_e1 0.02 + 0.25·0.01 + 0.05·0.10) → 0.0200286', () => {
    const t = coreTarget(0.02, 0.01, 0.05, 0.10, pv);
    expect(t).toBeCloseTo(0.0275, 12);
    expect(stepCore(0.02, t, 0)).toBeCloseTo(0.0200286, 7);
    // noise term σ√Δ ε with σ 0.003
    expect(stepCore(0.02, 0.02, 1) - 0.02).toBeCloseTo(0.003 / Math.sqrt(364), 12);
  });
  it('macro_phillips_slope is read from params (κ)', () => {
    const p2 = { num: (k: string) => (k === 'macro_phillips_slope' ? 0.5 : NaN) } as unknown as ParamsView;
    expect(coreTarget(0, 0.01, 0, 0, p2)).toBeCloseTo(0.005, 12);
  });

  it('headline: core 102, energy 150, spot = spot0, weight 0.08 → 105.36284; EUN 1.10 → 1.00 with energy 120: 100·1.32^0.09 = 102.53016', () => {
    expect(headlineLevel(102, 150, 100, 1, 1, 0.08, 0.12)).toBeCloseTo(105.36284, 5);
    expect(BLOC_DEFAULTS.EUN.energyWeight).toBe(0.09);
    expect(headlineLevel(100, 120, 100, 1.00, 1.10, BLOC_DEFAULTS.EUN.energyWeight, 0)).toBeCloseTo(102.53016, 5);   // energy part only
    expect(headlineLevel(100, 100, 150, 1, 1, 0.08, 0.12)).toBeCloseTo(100 * dmath.pow(1.5, 0.12), 10);   // food leg
    expect(headlineYoy(105, 100)).toBeCloseTo(dmath.ln(1.05), 15);
  });

  it('core level compounds × exp(π_core/364)', () => {
    let lvl = 100; for (let d = 0; d < 364; d++) lvl = stepCoreLevel(lvl, 0.02);
    expect(lvl).toBeCloseTo(100 * dmath.exp(0.02), 9);
  });

  it('clamps: target 2.0 converges to and never exceeds 0.60; deflation floor −0.05', () => {
    let c = 0.02; let mx = 0;
    for (let d = 0; d < 20 * 364; d++) { c = stepCore(c, 2.0, 0); mx = Math.max(mx, c); }
    expect(mx).toBe(0.60); expect(c).toBe(0.60);
    let f = 0.02; for (let d = 0; d < 20 * 364; d++) f = stepCore(f, -2.0, 0);
    expect(f).toBe(-0.05);
    expect(stepCore(0.5999, 0.60, 1e6)).toBe(0.60);
    expect(stepCore(-0.0499, -0.05, -1e6)).toBe(-0.05);
  });

  it('effectiveFxLn: FDL at fx0 → reference value; doubling SRL raises SRL by ln 2; weights renormalized over the other four', () => {
    const fx0 = rec((b) => BLOC_DEFAULTS[b].fx0); const w = rec((b) => BLOC_DEFAULTS[b].gdpShare0);
    let ref = 0; let ws = 0;
    for (const y of BLOC_ORDER) if (y !== 'FDL') ws += w[y];
    for (const y of BLOC_ORDER) if (y !== 'FDL') ref += (w[y] / ws) * (dmath.ln(fx0.FDL) - dmath.ln(fx0[y]));
    expect(effectiveFxLn('FDL', fx0, w)).toBeCloseTo(ref, 14);
    const base = effectiveFxLn('SRL', fx0, w);
    expect(effectiveFxLn('SRL', { ...fx0, SRL: 2 * fx0.SRL }, w) - base).toBeCloseTo(dmath.ln(2), 14);
    // own weight ignored; others renormalized
    expect(effectiveFxLn('SRL', fx0, { ...w, SRL: 99 })).toBeCloseTo(base, 14);
    expect(effectiveFxLn('FDL', { ...fx0, EUN: 2 * fx0.EUN }, { FDL: 0.5, EUN: 1, PYN: 1, NKR: 1, SRL: 1 }) - effectiveFxLn('FDL', fx0, { FDL: 0.5, EUN: 1, PYN: 1, NKR: 1, SRL: 1 }))
      .toBeCloseTo(-0.25 * dmath.ln(2), 14);
    expect(effectiveDepreciation(0.1, 0.3)).toBeCloseTo(0.2, 15);
  });

  it('stepExpectations: π_e5 uses the updated π_e1; cred 1 pins both to target', () => {
    const r = stepExpectations(0.02, 0.02, 0.05, 0.02, 0.5);
    const e1 = 0.02 + (dmath.ln(2) / 0.25) * (0.5 * 0.05 + 0.5 * 0.02 - 0.02) / 364;
    expect(r.piE1).toBeCloseTo(e1, 15);
    expect(r.piE5).toBeCloseTo(0.02 + dmath.ln(2) * (0.25 * e1 + 0.75 * 0.02 - 0.02) / 364, 15);
    expect(stepExpectations(0.03, 0.04, 0.10, 0.02, 1)).toEqual({ piE1: 0.03 + (dmath.ln(2) / 0.25) * (0.02 - 0.03) / 364, piE5: 0.04 + dmath.ln(2) * (0.02 - 0.04) / 364 });
  });

  it('priceIndexOf serves CPI, CORE, WAGE, ENERGY_LOCAL, FOOD_LOCAL (genesis = 100)', () => {
    const st = { cpiLevel: 104, coreCpiLevel: 103, wageIndex: 105 } as BlocMacroState;
    const g = { energyIndex: 120, foodIndex: 90 } as GlobalMacroState;
    expect(priceIndexOf(st, g, 1, 1.1, 'CPI')).toBe(104);
    expect(priceIndexOf(st, g, 1, 1.1, 'CORE')).toBe(103);
    expect(priceIndexOf(st, g, 1, 1.1, 'WAGE')).toBe(105);
    expect(priceIndexOf(st, g, 1, 1.1, 'ENERGY_LOCAL')).toBeCloseTo(132, 10);
    expect(priceIndexOf(st, g, 1, 1.1, 'FOOD_LOCAL')).toBeCloseTo(99, 10);
  });
});
