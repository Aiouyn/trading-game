import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand } from '../game';
import type { GameState } from '../types';
import { advanceTo, BUYER_A, FOUNDER, founded, listedWorld, totalMoney } from './b1fixture';
import { BANK_POOL, covenantBreachOf, ttmOf } from './debt';
import { publicCompanyView } from './views';
import type { Company } from './types';

// Debt, covenants and guarantees (section 5, B1), and dividends (section 5.3): the rules, the cure, the default status and
// the conservation of money (loans, repayments and dividends are transfers).

function growth(seed: string): { g: GameState; c: Company } {
  const { g, c } = founded(seed);
  c.tier = 'growth';
  return { g, c };
}

function loan(g: GameState, companyId: string, amount: number, over: Partial<{ guarantee: boolean; acknowledged: boolean }> = {}) {
  return applyCommand(g, FOUNDER, { type: 'company.loan', companyId, amount, ...over });
}

describe('loans (Growth and Late tiers)', () => {
  it('refuses a loan below the Growth tier', () => {
    const { g, c } = founded('loan-tier');
    expect(loan(g, c.id, 100_000).error).toBe('loanTier');
  });

  it('draws a loan from the bank pool into company cash, at the bank rate', () => {
    const { g, c } = growth('loan-draw');
    const bankBefore = g.companies!.investors[BANK_POOL]!.cash;
    const cashBefore = c.cash;
    const r = loan(g, c.id, 100_000);
    expect(r.ok).toBe(true);
    expect((r.data as { ratePerDay: number }).ratePerDay).toBe(COMPANY.debt.ratePerDay);
    expect(c.cash).toBeCloseTo(cashBefore + 100_000, 6);
    expect(g.companies!.investors[BANK_POOL]!.cash).toBeCloseTo(bankBefore - 100_000, 6);
  });

  it('refuses a guaranteed loan until the consequence is acknowledged, then charges 75% of the rate', () => {
    const { g, c } = growth('loan-guarantee');
    const r = loan(g, c.id, 50_000, { guarantee: true });
    expect(r.error).toBe('guaranteeNotAcknowledged');
    expect((r.data as { personalDebt: number }).personalDebt).toBe(50_000);
    const ok = loan(g, c.id, 50_000, { guarantee: true, acknowledged: true });
    expect(ok.ok).toBe(true);
    expect((ok.data as { ratePerDay: number }).ratePerDay).toBeCloseTo(COMPANY.debt.ratePerDay * COMPANY.debt.guaranteedFactor, 12);
    expect((ok.data as { personalDebtIfDefault: number }).personalDebtIfDefault).toBe(50_000);
    expect(c.debts[c.debts.length - 1]!.guarantor).toBe(FOUNDER);
  });

  it('charges interest every game day to the bank, and moves no money out of the world', () => {
    const { g, c } = growth('loan-interest');
    loan(g, c.id, 200_000);
    const bankBefore = g.companies!.investors[BANK_POOL]!.cash;
    const day = c.foundedDay + 1;
    advanceTo(g, day);
    const bankAfter = g.companies!.investors[BANK_POOL]!.cash;
    expect(bankAfter - bankBefore).toBeCloseTo(200_000 * COMPANY.debt.ratePerDay, 6);
  });

  it('conserves money across a draw, a repayment and the bank (transfers only)', () => {
    const { g, c } = growth('loan-conserve');
    const before = totalMoney(g);
    loan(g, c.id, 300_000);
    expect(totalMoney(g)).toBeCloseTo(before, 6);
    c.cash += 1_000_000; // company cash for the repayment (a direct test setup, not a flow)
    const mid = totalMoney(g);
    const debtId = c.debts[0]!.id;
    expect(applyCommand(g, FOUNDER, { type: 'company.repay', companyId: c.id, debtId, amount: 100_000 }).ok).toBe(true);
    expect(totalMoney(g)).toBeCloseTo(mid, 6);
    expect(c.debts[0]!.principal).toBeCloseTo(200_000, 6);
  });

  it('refuses to repay more cash than the company holds, and an unknown loan', () => {
    const { g, c } = growth('loan-repay');
    loan(g, c.id, 100_000);
    c.cash = 10;
    expect(applyCommand(g, FOUNDER, { type: 'company.repay', companyId: c.id, debtId: c.debts[0]!.id, amount: 50_000 }).error).toBe('insufficientFunds');
    expect(applyCommand(g, FOUNDER, { type: 'company.repay', companyId: c.id, debtId: 'nope', amount: 1 }).error).toBe('repayUnknownDebt');
  });
});

