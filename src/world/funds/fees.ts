import { FUND_RULES, FUND_TIME } from '@/content/funds';
import { debit } from '../core';
import type { GameState } from '../types';
import { navOf, navPerUnitOf, unitsOf } from './state';
import type { Fund } from './types';

/**
 * Fees. The management fee and the 0.25% custody sink accrue daily on NAV (a game year is 252 game days). The management fee
 * and any performance fee crystallize at each quarter (63 game days): the performance fee is charged only on NAV per unit above
 * the high-water mark, and the high-water mark then moves to the net NAV. Custody is a sink, destroyed like a fine.
 */

export function isQuarterDay(day: number): boolean {
  return day > 0 && day % FUND_TIME.quarterDays === 0;
}

/** One game day of fees: the management fee into the accrued liability, and the custody sink out of fund cash. */
export function accrueDay(g: GameState, f: Fund): void {
  const nav = navOf(g, f);
  if (!(nav > 0)) return;
  f.feeAccrued += (nav * f.fees.mgmt) / FUND_TIME.yearDays;
  const custody = (nav * FUND_RULES.custodyFeePerYear) / FUND_TIME.yearDays;
  if (custody > 0) debit(g, f.accountId, custody, 'fund custody');
}

/** The quarter's crystallization: accrued management fees become payable, and a performance fee above the high-water mark too. */
export function crystallize(g: GameState, f: Fund): void {
  f.feePayable += f.feeAccrued;
  f.managerEntitled += f.feeAccrued;
  f.feeAccrued = 0;
  const units = unitsOf(f);
  if (!(units > 0)) return;
  const px = navPerUnitOf(g, f);
  if (px > f.hwm) {
    const perf = f.fees.perf * (px - f.hwm) * units;
    f.feePayable += perf;
    f.managerEntitled += perf;
  }
  f.hwm = Math.max(f.hwm, navPerUnitOf(g, f));
}
