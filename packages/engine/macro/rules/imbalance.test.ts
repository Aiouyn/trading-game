// T04-03 acceptance tests: imbalance z-scores (04 §3.3.3), globalZ, inversion days; Cycle Committee label (04 §3.3.6).
import { describe, expect, it } from 'vitest';
import { isTradingDay } from '@tycoon/engine-core';
import { MACRO_EVENT_VISIBILITY } from '../events';
import { BLOC_ORDER, IMBALANCE_KEYS, type BlocId, type ImbalanceKey, RELEASE_KINDS, type LatestPrint, type PublicMacroView, type ReleaseKind } from '../schema';
import { cycleLabelStep } from './cycleCommittee';
import { globalZ, imbalanceZ, nextInversionDays, type ImbalanceInputs } from './imbalance';

const BASE: ImbalanceInputs = { creditGap: 0.02, peAgg: 18, peNorm: 15, y10: 0.03, y3m: 0.034, inversionDays: 30, coreInflation: 0.035, inflationTarget: 0.02,
  housePriceGap: 0.06, energyIndexNow: 130, energyIndex63: 100, commodityExporter: 0.9, sovereignStress: 0.3, fear: 62, otherBlocsContractionGdpShare: 0.31,
  realRateGapSmoothed: 0.006, outputGap: 0.007, wtiNow: 95, wti182: 100, fiscalImpulse: 0.01 };

describe('T04-03 imbalances', () => {
  it('§3.3.3 table row by row (full vector)', () => {
    const z = imbalanceZ(BASE);
    const want: Record<ImbalanceKey, number> = { credit: 0.4, valuation: 0.7292862271758184, curve: 1.276190476190476, inflation: 1.0, house: 0.4, oil: -0.6996380385799763,
      fiscal: 1.2, fear: 0.6, contagion: 0.55, policy: 0.4, overheat: 0.7, trade: 1.0258658877510114, stimulus: 0.4 };
    expect(Object.getOwnPropertyNames(z).sort()).toEqual([...IMBALANCE_KEYS].sort());
    for (const k of IMBALANCE_KEYS) expect(z[k]).toBeCloseTo(want[k], 10);
  });
  it('curve: 30 inversion days, y3m − y10 = 0.004 → 30/63 + 0.8 = 1.276190; not inverted → −0.5', () => {
    expect(imbalanceZ(BASE).curve).toBeCloseTo(1.276190, 6);
    expect(imbalanceZ({ ...BASE, y10: 0.034, y3m: 0.034 }).curve).toBe(-0.5);
    expect(imbalanceZ({ ...BASE, y10: 0.04, y3m: 0.034 }).curve).toBe(-0.5);
  });
  it('oil for NKR (exporter 0.9): E 130 vs 100 → −0.699638; importer (≤ 0) uses factor 1', () => {
    expect(imbalanceZ(BASE).oil).toBeCloseTo(-0.699638, 6);
    expect(imbalanceZ({ ...BASE, commodityExporter: -0.5 }).oil).toBeCloseTo(Math.log(1.3) / 0.3, 12);
  });
  it('valuation is 0 when peAgg is missing', () => { expect(imbalanceZ({ ...BASE, peAgg: null }).valuation).toBe(0); });
  it('clamp: credit gap 0.30 → 6 → stored 4; lower bound −3', () => {
    expect(imbalanceZ({ ...BASE, creditGap: 0.30 }).credit).toBe(4);
    expect(imbalanceZ({ ...BASE, creditGap: -0.30 }).credit).toBe(-3);
    expect(imbalanceZ({ ...BASE, fear: 200 }).fear).toBe(4);
  });
  it('globalZ is the GDP-weighted mean of the bloc vectors', () => {
    const w: Record<BlocId, number> = { FDL: 4, EUN: 3, PYN: 1, NKR: 1, SRL: 1 };
    const bz = {} as Record<BlocId, Record<ImbalanceKey, number>>;
    for (const [i, b] of BLOC_ORDER.entries()) bz[b] = imbalanceZ({ ...BASE, creditGap: 0.01 * i, fear: 50 + 10 * i });
    const g = globalZ(bz, w);
    expect(g.credit).toBeCloseTo((4 * 0 + 3 * 0.2 + 1 * 0.4 + 1 * 0.6 + 1 * 0.8) / 10, 12);
    expect(g.fear).toBeCloseTo((4 * 0 + 3 * 0.5 + 1 * 1 + 1 * 1.5 + 1 * 2) / 10, 12);
    expect(g.trade).toBeCloseTo(bz.FDL.trade, 12);
  });
  it('nextInversionDays: +1 per inverted trading day, weekend days do not increment, reset when not inverted', () => {
    let n = 0;
    for (let d = 0; d < 14; d++) n = nextInversionDays(n, 0.03, 0.035, isTradingDay('FDL', d, false));
    let td = 0; for (let d = 0; d < 14; d++) if (isTradingDay('FDL', d, false)) td++;
    expect(td).toBe(10); expect(n).toBe(10);
    expect(nextInversionDays(7, 0.03, 0.035, false)).toBe(7);
    expect(nextInversionDays(7, 0.035, 0.035, true)).toBe(0);
    expect(nextInversionDays(7, 0.04, 0.035, false)).toBe(0);
  });
});

