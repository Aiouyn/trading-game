import { describe, expect, it } from 'vitest';
import { dmath } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { GRADES, hazardRaw, hazardWeights, hazardZ, hTerm, isInvestmentGrade, liquidityPremium, lowestOfTwoBest, marketHazard, pdAt, sovSpread,
  stepHazard, stressIndexOf, type HazardInputs } from './sovCredit';

const LGD = 0.6;   // macro_sov_lgd (E-100)
const NOMODS = { concordActive: false, postRestructuringDays: null, shockMult: 1 };
const close = (a: number, b: number, dp = 7) => expect(a).toBeCloseTo(b, dp);
const base = (o: Partial<HazardInputs>): HazardInputs => ({ b: 'FDL', debtGdp: 1.1, dStar: 1.1, rEff: 0.025, gPot: 0.025, target: 0.02, primaryBalanceGdp: 0,
  fxDebtShare: 0, depVsFdlYoy: 0, reserveCoverMonths: 6, fxRegime: 'FREE_FLOAT', fear: 50, politicalStability: 0.5, failedAuctions21d: 0, coreInflation: 0.02, ...o });
const wz = (z: number[], w: number[]) => z.reduce((s, v, k) => s + w[k]! * dmath.clamp(v, -3, 4), 0);

describe('T04-07 sovereign hazard (§3.11.1)', () => {
  it('FU genesis worked: z1 −0.375, z2 0.0333, z6 −0.8 → Σ −0.823333, λ_raw 0.000219483', () => {
    const z = hazardZ(base({ debtGdp: 0.95, rEff: 0.025, gPot: 0.025, primaryBalanceGdp: -0.02, politicalStability: 0.7 }));
    close(z[0]!, -0.375, 12); close(z[1]!, 0.0333333, 7); close(z[5]!, -0.8, 12);
    for (const k of [2, 3, 4, 6, 7]) expect(z[k]).toBe(0);
    close(wz(z, hazardWeights('FDL')), -0.823333, 6);
    close(hazardRaw(BLOC_DEFAULTS.FDL.sovereignBaseHazard, z, hazardWeights('FDL'), 'FDL', NOMODS), 0.000219483, 9);
  });
  it('SRL worked: z, Σw·z 1.813333, λ_raw 0.1226170, smoothing from 0.02 → 0.0332837, stress 0.1301976, s10 / s0.25 / pd1y / pd5y', () => {
    const z = hazardZ(base({ b: 'SRL', debtGdp: 0.70, dStar: 0.5, primaryBalanceGdp: -0.015, rEff: 0.09, gPot: 0.035, target: 0.05, fxDebtShare: 0.3, depVsFdlYoy: 0.10,
      fxRegime: 'MANAGED_FLOAT', reserveCoverMonths: 4, fear: 60, politicalStability: 0.6, coreInflation: 0.06 }));
    const want = [0.5, 0.616667, 0.3, 0.666667, 0.4, -0.4, 0, 0.2];
    z.forEach((v, k) => close(v, want[k]!, 6));
    close(wz(z, hazardWeights('SRL')), 1.813333, 6);
    const raw = hazardRaw(0.02, z, hazardWeights('SRL'), 'SRL', NOMODS);
    close(raw, 0.1226170, 7);
    const l = stepHazard(0.02, raw, false);
    close(l, 0.0332837, 7); close(stressIndexOf(l, 0.02), 0.1301976, 7);
    close(sovSpread(10, l, LGD), 0.0199702, 7); close(sovSpread(0.25, l, LGD), 0.0123815, 7);
    close(pdAt(1, l), 0.0223787, 7); close(pdAt(5, l), 0.1533082, 7);
  });
  it('distress shape: λ 0.10 → s10 0.06, s0.25 0.0771 (inverted), pd1y 0.1166202, pd5y 0.3934693; λ 0.08 is still normal', () => {
    close(sovSpread(10, 0.10, LGD), 0.06, 12); close(sovSpread(0.25, 0.10, LGD), 0.0771, 12);
    close(pdAt(1, 0.10), 0.1166202, 7); close(pdAt(5, 0.10), 0.3934693, 7);
    expect(hTerm(0.25, 0.08)).toBeCloseTo(0.62, 12); expect(hTerm(30, 0.5)).toBeCloseTo(1.0, 12); expect(hTerm(2.5, 0)).toBeCloseTo(0.8, 12);
  });
  it('weights: [1.2, 0.8, 1.0, 0.6, w5, 0.5, 0.7, 0.3], w5 FU −0.2, NA −0.1, else 0.4', () => {
    expect(hazardWeights('FDL')).toEqual([1.2, 0.8, 1.0, 0.6, -0.2, 0.5, 0.7, 0.3]);
    expect(hazardWeights('NKR')[4]).toBe(-0.1);
    for (const b of ['EUN', 'PYN', 'SRL'] as const) expect(hazardWeights(b)[4]).toBe(0.4);
  });
  it('z4 only under MANAGED_FLOAT, MANAGED_BAND, HARD_PEG; z3 ignores appreciation; z8 ignores core below target', () => {
    for (const r of ['MANAGED_FLOAT', 'MANAGED_BAND', 'HARD_PEG'] as const) close(hazardZ(base({ fxRegime: r, reserveCoverMonths: 3 }))[3]!, 1, 12);
    expect(hazardZ(base({ fxRegime: 'FREE_FLOAT', reserveCoverMonths: 3 }))[3]).toBe(0);
    expect(hazardZ(base({ fxRegime: 'HARD_PEG', reserveCoverMonths: 9 }))[3]).toBe(0);
    expect(hazardZ(base({ fxDebtShare: 0.5, depVsFdlYoy: -0.2 }))[2]).toBe(0);
    expect(hazardZ(base({ coreInflation: 0.01 }))[7]).toBe(0);
    expect(hazardZ(base({ failedAuctions21d: 3 }))[6]).toBe(3);
  });
  it('caps: FU with every z at 4 → 0.02; NA → 0.03; others → 0.60; floor 1e−5', () => {
    const z4 = [4, 4, 4, 4, 4, 4, 4, 4];
    expect(hazardRaw(0.0005, z4, hazardWeights('FDL'), 'FDL', NOMODS)).toBe(0.02);
    expect(hazardRaw(0.0003, z4, hazardWeights('NKR'), 'NKR', NOMODS)).toBe(0.03);
    expect(hazardRaw(0.003, z4, hazardWeights('EUN'), 'EUN', NOMODS)).toBe(0.60);
    expect(hazardRaw(0.0005, [-3, -3, -3, -3, 0, -3, -3, -3], hazardWeights('FDL'), 'FDL', NOMODS)).toBe(1e-5);
  });
  it('z below −3 is clamped to −3 in the sum', () => {
    const z = hazardZ(base({ b: 'EUN', debtGdp: 0, dStar: 2.0 }));
    expect(z[0]).toBeCloseTo(-5, 12);
    const zc = [...z]; zc[0] = -3;
    expect(hazardRaw(0.003, z, hazardWeights('EUN'), 'EUN', NOMODS)).toBe(hazardRaw(0.003, zc, hazardWeights('EUN'), 'EUN', NOMODS));
  });
  it('edge 17: debtGdp 5.0 → z1 clamped to 4 in the sum', () => {
    const z = hazardZ(base({ b: 'EUN', debtGdp: 5.0, dStar: 0.6, rEff: 0.045 }));
    expect(z[0]).toBeCloseTo(11, 12);
    const zc = [...z]; zc[0] = 4;
    expect(hazardRaw(0.003, z, hazardWeights('EUN'), 'EUN', NOMODS)).toBe(hazardRaw(0.003, zc, hazardWeights('EUN'), 'EUN', NOMODS));
  });
  it('modifiers: Concord × 0.6; POST_RESTRUCTURING 182 days after → floor 0.04; shock multiplier last then re-clamped', () => {
    const z = [0, 0, 0, 0, 0, 0, 0, 0], w = hazardWeights('EUN');
    close(hazardRaw(0.003, z, w, 'EUN', { ...NOMODS, concordActive: true }), 0.0018, 15);
    close(hazardRaw(0.003, z, w, 'EUN', { ...NOMODS, postRestructuringDays: 182 }), 0.04, 15);
    close(hazardRaw(0.003, z, w, 'EUN', { ...NOMODS, postRestructuringDays: 0 }), 0.08, 15);
    close(hazardRaw(0.003, z, w, 'EUN', { ...NOMODS, postRestructuringDays: 182, concordActive: true }), 0.04, 15);   // floor after Concord
    close(hazardRaw(0.003, z, w, 'EUN', { ...NOMODS, shockMult: 3 }), 0.009, 15);
    close(hazardRaw(0.003, z, w, 'EUN', { concordActive: true, postRestructuringDays: 182, shockMult: 3 }), 0.12, 15);
    expect(hazardRaw(0.003, [4, 4, 4, 4, 4, 4, 4, 4], w, 'EUN', { ...NOMODS, shockMult: 3 })).toBe(0.60);
    close(hazardRaw(0.0005, [4, 4, 4, 4, 4, 4, 4, 4], hazardWeights('FDL'), 'FDL', { ...NOMODS, shockMult: 3 }), 0.06, 15);   // FU cap before the shock
  });
  it('shock trigger day: λ jumps to λ_raw (no smoothing), the next day smooths', () => {
    expect(stepHazard(0.02, 0.06, true)).toBe(0.06);
    close(stepHazard(0.06, 0.06, false), 0.06, 15);
    close(stepHazard(0.02, 0.06, false), 0.02 + 0.04 * (1 - 2 ** -0.2), 15);
  });
  it('stressIndex clamps to [0, 1]', () => {
    expect(stressIndexOf(0.001, 0.002)).toBe(0); expect(stressIndexOf(0.5, 0.002)).toBe(1); close(stressIndexOf(0.1, 0.002), 1, 12);
  });
});

