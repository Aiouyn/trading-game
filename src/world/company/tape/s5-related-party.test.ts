/**
 * Tape section 5, related-party trade (tape-company-building.md section 6.3, unchanged in Quant v1.7). A supply deal
 * between companies is priced inside the band of the public reference (+-10%); a deal between owner-linked companies
 * that is priced out of band adds surveillance (+30). Test names carry the Tape id.
 */
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand } from '../../game';
import { advanceTo, BUYER_B, companyOf, FOUNDER, founded } from '../b1fixture';
import { companyEnvOf } from '../bridge';
import { linkOwner } from '../owners';
import { openSupply, marketReference } from '../supply';
import type { Company } from '../types';

/** A founder company (buyer) and a second company founded by BUYER_B (seller), both at the founding day. */
function twoCompanies(seed: string): { g: ReturnType<typeof founded>['g']; buyer: Company; seller: Company } {
  const { g, c: buyer } = founded(seed);
  g.players[BUYER_B]!.rankId = 'R2';
  const r = applyCommand(g, BUYER_B, { type: 'company.found', name: 'Beta', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(r.error);
  const seller = Object.values(g.companies!.companies).find((x) => x.id !== buyer.id)!;
  advanceTo(g, 10);
  return { g, buyer, seller };
}

function supply(g: ReturnType<typeof founded>['g'], buyer: Company, seller: Company, price: number) {
  return openSupply(g.companies!, buyer, companyEnvOf(g), FOUNDER, { sellerId: seller.id, unitsPerDay: 10, price });
}

describe('Tape s5: related-party trade, band and surveillance', () => {
  it('rp_band_exact: the band is the public reference +-10% to the cent: 45.00 and 55.00 accepted; 44.99 and 55.01 refused', () => {
    const ref = marketReference();
    expect(ref * (1 - COMPANY.supply.band)).toBeCloseTo(45, 9);
    expect(ref * (1 + COMPANY.supply.band)).toBeCloseTo(55, 9);
    const at = (price: number, seed: string) => {
      const { g, buyer, seller } = twoCompanies(seed);
      return supply(g, buyer, seller, price).ok;
    };
    expect(at(45, 'rp-b1')).toBe(true);
    expect(at(55, 'rp-b2')).toBe(true);
    expect(at(44.99, 'rp-b3')).toBe(false);
    expect(at(55.01, 'rp-b4')).toBe(false);
  });

  it('rp_band_exact (refusal): an out-of-band deal names the band it missed', () => {
    const { g, buyer, seller } = twoCompanies('rp-code');
    const r = supply(g, buyer, seller, 56);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reject).toEqual({ code: 'supplyPriceOutOfBand', min: 45, max: 55 });
  });

  it('rp_roundtrip_two_cos (surveillance): an out-of-band deal between owner-linked companies adds +30 surveillance; an unlinked one adds none', () => {
    const unlinked = twoCompanies('rp-unl');
    expect(supply(unlinked.g, unlinked.buyer, unlinked.seller, 60).ok).toBe(false);
    expect(unlinked.g.companies!.insider?.[FOUNDER]).toBeUndefined();

    const linked = twoCompanies('rp-lnk');
    linkOwner(linked.g.companies!, BUYER_B, FOUNDER); // the seller's owner is now in the founder's owner group
    expect(supply(linked.g, linked.buyer, linked.seller, 60).ok).toBe(false);
    expect(linked.g.companies!.insider?.[FOUNDER]?.points).toBe(COMPANY.failure.insiderPoints.relatedOutOfBand);
  });

  it('rp_roundtrip_two_cos (in band, linked): an in-band deal between linked companies is accepted and adds no surveillance', () => {
    const { g, buyer, seller } = twoCompanies('rp-in');
    linkOwner(g.companies!, BUYER_B, FOUNDER);
    expect(supply(g, buyer, seller, 50).ok).toBe(true);
    expect(g.companies!.insider?.[FOUNDER]).toBeUndefined();
  });

  it('rp_no_sale_api (supply side): a supply deal to a company of the same founder is refused as a self supply', () => {
    const { g, buyer } = twoCompanies('rp-self');
    const r = openSupply(g.companies!, buyer, companyEnvOf(g), FOUNDER, { sellerId: buyer.id, unitsPerDay: 10, price: 50 });
    expect(r).toEqual({ ok: false, reject: { code: 'supplySelf' } });
    expect(companyOf(g).id).toBe(buyer.id);
  });
});
