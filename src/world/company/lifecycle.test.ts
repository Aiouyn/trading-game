import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { applyCommand } from '../game';
import { bump, cashOf, today } from '../core';
import type { GameState } from '../types';
import { advanceTo, BUYER_A, companyOf, FOUNDER, THREE_FILINGS_DAY, totalMoney, unfounded } from './b1fixture';
import { BANK_POOL } from './debt';
import { recordPayout } from './failure';
import type { IpoBook } from './types';

// The cross-track conservation test: one company from founding to bankruptcy, through the company core, the market (IPO and
// dividends), the bank (loans and covenants) and the failure path (guarantees and clawbacks). Every money move is a transfer
// or a booked faucet or sink, so the total money of the world less its booked faucets plus sinks is the same at every stage.

/** The money the world holds, less what it created (faucets) plus what it destroyed (sinks). Constant under transfers. */
function identity(g: GameState): number {
  const flows = g.companies ? g.companies.flows.faucet - g.companies.flows.sink : 0;
  return totalMoney(g) - flows;
}

describe('one company through its whole life keeps the money identity', () => {
  it('stage by stage: found, filings, a round, the IPO, a dividend, a covenant breach, a clawback and a bankruptcy', () => {
    const g = unfounded('lifecycle');
    const base = identity(g);
    const check = (stage: string) => {
      expect(identity(g), stage).toBeCloseTo(base, 4);
    };

    // 1. found: the founder's capital moves into the company (a transfer)
    const found = applyCommand(g, FOUNDER, { type: 'company.found', name: 'Acme', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
    expect(found.ok).toBe(true);
    check('found');
    const c = companyOf(g);
    expect(c.cash).toBe(COMPANY.founding.capital);

    // 2. three filed quarters: the operations, the closes and the filings all book their money
    advanceTo(g, THREE_FILINGS_DAY);
    expect(c.filings).toHaveLength(3);
    check('three filings');

    // 3. a private round: the seed pool buys shares for cash (a transfer from the investor into the company)
    const seed0 = g.companies!.investors['npc:seed']!.cash;
    const cash0 = c.cash;
    const round = applyCommand(g, FOUNDER, { type: 'company.act', companyId: c.id, action: { kind: 'raiseRound', amount: 300_000 } });
    expect(round.ok, round.error).toBe(true);
    expect(g.companies!.investors['npc:seed']!.cash).toBeCloseTo(seed0 - 300_000, 6);
    expect(c.cash).toBeCloseTo(cash0 + 300_000, 6);
    check('round');

    // 4. the IPO: the book is open on the request day, the buyer subscribes, and the company lists on the due day
    c.filedV = 100_000_000;
    g.players[FOUNDER]!.rankId = 'R3';
    g.players[BUYER_A]!.rankId = 'R3';
    expect(applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 }).ok).toBe(true);
    expect(applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 }).ok).toBe(true);
    advanceTo(g, (c.ipo as IpoBook).listDay);
    expect(c.listed).not.toBeNull();
    check('ipo');

    // 5. a dividend on the filed FCF and the register (a transfer from the company to the holders)
    c.filings[c.filings.length - 1]!.cashFlow.fcf = 1_000_000;
    c.retained = 1e8;
    const founder0 = cashOf(g, FOUNDER);
    const div = applyCommand(g, FOUNDER, { type: 'company.dividend', companyId: c.id, perShare: 0.001 });
    expect(div.ok, div.error).toBe(true);
    expect(cashOf(g, FOUNDER)).toBeGreaterThan(founder0);
    check('dividend');

    // 6. a bank loan with a personal guarantee, and most of the cash paid out to the founder as a related payment (a covered
    // payout): the company keeps a working balance of 300k, so the net debt breaches the leverage covenant at the next filing
    // (the quarter closes on day 252, filed on day 255).
    c.tier = 'growth';
    const loan = applyCommand(g, FOUNDER, { type: 'company.loan', companyId: c.id, amount: 9_000_000, guarantee: true, acknowledged: true });
    expect(loan.ok, loan.error).toBe(true);
    const bankAfterLoan = g.companies!.investors[BANK_POOL]!.cash;
    check('loan');
    const out = c.cash - 300_000;
    c.cash -= out;
    bump(g, FOUNDER, out);
    recordPayout(c, { day: 201, toPlayerId: FOUNDER, amount: out, covered: out, kind: 'related', termsDay: 201, flagged: false, insider: false });
    check('related payment');
    advanceTo(g, 255);
    expect(c.covenant.status).toBe('cure');
    check('breach');

    // 7. the company runs out of cash: a larger related payment leaves it overdrawn, and the overdraft is the creditors' claim
    const overdraw = c.cash + 2_000_000;
    c.cash -= overdraw;
    bump(g, FOUNDER, overdraw);
    recordPayout(c, { day: 256, toPlayerId: FOUNDER, amount: overdraw, covered: overdraw, kind: 'related', termsDay: 256, flagged: false, insider: false });
    check('overdraft');

    // 8. the default: the insolvency runs 21 gd, the clawback reaches the creditors' claims (the overdraft and the bank loan
    // among them), the bank is paid pro rata from the estate, and the rest of the claims are written off
    for (let i = 0; i < 120 && !c.bankrupt; i++) advanceTo(g, today(g) + 1);
    expect(c.bankrupt, 'the company defaults').not.toBeNull();
    expect(c.bankrupt!.clawed).toBeGreaterThan(0);
    expect(c.debts).toEqual([]);
    expect(g.companies!.investors[BANK_POOL]!.cash).toBeGreaterThan(bankAfterLoan);
    check('bankruptcy');

    // 9. a dead company accrues nothing: no interest, no new flows, the identity still holds
    const bankDead = g.companies!.investors[BANK_POOL]!.cash;
    const cashDead = c.cash;
    advanceTo(g, today(g) + 30);
    expect(g.companies!.investors[BANK_POOL]!.cash).toBe(bankDead);
    expect(c.cash).toBe(cashDead);
    check('after the default');
  });
});
