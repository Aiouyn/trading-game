import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { companyTick, emptyCompanyWorld, foundCompany, type CompanyEnv } from './company';
import { addSurveillance, bankrupt, clawback, insolvencyStep, recordPayout, salaryCapPerDay } from './failure';
import { BANK_POOL } from './debt';
import type { Company, CompanyWorld, Debt, Payout, Statements } from './types';

interface Harness { w: CompanyWorld; env: CompanyEnv; money: Record<string, number> }

function harness(seed = 'fail-test', founderCash = 5_000_000): Harness {
  const money: Record<string, number> = { founder: founderCash, rival: 900_000 };
  const env: CompanyEnv = {
    seed, day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R3',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
      give: (pid, amount) => { money[pid] = (money[pid] ?? 0) + amount; },
    },
  };
  return { w: emptyCompanyWorld(seed), env, money };
}

function found(h: Harness): Company {
  const r = foundCompany(h.w, h.env, 'founder', { name: 'Acme', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return h.w.companies[r.value.id]!;
}

/** Money the world holds: players, company cash and estates, investor pools, less sinks plus faucets. */
function identity(h: Harness): number {
  let t = Object.values(h.money).reduce((s, x) => s + x, 0);
  for (const x of Object.values(h.w.companies)) t += x.cash + (x.estate ?? 0);
  for (const p of Object.values(h.w.investors)) t += p.cash;
  return t + h.w.flows.sink - h.w.flows.faucet;
}

/** A covered payment record for a test: the defaults are a clawable related payment, unless a test changes them. */
function pay(over: Partial<Omit<Payout, 'id'>> & { day: number; toPlayerId: string; covered: number }): Omit<Payout, 'id'> {
  return { amount: over.covered, kind: 'related', termsDay: 0, flagged: false, insider: false, ...over };
}

describe('the salary cap and the default trigger (CB-050, spec 5.3)', () => {
  it('the cap is the larger of $50 a game day and 1% of the trailing revenue per game day', () => {
    const h = harness();
    const c = found(h);
    expect(salaryCapPerDay(c)).toBe(COMPANY.failure.salaryCapFloor);
    const q = { revenue: 630_000 } as unknown as Statements;
    c.closed = [q, q, q, q];
    expect(salaryCapPerDay(c)).toBeCloseTo((0.01 * 2_520_000) / COMPANY.yearDays, 9);
  });

  it('a default is 21 consecutive game days of negative cash, and a day at zero or above resets it', () => {
    const h = harness();
    const c = found(h);
    c.cash = -1;
    for (let i = 0; i < COMPANY.failure.defaultDays - 1; i++) expect(insolvencyStep(c)).toBe(false);
    c.cash = 5;
    expect(insolvencyStep(c)).toBe(false);
    expect(c.insolventDays).toBe(0);
    c.cash = -1;
    let defaulted = false;
    for (let i = 0; i < COMPANY.failure.defaultDays; i++) defaulted = insolvencyStep(c);
    expect(defaulted).toBe(true);
  });

  it('a company that runs out of cash defaults through the day step, and its operations stop', () => {
    const h = harness();
    const c = found(h);
    // an overdraft too deep for the company's sales to repay within the window: the default follows after 21 gd
    c.cash = -1_000_000_000;
    const events = [];
    for (let d = 0; d <= 40; d++) {
      h.env.day = d;
      events.push(...companyTick(h.w, h.env, d));
    }
    const dead = events.find((e) => e.kind === 'bankrupt');
    expect(dead).toBeDefined();
    expect(c.bankrupt).not.toBeNull();
    const cash = c.cash;
    const later = companyTick(h.w, { ...h.env, day: 41 }, 41);
    expect(later.some((e) => e.kind === 'filed' || e.kind === 'signal' || e.kind === 'bankrupt')).toBe(false);
    expect(c.cash).toBe(cash);
  });
});

describe('the default waterfall and limited liability (spec 5.3)', () => {
  it('creditors are paid from the company only: with no guarantee, the founder keeps every dollar of personal money', () => {
    const h = harness();
    const c = found(h);
    c.cash = -50_000;
    c.ap = 20_000;
    c.ppe = 100_000;
    const founder0 = h.money.founder!;
    const id0 = identity(h);
    const r = bankrupt(h.w, c, h.env, 10);
    expect(h.money.founder).toBe(founder0);
    expect(h.w.personalDebt?.founder).toBeUndefined();
    expect(r.recovery).toBe(COMPANY.failure.recovery.tech);
    // realized 0.35 x 100k = 35k against 70k of claims: the overdraft and payables share it pro rata, the rest is written off
    expect(r.paid).toBeCloseTo(35_000, 6);
    expect(r.shortfall).toBeCloseTo(35_000, 6);
    expect(c.bankrupt).toMatchObject({ day: 10, recovery: 0.35 });
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('a guarantee is called up to its amount and above the court floor, and the rest is personal debt', () => {
    const h = harness();
    const c = found(h);
    c.cash = -50_000;
    c.ap = 20_000;
    c.ppe = 100_000;
    c.guarantee = { playerId: 'founder', amount: 20_000 };
    const founder0 = h.money.founder!;
    const id0 = identity(h);
    bankrupt(h.w, c, h.env, 10);
    expect(h.money.founder).toBe(founder0 - 20_000);
    expect(h.w.personalDebt?.founder).toBeUndefined();
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('a guarantee the founder cannot pay above the floor leaves the rest as personal debt', () => {
    const h = harness('g2', 5_000_000);
    const c = found(h);
    h.money.founder = 12_000;
    c.cash = -50_000;
    c.guarantee = { playerId: 'founder', amount: 20_000 };
    bankrupt(h.w, c, h.env, 10);
    expect(h.money.founder).toBe(COMPANY.failure.floor);
    expect(h.w.personalDebt?.founder).toBe(20_000 - (12_000 - COMPANY.failure.floor));
  });

  it('after the default the company keeps no working assets, so its book is closed', () => {
    const h = harness();
    const c = found(h);
    c.cash = -10;
    bankrupt(h.w, c, h.env, 3);
    expect(c.bankrupt?.day).toBe(3);
    expect(c.ar + c.inv + c.ppe).toBe(0);
  });
});

describe('clawbacks (CB-044 to CB-046, N5)', () => {
  it('reaches covered payments in the 63 gd before the default, newest first, up to the shortfall', () => {
    const h = harness();
    const c = found(h);
    const D = 100;
    c.cash = -100_000;
    recordPayout(c, pay({ day: 30, toPlayerId: 'founder', covered: 60_000 }));          // outside the lookback
    recordPayout(c, pay({ day: 70, toPlayerId: 'founder', covered: 0, kind: 'repayment', termsDay: 10 })); // covered 0: nothing to claw
    recordPayout(c, pay({ day: 80, toPlayerId: 'founder', covered: 40_000, kind: 'repayment', insider: true, termsDay: 0 }));
    recordPayout(c, pay({ day: 90, toPlayerId: 'rival', covered: 60_000 }));
    const founder0 = h.money.founder!;
    const rival0 = h.money.rival!;
    const id0 = identity(h);
    const r = bankrupt(h.w, c, h.env, D);
    expect(h.money.rival).toBe(rival0 - 60_000);
    expect(h.money.founder).toBe(founder0 - 40_000);
    expect(r.clawed).toBe(100_000);
    expect(c.cash).toBe(0);
    expect(r.shortfall).toBe(0);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('keeps ordinary repayments on terms signed 64 gd or more before the default (safe harbour, CB-045)', () => {
    const h = harness();
    const c = found(h);
    const D = 100;
    c.cash = -50_000;
    recordPayout(c, pay({ day: 95, toPlayerId: 'rival', covered: 50_000, kind: 'repayment', termsDay: D - 64 }));
    const rival0 = h.money.rival!;
    const r = bankrupt(h.w, c, h.env, D);
    expect(r.clawed).toBe(0);
    expect(h.money.rival).toBe(rival0);
    expect(r.shortfall).toBeCloseTo(50_000, 6);
  });

  it('a later term (63 gd) is not safe, and an early or flagged payment is never safe', () => {
    const h = harness();
    const c = found(h);
    const D = 100;
    c.cash = -30_000;
    recordPayout(c, pay({ day: 95, toPlayerId: 'rival', covered: 10_000, kind: 'repayment', termsDay: D - 63 }));
    recordPayout(c, pay({ day: 96, toPlayerId: 'rival', covered: 10_000, kind: 'repayment', termsDay: D - 200, flagged: true }));
    const r = bankrupt(h.w, c, h.env, D);
    expect(r.clawed).toBe(20_000);
  });

  it('a recipient keeps the court floor; the rest is a personal debt, never a third player', () => {
    const h = harness();
    const c = found(h);
    h.money.rival = 30_000;
    c.cash = -60_000;
    recordPayout(c, pay({ day: 95, toPlayerId: 'rival', covered: 50_000 }));
    bankrupt(h.w, c, h.env, 100);
    expect(h.money.rival).toBe(COMPANY.failure.floor);
    expect(h.w.personalDebt?.rival).toBe(50_000 - (30_000 - COMPANY.failure.floor));
    expect(h.w.personalDebt?.founder).toBeUndefined();
  });

  it('clawback uses the first recipient only, and only up to the target', () => {
    const h = harness();
    const c = found(h);
    recordPayout(c, pay({ day: 95, toPlayerId: 'rival', covered: 25_000 }));
    const got = clawback(h.w, c, h.env, 100, 10_000);
    expect(got).toBe(10_000);
    expect(h.money.rival).toBe(900_000 - 10_000);
    expect(h.money.founder).toBe(5_000_000 - 150_000);
  });

  it('the log keeps the lookback and a margin, and stays under 200 entries', () => {
    const h = harness();
    const c = found(h);
    for (let d = 0; d < 400; d++) recordPayout(c, pay({ day: d, toPlayerId: 'rival', covered: 1 }));
    expect(c.payouts!.length).toBeLessThanOrEqual(200);
    expect(c.payouts!.at(-1)!.day).toBe(399);
  });
});

describe('exploits on the default (N5)', () => {
  it('an insider cannot shelter a payout behind safe harbour: a founder salary is clawed up to the shortfall', () => {
    const h = harness();
    const c = found(h);
    // the founder took 150k out as a salary 5 gd before the default; the company is 20k short at default
    const founder0 = h.money.founder!;
    c.cash = -20_000;
    h.money.founder = founder0 + 150_000;
    recordPayout(c, pay({ day: 95, toPlayerId: 'founder', covered: 150_000, kind: 'salary', insider: true, termsDay: 0 }));
    const r = bankrupt(h.w, c, h.env, 100);
    // the clawback reaches the creditors' shortfall and no further (CB-046), and the shortfall is then fully repaid
    expect(r.clawed).toBe(20_000);
    expect(h.money.founder).toBe(founder0 + 150_000 - 20_000);
    expect(r.shortfall).toBe(0);
  });

  it('a guarantee cannot be dodged by moving cash out: the payment is clawed and the guarantee stays callable', () => {
    const h = harness();
    const c = found(h);
    c.cash = -40_000;
    c.guarantee = { playerId: 'founder', amount: 50_000 };
    h.money.founder = 5_000 + 40_000;
    recordPayout(c, pay({ day: 97, toPlayerId: 'founder', covered: 40_000, insider: true, kind: 'related' }));
    bankrupt(h.w, c, h.env, 100);
    // the clawback collected the 40k, leaving the founder at the floor: the guarantee has nothing above the floor to call
    expect(h.money.founder).toBe(COMPANY.failure.floor);
    expect(c.bankrupt?.shortfall).toBe(0);
  });
});

describe('the surveillance points (spec 6.2)', () => {
  it('points accumulate per player with the company they concern', () => {
    const h = harness();
    const c = found(h);
    addSurveillance(h.w, 'founder', c.id, 30, 'related supply priced out of band');
    addSurveillance(h.w, 'founder', c.id, 15, 'window');
    expect(h.w.insider?.founder?.points).toBe(45);
    expect(h.w.insider?.founder?.companyId).toBe(c.id);
    expect(h.w.insider?.founder?.reasons).toHaveLength(2);
  });
});

/** A bank loan on the company's books (the bank lent it earlier; the test sets the book, not the money). */
function bankLoan(over: Partial<Debt> & { principal: number }): Debt {
  return { id: 'co1:d0', ratePerDay: COMPANY.debt.ratePerDay, drawnDay: 0, guarantor: null, guaranteedAmount: 0, ...over };
}

describe('bank loans and guarantees in the default (B1 debt, B2 waterfall)', () => {
  it('the bank is a creditor: it is paid pro rata from the estate, and the unpaid principal is written off', () => {
    const h = harness();
    const c = found(h);
    const bank = h.w.investors[BANK_POOL]!;
    c.debts.push(bankLoan({ principal: 1_000_000 }));
    c.cash = -100_000;
    c.ppe = 1_000_000; // realized at the tech recovery rate: 0.35 x 1M = 350k into the estate
    const bank0 = bank.cash;
    const founder0 = h.money.founder!;
    const id0 = identity(h);
    const r = bankrupt(h.w, c, h.env, 10);
    // claims 1.1M (the overdraft 100k and the bank 1M) against 350k: each is paid 350k / 1.1M of its claim
    expect(bank.cash - bank0).toBeCloseTo(1_000_000 * (350_000 / 1_100_000), 4);
    expect(r.shortfall).toBeCloseTo(750_000, 4);
    expect(c.debts).toEqual([]);
    expect(h.money.founder).toBe(founder0);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('a guaranteed bank loan is called on default, for what the bank is still owed after the pro-rata payment', () => {
    const h = harness();
    const c = found(h);
    c.cash = -100_000;
    c.ppe = 1_000_000;
    c.debts.push(bankLoan({ principal: 1_000_000, guarantor: 'founder', guaranteedAmount: 1_000_000 }));
    const founder0 = h.money.founder!;
    const id0 = identity(h);
    bankrupt(h.w, c, h.env, 10);
    // the first payment leaves 1M x (1 - 350k / 1.1M) owed to the bank; the founder's guarantee covers that residual
    expect(founder0 - h.money.founder!).toBeCloseTo(1_000_000 * (1 - 350_000 / 1_100_000), 4);
    expect(h.w.personalDebt?.founder).toBeUndefined();
    expect(c.debts).toEqual([]);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('a guaranteed bank loan the founder cannot pay above the floor leaves the rest as personal debt', () => {
    const h = harness('bank-g2', 5_000_000);
    const c = found(h);
    h.money.founder = 300_000;
    c.cash = -100_000;
    c.debts.push(bankLoan({ principal: 1_000_000, guarantor: 'founder', guaranteedAmount: 1_000_000 }));
    bankrupt(h.w, c, h.env, 10);
    expect(h.money.founder).toBe(COMPANY.failure.floor);
    expect(h.w.personalDebt?.founder).toBeCloseTo(1_000_000 - (300_000 - COMPANY.failure.floor), 4);
  });
});
