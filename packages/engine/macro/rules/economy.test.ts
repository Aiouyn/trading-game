import { describe, expect, it } from 'vitest';
import { createParamsView } from '@tycoon/params';
import type { ParamsView } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { BLOC_ORDER, REGIMES } from '../schema';
import * as economy from './economy';
import { gapTerms, gdpGrowthQoQAnn, outputGapTarget, potentialGrowth, smoothRealRateGap, stepLevels, stepNeutralRate, stepOutputGap,
  stepUnemployment, stepWageIndex, wageGrowth, type GapInputs, type GapTerms } from './economy';


const T0404_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  macro_scale_ref_players: 5000, macro_scale_min: 0.2, macro_scale_max: 400, macro_world_gdp_ref: 100e12,
  macro_policy_lag_days: 120, macro_gap_halflife_years: 0.30, macro_gap_vol: 0.008, macro_ai_productivity_max: 0.005,
  macro_xreg_exp: 0.005, macro_xreg_ovh: 0.025, macro_xreg_con: -0.04, macro_xreg_rec: -0.01,
  macro_x_a_r: 0.5, macro_x_m: 0.8, macro_x_a_c: 0.012, macro_x_a_e: 0.4, macro_x_a_q: 0.10, macro_x_a_o: 0.03, macro_x_a_f: 0.010,
  macro_x_a_w: 0.05, macro_x_a_h: 0.08, macro_x_a_t: 0.2, macro_x_a_k: 0.010,
});

function testParams(over: Record<string, number> = {}, reads: string[] = []): ParamsView {
  const m: Record<string, number> = { ...T0404_DEFAULTS, ...over };
  return { ...createParamsView([]), num: (k) => { reads.push(k); if (!(k in m)) throw new Error(`unknown param ${k}`); return m[k]!; } };
}

const p = testParams();
const NEUTRAL: GapInputs = { i: 0, piE1: 0, rStar: 0, regime: 'EXPANSION', fiscalImpulse: 0, sovStress: 0, atElb: false, creditConditions: 0,
  openness: 0, xOthers: 0, realFxGap: 0, energyYoyLn: 0, commodityExporter: 0, fear: 30, eqIndex: null, eqMean364: null, housePriceGap: 0,
  wtiNow: 1, wtiMean364: 1, worldHackRate: 0, shockSum: 0 };
const CHANNELS = ['monetary', 'fiscal', 'credit', 'external', 'realFx', 'energy', 'fear', 'wealth', 'trade', 'cyber', 'shocks'] as const;
/** Every channel term except `only` is 0 (±0), and xReg is the EXPANSION attractor. */
const onlyTerm = (t: GapTerms, only: (typeof CHANNELS)[number] | null): void => {
  for (const k of CHANNELS) if (k !== only) expect(t[k] === 0, k).toBe(true);
  expect(t.xReg).toBe(0.005);
};
const zeroTerms = (o: Partial<GapTerms> = {}): GapTerms => ({ monetary: 0, fiscal: 0, credit: 0, external: 0, realFx: 0, energy: 0, fear: 0, wealth: 0,
  trade: 0, cyber: 0, shocks: 0, xReg: 0, ...o });

describe('T04-04 economy.ts exports', () => {
  it('exports exactly the card list', () => {
    expect(Object.keys(economy).sort()).toEqual(['gapTerms', 'gdpGrowthQoQAnn', 'outputGapTarget', 'potentialGrowth', 'smoothRealRateGap',
      'stepLevels', 'stepNeutralRate', 'stepOutputGap', 'stepUnemployment', 'stepWageIndex', 'wageGrowth']);
  });
});

