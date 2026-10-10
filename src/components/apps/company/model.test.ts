import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { emptyCompanyWorld, foundCompany, type CompanyEnv } from '@/world/company/company';
import { founderCompanyView, publicCompanyView, type CompanyPublic } from '@/world/company/views';
import type { CompanyWorld } from '@/world/company/types';
import { PublicPanel } from './PublicPanel';
import { marketOf, numberOrNull, refusalOf, isCompanyView, percentOf } from './model';
import { money, pct } from '@/game/format';

// The privacy checks run through the real paths: a company is founded by the engine, its private state is set to
// sentinel values (distinctive numbers no public field can carry), and the market side is rendered from the public
// view only. A sentinel in the rendered markup, or a key the public view does not have, is a leak.

interface Harness { w: CompanyWorld; env: CompanyEnv; id: string; day: number }

function founded(): Harness {
  const money: Record<string, number> = { founder: 2_000_000 };
  const env: CompanyEnv = {
    seed: 'privacy', day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R2',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
    },
  };
  const w = emptyCompanyWorld('privacy');
  const r = foundCompany(w, env, 'founder', { name: 'Lantern Roasting Co.', sector: 'staples', cityId: 'avalon', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return { w, env, id: r.value.id, day: 1 };
}

/** Sentinel private values (no public field carries them): marketing, revenue to date, quality, a share and cash. */
const SENTINELS = {
  marketing: 412_000,
  revenueQtd: 987_654.32,
  share: 0.4421,
  quality: 61.37,
};

function withSentinels(h: Harness): void {
  const c = h.w.companies[h.id]!;
  const p = c.products[0]!;
  p.marketing = SENTINELS.marketing;
  p.q = SENTINELS.quality;
  p.lastShare = SENTINELS.share;
  c.qtd.revenue = SENTINELS.revenueQtd;
}

/** The text a second player would see on the market side, as HTML (every string the screen can show). */
function renderedMarket(pub: CompanyPublic): string {
  return renderToStaticMarkup(createElement(PublicPanel, { pub }));
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

  it('matches the engine public view exactly, and the market render carries no sentinel of a real founded company', () => {
    const h = founded();
    withSentinels(h);
    const c = h.w.companies[h.id]!;
    const founder = founderCompanyView(h.w, 'founder', h.id, h.day);
    // the founder's own view holds the sentinels (so the check below means something)
    const founderText = JSON.stringify(founder);
    expect(founderText.includes(String(SENTINELS.marketing))).toBe(true);
    expect(founderText.includes('61.37')).toBe(true);

    const pub = marketOf(founder);
    expect(pub).toEqual(publicCompanyView(c, h.day));
    const html = renderedMarket(pub);
    expect(html).toContain('data-testid="company-market"');
    for (const shown of [
      money(SENTINELS.marketing), money(SENTINELS.revenueQtd), pct(SENTINELS.share), '412,000', '987,654', '61.37', '44.21',
    ]) {
      expect(html.includes(shown), shown).toBe(false);
    }
    expect(html).not.toContain('data-private');
    expect(html).not.toContain('company-plan-minprice');
  });

  it('renders every public section a CompanyPublic can carry, with its values', () => {
    const pub: CompanyPublic = {
      id: 'c1', name: 'Atlas Tools Ltd', sector: 'industrials', foundedDay: 36, tier: 'late',
      listed: { assetId: 'a1', ipoDay: 500, sharesOut: 2_000_000, floatShares: 500_000 },
      cities: ['avalon'], products: [{ name: 'Gear Set', segment: 'mid', price: 52 }],
      headcountBand: '50–200', debt: { totalBand: '1M–5M', rating: 'NR', covenant: 'cure' },
      cashDebt: { cash: 120_000, totalDebt: 3_000_000, filedDay: 620 },
      filings: [{
        quarter: 4, periodCloseDay: 615, filedDay: 618, hash: 'h',
        income: { revUnrelated: 2_200_000, relatedPartyIncome: 0, cogs: 1, opex: 1, ebitda: 1, netIncome: 88_000, niAdj: 1, interest: 1 },
        balance: { cash: 120_000, receivables: 0, inventory: 0, ppe: 0, debt: 3_000_000, equity: 0, retainedEarnings: 0 },
        cashFlow: { ocf: 1, capex: 0, capexMaint: 0, fcf: 1, dividends: 0, buybacks: 0 }, headcountBand: '50–200',
        backlog: 0, backlogContribution: 0, unitCost: 1, matUnit: 1, inputIndex: 1,
        backlogReversal: { nonConversion: 0, baseRate: 0, excessLift: 0, repayment: 0 },
      }],
      registry: undefined,
      signals: [{
        day: 610, revenueQtdBand: [1_000_000, 1_200_000], runRateBand: [90_000, 110_000], bookingsBand: [0, 1],
        netHires: 'up', utilizationBand: '70–80%', launches: [], debtDrawn: 0, backlogContributionBand: [0, 1],
      } as unknown as CompanyPublic['signals'][number]],
      credibility: 0.5,
      insiderTrades: [{ day: 590, filedDay: 591, side: 'sell', qty: 4_000, instrument: 'stock' }],
      distressFlag: true,
      buybackPrograms: [{ size: 150_000, fromDay: 600, toDay: 640 }],
      plans: [{ fromDay: 650, toDay: 700 }],
      planSkips: [{ day: 655, reason: 'price' }],
      window: { open: false, opensDay: 660, covered: ['a1'] },
    };
    const html = renderedMarket(pub);
    for (const testId of [
      'company-market-card', 'company-market-covenant', 'company-market-distress', 'company-market-listed', 'company-market-balance',
      'company-market-products', 'company-market-filings', 'company-market-signals', 'company-market-insider', 'company-market-window',
      'company-market-plans', 'company-market-skips', 'company-market-buybacks',
    ]) {
      expect(html, testId).toContain(`data-testid="${testId}"`);
    }
    expect(html).not.toContain('data-testid="company-market-registry"');
    expect(html).toContain('data-testid="company-market-trade"');
    expect(html).toContain('data-testid="company-market-signal"');
    expect(html).toContain('data-testid="company-market-skips"');
  });
});

