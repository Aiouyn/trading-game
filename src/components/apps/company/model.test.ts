import { describe, expect, it } from 'vitest';
import type { CompanyFounderView } from '@/world/company/views';
import { marketOf, numberOrNull, refusalOf, isCompanyView, percentOf } from './model';

/** A founder view with sentinel private values (61.37, 412000, and so on) that the market side must never carry. */
function sentinelView(): CompanyFounderView {
  return {
    id: 'c1', name: 'Lantern Roasting Co.', sector: 'staples', foundedDay: 36, tier: 'late', cities: ['avalon'],
    products: [{ name: 'House Blend', segment: 'mid', price: 50 }], headcountBand: '10–50', debt: { totalBand: '0–1M', rating: 'NR', covenant: 'ok' },
    filings: [], signals: [], credibility: 0.5, insiderTrades: [], distressFlag: false, buybackPrograms: [], plans: [], planSkips: [],
    cash: 61.37, quarterToDate: { revenue: 412000, cogs: 1, opex: 2, units: 3 }, productsPrivate: [{ id: 'p', name: 'House Blend', price: 50, quality: 61.37, qualityScore: 61, unitCost: 0.4421, share: 0.1, marketing: 412000, generation: 1, brand: 0 }],
    execs: { CEO: null, CFO: null, COO: null, CTO: null }, goalsDone: {}, rivals: [], suppliers: [], licences: [], supplyDeals: [], ceoChange: null, ceoFreeze: null, exCeo: null, guarantee: null,
    limits: { priceMin: 35, priceMax: 65, marketingMax: 10000, productCap: 2, headcountCap: 25, rdProjectsAtOnce: 1, qualityReady: 55, franchiseRateMin: 0.04, franchiseRateMax: 0.08, franchiseCap: 3, supplyBand: 0.1 },
    payrollPerDay: 1000, runwayDays: 60, nextCloseDay: 63, distress: false, bankrupt: false,
  } as unknown as CompanyFounderView;
}

describe('the market side of a company', () => {
  it('keeps only the public fields, so no private sentinel can reach the market screen', () => {
    const pub = marketOf(sentinelView());
    const json = JSON.stringify(pub);
    for (const secret of ['61.37', '412000', '0.4421', 'productsPrivate', 'quarterToDate', 'marketing']) {
      expect(json.includes(secret), secret).toBe(false);
    }
    expect(Object.keys(pub).sort()).toEqual([
      'buybackPrograms', 'cities', 'credibility', 'debt', 'distressFlag', 'filings', 'foundedDay', 'headcountBand',
      'id', 'insiderTrades', 'name', 'planSkips', 'plans', 'products', 'sector', 'signals', 'tier',
    ]);
    expect(pub.name).toBe('Lantern Roasting Co.');
  });
});

describe('the Company app helpers', () => {
  it('reads a refusal from an ack: the code and the reject numbers', () => {
    expect(refusalOf({ ok: true })).toBeNull();
    expect(refusalOf({ ok: false, error: 'marketingCap', data: { code: 'marketingCap', cap: 10000 } })).toEqual({ code: 'marketingCap', cap: 10000 });
    expect(refusalOf({ ok: false, error: 'server error' })).toEqual({ code: 'server error' });
  });

  it('parses form numbers and rejects empty or non-finite input', () => {
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('  ')).toBeNull();
    expect(numberOrNull('abc')).toBeNull();
    expect(numberOrNull('12.5')).toBe(12.5);
  });

  it('knows the company views and turns a rate into percent for the copy', () => {
    expect(isCompanyView('rd')).toBe(true);
    expect(isCompanyView('overview ')).toBe(false);
    expect(percentOf(0.04)).toBe(4);
    expect(percentOf(0.075)).toBe(8);
  });
});