describe('smoothRealRateGap (§3.4.1 step 1, E-87 (7))', () => {
  it('α = 1 − 2^(−1/macro_policy_lag_days) = 0.0057596 at 120, read from the param', () => {
    const reads: string[] = [];
    const a = smoothRealRateGap(0, 0.01, 0, 0, testParams({}, reads));
    expect(reads).toEqual(['macro_policy_lag_days']);
    expect(a / 0.01).toBeCloseTo(0.0057596, 7);
    expect(smoothRealRateGap(0, 0.01, 0, 0, testParams({ macro_policy_lag_days: 60 })) / 0.01).toBeCloseTo(1 - 2 ** (-1 / 60), 15);
    expect(smoothRealRateGap(0, 0.01, 0, 0, testParams({ macro_policy_lag_days: 240 })) / 0.01).toBeCloseTo(1 - 2 ** (-1 / 240), 15);
  });
  it('R = i − π_e1 − r*', () => {
    const a = 1 - 2 ** (-1 / 120);
    expect(smoothRealRateGap(0, 0.05, 0.02, 0.01, p)).toBeCloseTo(0.02 * a, 16);
    expect(smoothRealRateGap(0, 0.03, 0.02, 0.0, p)).toBeCloseTo(0.01 * a, 16);
    expect(smoothRealRateGap(0, 0.03, 0.0, 0.02, p)).toBeCloseTo(0.01 * a, 16);
    expect(smoothRealRateGap(0.004, 0.004, 0, 0, p)).toBe(0.004);
    expect(smoothRealRateGap(0.01, 0, 0, 0, p)).toBeCloseTo(0.01 * (1 - a), 16);
  });
  it('AC E87-7: a constant R of 0.01 from R̃_0 = 0 reaches 0.0087786 ± 1e-9 after 364 days', () => {
    let R = 0;
    for (let d = 0; d < 364; d++) R = smoothRealRateGap(R, 0.01, 0, 0, p);
    expect(R).toBeCloseTo(0.01 * (1 - 2 ** (-364 / 120)), 15);
    // Spec question: 0.0087786 is the 7-dp rounding of 0.00877855004; |R − 0.0087786| = 5.0e-8, so the literal ±1e-9 band only holds
    // against the unrounded figure. Pinned: the unrounded value ± 1e-9, and the 7-dp figure at toBeCloseTo(…, 7).
    expect(Math.abs(R - 0.00877855004)).toBeLessThan(1e-9);
    expect(R).toBeCloseTo(0.0087786, 7);
  });
});