/** A founder view with sentinel private values, built from a plain object (the market side reads only public keys). */
function sentinelView(): Parameters<typeof marketOf>[0] {
  return {
    id: 'c1', name: 'Lantern Roasting Co.', sector: 'staples', foundedDay: 36, tier: 'late', cities: ['avalon'],
    products: [{ name: 'House Blend', segment: 'mid', price: 50 }], headcountBand: '10–50', debt: { totalBand: '0–1M', rating: 'NR', covenant: 'ok' },
    filings: [], signals: [], credibility: 0.5, insiderTrades: [], distressFlag: false, buybackPrograms: [], plans: [], planSkips: [],
    cash: 61.37, quarterToDate: { revenue: 412000, cogs: 1, opex: 2, units: 3 }, productsPrivate: [{ id: 'p', name: 'House Blend', price: 50, quality: 61.37, qualityScore: 61, unitCost: 0.4421, share: 0.1, marketing: 412000, generation: 1, brand: 0, patents: [] }],
    execs: { CEO: null, CFO: null, COO: null, CTO: null }, goalsDone: {}, rivals: [], suppliers: [], licences: [], supplyDeals: [], ceoChange: null, ceoFreeze: null, exCeo: null, guarantee: null,
    limits: { priceMin: 35, priceMax: 65, marketingMax: 10000, productCap: 2, headcountCap: 25, rdProjectsAtOnce: 1, qualityReady: 55, franchiseRateMin: 0.04, franchiseRateMax: 0.08, franchiseCap: 3, supplyBand: 0.1 },
    payrollPerDay: 1000, runwayDays: 60, nextCloseDay: 63, distress: false, bankrupt: false,
  } as unknown as Parameters<typeof marketOf>[0];
}

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
