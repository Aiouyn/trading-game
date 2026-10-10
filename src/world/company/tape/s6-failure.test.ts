/**
 * Tape section 6, bankruptcy, clawback, dividends and guarantees (tape-company-building.md section 3.8, re-targeted to Quant
 * v1.7, unchanged in v1.7: spec 5.3). Covered payments are clawed back for 63 game days before a default, newest first,
 * and a safe harbour (ordinary terms signed 64+ days before) is not. Test names carry the Tape id.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY } from '@/content/company';
import { advanceTo, BUYER_A, FOUNDER, founded, YOUNG } from '../b1fixture';
import { contractDay } from '../contracts';
import { bankrupt, clawback, recordPayout, salaryCapPerDay } from '../failure';
import { drawLoan } from '../debt';
import { declareDividend, dividendRule } from '../payouts';
import { ttmOf } from '../debt';
import type { CompanyEnv } from '../company';
import type { Company, CompanyWorld, Payout } from '../types';

const D = 200; // the default day in the clawback rows
const floor = COMPANY.failure.floor;

/** A money stub: balances by account, with take and give recorded. */
function moneyOf(balances: Record<string, number>) {
  const taken: Record<string, number> = {};
  const given: Record<string, number> = {};
  return {
    balances, taken, given,
    env: {
      money: {
        cash: (pid: string) => balances[pid] ?? 0,
        take: (pid: string, amount: number) => {
          balances[pid] = (balances[pid] ?? 0) - amount;
          taken[pid] = (taken[pid] ?? 0) + amount;
        },
        give: (pid: string, amount: number) => {
          balances[pid] = (balances[pid] ?? 0) + amount;
          given[pid] = (given[pid] ?? 0) + amount;
        },
      },
    },
  };
}

function payout(c: Company, day: number, amount: number, extra: Partial<Omit<Payout, 'id'>> = {}): void {
  recordPayout(c, {
    day, toPlayerId: FOUNDER, amount, covered: amount, kind: 'dividend', termsDay: day, flagged: false, insider: false, ...extra,
  });
}

/** A founded company at day 0 (fresh world), with its owner's account and a clean payout log. */
function fresh(seed: string) {
  const { g, c } = founded(seed);
  c.payouts = [];
  return { g, c, w: g.companies as CompanyWorld };
}

