/**
 * Tape sections 6 and 7 (IPO eligibility and float bounds, IPO price, founder allocation, salary cap). Test names carry
 * the Tape id. The IPO price is (1 - discount) x V_engine / shares_post (Quant section 12 #3, decided by Ledger Q16).
 */
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand } from '../../game';
import { advanceTo, BUYER_A, companyOf, FOUNDER, founded, THREE_FILINGS_DAY } from '../b1fixture';
import { salaryCapPerDay } from '../failure';
import type { Company } from '../types';

/** A founded company with three filings, an R3 founder and buyer A, and a filed value `filedV`, ready for an IPO request. */
function ipoReady(seed: string, filedV = 100_000_000) {
  const { g } = founded(seed);
  advanceTo(g, THREE_FILINGS_DAY);
  const c = companyOf(g);
  c.filedV = filedV;
  g.players[FOUNDER]!.rankId = 'R3';
  g.players[BUYER_A]!.rankId = 'R3';
  return { g, c };
}

describe('Tape s6/s7: IPO and pay rules (unit rows)', () => {
  it('ipo_float_bounds: float 14.99% refused, 15% accepted, 49% accepted, 49.01% refused', () => {
    const want = (pct: number, seed: string) => {
      const { g, c } = ipoReady(seed);
      return applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: pct }).ok;
    };
    expect(want(0.1499, 'ipo-f1')).toBe(false);
    expect(want(0.15, 'ipo-f2')).toBe(true);
    expect(want(0.49, 'ipo-f3')).toBe(true);
    expect(want(0.4901, 'ipo-f4')).toBe(false);
    expect(COMPANY.ipo.floatMin).toBe(0.15);
    expect(COMPANY.ipo.floatMax).toBe(0.49);
  });

  it('ipo_eligibility (value): filed value $49.99M refused, $50M passes the value test', () => {
    const low = ipoReady('ipo-v1', 49_990_000);
    expect(applyCommand(low.g, FOUNDER, { type: 'company.ipo', companyId: low.c.id, floatPct: 0.2 }).ok).toBe(false);
    const ok = ipoReady('ipo-v2', 50_000_000);
    expect(applyCommand(ok.g, FOUNDER, { type: 'company.ipo', companyId: ok.c.id, floatPct: 0.2 }).ok).toBe(true);
  });

  it('ipo_price_formula: P_IPO = 0.9 x filed V / shares post, exact, and the book is one game day', () => {
    const { g, c } = ipoReady('ipo-p');
    expect(applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 }).ok).toBe(true);
    const book = c.ipo!;
    expect(book.price).toBeCloseTo((0.9 * c.filedV) / book.sharesPost, 12);
    expect(book.listDay - book.requestDay).toBe(COMPANY.ipo.bookDays);
  });

  it('ipo_founder_no_subscribe: the founder gets no allocation (the order is refused); an unlinked buyer can order', () => {
    const { g, c } = ipoReady('ipo-nosub');
    applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 });
    expect(applyCommand(g, FOUNDER, { type: 'company.ipoOrder', companyId: c.id, shares: 100 }).ok).toBe(false);
    expect(applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 100 }).ok).toBe(true);
  });

  it('salary_cap_exact: max($50/gd, 1% of TTM revenue / 252); the $50 floor binds below TTM revenue of $1.26M, not $126k', () => {
    const withTtm = (ttm: number) => {
      const q = { revenue: ttm / 4 };
      return salaryCapPerDay({ closed: [q, q, q, q] } as unknown as Company);
    };
    const floor = COMPANY.failure.salaryCapFloor;
    const share = COMPANY.failure.salaryCapRevenueShare;
    // the floor binds while share x TTM / 252 < floor, i.e. below TTM = floor x 252 / share = $1,260,000
    expect(floor * 252 / share).toBeCloseTo(1_260_000, 6);
    expect(withTtm(1_000_000)).toBe(floor); // 1% of $1M / 252 = $39.68, below the floor
    expect(withTtm(0)).toBe(floor);
    expect(withTtm(1_259_999)).toBe(floor);
    expect(withTtm(1_260_000)).toBeCloseTo(floor, 9); // the exact boundary: 1% of $1.26M / 252 = $50.00
    // above the boundary the cap is the formula, exact to the cent: $1,260,252 gives $50.01
    expect(withTtm(1_260_252)).toBeCloseTo(50.01, 9);
    expect(Math.abs(withTtm(1_285_200) - (share * 1_285_200) / 252)).toBeLessThan(0.005);
    expect(withTtm(10_000_000)).toBeCloseTo((share * 10_000_000) / 252, 9);
  });

  it.skip('ipo_primary_only [WAIT: the proceeds-to-treasury cash identity is in the money-flow invariants, not a unit row here]', () => {});
  it.skip('ipo_lockup [WAIT: sell path at listing+167/168 across the window; covered by ipo.test.ts lockup cases]', () => {});
  it.skip('ipo_short_open [WAIT-INSTR: shorting needs the Quant 6.5 instruments, not built]', () => {});
});
