// T04-05 step 2: credit aggregates (04 §3.14.4). 07 supplies credit, creditConditions and the interbank spread; 04 derives
// creditGdp, its 3 × 364-day EWMA trend, the gap and yoy growth. Without 07 (ports.credit null or a null row; edge 18, 04#43)
// the fallback below keeps the macro step runnable. Genesis (unit decision, T04-20): credit = 1.0 × nominalGdp, trend = creditGdp.
import { dmath } from '@tycoon/engine-core';
import type { Regime } from '../schema';

/** EWMA factor for 3 × 364 = 1092 days, half-life convention: 1 − 2^(−1/1092). */
const TREND_ALPHA = 1 - dmath.pow(2, -1 / 1092);
/** §3.14.4 fallback regime tilt. */
const TILT: Readonly<Record<Regime, number>> = Object.freeze({ EXPANSION: 0.2, OVERHEATING: 0.3, CONTRACTION: -0.5, RECOVERY: 0 });

export interface CreditStateIn { credit: number; creditGdpTrend: number; credit364: number | null }

/** creditConditions = 0.5·tanh(−2R̃/0.01) + tilt(regime), clamped to [−1, 1]. */
export function fallbackCreditConditions(Rtilde: number, regime: Regime): number {
  return dmath.clamp(0.5 * dmath.tanh(-2 * Rtilde / 0.01) + TILT[regime], -1, 1);
}

/**
 * One day of §3.14.4. supplied = 07's row (null → fallback: credit ← credit × exp(g × (1 + 0.5·creditConditions)) with g the
 * day's nominal GDP log growth, interbankSpread null). creditGrowth = ln(credit / credit_364); 0 while credit364 is null (before day 364).
 */
export function creditAggregates(nominalGdp: number, prev: CreditStateIn, supplied: { credit: number; creditConditions: number; interbankSpread: number } | null,
  fallback: { Rtilde: number; regime: Regime; nominalGdpGrowthLn: number }): { credit: number; creditGdp: number; trend: number; creditGap: number; creditGrowth: number; creditConditions: number; interbankSpread: number | null } {
  let credit: number; let creditConditions: number; let interbankSpread: number | null;
  if (supplied) {
    credit = supplied.credit; creditConditions = supplied.creditConditions; interbankSpread = supplied.interbankSpread;
  } else {
    creditConditions = fallbackCreditConditions(fallback.Rtilde, fallback.regime);
    credit = prev.credit * dmath.exp(fallback.nominalGdpGrowthLn * (1 + 0.5 * creditConditions));
    interbankSpread = null;
  }
  const creditGdp = credit / nominalGdp;
  const trend = prev.creditGdpTrend + TREND_ALPHA * (creditGdp - prev.creditGdpTrend);
  const creditGrowth = prev.credit364 === null ? 0 : dmath.ln(credit / prev.credit364);
  return { credit, creditGdp, trend, creditGap: creditGdp - trend, creditGrowth, creditConditions, interbankSpread };
}