describe('gapTerms: each channel alone (11 table rows) and the regime attractor', () => {
  it('neutral inputs give all channel terms 0', () => onlyTerm(gapTerms(NEUTRAL, 0, p), null));
  it('monetary −a_r·R̃', () => { const t = gapTerms(NEUTRAL, 0.01, p); onlyTerm(t, 'monetary'); expect(t.monetary).toBe(-0.005); });
  it('fiscal m·FI, m = 0.8(1 − 0.5·stress), ×1.25 at the ELB', () => {
    let t = gapTerms({ ...NEUTRAL, fiscalImpulse: 0.01 }, 0, p); onlyTerm(t, 'fiscal'); expect(t.fiscal).toBeCloseTo(0.008, 16);
    t = gapTerms({ ...NEUTRAL, fiscalImpulse: 0.01, sovStress: 0.5 }, 0, p); expect(t.fiscal).toBeCloseTo(0.006, 16);
    t = gapTerms({ ...NEUTRAL, fiscalImpulse: 0.01, atElb: true }, 0, p); expect(t.fiscal).toBeCloseTo(0.01, 16);
    t = gapTerms({ ...NEUTRAL, fiscalImpulse: 0.01, sovStress: 1, atElb: true }, 0, p); expect(t.fiscal).toBeCloseTo(0.005, 16);
  });
  it('credit a_c·creditConditions', () => { const t = gapTerms({ ...NEUTRAL, creditConditions: -1 }, 0, p); onlyTerm(t, 'credit'); expect(t.credit).toBe(-0.012); });
  it('external a_e·openness·x_others', () => {
    const t = gapTerms({ ...NEUTRAL, openness: 0.5, xOthers: 0.02 }, 0, p); onlyTerm(t, 'external'); expect(t.external).toBeCloseTo(0.004, 16);
    expect(gapTerms({ ...NEUTRAL, xOthers: 0.02 }, 0, p).external === 0).toBe(true);
  });
  it('real FX −a_q·q̃', () => { const t = gapTerms({ ...NEUTRAL, realFxGap: 0.1 }, 0, p); onlyTerm(t, 'realFx'); expect(t.realFx).toBeCloseTo(-0.01, 16); });
  it('energy −a_o·clamp(e_yoy, ±1.5)·(1 − 1.5·commodityExporter)', () => {
    let t = gapTerms({ ...NEUTRAL, energyYoyLn: 0.5 }, 0, p); onlyTerm(t, 'energy'); expect(t.energy).toBeCloseTo(-0.015, 16);
    t = gapTerms({ ...NEUTRAL, energyYoyLn: 3 }, 0, p); expect(t.energy).toBeCloseTo(-0.045, 16);
    t = gapTerms({ ...NEUTRAL, energyYoyLn: -3 }, 0, p); expect(t.energy).toBeCloseTo(0.045, 16);
    t = gapTerms({ ...NEUTRAL, energyYoyLn: 0.5, commodityExporter: 0.9 }, 0, p); expect(t.energy).toBeCloseTo(0.00525, 16);
    expect(gapTerms({ ...NEUTRAL, commodityExporter: 0.9 }, 0, p).energy === 0).toBe(true);
  });
  it('fear −a_f·(F − 30)/20', () => {
    const t = gapTerms({ ...NEUTRAL, fear: 70 }, 0, p); onlyTerm(t, 'fear'); expect(t.fear).toBeCloseTo(-0.02, 16);
    expect(gapTerms({ ...NEUTRAL, fear: 10 }, 0, p).fear).toBeCloseTo(0.01, 16);
  });
  it('wealth a_w·ln(EQ/mean364) + a_h·housePriceGap; EQ missing → 0', () => {
    let t = gapTerms({ ...NEUTRAL, eqIndex: 110, eqMean364: 100 }, 0, p); onlyTerm(t, 'wealth'); expect(t.wealth).toBeCloseTo(0.05 * Math.log(1.1), 15);
    t = gapTerms({ ...NEUTRAL, housePriceGap: 0.1 }, 0, p); onlyTerm(t, 'wealth'); expect(t.wealth).toBeCloseTo(0.008, 16);
    t = gapTerms({ ...NEUTRAL, eqIndex: 110, eqMean364: null, housePriceGap: 0.1 }, 0, p); expect(t.wealth).toBeCloseTo(0.008, 16);
    t = gapTerms({ ...NEUTRAL, eqIndex: null, eqMean364: 100 }, 0, p); expect(t.wealth === 0).toBe(true);
    t = gapTerms({ ...NEUTRAL, eqIndex: 110, eqMean364: 0 }, 0, p); expect(t.wealth === 0).toBe(true);
  });
  it('trade a_t·openness·ln(WTI/mean364)', () => {
    const t = gapTerms({ ...NEUTRAL, openness: 0.5, wtiNow: 90, wtiMean364: 75 }, 0, p); onlyTerm(t, 'trade');
    expect(t.trade).toBeCloseTo(0.1 * Math.log(1.2), 15);
    expect(gapTerms({ ...NEUTRAL, openness: 0.5, wtiNow: 90, wtiMean364: 0 }, 0, p).trade === 0).toBe(true);
  });
  it('cyber −a_k·max(0, hack − 70)/30', () => {
    const t = gapTerms({ ...NEUTRAL, worldHackRate: 85 }, 0, p); onlyTerm(t, 'cyber'); expect(t.cyber).toBeCloseTo(-0.005, 16);
    expect(gapTerms({ ...NEUTRAL, worldHackRate: 60 }, 0, p).cyber === 0).toBe(true);
    expect(gapTerms({ ...NEUTRAL, worldHackRate: 100 }, 0, p).cyber).toBeCloseTo(-0.01, 16);
  });
  it('shocks Σ shock.value (T04-18 evaluates the shapes; passed in as shockSum)', () => {
    const t = gapTerms({ ...NEUTRAL, shockSum: -0.03 }, 0, p); onlyTerm(t, 'shocks'); expect(t.shocks).toBe(-0.03);
  });
  it('x_reg by regime: +0.005, +0.025, −0.04, −0.01 from macro_xreg_exp/ovh/con/rec', () => {
    const want = { EXPANSION: 0.005, OVERHEATING: 0.025, CONTRACTION: -0.04, RECOVERY: -0.01 };
    for (const r of REGIMES) expect(gapTerms({ ...NEUTRAL, regime: r }, 0, p).xReg, r).toBe(want[r]);
    expect(gapTerms({ ...NEUTRAL, regime: 'CONTRACTION' }, 0, testParams({ macro_xreg_con: -0.06 })).xReg).toBe(-0.06);
  });
  it('every coefficient is read through ctx.params under the card key names', () => {
    const reads: string[] = [];
    gapTerms({ ...NEUTRAL, eqIndex: 1, eqMean364: 1 }, 0, testParams({}, reads));
    expect([...reads].sort()).toEqual(['macro_x_a_c', 'macro_x_a_e', 'macro_x_a_f', 'macro_x_a_h', 'macro_x_a_k', 'macro_x_a_o', 'macro_x_a_q',
      'macro_x_a_r', 'macro_x_a_t', 'macro_x_a_w', 'macro_x_m', 'macro_xreg_exp']);
    const ones = { macro_x_a_r: 1, macro_x_m: 1, macro_x_a_c: 1, macro_x_a_e: 1, macro_x_a_q: 1, macro_x_a_o: 1, macro_x_a_f: 1, macro_x_a_w: 1,
      macro_x_a_h: 1, macro_x_a_t: 1, macro_x_a_k: 1 };
    const t = gapTerms({ ...NEUTRAL, fiscalImpulse: 0.01, creditConditions: 1, openness: 1, xOthers: 1, realFxGap: 1, energyYoyLn: 1, fear: 50,
      eqIndex: 110, eqMean364: 100, housePriceGap: 1, wtiNow: 2, wtiMean364: 1, worldHackRate: 100 }, 1, testParams(ones));
    expect(t.monetary).toBe(-1); expect(t.fiscal).toBe(0.01); expect(t.credit).toBe(1); expect(t.external).toBe(1); expect(t.realFx).toBe(-1);
    expect(t.energy).toBe(-1); expect(t.fear).toBe(-1); expect(t.wealth).toBeCloseTo(Math.log(1.1) + 1, 15); expect(t.trade).toBeCloseTo(Math.log(2), 15);
    expect(t.cyber).toBe(-1);
  });
});

