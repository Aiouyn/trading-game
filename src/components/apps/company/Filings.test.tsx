import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPANY } from '@/content/company';
import { foundCompany, emptyCompanyWorld, type CompanyEnv } from '@/world/company/company';
import { founderCompanyView, type CompanyFounderView } from '@/world/company/views';
import type { CompanyWorld, FilingPublic } from '@/world/company/types';
import { Filings } from './Filings';
import { RnD } from './RnD';

// O-17: the Filings tab shows the founder's filed statements (the frozen, filed data) and the next filing day; the Launch
// block on R&D shows a next-gen credit as ready at the ready mark, and waits below it.

function view(): CompanyFounderView {
  const env: CompanyEnv = { seed: 'filings-view', day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R2', money: { cash: () => 2_000_000, take: () => undefined } };
  const w: CompanyWorld = emptyCompanyWorld('filings-view');
  const r = foundCompany(w, env, 'founder', { name: 'Filed Co.', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return founderCompanyView(w, 'founder', r.value.id, 70);
}

function filing(quarter: number, filedDay: number): FilingPublic {
  return {
    quarter, periodCloseDay: quarter * COMPANY.quarterDays, filedDay, hash: 'h',
    income: { revUnrelated: 120_000, relatedPartyIncome: 0, cogs: 60_000, opex: 30_000, ebitda: 30_000, netIncome: 20_000, niAdj: 20_000, interest: 0 },
    balance: { cash: 95_000, receivables: 12_000, inventory: 8_000, ppe: 40_000, debt: 0, equity: 160_000, retainedEarnings: 10_000 },
    cashFlow: { ocf: 25_000, capex: 5_000, capexMaint: 1_000, fcf: 20_000, dividends: 0, buybacks: 0 },
    headcountBand: '10-50', backlog: 0, backlogContribution: 0, unitCost: 10, matUnit: 5, inputIndex: 1,
    backlogReversal: { nonConversion: 0, baseRate: 0, excessLift: 0, repayment: 0 },
  };
}

describe('Filings tab (O-17)', () => {
  it('shows the next filing day and the empty state before any quarter is filed', () => {
    const v = view();
    const html = renderToStaticMarkup(<Filings co={v} />);
    expect(html).toContain('data-testid="company-filings-next"');
    expect(html).toContain('data-testid="company-filings-none"');
    expect(html).toContain('data-testid="company-filings-registry"');
    expect(html).not.toContain('data-testid="company-filing"');
  });

  it('lists each filed quarter newest first, with its income, balance and cash flow lines as whole figures', () => {
    const v: CompanyFounderView = { ...view(), tier: 'late', filings: [filing(1, 66), filing(2, 129)] };
    const html = renderToStaticMarkup(<Filings co={v} />);
    const first = html.indexOf('data-quarter="2"');
    const second = html.indexOf('data-quarter="1"');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(html).toContain('data-testid="company-filing-income"');
    expect(html).toContain('data-testid="company-filing-balance"');
    expect(html).toContain('data-testid="company-filing-cashflow"');
    expect(html).toContain('data-testid="company-filing-2-netIncome"');
    expect(html).toContain('data-testid="company-filing-1-fcf"');
    // every figure is set whole: the nowrap class of Stat's figure prop
    const figures = html.match(/data-testid="company-filing-\d-[a-zA-Z]+"[\s\S]*?<\/div><\/div>/g) ?? [];
    // 6 income, 6 balance and 5 cash flow lines in each of the two filings
    expect(figures.length).toBe(34);
    for (const f of figures) expect(f).toContain('whitespace-nowrap');
    expect(html).not.toContain('data-testid="company-filings-registry"');
  });
});

describe('Launch on R&D (O-17)', () => {
  it('shows the launch form for a credit at the ready mark, and waits below it', () => {
    const ready = { ...view(), launchCredits: [{ generation: 2, score: 80, ready: true }] };
    const htmlReady = renderToStaticMarkup(<RnD co={ready} />);
    expect(htmlReady).toContain('data-testid="company-launch-ready"');
    expect(htmlReady).toContain('data-testid="company-launch-submit"');
    expect(htmlReady).not.toContain('data-testid="company-launch-not-ready"');

    const waiting = { ...view(), launchCredits: [{ generation: 2, score: 40, ready: false }] };
    const htmlWaiting = renderToStaticMarkup(<RnD co={waiting} />);
    expect(htmlWaiting).toContain('data-testid="company-launch-not-ready"');
    expect(htmlWaiting).not.toContain('data-testid="company-launch-submit"');

    const none = renderToStaticMarkup(<RnD co={{ ...view(), launchCredits: [] }} />);
    expect(none).toContain('data-testid="company-launch-none"');
  });
});
