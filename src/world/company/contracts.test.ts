import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { companyTick, emptyCompanyWorld, foundCompany, privateValue, type CompanyEnv } from './company';
import { bankrupt, clawback, recordPayout } from './failure';
import { post } from './books';
import { contractDay, insiderNow, lendToCompany, lendToPlayer, loanBook, prepayLoan, repayLoanOut, signContractor } from './contracts';
import { openSupply, supplyDay } from './supply';
import { linkOwner } from './owners';
import type { Company, CompanyWorld, Payout } from './types';

interface Harness { w: CompanyWorld; env: CompanyEnv; money: Record<string, number> }

/** Players with money, and a seller sell-back hook (a T1 business sale: the price goes to the player's cash). */
function harness(seed = 'contracts', sellT1Price = 0): Harness {
  const money: Record<string, number> = { founder: 5_000_000, alt: 200_000, stranger: 300_000, rival: 900_000 };
  const env: CompanyEnv = {
    seed, day: 0, regime: 'expansion', oilLog: 0, rankOf: () => 'R3',
    money: {
      cash: (pid) => money[pid] ?? 0,
      take: (pid, amount) => { money[pid] = (money[pid] ?? 0) - amount; },
      give: (pid, amount) => { money[pid] = (money[pid] ?? 0) + amount; },
      sellT1: sellT1Price > 0 ? (pid) => { money[pid] = (money[pid] ?? 0) + sellT1Price; return sellT1Price; } : undefined,
    },
  };
  return { w: emptyCompanyWorld(seed), env, money };
}

