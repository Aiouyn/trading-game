// T04-03 step 2: imbalance z-scores (04 §3.3.3), computed at day close (macro step 1) and clamped to [−3, 4] at storage.
import { dmath } from '@tycoon/engine-core';
import { BLOC_ORDER, IMBALANCE_KEYS, type BlocId, type ImbalanceKey } from '../schema';

export interface ImbalanceInputs {
  creditGap: number; peAgg: number | null; peNorm: number; y10: number; y3m: number; inversionDays: number; coreInflation: number; inflationTarget: number;
  housePriceGap: number; energyIndexNow: number; energyIndex63: number; commodityExporter: number; sovereignStress: number; fear: number;
  otherBlocsContractionGdpShare: number; realRateGapSmoothed: number; outputGap: number; wtiNow: number; wti182: number; fiscalImpulse: number }

const store = (z: number): number => dmath.clamp(z, -3, 4);

/** §3.3.3 table, row by row. peAgg null (missing) → valuation 0. Non-positive PE/energy/WTI inputs fault in dmath.ln (I0.domain). */
export function imbalanceZ(i: ImbalanceInputs): Record<ImbalanceKey, number> {
  const spread = i.y10 - i.y3m;
  return {
    credit: store(i.creditGap / 0.05),
    valuation: store(i.peAgg === null ? 0 : dmath.ln(i.peAgg / i.peNorm) / 0.25),
    curve: store(spread < 0 ? i.inversionDays / 63 + (i.y3m - i.y10) / 0.005 : -0.5),
    inflation: store((i.coreInflation - i.inflationTarget) / 0.015),
    house: store(i.housePriceGap / 0.15),
    oil: store((dmath.ln(i.energyIndexNow / i.energyIndex63) / 0.30) * (1 - 2 * Math.max(0, i.commodityExporter))),
    fiscal: store(i.sovereignStress / 0.25),
    fear: store((i.fear - 50) / 20),
    contagion: store((i.otherBlocsContractionGdpShare - 0.2) / 0.2),
    policy: store(i.realRateGapSmoothed / 0.015),
    overheat: store(i.outputGap / 0.01),
    trade: store(-dmath.ln(i.wtiNow / i.wti182) / 0.05),
    stimulus: store((-i.realRateGapSmoothed + i.fiscalImpulse) / 0.01),
  };
}

/** §3.3.3 last line: the global chain uses the GDP-weighted average of the five bloc z vectors (Σ w_b z_b / Σ w_b). */
export function globalZ(blocZ: Record<BlocId, Record<ImbalanceKey, number>>, gdpWeights: Record<BlocId, number>): Record<ImbalanceKey, number> {
  let wSum = 0;
  for (const b of BLOC_ORDER) wSum += gdpWeights[b];
  const out = {} as Record<ImbalanceKey, number>;
  for (const k of IMBALANCE_KEYS) {
    let s = 0;
    for (const b of BLOC_ORDER) s += gdpWeights[b] * blocZ[b][k];
    out[k] = s / wSum;
  }
  return out;
}

/** inversionDays: +1 per trading day with y10 − y3m < 0; reset to 0 whenever not inverted; unchanged on non-trading inverted days. */
export function nextInversionDays(prev: number, y10: number, y3m: number, isTradingDay: boolean): number {
  if (!(y10 - y3m < 0)) return 0;
  return isTradingDay ? prev + 1 : prev;
}
