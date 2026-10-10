/**
 * Hiring, firing, ramp and the headcount caps (spec v1.7 §4, CB-029..CB-030). A hire takes 3 gd to fill; the seat
 * is paid from the fill day, and it is productive only after its role's ramp (Ops 5 gd, Sales 10, R&D 21, G&A 5).
 * Severance on a fire is 21 gd of wages, paid out of the company (a sink).
 */

import { COMPANY, type CompanyRole, type CompanyTierId } from '@/content/company';
import type { CompanyReject } from './types';
import type { Company, HirePipeline, Staff } from './types';

export const ROLES: CompanyRole[] = ['ops', 'sales', 'rd', 'ga'];

export function emptyStaff(): Staff {
  return { total: 0, ramping: [] };
}

/** The headcount cap of a tier (§4): Seed 25, Growth 250, Late 2,500. */
export function headcountCap(tier: CompanyTierId): number {
  return COMPANY.headcountCap[tier];
}

export function totalHeads(c: Company): number {
  return ROLES.reduce((sum, r) => sum + c.staff[r].total, 0);
}

export function pendingHeads(c: Company): number {
  return c.hires.reduce((sum, h) => sum + h.n, 0);
}

/**
 * Land the hires whose fill day has come: the seat is seated (paid) and ramps from the fill day. Returns the number
 * of heads that landed (for the goal "first hire").
 */
export function landHires(c: Company, day: number): number {
  let landed = 0;
  const keep: HirePipeline[] = [];
  for (const h of c.hires) {
    if (h.fillDay > day) { keep.push(h); continue; }
    c.staff[h.role].total += h.n;
    c.staff[h.role].ramping.push({ readyDay: day + COMPANY.rampDays[h.role], n: h.n });
    landed += h.n;
  }
  c.hires = keep;
  return landed;
}

/** Drop finished ramps and keep ramping counts within the seated total (after a fire). */
export function settleRamps(s: Staff, day: number): void {
  s.ramping = s.ramping.filter((r) => r.readyDay > day);
  let ramping = s.ramping.reduce((sum, r) => sum + r.n, 0);
  while (ramping > s.total && s.ramping.length > 0) {
    const last = s.ramping[s.ramping.length - 1]!;
    const cut = Math.min(last.n, ramping - s.total);
    last.n -= cut;
    ramping -= cut;
    if (last.n <= 0) s.ramping.pop();
  }
}

/** Wages per gd of the seated heads, by role (the wage table of §4). */
export function wagesPerDay(c: Company): Record<CompanyRole, number> {
  return {
    ops: c.staff.ops.total * COMPANY.wages.ops,
    sales: c.staff.sales.total * COMPANY.wages.sales,
    rd: c.staff.rd.total * COMPANY.wages.rd,
    ga: c.staff.ga.total * COMPANY.wages.ga,
  };
}

/** Queue `n` hires of `role` (they fill in 3 gd). Refused above the tier's headcount cap. */
export function queueHire(c: Company, role: CompanyRole, n: number, day: number, cap: number): CompanyReject | null {
  if (!(n > 0) || !Number.isInteger(n)) return { code: 'negativeAmount' };
  if (totalHeads(c) + pendingHeads(c) + n > cap) return { code: 'headcountCap', cap };
  c.hires.push({ role, n, fillDay: day + COMPANY.hireFillDays });
  return null;
}

/** Fire `n` seated heads of `role`. Returns the severance (21 gd of wages per head), or a reject. */
export function fireHeads(c: Company, role: CompanyRole, n: number, day: number): { severance: number } | CompanyReject {
  if (!(n > 0) || !Number.isInteger(n)) return { code: 'negativeAmount' };
  const have = c.staff[role].total;
  if (n > have) return { code: 'notEnoughStaff', role, have };
  c.staff[role].total -= n;
  settleRamps(c.staff[role], day);
  return { severance: n * COMPANY.wages[role] * COMPANY.severanceDays };
}
