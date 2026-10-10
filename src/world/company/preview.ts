/**
 * The founder's decision card and runway chart (Velvet 2 and 4). A pure preview: it reads the company and writes nothing.
 * The odds band, the gain band and the project length are the engine's own (the same functions a project freezes at its
 * start), so the card shows what the project would be, and the screen only formats the numbers it is given.
 */

import { COMPANY } from '@/content/company';
import { revenuePerDay } from './company';
import { rdEffort } from './economics';
import { projectBand, projectDays, sRef } from './rd';
import type { Company } from './types';

/** Days of the cash path the runway chart draws. */
export const PREVIEW_HORIZON_DAYS = 30;

/** The three spend levels the card offers, as multiples of the project's S_ref (the scale the odds curve is built on). */
export const PREVIEW_LEVELS = [
  { key: 'low', multiple: 0.5 },
  { key: 'mid', multiple: 1 },
  { key: 'high', multiple: 2 },
] as const;

export type PreviewLevel = (typeof PREVIEW_LEVELS)[number]['key'];

export interface DecisionLevel {
  key: PreviewLevel;
  spend: number;
  /** odds band, plus or minus 5 points (X15) */
  pLow: number;
  pHigh: number;
  /** quality gain in score points at bear, base and bull */
  gainPoints: [number, number, number];
  /** cash after the spend is paid today, and the runway that gives (null when there is no payroll) */
  runwayAfter: number | null;
  /** cash on each of the next days with the spend paid evenly over the project, and no revenue */
  cashPath: number[];
}

export interface DecisionCard {
  productId: string;
  productName: string;
  /** the project's length in game days at today's R&D effort */
  days: number;
  endDay: number;
  /** cash on each of the next days with payroll only (the "as now" line) */
  cashNow: number[];
  levels: DecisionLevel[];
}

/**
 * The decision card for the company's first product: a quality project at three spend levels. Null when there is no
 * product or no R&D effort (the project then cannot start, and the screen says so through the R&D tab).
 */
export function decisionCard(c: Company, day: number, payrollPerDay: number): DecisionCard | null {
  const product = c.products[0];
  if (!product) return null;
  const effort = rdEffort(c, day);
  if (!(effort > 0)) return null;
  const days = projectDays(c.sector, effort);
  const sref = sRef(revenuePerDay(c, day));
  const horizon = Array.from({ length: PREVIEW_HORIZON_DAYS + 1 }, (_, d) => d);
  const cashAt = (spendPerDay: number, d: number): number => c.cash - payrollPerDay * d - spendPerDay * Math.min(d, days);
  const cashNow = horizon.map((d) => cashAt(0, d));
  const levels = PREVIEW_LEVELS.map(({ key, multiple }): DecisionLevel => {
    const spend = Math.round(multiple * sref);
    const band = projectBand(c.sector, spend, sref, product.k);
    const spendPerDay = spend / days;
    return {
      key,
      spend,
      pLow: band.pLow,
      pHigh: band.pHigh,
      gainPoints: [band.dqBear, band.dqBase, band.dqBull].map((x) => COMPANY.qualityScale.slope * x) as [number, number, number],
      runwayAfter: payrollPerDay > 0 ? Math.max(0, c.cash - spend) / payrollPerDay : null,
      cashPath: horizon.map((d) => cashAt(spendPerDay, d)),
    };
  });
  return {
    productId: product.id,
    productName: product.name,
    days,
    endDay: day + days,
    cashNow,
    levels,
  };
}