describe('outputGapTarget and stepOutputGap (§3.4.1 steps 4–5)', () => {
  it('x_target = clamp(x_reg + Σ, −0.12, +0.08)', () => {
    expect(outputGapTarget(zeroTerms({ xReg: 0.005, monetary: -0.002, fiscal: 0.001 }))).toBeCloseTo(0.004, 16);
    for (const k of CHANNELS) expect(outputGapTarget(zeroTerms({ [k]: 0.01 })), k).toBe(0.01);
    expect(outputGapTarget(zeroTerms({ xReg: 0.025, shocks: 0.1 }))).toBe(0.08);
    expect(outputGapTarget(zeroTerms({ xReg: -0.04, shocks: -0.1 }))).toBe(-0.12);
  });
  it('worked step: x 0, x_target 0.005, ε 0 → 3.17375e−5; ε = 1 adds 4.19314e−4', () => {
    const a = stepOutputGap(0, 0.005, 0, p);
    expect(a).toBeCloseTo(3.17375e-5, 10);
    expect(stepOutputGap(0, 0.005, 1, p) - a).toBeCloseTo(4.19314e-4, 9);
    expect(stepOutputGap(0, 0.005, -1, p) - a).toBeCloseTo(-4.19314e-4, 9);
    expect(stepOutputGap(0.01, 0.01, 0, p)).toBe(0.01);
  });
  it('θ_x and σ_x come from macro_gap_halflife_years and macro_gap_vol', () => {
    const reads: string[] = [];
    stepOutputGap(0, 0.005, 1, testParams({}, reads));
    expect([...reads].sort()).toEqual(['macro_gap_halflife_years', 'macro_gap_vol']);
    expect(stepOutputGap(0, 0.005, 0, testParams({ macro_gap_halflife_years: 0.5 }))).toBeCloseTo(Math.LN2 / 0.5 * 0.005 / 364, 15);
    expect(stepOutputGap(0, 0, 1, testParams({ macro_gap_vol: 0.004 }))).toBeCloseTo(0.004 / Math.sqrt(364), 15);
  });
});

