import { COMPANY, type CompanySector } from '@/content/company';
import { post } from './books';
import type { CompanyEnv, Outcome } from './company';
import type { Company, CompanyWorld, Licence } from './types';

/**
 * Franchising (DECISIONS C4): a company licenses its brand to an NPC operator for a royalty of 4 to 8% of the operator's
 * revenue. No capital is needed. At most `capPerSector` licences run in one sector, across all companies. The operator's
 * revenue per gd is fixed at signing, a share of the brand's own revenue per gd with a floor. Royalties are money from NPC
 * customers, so they are a faucet and count as the company's revenue (unrelated).
 */

export function licenceCount(w: CompanyWorld, sector: CompanySector): number {
  let n = 0;
  for (const c of Object.values(w.companies)) if (c.sector === sector) n += c.licences?.length ?? 0;
  return n;
}

/** The brand's own revenue per gd so far in the quarter (the basis of the operator's sales at signing). */
function revenuePerDayOf(c: Company, day: number): number {
  return c.qtd.revenue / Math.max(1, day - c.qtd.startDay);
}

export function grantLicence(w: CompanyWorld, c: Company, env: CompanyEnv, playerId: string, rate: number): Outcome<{ id: string; revenuePerDay: number }> {
  if (c.bankrupt) return { ok: false, reject: { code: 'companyBankrupt' } };
  if (c.ownerId !== playerId) return { ok: false, reject: { code: 'notFounder' } };
  const F = COMPANY.franchise;
  if (!(Number.isFinite(rate) && rate >= F.rateMin && rate <= F.rateMax)) return { ok: false, reject: { code: 'franchiseRate', min: Math.round(F.rateMin * 100), max: Math.round(F.rateMax * 100) } };
  if (c.products.length === 0) return { ok: false, reject: { code: 'franchiseNoProduct' } };
  const used = licenceCount(w, c.sector);
  if (used >= F.capPerSector) return { ok: false, reject: { code: 'franchiseCap', cap: F.capPerSector } };
  const revenuePerDay = Math.max(F.operatorFloorPerDay, F.operatorShare * revenuePerDayOf(c, env.day));
  const lic: Licence = { id: `${c.id}:lic${(c.licences?.length ?? 0) + 1}`, rate, revenuePerDay, signedDay: env.day };
  c.licences = [...(c.licences ?? []), lic];
  return { ok: true, value: { id: lic.id, revenuePerDay } };
}

/** The day's royalties: each licence pays its rate on the operator's revenue per gd. */
export function licenceDay(w: CompanyWorld, c: Company, day: number): void {
  for (const lic of c.licences ?? []) {
    const royalty = lic.rate * lic.revenuePerDay;
    post(w, c, day, 'royalty', royalty);
    c.qtd.revenue += royalty;
  }
}
