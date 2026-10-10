/**
 * The company part of net worth (spec 5.1): a private company a player founded counts at 0.85 x V_engine x the player's
 * ownership. Listed companies are valued by the market and are outside this term (their value comes with the listing,
 * a later step). Pure: it reads the company world and the day; nothing here moves money.
 */

import { COMPANY } from '@/content/company';
import { privateValue } from './company';
import type { CompanyWorld } from './types';

export function companyNetWorth(w: CompanyWorld | undefined, playerId: string, day: number): number {
  if (!w) return 0;
  let total = 0;
  for (const c of Object.values(w.companies)) {
    if (c.ownerId !== playerId || c.listed !== null || c.shares <= 0) continue;
    const ownership = (c.capTable[`founder:${playerId}`] ?? 0) / c.shares;
    total += COMPANY.netWorth.privateHaircut * privateValue(c, day) * ownership;
  }
  return total;
}