describe('04#7: a 1 pp permanent policy-rate rise lowers the output gap by 0.4–0.6 pp after 1 game year', () => {
  const run = (i: number, days: number): { xT: number; x: number } => {
    const q = testParams({ macro_xreg_exp: 0, macro_gap_vol: 0 });
    let R = 0, x = 0, xT = 0;
    for (let d = 0; d < days; d++) {
      R = smoothRealRateGap(R, i, 0, 0, q);
      xT = outputGapTarget(gapTerms({ ...NEUTRAL, i }, R, q));
      x = stepOutputGap(x, xT, 0, q);
    }
    return { xT, x };
  };
  it('x_target_B − x_target_A after 364 days ∈ [−0.006, −0.004] (−0.0043893); realized −0.0032377; 5-year limit within 1e-4 of −0.005', () => {
    const A = run(0, 364), B = run(0.01, 364);
    expect(B.xT - A.xT).toBeGreaterThanOrEqual(-0.006);
    expect(B.xT - A.xT).toBeLessThanOrEqual(-0.004);
    expect(B.xT - A.xT).toBeCloseTo(-0.0043893, 7);
    expect(B.x - A.x).toBeLessThan(0);
    expect(B.x - A.x).toBeCloseTo(-0.0032377, 7);
    const A5 = run(0, 5 * 364), B5 = run(0.01, 5 * 364);
    expect(Math.abs((B5.x - A5.x) - -0.005)).toBeLessThan(1e-4);
  });
});

describe('§3.4.2 growth and levels', () => {
  it('potential growth FDL with AI race 80 → 0.028; 50 → potentialGrowth0; techShare scales', () => {
    expect(potentialGrowth('FDL', 80, p)).toBeCloseTo(0.028, 16);
    for (const b of BLOC_ORDER) expect(potentialGrowth(b, 50, p), b).toBe(BLOC_DEFAULTS[b].potentialGrowth0);
    expect(potentialGrowth('SRL', 100, p)).toBeCloseTo(0.045 + 0.005 * 0.3, 16);
    expect(potentialGrowth('PYN', 0, p)).toBeCloseTo(0.040 - 0.005 * 0.9, 16);
    expect(potentialGrowth('FDL', 80, testParams({ macro_ai_productivity_max: 0.01 }))).toBeCloseTo(0.031, 16);
  });
  it('stepLevels: potential × exp(g/364), real = potential × (1 + x)', () => {
    const r = stepLevels({ potentialGdpIndex: 100, realGdpIndex: 99, outputGap: 0.02 }, 0.0364);
    expect(r.potentialGdpIndex).toBeCloseTo(100 * Math.exp(0.0001), 12);
    expect(r.realGdpIndex).toBeCloseTo(100 * Math.exp(0.0001) * 1.02, 12);
    expect(stepLevels({ potentialGdpIndex: 100, realGdpIndex: 100, outputGap: 0 }, 0).realGdpIndex).toBe(100);
  });
  it('gdpGrowthQoQAnn = 4·ln(now/then)', () => {
    expect(gdpGrowthQoQAnn(101, 100)).toBeCloseTo(4 * Math.log(1.01), 14);
    expect(gdpGrowthQoQAnn(100, 100)).toBe(0);
    expect(gdpGrowthQoQAnn(98, 100)).toBeCloseTo(4 * Math.log(0.98), 14);
  });
});

