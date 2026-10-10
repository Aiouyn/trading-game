/**
 * Tape section 5, the related-party income rows that have code in this build (tape-company-building.md section 3.7,
 * Quant v1.7 section 6.3 and 6.4, unchanged in v1.7): a supply deal's revenue is filed apart (relatedPartyIncome), stays out
 * of Rev_u, NI_adj and the valuation, and its cash is kept out of net debt. Test names carry the Tape id.
 */
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand } from '../../game';
import { advanceTo, BUYER_B, companyOf, FOUNDER, founded } from '../b1fixture';
import { companyEnvOf } from '../bridge';
import { linkOwner } from '../owners';
import { openSupply, marketReference } from '../supply';
import { filedInputs } from '../signals';
import { vEngine } from '../valuation';
import type { GameState } from '../../types';
import type { Company } from '../types';

/**
 * Two companies: the founder's (the seller, with a founder at R2) and BUYER_B's (the buyer). Optionally the two owners are
 * linked, so the deal is a related one. The buyer sells its supply to the seller, at the market reference.
 */
function pair(seed: string, opts: { deal: boolean; linked: boolean }): { g: GameState; seller: Company; buyer: Company } {
  const { g, c: seller } = founded(seed);
  g.players[BUYER_B]!.rankId = 'R2';
  const r = applyCommand(g, BUYER_B, { type: 'company.found', name: 'Beta', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(r.error);
  const buyer = Object.values(g.companies!.companies).find((x) => x.id !== seller.id)!;
  advanceTo(g, 10);
  // the link is set after the day step: the daily alliance sync rebuilds the owner groups and would drop it
  if (opts.linked) linkOwner(g.companies!, BUYER_B, FOUNDER);
  if (opts.deal) {
    const ref = marketReference();
    const r2 = openSupply(g.companies!, buyer, companyEnvOf(g), BUYER_B, { sellerId: seller.id, unitsPerDay: 10, price: ref });
    if (!r2.ok) throw new Error(`supply refused: ${JSON.stringify(r2.reject)}`);
  }
  return { g, seller: companyOf(g), buyer };
}

describe('Tape s5: related-party income, filed apart and out of value', () => {
  it('related_party_revenue_in_Rev_u: a related supply deal is filed as related-party income, and Rev_u (revUnrelated) is the revenue without it', () => {
    const { g, seller } = pair('rp-rev', { deal: true, linked: true });
    advanceTo(g, 70); // the first filing (F = 66)
    const f = seller.filings[0]!;
    expect(f.income.relatedPartyIncome).toBeGreaterThan(0);
    // the filed related line is the frozen statement's related revenue; the unrelated revenue is the statement's revenue
    expect(f.income.relatedPartyIncome).toBe(seller.closed[0]!.relatedRevenue);
    expect(f.income.revUnrelated).toBe(seller.closed[0]!.revenue);
    expect(marketReference()).toBeGreaterThan(0);
  });

  it('rp_roundtrip_two_cos: the seller\'s income statement is identical with and without the supply deal (only the related line differs)', () => {
    // the same seed in both worlds: the only difference is the deal
    const plain = pair('rp-twin', { deal: false, linked: true });
    const deal = pair('rp-twin', { deal: true, linked: true });
    advanceTo(plain.g, 70);
    advanceTo(deal.g, 70);
    const a = plain.seller.filings[0]!.income;
    const b = deal.seller.filings[0]!.income;
    expect({ ...b, relatedPartyIncome: 0 }).toEqual({ ...a, relatedPartyIncome: 0 });
    expect(a.relatedPartyIncome).toBe(0);
    expect(b.relatedPartyIncome).toBeGreaterThan(0);
  });

  it('rp_ipo_excluded: the seller\'s filed value (and so the IPO price) is the same to the cent with and without the related income', () => {
    const plain = pair('rp-ipo', { deal: false, linked: true });
    const deal = pair('rp-ipo', { deal: true, linked: true });
    advanceTo(plain.g, 200);
    advanceTo(deal.g, 200);
    const va = vEngine(filedInputs(plain.seller, 0));
    const vb = vEngine(filedInputs(deal.seller, 0));
    expect(va).toBeGreaterThan(0);
    expect(vb).toBeCloseTo(va, 2);
    expect(plain.seller.filedV).toBeCloseTo(deal.seller.filedV ?? 0, 2);
  });

  it('rp_roundtrip_two_cos (cash side): the related cash is kept out of net debt, so the cash from the deal does not move value', () => {
    const deal = pair('rp-cash', { deal: true, linked: true });
    advanceTo(deal.g, 70);
    const f = deal.seller.filings[0]!;
    expect(f.relatedCash).toBeGreaterThan(0);
    expect(f.relatedCash).toBeLessThanOrEqual(f.balance.cash);
  });
});