describe('covenants at filing (3.5x leverage, 2.0x interest cover, a 21 gd cure)', () => {
  it('reads a breach from net debt and TTM EBITDA, and none when there is no debt', () => {
    const { c } = founded('cov-read');
    expect(covenantBreachOf(c, 0, 0)).toBeNull();
    expect(covenantBreachOf(c, 1_000, 0)).toBe('earnings');
    expect(ttmOf(c).count).toBe(0);
  });

  it('opens a cure at the filing of a breach, and the cure clears when the debt is repaid', () => {
    const { g, c } = listedWorld('cov-cure');
    // the loan is drawn before the next close (day 252), so the filing on day 255 tests it
    c.tier = 'growth';
    // a loan well above 3.5x the TTM EBITDA, with the proceeds spent: net debt is positive and breaches at the filing
    loan(g, c.id, 4_500_000);
    c.cash = 1_000;
    advanceTo(g, 255);
    expect(c.covenant.status).toBe('cure');
    expect(c.covenant.cureUntilDay).toBe(255 + COMPANY.debt.cureDays);
    expect(publicCompanyView(c, 255).debt.covenant).toBe('cure');
    // a loan is refused during the cure, and the cure clears on the live balance once the debt is gone
    // (the filing re-derived the tier from the statements, so the tier is set back for this check)
    c.tier = 'growth';
    expect(loan(g, c.id, 10_000).error).toBe('loanCovenant');
    c.cash = 1e7;
    const debtId = c.debts[0]!.id;
    applyCommand(g, FOUNDER, { type: 'company.repay', companyId: c.id, debtId, amount: 4_500_000 });
    advanceTo(g, 256);
    expect(c.covenant.status).toBe('ok');
  });

  it('moves to default when the cure ends still in breach, and the default is not cleared by a later day', () => {
    const { g, c } = listedWorld('cov-default');
    c.tier = 'growth';
    loan(g, c.id, 4_500_000);
    c.cash = 1_000;
    advanceTo(g, 255);
    expect(c.covenant.status).toBe('cure');
    advanceTo(g, 255 + COMPANY.debt.cureDays);
    expect(c.covenant.status).toBe('default');
    expect(publicCompanyView(c, 280).debt.covenant).toBe('default');
    advanceTo(g, 300);
    expect(c.covenant.status).toBe('default');
  });
});

describe('dividends (section 5.3): four rules, and the distress flag', () => {
  it('refuses a dividend before any filing', () => {
    const { g, c } = founded('div-none');
    expect(applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 0.1 }).error).toBe('dividendNotPermitted');
  });

  it('refuses a dividend in a cure', () => {
    const { g, c } = listedWorld('div-cure');
    c.covenant = { status: 'cure', cureUntilDay: 999 };
    expect(applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 0.1 }).error).toBe('dividendNotPermitted');
  });

  it('refuses a dividend above the TTM filed FCF, and one that empties retained earnings', () => {
    const { g, c } = listedWorld('div-fcf');
    const last = c.filings[c.filings.length - 1]!;
    last.cashFlow.fcf = 100;
    c.retained = 1e9;
    c.cash = 1e9;
    expect(applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 1 }).error).toBe('dividendNotPermitted');
    c.retained = 1;
    expect(applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 0.000001 }).error).toBe('dividendNotPermitted');
  });

  it('pays the register (founder, buyer, NPC book) and conserves money', () => {
    const { g, c } = listedWorld('div-pay');
    const last = c.filings[c.filings.length - 1]!;
    last.cashFlow.fcf = 1_000_000;
    c.retained = 1e8;
    c.cash = 1e7;
    const before = totalMoney(g);
    const founderBefore = g.market.accounts[FOUNDER]!.cash;
    const buyerBefore = g.market.accounts[BUYER_A]!.cash;
    const r = applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 0.5 });
    expect(r.ok).toBe(true);
    const total = (r.data as { total: number }).total;
    expect(total).toBeCloseTo(0.5 * c.shares, 6);
    expect(g.market.accounts[FOUNDER]!.cash - founderBefore).toBeCloseTo(0.5 * c.capTable[`founder:${FOUNDER}`]!, 6);
    expect(g.market.accounts[BUYER_A]!.cash - buyerBefore).toBeCloseTo(0.5 * 10_000, 6);
    expect(totalMoney(g)).toBeCloseTo(before, 4);
  });

  it('raises the distress flag when a permitted dividend follows a loan drawn in the same quarter, until the next filing', () => {
    const { g, c } = listedWorld('div-distress');
    c.tier = 'growth';
    loan(g, c.id, 100_000);
    const last = c.filings[c.filings.length - 1]!;
    last.cashFlow.fcf = 1_000_000;
    c.retained = 1e8;
    c.cash = 1e7;
    expect(applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 0.01 }).ok).toBe(true);
    expect(publicCompanyView(c, 201).distressFlag).toBe(true);
    advanceTo(g, 255);
    expect(c.divDistress).toBe(false);
  });
});

describe('the company\'s default status is consumed, not decided, here', () => {
  it('leaves the bankruptcy to a later step (the status is the only output)', () => {
    const { g, c } = founded('default-status');
    expect(c.covenant.status).toBe('ok');
    expect(g.companies).toBeDefined();
  });
});

