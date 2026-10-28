// T04-16: data release values (04 §3.15.2-§3.15.3). True values per kind, measurement, consensus, surprise and risk reaction.
// E-83: CPI σ_meas 0.001 on all four fields; one independent normal per field per release in the fixed order headline yoy, coreYoy,
// headlineMom, coreMom (AC-04-16-CPI-DRAW-ORDER). Consensus and surprise stay headline-only (E-81).
import { EngineFault, roundHalfEven, TICKS_PER_GAME_DAY, type StoreRead } from '@tycoon/engine-core';
import { BLOC_DEFAULTS } from '../blocs';
import { macroTables, type BlocId, type DailyHistoryRow, type DataRelease, type GlobalMacroState, type ReleaseKind } from '../schema';
import { gdpGrowthQoQAnn } from './economy';
import { blocRow } from './sovCase';

const K = <T>(m: Record<ReleaseKind, T>): Readonly<Record<ReleaseKind, T>> => Object.freeze(m);
export const SIGMA_MEAS = K<number>({ CPI: 0.001, JOBS: 0.001, GDP_ADV: 0.006, GDP_REV1: 0.003, GDP_REV2: 0.001, PMI: 1.0, RETAIL: 0.003, TRADE: 0.002,
  SENTIMENT: 2.0, HOUSING: 0.005, CREDIT: 0.003, FISCAL: 0, CB_DECISION: 0, CB_GUIDANCE: 0, CB_MINUTES: 0, RESERVES: 0 });
export const SIGMA_CONS = K<number>({ CPI: 0.002, JOBS: 0.0015, GDP_ADV: 0.010, GDP_REV1: 0.010, GDP_REV2: 0.010, PMI: 1.5, RETAIL: 0.005, TRADE: 1.5 * 0.002,
  SENTIMENT: 1.5 * 2.0, HOUSING: 1.5 * 0.005, CREDIT: 1.5 * 0.003, FISCAL: 0, CB_DECISION: 0, CB_GUIDANCE: 0, CB_MINUTES: 0, RESERVES: 0 });
/** Display decimals in display units: pp (decimal × 100) except the index-point kinds PMI, SENTIMENT, HOUSING, RESERVES. */
export const DECIMALS = K<number>({ CPI: 1, JOBS: 1, GDP_ADV: 1, GDP_REV1: 1, GDP_REV2: 1, PMI: 1, RETAIL: 1, TRADE: 1, SENTIMENT: 1, HOUSING: 1, CREDIT: 1,
  FISCAL: 1, CB_DECISION: 2, CB_GUIDANCE: 2, CB_MINUTES: 2, RESERVES: 0 });
const POINTS: readonly ReleaseKind[] = ['PMI', 'SENTIMENT', 'HOUSING', 'RESERVES'];
const TEN = [1, 10, 100, 1000];
const roundTo = (v: number, scale: number, dec: number): number => roundHalfEven(v * scale * TEN[dec]!) / (scale * TEN[dec]!);

export interface ReleaseFields { headline: number; extra: Record<string, number> }   // headline carries the noise; extra fields per kind
/** Extra fields per kind, in publication (draw) order. `noisy` extras share the kind's σ_meas and DECIMALS (E-83: CPI); the others are
 *  index or ratio fields in other units, published exactly at 2 decimals. */
export const EXTRA_FIELDS: Readonly<Partial<Record<ReleaseKind, readonly { key: string; noisy: boolean }[]>>> = Object.freeze({
  CPI: [{ key: 'coreYoy', noisy: true }, { key: 'headlineMom', noisy: true }, { key: 'coreMom', noisy: true }],
  JOBS: [{ key: 'payrollIndex', noisy: false }], TRADE: [{ key: 'currentAccountGdp', noisy: false }], HOUSING: [{ key: 'transactionsIndex', noisy: false }],
  CREDIT: [{ key: 'lendingStandards', noisy: false }], FISCAL: [{ key: 'primaryBalanceGdp', noisy: false }, { key: 'debtGdp', noisy: false }],
  RESERVES: [{ key: 'coverMonths', noisy: false }] });
export const EXTRA_DECIMALS = 2;
export const roundExtra = (v: number): number => roundTo(v, 1, EXTRA_DECIMALS);

/** The stored release row: DataRelease plus the hidden truth the publication reuses (never in a payload). */
export type ReleaseRow = DataRelease & { pending: boolean; truthExtra: Record<string, number>; realWageGrowth?: number;
  riskReaction?: RiskReaction };