const KINDS = RELEASE_KINDS;
function prints(p: Partial<Record<ReleaseKind, [number, number]>>): PublicMacroView['prints'] {
  const out = {} as Record<ReleaseKind, LatestPrint | null>;
  for (const k of KINDS) { const v = p[k]; out[k] = v === undefined ? null : { kind: k, tick: v[1], actual: v[0], consensus: v[0], prior: v[0], surprise: 0 }; }
  return out;
}

describe('T04-03 Cycle Committee', () => {
  const NAIRU = 0.045, TGT = 0.02, LAG = 21;
  it('true CONTRACTION 20 days with a negative GDP print → no change; day 21 → declared once', () => {
    const pr = prints({ GDP_ADV: [-0.01, 100] });
    let label: PublicMacroView['cycleLabel'] = 'EXPANSION'; let declared = 0;
    for (let d = 0; d <= 30; d++) {
      const r = cycleLabelStep('CONTRACTION', d, label, pr, 0.04, NAIRU, TGT, LAG);
      if (d === 20) expect(r).toEqual({ label: 'EXPANSION', changed: false });
      if (d === 21) expect(r).toEqual({ label: 'CONTRACTION', changed: true });
      if (r.changed) declared++; label = r.label;
    }
    expect(declared).toBe(1);
    expect(MACRO_EVENT_VISIBILITY['macro.cycle.declared']).toBe('PUBLIC');
  });
  it('CONTRACTION: positive GDP and unemployment only 0.004 above its 12-month low → not declared; ≥ 0.005 → declared', () => {
    expect(cycleLabelStep('CONTRACTION', 30, 'EXPANSION', prints({ GDP_ADV: [0.01, 1], JOBS: [0.044, 2] }), 0.04, NAIRU, TGT, LAG).changed).toBe(false);
    expect(cycleLabelStep('CONTRACTION', 30, 'EXPANSION', prints({ GDP_ADV: [0.01, 1], JOBS: [0.046, 2] }), 0.04, NAIRU, TGT, LAG).changed).toBe(true);
  });
  it('latest growth print is the most recent of GDP_ADV/REV1/REV2 by tick', () => {
    expect(cycleLabelStep('CONTRACTION', 30, 'EXPANSION', prints({ GDP_ADV: [-0.01, 5], GDP_REV1: [0.01, 9] }), null, NAIRU, TGT, LAG).changed).toBe(false);
    expect(cycleLabelStep('CONTRACTION', 30, 'EXPANSION', prints({ GDP_ADV: [-0.01, 9], GDP_REV2: [0.01, 5] }), null, NAIRU, TGT, LAG).changed).toBe(true);
  });
  it('EXPANSION/RECOVERY need growth > 0; UNDETERMINED until the first declaration; no prints → no declaration', () => {
    expect(cycleLabelStep('RECOVERY', 21, 'UNDETERMINED', prints({}), null, NAIRU, TGT, LAG)).toEqual({ label: 'UNDETERMINED', changed: false });
    expect(cycleLabelStep('EXPANSION', 21, 'UNDETERMINED', prints({ GDP_REV2: [0.0, 1] }), null, NAIRU, TGT, LAG).changed).toBe(false);
    expect(cycleLabelStep('RECOVERY', 21, 'CONTRACTION', prints({ GDP_REV2: [0.001, 1] }), null, NAIRU, TGT, LAG)).toEqual({ label: 'RECOVERY', changed: true });
    expect(cycleLabelStep('EXPANSION', 40, 'EXPANSION', prints({ GDP_ADV: [0.02, 1] }), null, NAIRU, TGT, LAG).changed).toBe(false);   // already labelled
  });
  it('OVERHEATING: CPI print ≥ target + 0.01 and unemployment < NAIRU', () => {
    expect(cycleLabelStep('OVERHEATING', 21, 'EXPANSION', prints({ CPI: [0.03, 1], JOBS: [0.044, 1] }), null, NAIRU, TGT, LAG).changed).toBe(true);
    expect(cycleLabelStep('OVERHEATING', 21, 'EXPANSION', prints({ CPI: [0.0299, 1], JOBS: [0.044, 1] }), null, NAIRU, TGT, LAG).changed).toBe(false);
    expect(cycleLabelStep('OVERHEATING', 21, 'EXPANSION', prints({ CPI: [0.04, 1], JOBS: [0.045, 1] }), null, NAIRU, TGT, LAG).changed).toBe(false);
  });
});