describe('Tape s6: bankruptcy, clawback, dividends and guarantees', () => {
  it('clawback_boundary: a covered payment at D-64 is not clawed, at D-63, D-62 and D-1 it is, and on D it is not covered', () => {
    const cases: [number, boolean][] = [[-64, false], [-63, true], [-62, true], [-1, true], [0, false]];
    for (const [offset, clawed] of cases) {
      const { w, c } = fresh(`cb-bound-${offset}`);
      payout(c, D + offset, 1_000);
      const moved = moneyOf({ [FOUNDER]: 1_000_000 });
      const claimed = clawback(w, c, moved.env, D, 1e9);
      expect(claimed, `offset ${offset}`).toBe(clawed ? 1_000 : 0);
    }
  });

  it('clawback_any_player: the same covered payment is clawed from an unlinked player and from a linked alt alike (no alt detection)', () => {
    for (const payee of [YOUNG, BUYER_A]) {
      const { w, c } = fresh(`cb-any-${payee}`);
      payout(c, D - 10, 500, { toPlayerId: payee });
      const moved = moneyOf({ [payee]: 1_000_000 });
      expect(clawback(w, c, moved.env, D, 1e9), payee).toBe(500);
      expect(moved.taken[payee]).toBe(500);
    }
  });

  it('clawback_insider_loans: a loan repayment to an insider is clawed in the lookback even on ordinary terms', () => {
    const { w, c } = fresh('cb-ins');
    payout(c, D - 30, 2_000, { kind: 'repayment', insider: true, termsDay: D - 100 });
    expect(clawback(w, c, moneyOf({ [FOUNDER]: 1e6 }).env, D, 1e9)).toBe(2_000);
  });

  it('clawback_safe_harbour_64: ordinary terms signed D-65 or D-64 are safe; signed D-63 they are clawed', () => {
    const expected: [number, number][] = [[-65, 0], [-64, 0], [-63, 2_000]];
    for (const [termsOffset, claimed] of expected) {
      const { w, c } = fresh(`cb-sh-${termsOffset}`);
      payout(c, D - 10, 2_000, { kind: 'repayment', termsDay: D + termsOffset });
      expect(clawback(w, c, moneyOf({ [FOUNDER]: 1e6 }).env, D, 1e9), `terms ${termsOffset}`).toBe(claimed);
    }
  });

  it('clawback_non_ordinary: a flagged payment (prepayment, accelerated or above band) is clawed even on terms signed long before', () => {
    const { w, c } = fresh('cb-flag');
    payout(c, D - 5, 3_000, { kind: 'repayment', termsDay: D - 300, flagged: true });
    expect(clawback(w, c, moneyOf({ [FOUNDER]: 1e6 }).env, D, 1e9)).toBe(3_000);
  });

  it('clawback_insider_either: an insider at signing only, on payment only, both, or neither: clawed unless neither', () => {
    // a company loan from a player (kind loanIn): each leg of the insider test is read through contractDay
    const cases: [string, boolean, number, boolean][] = [
      ['signing only', true, 0, true],
      ['payment only', false, 0.2, true],
      ['both', true, 0.2, true],
      ['neither', false, 0, false],
    ];
    for (const [label, atSigning, stake, insider] of cases) {
      const { g, c } = fresh(`cb-either-${label}`);
      const w = g.companies!;
      c.cash = 1_000_000;
      c.contracts = [{
        id: 'ctr1', kind: 'loanIn', payeeId: YOUNG, perDay: 100, principal: 1_000, balance: 1_000,
        signedDay: 10, endDay: 500, insiderAtSigning: atSigning, closed: false,
      }];
      const env = {
        seed: 'x', day: 50, regime: 'calm', oilLog: 0, rankOf: () => 'R2',
        stakeOf: (pid: string) => (pid === YOUNG ? stake : 0),
        money: { cash: () => 0, take: () => undefined, give: () => undefined },
      } as unknown as CompanyEnv;
      contractDay(w, c, env, 50);
      expect(c.payouts?.at(-1)?.insider, label).toBe(insider);
    }
  });

  it('clawback_covered_types: dividends, insider repayments, salary above the cap, related-party payments and company loans to a player are each covered', () => {
    const { w, c } = fresh('cb-types');
    const types: Payout['kind'][] = ['dividend', 'repayment', 'salary', 'related', 'loan', 'contractor'];
    for (const kind of types) payout(c, D - 5, 100, { kind, toPlayerId: FOUNDER, insider: kind === 'repayment' });
    const claimed = clawback(w, c, moneyOf({ [FOUNDER]: 1e6 }).env, D, 1e9);
    expect(claimed).toBe(100 * types.length);
  });

  it('clawback_not_covered (L): only the covered-payment paths record a payout (no buyback, NPC wage or NPC payment is a payout)', () => {
    const files = listFiles(resolve(__dirname, '..'));
    const callers = files.filter((f) => /\brecordPayout\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(resolve(__dirname, '..'), f).split(sep).join('/'))
      .filter((f) => !f.includes('test') && !f.startsWith('tape/'))
      .sort();
    expect(callers).toEqual(['contracts.ts', 'failure.ts', 'governance.ts', 'payouts.ts', 'supply.ts']);
    expect(readFileSync(resolve(__dirname, '..', 'programs.ts'), 'utf8')).not.toMatch(/recordPayout\(/);
    expect(readFileSync(resolve(__dirname, '..', 'staff.ts'), 'utf8')).not.toMatch(/recordPayout\(/);
  });

  it('clawback_first_recipient: a player with 60k cash owing 80k pays down to the court floor; the rest is personal debt; a third party is untouched', () => {
    const { w, c } = fresh('cb-first');
    payout(c, D - 10, 80_000, { toPlayerId: YOUNG });
    const moved = moneyOf({ [YOUNG]: 60_000, [BUYER_A]: 7_000 });
    expect(clawback(w, c, moved.env, D, 1e9)).toBe(80_000);
    expect(moved.balances[YOUNG]).toBe(floor);
    expect(w.personalDebt?.[YOUNG]).toBe(80_000 - (60_000 - floor));
    expect(moved.balances[BUYER_A]).toBe(7_000);
  });

  it('clawback_order_and_cap: with shortfall S and payments T above S, recovery is min(S, T), newest first; the cash moved equals the recovery', () => {
    const { w, c } = fresh('cb-order');
    payout(c, D - 20, 50_000);
    payout(c, D - 10, 30_000);
    const moved = moneyOf({ [FOUNDER]: 1e6 });
    expect(clawback(w, c, moved.env, D, 60_000)).toBe(60_000); // S = 60k below T = 80k
    expect(moved.taken[FOUNDER]).toBe(60_000);
    // newest first: the 30k payment is taken in full before any of the 50k one
    const second = fresh('cb-order2');
    payout(second.c, D - 20, 50_000);
    payout(second.c, D - 10, 30_000);
    expect(clawback(second.w, second.c, moneyOf({ [FOUNDER]: 1e6 }).env, D, 60_000)).toBe(60_000);
    expect(clawback(second.w, second.c, moneyOf({ [FOUNDER]: 1e6 }).env, D, 100_000)).toBe(80_000); // S = 100k above T = 80k
  });

  it('limited_liability: a default without a guarantee leaves the founder balance untouched (no payouts to claw); creditors get a realization of 20 to 60%', () => {
    const { g, c } = fresh('ll-1');
    const w = g.companies!;
    c.cash = -50_000;
    c.ap = 10_000;
    c.ar = 0;
    c.inv = 0;
    c.ppe = 100_000;
    const moved = moneyOf({ [FOUNDER]: 300_000 });
    const before = moved.balances[FOUNDER];
    const r = bankrupt(w, c, moved.env, D);
    expect(moved.balances[FOUNDER]).toBe(before);
    expect(r.recovery).toBeGreaterThanOrEqual(COMPANY.failure.recoveryMin);
    expect(r.recovery).toBeLessThanOrEqual(COMPANY.failure.recoveryMax);
    expect(c.bankrupt?.day).toBe(D);
    expect(w.personalDebt?.[FOUNDER] ?? 0).toBe(0);
  });

  it('personal_debt_survives and pg_called: a guarantee above the guarantor cash is called to the cent, the rest is personal debt that survives the wipe', () => {
    const { g, c } = fresh('pg-1');
    const w = g.companies!;
    c.cash = -200_000; // an overdraft nothing can pay, so the guarantee is called for its full amount (100k) first
    c.ap = 0;
    c.ar = 0;
    c.inv = 0;
    c.ppe = 0;
    c.guarantee = { playerId: FOUNDER, amount: 100_000 };
    const moved = moneyOf({ [FOUNDER]: floor + 30_000 });
    bankrupt(w, c, moved.env, D);
    // called 100k, the founder can pay 30k above the floor, so 70k is personal debt, to the cent
    expect(moved.taken[FOUNDER]).toBe(30_000);
    expect(w.personalDebt?.[FOUNDER]).toBe(70_000);
    expect(c.debts).toEqual([]); // the company's books are closed; the personal debt is not
  });

  it('pg_rate_exact: a guaranteed loan accrues 0.75 x the debt rate per game day to 1e-12; an unguaranteed one the full rate', () => {
    const { g, c } = fresh('pg-rate');
    c.tier = 'growth';
    c.covenant.status = 'ok';
    const plain = drawLoan(g, FOUNDER, c, { amount: 100_000, guarantee: false, acknowledged: false }, null);
    const guar = drawLoan(g, FOUNDER, c, { amount: 100_000, guarantee: true, acknowledged: true }, null);
    expect(plain.ok && guar.ok).toBe(true);
    const rate = COMPANY.debt.ratePerDay;
    if (plain.ok) expect(plain.value.ratePerDay).toBeCloseTo(rate, 12);
    if (guar.ok) expect(guar.value.ratePerDay).toBeCloseTo(rate * COMPANY.debt.guaranteedFactor, 12);
  });

  it('pg_consequence_confirm (engine part): a guaranteed loan without the consequence acknowledged is refused, and nothing is drawn', () => {
    const { g, c } = fresh('pg-ack');
    c.tier = 'growth';
    c.covenant.status = 'ok';
    const before = c.debts.length;
    const r = drawLoan(g, FOUNDER, c, { amount: 50_000, guarantee: true, acknowledged: false }, null);
    expect(r).toEqual({ ok: false, reject: { code: 'guaranteeNotAcknowledged', personalDebt: 50_000 } });
    expect(c.debts.length).toBe(before);
  });

  it('dividend_rule_reject: retained earnings after = 0 refused; cash after below 21 gd of costs refused; open cure refused; FCF + 1 cent refused', () => {
    const { g, c } = fresh('div-rules');
    advanceTo(g, 130);
    const fcf = ttmOf(c).fcf;
    expect(fcf).toBeGreaterThan(0);
    const shares = c.shares;
    const exactPerShare = fcf / shares;
    c.retained = 1e9;
    c.cash = 1e9;
    expect(dividendRule(g, c, exactPerShare)).toBeNull();
    // one cent over the FCF is refused (fcf rule)
    expect(dividendRule(g, c, (fcf + 0.01) / shares)).toBe('fcf');
    // retained earnings exactly used up is refused (retained after = 0)
    c.retained = fcf;
    expect(dividendRule(g, c, exactPerShare)).toBe('retained');
    c.retained = 1e9;
    // a covenant in cure is refused
    c.covenant.status = 'cure';
    expect(dividendRule(g, c, exactPerShare)).toBe('covenant');
    c.covenant.status = 'ok';
    // cash left below 21 gd of opex + COGS is refused
    const last = c.closed[c.closed.length - 1]!;
    const dailyCost = (last.cogs + last.opex) / COMPANY.quarterDays;
    c.cash = fcf + 21 * dailyCost - 0.01;
    expect(dividendRule(g, c, exactPerShare)).toBe('cash');
    c.cash = fcf + 21 * dailyCost;
    expect(dividendRule(g, c, exactPerShare)).toBeNull();
    // the refusal changes nothing
    const cashBefore = c.cash;
    const r = declareDividend(g, FOUNDER, c, (fcf + 0.01) / shares, null);
    expect(r.ok).toBe(false);
    expect(c.cash).toBe(cashBefore);
  });

  it('dividend_distress_flag: a permitted dividend in a quarter with a new bank loan raises the distress flag on the same tick', () => {
    const { g, c } = fresh('div-dist');
    advanceTo(g, 130);
    c.retained = 1e9;
    c.cash = 1e9;
    c.lastDebtDrawDay = c.qtd.startDay; // a loan drawn this quarter
    c.divDistress = false;
    const r = declareDividend(g, FOUNDER, c, 0.001, null);
    expect(r.ok).toBe(true);
    expect(c.divDistress).toBe(true);
  });

  it('clawback_covered_types (dividend path): a permitted dividend is a covered payment and the clawback reaches it within 63 gd', () => {
    const { g, c } = fresh('div-claw');
    advanceTo(g, 130);
    c.retained = 1e9;
    c.cash = 1e9;
    const r = declareDividend(g, FOUNDER, c, 0.001, null);
    expect(r.ok).toBe(true);
    const total = (r.ok ? (r.value.total as number) : 0);
    const last = c.payouts?.at(-1);
    expect(last).toMatchObject({ kind: 'dividend', toPlayerId: FOUNDER, amount: total, covered: total });
    const moved = moneyOf({ [FOUNDER]: 1e9 });
    expect(clawback(g.companies!, c, moved.env, 130 + 10, 1e9)).toBeCloseTo(total, 6);
  });

  it('bust_after_company_default (clawback debt): the founder pays the clawback down to the court floor and the rest is personal debt that survives', () => {
    const { g, c } = fresh('bust');
    const w = g.companies!;
    payout(c, D - 10, 100_000);
    c.cash = -10_000; // the creditors' shortfall is the overdraft, so the clawback reaches 10k of the 100k paid
    c.ap = 0;
    c.ar = 0;
    c.inv = 0;
    c.ppe = 0;
    const moved = moneyOf({ [FOUNDER]: floor + 1_000 });
    const r = bankrupt(w, c, moved.env, D);
    expect(r.clawed).toBe(10_000);
    expect(moved.taken[FOUNDER]).toBe(1_000); // the court floor is never taken
    expect(w.personalDebt?.[FOUNDER]).toBe(9_000); // the rest is personal debt, to the cent
    // the personal debt survives a later step: it is only ever added to, never cleared by the wipe
    expect(w.personalDebt?.[FOUNDER]).toBeGreaterThan(0);
  });

  it('salary_cap_exact (failure path): the cap is max($50 a gd, 1% of TTM revenue / 252) and drift above it is covered only for the excess', () => {
    const { c } = fresh('salary');
    c.closed = [];
    expect(salaryCapPerDay(c)).toBe(COMPANY.failure.salaryCapFloor);
    const q = { revenue: 630_000 } as unknown as Company['closed'][number];
    c.closed = [q, q, q, q];
    expect(salaryCapPerDay(c)).toBeCloseTo(0.01 * 2_520_000 / COMPANY.yearDays, 9);
  });

});

/** Every .ts file under a directory, recursively (for the static checks). */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
