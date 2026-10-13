import { describe, expect, it } from 'vitest';
import { COMPANY, SECTORS, type CompanySector } from '@/content/company';
import { companyTick, emptyCompanyWorld, foundCompany, type CompanyEnv } from './company';

// R-10-7 (company): receivables are days of sales by the buyer's terms (SectorEcon.receivableDays), and their build-up is its
// own ledger line ("receivables build-up"), so a sale never reads as cash out for sales.

function run(seed: string, sector: CompanySector, days: number) {
  const money: Record<string, number> = { founder: 2_000_000 };
  const env: CompanyEnv = {
    seed, day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R2',
    money: { cash: (pid) => money[pid] ?? 0, take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; } },
  };
  const w = emptyCompanyWorld(seed);
  const r = foundCompany(w, env, 'founder', { name: 'Harbor Labs', sector, cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  for (let d = 1; d <= days; d++) {
    env.day = d;
    companyTick(w, env, d);
  }
  return w.companies[r.value.id]!;
}

describe('receivables by the buyer (R-10-7)', () => {
  it('consumer goods settle in about a day; the B2B figure is the open ruling, held at the old 10 days (docs/V1-PHASE10.md 10D.2)', () => {
    expect(SECTORS.discretionary.receivableDays).toBe(1);
    for (const s of ['tech', 'health', 'staples', 'industrials', 'security'] as const) expect(SECTORS[s].receivableDays, s).toBe(10);
    expect('dso' in COMPANY).toBe(false);
  });

  it('the receivable balance is the build-up line: the sales and the build-up books add up to the sales booked', () => {
    const c = run('ar-identity', 'tech', 90);
    const sales = c.ledgerTotals.sales ?? 0;
    const build = c.ledgerTotals['receivables build-up'] ?? 0;
    expect(sales).toBeGreaterThan(0);
    // over a run from zero receivables, the build-up is the receivable balance taken out of the cash
    expect(-build).toBeCloseTo(c.ar, 4);
  });

  it('a consumer company carries about a day of sales in receivables, a trade company about ten', () => {
    const consumer = run('ar-consumer', 'discretionary', 120);
    const trade = run('ar-trade', 'tech', 120);
    const perDay = (c: typeof consumer) => (c.ledgerTotals.sales ?? 0) / 120;
    // the receivable stock in days of the average day's sales (the build-up of the last days is what the stock holds)
    expect(consumer.ar / perDay(consumer)).toBeLessThan(3);
    expect(trade.ar / perDay(trade)).toBeGreaterThan(5);
  });

  it('the first sale no longer books the whole receivable as a sales outflow', () => {
    const c = run('ar-first', 'discretionary', 30);
    // sales are always the day's revenue, never net of the receivable build
    expect(c.ledgerTotals.sales ?? 0).toBeGreaterThan(0);
    expect(c.ledgerTotals['receivables build-up'] ?? 0).toBeGreaterThanOrEqual(-(c.ledgerTotals.sales ?? 0));
  });
});