describe('T04-07 liquidity, market PD, cliffs (§3.11.2–§3.11.4)', () => {
  it('liquidityPremium: EUN depth 0.7 → 0.0016; FU → 0 (+ breach)', () => {
    close(liquidityPremium('EUN', 0.7, 0), 0.0016, 15); expect(liquidityPremium('FDL', 0.2, 0)).toBe(0);
    close(liquidityPremium('FDL', 0.2, 0.001), 0.001, 15); close(liquidityPremium('SRL', 1, 0.002), 0.003, 15);
  });
  it('exploit 8: y10 0.05, OIS10 0.03, TP10 0.004, liq 0.0016, conv 0 → λ_mkt 0.024 (pd1y 0.0161876); CDS with adv ≥ bond adv takes precedence', () => {
    const l = marketHazard(0.05, 0.03, 0.004, 0.0016, 0, LGD, null, 1000)!;
    close(l, 0.024, 12); close(pdAt(1, l), 0.0161876, 7);
    close(marketHazard(0.07, 0.03, 0.004, 0.0016, 0, LGD, null, 1000)!, 0.0573333, 7);   // +200 bp moves λ_mkt
    close(marketHazard(0.05, 0.03, 0.004, 0.0016, 0, LGD, { spread5y: 0.03, adv: 1000 }, 1000)!, 0.05, 12);
    close(marketHazard(0.05, 0.03, 0.004, 0.0016, 0, LGD, { spread5y: 0.03, adv: 999 }, 1000)!, 0.024, 12);
    close(marketHazard(null, 0.03, 0.004, 0.0016, 0, LGD, { spread5y: 0.03, adv: 1 }, null)!, 0.05, 12);
    expect(marketHazard(null, 0.03, 0.004, 0.0016, 0, LGD, null, null)).toBeNull();
    expect(marketHazard(0.02, 0.03, 0.004, 0.0016, 0, LGD, null, 1000)).toBe(0);
    close(marketHazard(0.05, 0.03, 0.004, 0.0016, 0.002, LGD, null, 1000)!, 0.0273333, 7);   // + conv
  });
  it('market λ at τ 5 / 10: h = 1 in both shapes, so λ = s / LGD above and below 0.08', () => {
    expect(hTerm(5, 0)).toBe(1); expect(hTerm(5, 0.5)).toBe(1); expect(hTerm(10, 0)).toBe(1); expect(hTerm(10, 0.5)).toBe(1);
    close(marketHazard(0.03 + 0.06, 0.03, 0, 0, 0, LGD, null, 1)!, 0.1, 12);   // h(10) = 1 in both shapes
    close(marketHazard(null, 0, 0, 0, 0, LGD, { spread5y: 0.06, adv: 1 }, null)!, 0.1, 12);
  });
  it('cliffs: [BBB-, BBB-, BB+] IG; [BBB-, BB+, BB+] not IG; lowestOfTwoBest([A, BBB, BB]) = BBB', () => {
    expect(isInvestmentGrade(['BBB-', 'BBB-', 'BB+'])).toBe(true); expect(isInvestmentGrade(['BBB-', 'BB+', 'BB+'])).toBe(false);
    expect(isInvestmentGrade(['AAA', 'NR', 'NR'])).toBe(false); expect(isInvestmentGrade(['AAA', 'AA'])).toBe(true);
    expect(lowestOfTwoBest(['A', 'BBB', 'BB'])).toBe('BBB'); expect(lowestOfTwoBest(['BB', 'A', 'BBB'])).toBe('BBB');
    expect(lowestOfTwoBest(['AA', 'AA', 'D'])).toBe('AA'); expect(lowestOfTwoBest(['A'])).toBeNull();
    expect(lowestOfTwoBest(['A', 'NR'])).toBeNull(); expect(lowestOfTwoBest(['A', 'NR', 'BBB'])).toBe('BBB');
    expect(GRADES).toHaveLength(20); expect(GRADES[0]).toBe('AAA'); expect(GRADES.indexOf('BBB-')).toBe(9); expect(GRADES[19]).toBe('D');
  });
});