describe('§3.4.3 unemployment and wages', () => {
  it('Okun: u 0.06, u* 0.045, x −0.02 → u_target 0.055, next u = 0.0599526', () => {
    expect(stepUnemployment(0.06, 0.045, -0.02)).toBeCloseTo(0.0599526, 7);
    expect(stepUnemployment(0.055, 0.045, -0.02)).toBeCloseTo(0.055, 15);
  });
  it('floor 0.015 and cap 0.30', () => {
    expect(stepUnemployment(0.015, 0.0, 0.08)).toBe(0.015);
    expect(stepUnemployment(0.30, 0.5, -0.12)).toBe(0.30);
    expect(stepUnemployment(0.02, 0.0, 0.08)).toBeCloseTo(0.02 + (-0.04 - 0.02) * (1 - 2 ** (-1 / 72.8)), 15);
    expect(stepUnemployment(0.29, 0.5, -0.12)).toBeCloseTo(0.29 + (0.56 - 0.29) * (1 - 2 ** (-1 / 72.8)), 15);
  });
  it('wage: π_e1 0.02, g_pot 0.025, LF 0.006, u 0.06, u* 0.045 → w 0.0315; wageIndex 100 → 100.008654', () => {
    const w = wageGrowth(0.02, 0.025, 0.006, 0.06, 0.045);
    expect(w).toBeCloseTo(0.0315, 15);
    expect(stepWageIndex(w, 100)).toBeCloseTo(100.008654, 6);
    expect(wageGrowth(0, 0, 0, 0.045, 0.045)).toBe(0);
    expect(wageGrowth(0, 0.01, 0, 0, 0)).toBe(0.01);
    expect(wageGrowth(0, 0, 0.01, 0, 0)).toBe(-0.01);
    expect(stepWageIndex(0, 123)).toBe(123);
  });
});

describe('§3.4.4 neutral rate', () => {
  it('r* = r*_0 + 0.5(g_pot − potentialGrowth0) + RW; RW steps by 0.001·√Δ·ε', () => {
    const s = stepNeutralRate(0, 1, 'FDL', 0.025);
    expect(s.rw).toBeCloseTo(0.001 / Math.sqrt(364), 16);
    expect(s.rStar).toBeCloseTo(0.0075 + 0.001 / Math.sqrt(364), 16);
    const t = stepNeutralRate(0.002, 0, 'FDL', 0.028);
    expect(t.rw).toBe(0.002);
    expect(t.rStar).toBeCloseTo(0.0075 + 0.0015 + 0.002, 16);
    expect(stepNeutralRate(0, 0, 'SRL', 0.045).rStar).toBe(0.02);
  });
  it('RW clamps so r* stays within r*_0 ± 0.01', () => {
    const hi = stepNeutralRate(0.0099, 1000, 'FDL', 0.028);
    expect(hi.rStar).toBeCloseTo(0.0075 + 0.01, 15);
    expect(hi.rw).toBeCloseTo(0.01 - 0.0015, 15);
    const lo = stepNeutralRate(-0.0099, -1000, 'EUN', 0.013);
    expect(lo.rStar).toBeCloseTo(0.0025 - 0.01, 15);
  });
  it('property: r* stays within r*_0 ± 0.01 over 100 simulated years (seeded normal draws, 8 seeds × 5 blocs)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      let s = seed >>> 0;
      const u = (): number => {
        s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (const b of BLOC_ORDER) {
        const r0 = BLOC_DEFAULTS[b].rStar0;
        let rw = 0, maxDev = 0, bad = 0;
        for (let d = 0; d < 100 * 364; d++) {
          const eps = 30 * Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());   // ×30 so the walk reaches the band
          const n = stepNeutralRate(rw, eps, b, potentialGrowth(b, 100 * u(), p));
          rw = n.rw;
          const dev = Math.abs(n.rStar - r0);
          if (dev > 0.01 + 1e-15) bad++;
          if (dev > maxDev) maxDev = dev;
        }
        expect(bad, `${b} seed ${seed}`).toBe(0);
        expect(maxDev).toBeGreaterThan(0.009);
      }
    }
  });
});