const D = TICKS_PER_GAME_DAY, Q = 91;
const hist = (s: StoreRead, b: BlocId, d: number): DailyHistoryRow | undefined => (d < 0 ? undefined : s.get<DailyHistoryRow>(macroTables.history.name, `${b}:${d}`));
/** The bloc's latest release row of `kind` (by scheduledTick), published or not. */
export function lastRow(s: StoreRead, b: BlocId, kind: ReleaseKind, published: boolean): ReleaseRow | undefined {
  let best: ReleaseRow | undefined;
  for (const r of s.index<ReleaseRow>(macroTables.release.name, 'bloc', b)) {
    if (r.kind === kind && (!published || !r.pending) && (!best || r.scheduledTick > best.scheduledTick)) best = r;
  }
  return best;
}
/** §3.15.3 true values. "Today" is the bloc row's tick (the consensus tick). `draw` is N(0,1) on S.shock(b), used by PMI and RETAIL only. */
export function trueValues(store: StoreRead, b: BlocId, kind: ReleaseKind, period: DataRelease['referencePeriod'], draw: () => number): ReleaseFields {
  const bl = blocRow(store, b), day = Math.floor(bl.tick / D);
  const growth91 = (): number => { const h = hist(store, b, day - 91); return h ? gdpGrowthQoQAnn(bl.realGdpIndex, h.realGdpIndex) : bl.gdpGrowthQoQAnn; };
  switch (kind) {
    case 'PMI': return { headline: 50 + (2.5 * (growth91() - bl.potentialGrowth)) / 0.01 + draw(), extra: {} };
    case 'JOBS': {
      const u28 = lastRow(store, b, 'JOBS', false)?.trueValue ?? bl.unemployment;   // the previous JOBS truth (~28 days ago)
      return { headline: bl.unemployment, extra: { payrollIndex: (100 * (1 - bl.unemployment)) / (1 - u28) } };
    }
    case 'RESERVES': return { headline: Number(bl.fx.reservesFdl) / 1e6, extra: { coverMonths: bl.fx.reserveCoverMonths } };
    case 'CPI': {
      const h = hist(store, b, day - 28);
      return { headline: bl.headlineInflation, extra: { coreYoy: bl.coreInflation, headlineMom: h ? bl.cpiLevel / h.cpiLevel - 1 : 0,
        coreMom: h ? bl.coreCpiLevel / h.coreCpiLevel - 1 : 0 } };
    }
    case 'RETAIL': {
      const rw = bl.wageGrowth - bl.headlineInflation, prev = lastRow(store, b, 'RETAIL', false)?.realWageGrowth ?? rw;
      return { headline: growth91() + 0.5 * (rw - prev) + 0.004 * draw(), extra: {} };
    }
    case 'TRADE': return { headline: bl.fx.currentAccountGdp, extra: { currentAccountGdp: bl.fx.currentAccountGdp } };
    case 'HOUSING': {
      const h = hist(store, b, day - 1)?.housePriceIndex;
      return { headline: h ?? lastRow(store, b, 'HOUSING', false)?.trueValue ?? 100, extra: { transactionsIndex: 100 } };
    }
    case 'CREDIT': return { headline: bl.creditGrowth, extra: { lendingStandards: -100 * bl.creditConditions } };
    case 'SENTIMENT': {
      const g = store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL');
      if (!g) throw new EngineFault('MAC_STATE_MISSING', 'global', [b]);
      return { headline: 100 + 300 * bl.outputGap - 100 * (bl.inflationExp1y - BLOC_DEFAULTS[b].inflationTarget) - 0.5 * (g.fearIndex - 30), extra: {} };
    }
    case 'GDP_ADV': case 'GDP_REV1': case 'GDP_REV2': {
      const q = period.index, end = hist(store, b, Q * (q + 1) - 1), start = q === 0 ? 100 : hist(store, b, Q * q - 1)?.realGdpIndex;
      return { headline: end && start !== undefined ? gdpGrowthQoQAnn(end.realGdpIndex, start) : bl.gdpGrowthQoQAnn, extra: {} };
    }
    case 'FISCAL': return { headline: bl.fiscal.deficitGdp, extra: { primaryBalanceGdp: bl.fiscal.primaryBalanceGdp, debtGdp: bl.fiscal.debtGdp } };
    default: throw new EngineFault('MAC_STATE_MISSING', `no release values for ${kind}`, [b]);
  }
}

export function sigmaSurprise(kind: ReleaseKind): number { return Math.sqrt(SIGMA_MEAS[kind] * SIGMA_MEAS[kind] + SIGMA_CONS[kind] * SIGMA_CONS[kind]); }
export function measure(trueValue: number, kind: ReleaseKind, eps: number): number {
  return roundTo(trueValue + SIGMA_MEAS[kind] * eps, POINTS.includes(kind) ? 1 : 100, DECIMALS[kind]);
}
export function consensusOf(trueValue: number, kind: ReleaseKind, eps: number): { consensus: number; dispersion: number } {
  return { consensus: trueValue + SIGMA_CONS[kind] * eps, dispersion: 0.6 * SIGMA_CONS[kind] };
}
export function surpriseOf(actual: number, consensus: number, kind: ReleaseKind): number {
  const s = sigmaSurprise(kind);
  return s > 0 ? (actual - consensus) / s : 0;
}
export interface RiskReaction { equityJump: number; fxValueJump: number }
const GROWTH: readonly ReleaseKind[] = ['GDP_ADV', 'GDP_REV1', 'GDP_REV2', 'JOBS', 'PMI', 'RETAIL'];
export function riskReaction(kind: ReleaseKind, s: number, piCore: number, target: number): RiskReaction {
  if (kind === 'CPI') return { equityJump: -0.003 * s, fxValueJump: 0.003 * s };
  if (!GROWTH.includes(kind)) return { equityJump: 0, fxValueJump: 0 };
  const sg = kind === 'JOBS' ? -s : s, c = Math.min(1, Math.max(0, (piCore - target - 0.01) / 0.02));
  return { equityJump: 0.004 * sg * (1 - 1.5 * c), fxValueJump: 0.003 * sg };
}