function found(h: Harness, pid = 'founder', name = pid): Company {
  const r = foundCompany(h.w, h.env, pid, { name, sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(JSON.stringify(r.reject));
  return h.w.companies[r.value.id]!;
}

/** The money the world holds, less sinks plus faucets: exact to the cent for every contract flow (spec 5.3, X3). */
function identity(h: Harness): number {
  let t = Object.values(h.money).reduce((s, x) => s + x, 0);
  for (const x of Object.values(h.w.companies)) t += x.cash + (x.estate ?? 0);
  for (const p of Object.values(h.w.investors)) t += p.cash;
  return t + h.w.flows.sink - h.w.flows.faucet;
}

/** Runs the contract flows of a company for days from..to (a company has no other flow in these tests). */
function payDays(h: Harness, c: Company, from: number, to: number): void {
  for (let d = from; d <= to; d++) contractDay(h.w, c, h.env, d);
}

function covered(over: Partial<Omit<Payout, 'id'>> & { day: number; toPlayerId: string; covered: number }): Omit<Payout, 'id'> {
  return { amount: over.covered, kind: 'contractor', termsDay: 0, flagged: false, insider: false, ...over };
}

describe('contractor fees (spec 5.3, 6.3)', () => {
  it('the day rate must sit in the band of the market rate, and a contract with an owner-set player outside it is flagged', () => {
    const h = harness();
    const c = found(h);
    const K = COMPANY.contract.marketPerDay;
    expect(signContractor(h.w, c, h.env, 'founder', { payeeId: 'stranger', perDay: K * 1.5 })).toEqual({
      ok: false, reject: { code: 'contractPriceOutOfBand', min: K * 0.9, max: K * 1.1 },
    });
    expect(h.w.insider).toBeUndefined();
    linkOwner(h.w, 'alt', 'founder');
    expect(signContractor(h.w, c, h.env, 'founder', { payeeId: 'alt', perDay: K * 1.5 }).ok).toBe(false);
    expect(h.w.insider?.founder?.points).toBe(COMPANY.failure.insiderPoints.relatedOutOfBand);
    expect(signContractor(h.w, c, h.env, 'founder', { payeeId: 'stranger', perDay: K })).toMatchObject({ ok: true });
    expect(signContractor(h.w, c, h.env, 'alt', { payeeId: 'stranger', perDay: K })).toEqual({ ok: false, reject: { code: 'notFounder' } });
  });

  it('pays the day rate every game day of the term as a cost, with the money identity exact, then closes', () => {
    const h = harness();
    const c = found(h);
    const K = COMPANY.contract.marketPerDay;
    const r = signContractor(h.w, c, h.env, 'founder', { payeeId: 'stranger', perDay: K });
    expect(r.ok).toBe(true);
    const id0 = identity(h);
    const opex0 = c.qtd.opex;
    const s0 = h.money.stranger!;
    payDays(h, c, 1, 10);
    expect(h.money.stranger! - s0).toBeCloseTo(10 * K, 6);
    expect(c.qtd.opex - opex0).toBeCloseTo(10 * K, 6);
    expect(c.payouts!.every((p) => p.kind === 'contractor' && p.covered === K)).toBe(true);
    expect(identity(h)).toBeCloseTo(id0, 6);
    payDays(h, c, 11, COMPANY.contract.termDays + 2);
    expect(c.contracts ?? []).toHaveLength(0);
  });

  it('a company without the cash for the day rate skips that day; the fee is never a default by itself', () => {
    const h = harness();
    const c = found(h);
    const K = COMPANY.contract.marketPerDay;
    signContractor(h.w, c, h.env, 'founder', { payeeId: 'stranger', perDay: K });
    c.cash = K / 2;
    const s0 = h.money.stranger!;
    contractDay(h.w, c, h.env, 1);
    expect(h.money.stranger).toBe(s0);
  });
});

describe('loans from players to the company (spec 5.3, net debt)', () => {
  it('a lend moves cash in as a transfer and is debt; the minimum and the lender cash are checked', () => {
    const h = harness();
    const c = found(h);
    expect(lendToCompany(h.w, c, h.env, 'alt', COMPANY.contract.minLoan - 1)).toEqual({ ok: false, reject: { code: 'loanTooSmall', min: COMPANY.contract.minLoan } });
    expect(lendToCompany(h.w, c, h.env, 'alt', 10_000_000)).toMatchObject({ ok: false, reject: { code: 'insufficientFunds' } });
    const id0 = identity(h);
    const cash0 = c.cash;
    const r = lendToCompany(h.w, c, h.env, 'alt', 126_000);
    expect(r.ok).toBe(true);
    expect(c.cash - cash0).toBe(126_000);
    expect(loanBook(c).debt).toBe(126_000);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('N1 exploit: a loan from an alt does not inflate the company value (the cash comes with a matching debt)', () => {
    const h = harness();
    const c = found(h);
    h.money.alt = 1_000_000;
    c.cash = 400_000;
    const v0 = privateValue(c, 0);
    expect(lendToCompany(h.w, c, h.env, 'alt', 300_000).ok).toBe(true);
    expect(privateValue(c, 0)).toBeCloseTo(v0, 6);
  });

  it('N1 exploit: a loan out to an alt does not inflate the value either (the receivable offsets the cash)', () => {
    const h = harness();
    const c = found(h);
    c.cash = 400_000;
    const v0 = privateValue(c, 0);
    expect(lendToPlayer(h.w, c, h.env, 'founder', { payeeId: 'alt', amount: 300_000 }).ok).toBe(true);
    expect(privateValue(c, 0)).toBeCloseTo(v0, 6);
  });

  it('scheduled instalments repay the loan, and a loan signed 64 gd before default is safe harbour for an outside lender', () => {
    const h = harness();
    const c = found(h);
    lendToCompany(h.w, c, h.env, 'stranger', 126_000);
    const perDay = 1_000;
    const id0 = identity(h);
    payDays(h, c, 1, 70);
    expect(loanBook(c).debt).toBeCloseTo(126_000 - 70 * perDay, 6);
    expect(c.payouts!.every((p) => p.kind === 'repayment' && !p.flagged && p.covered === perDay)).toBe(true);
    expect(identity(h)).toBeCloseTo(id0, 6);
    // default on day 100: the instalments are on terms signed on day 0 (<= 100 - 64), so none is clawed
    post(h.w, c, 99, 'test sink', -(c.cash + 5_000));
    c.ppe = 200_000;
    const r = bankrupt(h.w, c, h.env, 100);
    expect(r.clawed).toBe(0);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('a prepayment is an extra payment: flagged, so the clawback always reaches it, even on old terms', () => {
    const h = harness();
    const c = found(h);
    lendToCompany(h.w, c, h.env, 'stranger', 126_000);
    const id = c.contracts![0]!.id;
    expect(prepayLoan(h.w, c, h.env, 'founder', { contractId: id, amount: 200_000 })).toEqual({ ok: false, reject: { code: 'loanBalance', balance: 126_000 } });
    expect(prepayLoan(h.w, c, h.env, 'founder', { contractId: id, amount: 10_000 })).toEqual({ ok: true, value: { balance: 116_000 } });
    expect(c.payouts!.at(-1)).toMatchObject({ kind: 'repayment', flagged: true, covered: 10_000 });
    expect(prepayLoan(h.w, c, h.env, 'stranger', { contractId: id, amount: 1 })).toEqual({ ok: false, reject: { code: 'notFounder' } });
  });
});

describe('loans from the company to a player (spec 5.3, covered at the outstanding balance)', () => {
  it('the owner lends out of the company cash; the player repays; only the party may repay; the balance is bounded', () => {
    const h = harness();
    const c = found(h);
    c.cash = 200_000;
    expect(lendToPlayer(h.w, c, h.env, 'alt', { payeeId: 'alt', amount: 1_000 })).toEqual({ ok: false, reject: { code: 'notFounder' } });
    expect(lendToPlayer(h.w, c, h.env, 'founder', { payeeId: 'alt', amount: 500_000 })).toMatchObject({ ok: false, reject: { code: 'insufficientFunds' } });
    const id0 = identity(h);
    const r = lendToPlayer(h.w, c, h.env, 'founder', { payeeId: 'alt', amount: 50_000 });
    expect(r.ok).toBe(true);
    expect(loanBook(c).loansOut).toBe(50_000);
    expect(identity(h)).toBeCloseTo(id0, 6);
    const id = r.ok ? r.value.id : '';
    expect(repayLoanOut(h.w, c, h.env, 'founder', { contractId: id, amount: 1_000 })).toEqual({ ok: false, reject: { code: 'notParty' } });
    expect(repayLoanOut(h.w, c, h.env, 'alt', { contractId: id, amount: 60_000 })).toEqual({ ok: false, reject: { code: 'loanBalance', balance: 50_000 } });
    expect(repayLoanOut(h.w, c, h.env, 'alt', { contractId: id, amount: 20_000 })).toEqual({ ok: true, value: { balance: 30_000 } });
    expect(loanBook(c).loansOut).toBe(30_000);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });

  it('at a default the outstanding balance of a loan signed in the lookback is clawed back; an older one is not', () => {
    const h = harness();
    const c = found(h);
    c.cash = 200_000;
    lendToPlayer(h.w, c, h.env, 'founder', { payeeId: 'alt', amount: 40_000 });
    h.env.day = 10;
    lendToPlayer(h.w, c, h.env, 'founder', { payeeId: 'stranger', amount: 30_000 });
    c.cash = -20_000;
    const alt0 = h.money.alt!;
    const str0 = h.money.stranger!;
    const id0 = identity(h);
    // the company's default on day 100: the loan of day 0 is 100 gd old (outside), the loan of day 10 is 90 gd (outside too)
    bankrupt(h.w, c, h.env, 100);
    expect(h.money.alt).toBe(alt0);
    expect(h.money.stranger).toBe(str0);
    expect(identity(h)).toBeCloseTo(id0, 6);
    // a loan made 10 gd before the default is inside the lookback: the borrower owes it back
    const h2 = harness('lent-recent');
    const c2 = found(h2);
    c2.cash = 200_000;
    h2.env.day = 90;
    lendToPlayer(h2.w, c2, h2.env, 'founder', { payeeId: 'alt', amount: 40_000 });
    c2.cash = -20_000;
    const alt1 = h2.money.alt!;
    const r = bankrupt(h2.w, c2, h2.env, 100);
    expect(r.clawed).toBe(20_000);
    expect(h2.money.alt).toBe(alt1 - 20_000);
  });
});

describe('insider status at signing or on the payment day (spec 5.3, G9)', () => {
  it('a payee who was an insider at signing is covered for every payment, even when it has left the owner set since', () => {
    const h = harness();
    const c = found(h);
    linkOwner(h.w, 'alt', 'founder');
    const K = COMPANY.contract.marketPerDay;
    signContractor(h.w, c, h.env, 'founder', { payeeId: 'alt', perDay: K });
    delete h.w.linked!.alt;
    payDays(h, c, 1, 5);
    expect(c.payouts!.every((p) => p.insider === true)).toBe(true);
    c.cash = -1_000;
    // a default on day 10: the five payments are inside the lookback, and insider payments are never safe harbour
    const r = bankrupt(h.w, c, h.env, 10);
    expect(r.clawed).toBe(1_000);
  });

  it('a payee that became an insider on the payment day is covered even on 64-gd-old terms', () => {
    const h = harness();
    const c = found(h);
    const K = COMPANY.contract.marketPerDay;
    signContractor(h.w, c, h.env, 'founder', { payeeId: 'stranger', perDay: K });
    payDays(h, c, 1, 1);
    expect(c.payouts![0]!.insider).toBe(false);
    // day 2 onward: the stranger is linked to the founder (an insider on the payment's day)
    linkOwner(h.w, 'stranger', 'founder');
    payDays(h, c, 2, 3);
    expect(c.payouts!.at(-1)!.insider).toBe(true);
    // the default on day 64: the day-1 payment is an outside payee's on 64-gd-old terms (safe), days 2 and 3 are insider payments
    expect(clawback(h.w, c, h.env, 64, 1e9)).toBe(2 * K);
  });

  it('a non-insider payee on old terms is in safe harbour (the control case)', () => {
    const h = harness();
    const c = found(h);
    const K = COMPANY.contract.marketPerDay;
    signContractor(h.w, c, h.env, 'founder', { payeeId: 'stranger', perDay: K });
    payDays(h, c, 1, 3);
    // on day 64 the three payments are in the lookback, and the terms (day 0) are 64 gd old: safe harbour
    expect(clawback(h.w, c, h.env, 64, 1e9)).toBe(0);
  });

  it('the insider predicate is the owner set, the CEO or a 10% holder', () => {
    const h = harness();
    const c = found(h);
    expect(insiderNow(h.w, c, 'founder', h.env)).toBe(true);
    expect(insiderNow(h.w, c, 'stranger', h.env)).toBe(false);
    h.env.stakeOf = (pid) => (pid === 'stranger' ? 0.10 : 0);
    expect(insiderNow(h.w, c, 'stranger', h.env)).toBe(true);
    c.ceo = { kind: 'player', playerId: 'alt' };
    expect(insiderNow(h.w, c, 'alt', h.env)).toBe(true);
  });
});

describe('what a recipient pays back (spec 5.3)', () => {
  it('a short recipient sells one T1 business before the rest becomes personal debt', () => {
    const h = harness('t1-sale', 70_000);
    const c = found(h);
    h.money.stranger = 10_000;
    recordPayout(c, covered({ day: 95, toPlayerId: 'stranger', covered: 80_000, kind: 'related' }));
    const id0 = identity(h);
    const got = clawback(h.w, c, h.env, 100, 1e9);
    expect(got).toBe(80_000);
    // 10k cash plus the 70k sale: the court floor (5k) stays, 75k is collected, and 5k is personal debt
    expect(h.money.stranger).toBe(COMPANY.failure.floor);
    expect(h.w.personalDebt?.stranger).toBe(5_000);
    expect(c.estate).toBe(75_000);
    // the sale is money the economy creates in the players' hands (the bridge's sellBusiness): the identity is up by it
    expect(identity(h)).toBeCloseTo(id0 + 70_000, 6);
  });

  it('a supply seller pays back from its own cash, and its owner carries the rest as a personal debt', () => {
    const h = harness();
    const buyer = found(h, 'founder');
    const seller = found(h, 'rival');
    linkOwner(h.w, 'rival', 'founder');
    expect(openSupply(h.w, buyer, h.env, 'founder', { sellerId: seller.id, unitsPerDay: 10, price: 50 }).ok).toBe(true);
    supplyDay(h.w, buyer, h.env, 1);
    supplyDay(h.w, buyer, h.env, 2);
    expect(seller.payouts ?? []).toHaveLength(0);
    // the seller has spent most of its cash by the buyer's default: it pays back what it has, the owner the rest
    post(h.w, seller, 2, 'test sink', 300 - seller.cash);
    post(h.w, buyer, 2, 'test sink', -2_000 - buyer.cash);
    const id0 = identity(h);
    const r = bankrupt(h.w, buyer, h.env, 3);
    expect(r.clawed).toBe(1_000);
    expect(seller.cash).toBe(0);
    expect(h.w.personalDebt?.rival).toBeCloseTo(1_000 - 300, 6);
    expect(identity(h)).toBeCloseTo(id0, 6);
  });
});

describe('exploit N5: a bot that pays itself out and then defaults ends no richer', () => {
  it('a founder pays an alt contractor and loans out to it, then the company defaults: the payments come back, and the total is no higher', () => {
    /** the same sink in both runs, so both companies default; only the payouts differ */
    const run = (paidOut: boolean): { total: number; drift: number } => {
      const h = harness('n5-extract');
      const c = found(h);
      linkOwner(h.w, 'alt', 'founder');
      const K = COMPANY.contract.marketPerDay;
      c.cash = 50_000;
      const id0 = identity(h);
      if (paidOut) {
        expect(lendToPlayer(h.w, c, h.env, 'founder', { payeeId: 'alt', amount: 30_000 }).ok).toBe(true);
        expect(signContractor(h.w, c, h.env, 'founder', { payeeId: 'alt', perDay: K }).ok).toBe(true);
        payDays(h, c, 1, 30);
      }
      // a cost the company cannot cover: the cash goes negative and stays there for the default
      post(h.w, c, 40, 'test sink', -60_000);
      bankrupt(h.w, c, h.env, 60);
      return { total: h.money.founder! + h.money.alt!, drift: identity(h) - id0 };
    };
    const with_ = run(true);
    const without = run(false);
    expect(with_.drift).toBeCloseTo(0, 6);
    expect(without.drift).toBeCloseTo(0, 6);
    expect(with_.total).toBeLessThanOrEqual(without.total + 1e-6);
  });
});

describe('determinism: contracts, loans and the supply flows survive a save mid-run (B2)', () => {
  it('a JSON round trip at day 30 continues to the same world at day 80 as the unbroken run', () => {
    const tick = (h: Harness, from: number, to: number): void => {
      for (let d = from; d <= to; d++) {
        h.env.day = d;
        companyTick(h.w, h.env, d);
      }
    };
    const h1 = harness('det-contracts');
    const buyer = found(h1, 'founder');
    const rival = found(h1, 'rival');
    linkOwner(h1.w, 'rival', 'founder');
    expect(signContractor(h1.w, buyer, h1.env, 'founder', { payeeId: 'stranger', perDay: COMPANY.contract.marketPerDay }).ok).toBe(true);
    expect(lendToCompany(h1.w, buyer, h1.env, 'alt', 126_000).ok).toBe(true);
    expect(lendToPlayer(h1.w, buyer, h1.env, 'founder', { payeeId: 'alt', amount: 20_000 }).ok).toBe(true);
    expect(openSupply(h1.w, buyer, h1.env, 'founder', { sellerId: rival.id, unitsPerDay: 5, price: 52 }).ok).toBe(true);
    tick(h1, 0, 30);
    const snap = JSON.parse(JSON.stringify(h1.w)) as CompanyWorld;
    const money = { ...h1.money };
    tick(h1, 31, 80);
    const env2: CompanyEnv = {
      ...h1.env,
      money: {
        cash: (pid) => money[pid] ?? 0,
        take: (pid, a) => { money[pid] = (money[pid] ?? 0) - a; },
        give: (pid, a) => { money[pid] = (money[pid] ?? 0) + a; },
      },
    };
    const h2: Harness = { w: snap, env: env2, money };
    tick(h2, 31, 80);
    expect(JSON.stringify(h2.w)).toBe(JSON.stringify(h1.w));
    expect(h2.money).toEqual(h1.money);
    expect(identity(h2)).toBeCloseTo(identity(h1), 6);
  });
});
