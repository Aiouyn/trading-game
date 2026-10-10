import { COMPANY } from '@/content/company';
import { post } from './books';
import { addSurveillance, recordPayout } from './failure';
import { ownerGroup } from './owners';
import type { CompanyEnv, Outcome } from './company';
import type { Company, CompanyWorld, SupplyDeal } from './types';

/**
 * Supply deals (DECISIONS C4, spec 6.3, N1). A buyer company takes units from a seller company each game day at a price
 * inside the band of the market reference (+-10%). A deal between companies of one owner set is related: its revenue
 * never counts in the seller's reported revenue (`relatedRevenue` is filed as related-party income, and it stays out of the
 * valuation's Rev_u), and the seller's owner is the first recipient of a covered payment. A price outside the band is
 * refused for a related deal, and adds surveillance points (spec 6.3). Money moves between the two books as a transfer.
 */

/** The market reference price per unit for a supply contract (the list price the sector's buyers pay). */
export function marketReference(): number {
  return COMPANY.demand.priceRef;
}

export function openSupply(
  w: CompanyWorld, buyer: Company, env: CompanyEnv, playerId: string,
  args: { sellerId: string; unitsPerDay: number; price: number },
): Outcome<{ id: string; related: boolean }> {
  if (buyer.bankrupt) return { ok: false, reject: { code: 'companyBankrupt' } };
  if (buyer.ownerId !== playerId) return { ok: false, reject: { code: 'notFounder' } };
  if (args.sellerId === buyer.id) return { ok: false, reject: { code: 'supplySelf' } };
  const seller = w.companies[args.sellerId];
  if (!seller) return { ok: false, reject: { code: 'unknownCompany' } };
  if (seller.bankrupt) return { ok: false, reject: { code: 'companyBankrupt' } };
  const related = ownerGroup(w, seller.ownerId) === ownerGroup(w, buyer.ownerId);
  const ref = marketReference();
  const min = Math.round(ref * (1 - COMPANY.supply.band) * 100) / 100;
  const max = Math.round(ref * (1 + COMPANY.supply.band) * 100) / 100;
  if (!(Number.isFinite(args.price) && args.price >= min && args.price <= max)) {
    if (related) addSurveillance(w, playerId, buyer.id, COMPANY.failure.insiderPoints.relatedOutOfBand, 'related supply priced out of band');
    return { ok: false, reject: { code: 'supplyPriceOutOfBand', min, max } };
  }
  if (!(Number.isInteger(args.unitsPerDay) && args.unitsPerDay > 0 && args.unitsPerDay <= COMPANY.supply.maxUnitsPerDay)) {
    return { ok: false, reject: { code: 'negativeAmount' } };
  }
  const deal: SupplyDeal = {
    id: `${buyer.id}:sup${(buyer.supplyDeals?.length ?? 0) + 1}`, sellerId: seller.id, buyerId: buyer.id,
    unitsPerDay: args.unitsPerDay, price: args.price, related, signedDay: env.day,
  };
  buyer.supplyDeals = [...(buyer.supplyDeals ?? []), deal];
  return { ok: true, value: { id: deal.id, related } };
}

/**
 * The day's supply flows for one buyer. A deal is paid only when the buyer has the cash for it (no partial day, no credit):
 * a short buyer's day is skipped. The seller books the revenue, reported apart when the deal is related.
 */
export function supplyDay(w: CompanyWorld, buyer: Company, day: number): void {
  if (buyer.bankrupt) return;
  for (const deal of buyer.supplyDeals ?? []) {
    const seller = w.companies[deal.sellerId];
    if (!seller || seller.bankrupt) continue;
    const amount = deal.unitsPerDay * deal.price;
    if (buyer.cash < amount) continue;
    post(w, buyer, day, 'supplyCost', -amount, true);
    post(w, seller, day, 'supplyRevenue', amount, true);
    if (deal.related) {
      seller.relatedCash = (seller.relatedCash ?? 0) + amount;
      buyer.relatedCash = (buyer.relatedCash ?? 0) - amount;
      seller.qtd.relatedRevenue = (seller.qtd.relatedRevenue ?? 0) + amount;
      recordPayout(seller, {
        day, toPlayerId: seller.ownerId, amount, covered: amount, kind: 'related',
        termsDay: deal.signedDay, flagged: false, insider: true,
      });
    } else {
      seller.qtd.revenue += amount;
    }
  }
}
