/**
 * Debt, covenants and guarantees (quant-company-building v1.7 sections 5 and 5.2; Phase 4 B1). A growing company borrows from
 * the NPC bank pool (a revolver from Growth, a term loan from Late); interest accrues daily on the principal, and a
 * covenant is tested on each filing: net debt over TTM EBITDA at most 3.5x, and EBITDA over TTM interest at least 2.0x.
 * A breach opens a 21 gd cure, and a company still in breach when the cure ends is in default (the status is set here;
 * the bankruptcy and the calls on guarantees are a later step, B2). A personal guarantee lowers the rate to 75% and makes
 * the founder owe the guaranteed amount personally on default. The consequence is shown before the guarantee is taken.
 */

import { COMPANY } from '@/content/company';
import { notify, today } from '../core';
import type { GameState, StepOutput } from '../types';
import { post } from './books';
import { loanBook } from './contracts';
import type { Company, CompanyReject, CovenantStatus, Debt, FilingPublic } from './types';

/** The NPC bank pool: lends from its cash, takes interest and principal back (transfers only). */
export const BANK_POOL = 'npc:bank';

const TIER_RANK: Record<string, number> = { seed: 0, growth: 1, late: 2 };

/** TTM over the last four filings: EBITDA, interest, FCF and the count (the covenant and dividend tests read these). */
export function ttmOf(c: Company): { ebitda: number; interest: number; fcf: number; count: number } {
  const last: FilingPublic[] = c.filings.slice(-4);
  let ebitda = 0;
  let interest = 0;
  let fcf = 0;
  for (const f of last) {
    ebitda += f.income.ebitda;
    interest += f.income.interest ?? 0; // a filing from before B1 has no interest line
    fcf += f.cashFlow.fcf;
  }
  return { ebitda, interest, fcf, count: last.length };
}

/**
 * TTM EBITDA annualized to four quarters: the covenant reads net debt over annualized EBITDA (§5). With fewer than four
 * filings the TTM sum scales by 4 over the count, so a young company is not tested at half its earnings.
 */
export function annualEbitdaOf(c: Company): number {
  const t = ttmOf(c);
  return t.count > 0 ? t.ebitda * (COMPANY.yearDays / COMPANY.quarterDays / t.count) : 0;
}

/** The covenant breach, if any, of a debt and cash position against the TTM filed numbers ('earnings', 'leverage', 'cover'). */
export function covenantBreachOf(c: Company, debt: number, cash: number): 'earnings' | 'leverage' | 'cover' | null {
  if (debt <= 0) return null;
  const netDebt = debt - cash;
  if (netDebt <= 0) return null;
  const { interest } = ttmOf(c);
  const ebitda = annualEbitdaOf(c);
  if (ebitda <= 0) return 'earnings';
  if (netDebt / ebitda > COMPANY.debt.maxLeverage) return 'leverage';
  if (interest > 0 && ebitda / interest < COMPANY.debt.minInterestCover) return 'cover';
  return null;
}

/** The public band of the total debt, as the covenant status is public and the amount is only a band. */
export function debtBand(total: number): string {
  if (total <= 0) return '0';
  if (total < 1_000_000) return '<1M';
  if (total < 10_000_000) return '1M-10M';
  return '10M+';
}

export function totalDebt(c: Company): number {
  return c.debts.reduce((x, d) => x + d.principal, 0);
}

/** A loan from the bank pool. Guarantees need the consequence acknowledged in the same command (shown before commit). */
export function drawLoan(
  g: GameState, playerId: string, c: Company,
  args: { amount: number; guarantee: boolean; acknowledged: boolean },
  out: StepOutput | null,
): { ok: true; value: Record<string, unknown> } | { ok: false; reject: CompanyReject } {
  if (c.ownerId !== playerId) return { ok: false, reject: { code: 'notFounder' } };
  const { amount, guarantee, acknowledged } = args;
  if (!(Number.isFinite(amount) && amount > 0)) return { ok: false, reject: { code: 'loanBadAmount' } };
  const minTier = COMPANY.debt.loanMinTier;
  if ((TIER_RANK[c.tier] ?? 0) < (TIER_RANK[minTier] ?? 0)) return { ok: false, reject: { code: 'loanTier', minTier } };
  if (c.covenant.status !== 'ok') return { ok: false, reject: { code: 'loanCovenant', covenant: c.covenant.status } };
  const pool = g.companies!.investors[BANK_POOL];
  if (!pool || pool.cash < amount) return { ok: false, reject: { code: 'loanBankCash', available: pool?.cash ?? 0 } };
  if (guarantee && !acknowledged) return { ok: false, reject: { code: 'guaranteeNotAcknowledged', personalDebt: amount } };
  const day = today(g);
  const rate = COMPANY.debt.ratePerDay * (guarantee ? COMPANY.debt.guaranteedFactor : 1);
  const debt: Debt = {
    id: `${c.id}:d${c.debtSeq++}`, principal: amount, ratePerDay: rate, drawnDay: day,
    guarantor: guarantee ? playerId : null, guaranteedAmount: guarantee ? amount : 0,
  };
  pool.cash -= amount;
  post(g.companies!, c, day, 'loan', amount, true);
  c.debts.push(debt);
  c.lastDebtDrawDay = day;
  notify(g, out, playerId, { kind: 'system', tone: 'info', text: `${c.name} drew ${Math.round(amount)} from the bank.`, msg: { key: 'company.note.loan', vars: { name: c.name, amount: Math.round(amount) } } });
  return { ok: true, value: { debtId: debt.id, ratePerDay: rate, personalDebtIfDefault: debt.guaranteedAmount } };
}

/** Repays part or all of a loan from company cash (transfers only). */
export function repayLoan(
  g: GameState, playerId: string, c: Company, debtId: string, amount: number,
): { ok: true; value: Record<string, unknown> } | { ok: false; reject: CompanyReject } {
  if (c.ownerId !== playerId) return { ok: false, reject: { code: 'notFounder' } };
  const d = c.debts.find((x) => x.id === debtId);
  if (!d) return { ok: false, reject: { code: 'repayUnknownDebt' } };
  if (!(Number.isFinite(amount) && amount > 0)) return { ok: false, reject: { code: 'repayBadAmount' } };
  const pay = Math.min(amount, d.principal);
  if (c.cash < pay) return { ok: false, reject: { code: 'insufficientFunds', shortfall: pay - c.cash } };
  const day = today(g);
  post(g.companies!, c, day, 'repay', -pay, true);
  g.companies!.investors[BANK_POOL]!.cash += pay;
  d.principal -= pay;
  if (d.principal <= 1e-9) c.debts = c.debts.filter((x) => x.id !== debtId);
  return { ok: true, value: { remaining: Math.max(0, d.principal), paid: pay } };
}

/**
 * The day's debt flows (B1; the spec's five-day rule, O-7 ruling). Interest accrues daily on each loan (a transfer to the bank
 * pool, a cost of the quarter below EBIT), and a covenant in cure adds its rate (+0.05%/gd).
 *
 * Outside a liquidity cure the day's interest is paid from cash, which may take cash below zero. Cash below zero with a
 * facility drawn opens a liquidity cure: five game days, with a founder notice. During the cure the owed interest is not paid:
 * it builds up as arrears, which accrue at the facility rate, and no money moves. The cure ends early when the cash covers
 * everything owed (the arrears and the day's interest), and the bank is paid then. A cure still open on its fifth day is a
 * default, and the covenant is not tested again. With no facility drawn any more, an open cure ends.
 *
 * Then the covenant cure: a company in cure is tested again on its live numbers, cured when the breach clears, and in default
 * when the cure ends in breach. Default is a status here; the bankruptcy is a later step (B2).
 */
export function debtDay(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  const pool = g.companies!.investors[BANK_POOL];
  if (c.debts.length === 0) {
    if (liquidityCureOpen(c)) endLiquidityCure(g, c, out);
  } else if (pool) {
    const cure = c.covenant.status === 'cure';
    const rateOf = (d: Debt) => d.ratePerDay + (cure ? COMPANY.debt.cureRatePerDay : 0);
    const interest = c.debts.map((d) => d.principal * rateOf(d));
    if (!liquidityCureOpen(c)) {
      c.debts.forEach((d, i) => payBank(g, c, day, pool, interest[i]!));
      if (c.cash < 0) openLiquidityCure(g, c, day, out);
    } else {
      // the arrears carry the facility rate, then the day's interest is added: all of it is owed
      const owed = c.debts.map((d, i) => (d.arrears ?? 0) * (1 + rateOf(d)) + interest[i]!);
      if (c.cash >= owed.reduce((x, v) => x + v, 0)) {
        c.debts.forEach((d, i) => {
          payBank(g, c, day, pool, owed[i]!);
          d.arrears = 0;
        });
        endLiquidityCure(g, c, out);
      } else {
        // the missed payment is arrears, and no money moves
        c.debts.forEach((d, i) => { d.arrears = owed[i]!; });
        if (day >= c.liquidityCureUntilDay!) {
          liquidityDefault(g, c, day, out);
          return;
        }
      }
    }
  }
  covenantDay(g, c, day, out);
}

function liquidityCureOpen(c: Company): boolean {
  return (c.liquidityCureUntilDay ?? null) !== null;
}

/** A payment of interest or arrears to the bank pool: a transfer, booked as the company's interest. */
function payBank(g: GameState, c: Company, day: number, pool: { cash: number }, amount: number): void {
  if (amount <= 0) return;
  post(g.companies!, c, day, 'interest', -amount, true);
  pool.cash += amount;
  c.qtd.interest += amount;
  c.qtd.ocf -= amount;
}

/** Cash below zero with a facility drawn: the five-day cure opens, and the founder is told what, why and what to do. */
function openLiquidityCure(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  const until = day + COMPANY.debt.liquidityCureDays;
  c.liquidityCureUntilDay = until;
  notify(g, out, c.ownerId, {
    kind: 'system', tone: 'warn',
    text: `${c.name} has cash below zero with a bank loan drawn. The bank cannot be paid from negative cash, so the interest builds up as arrears. Put cash into ${c.name} by day ${until}, or the loan goes into default.`,
    msg: { key: 'company.note.liquidityCure', vars: { name: c.name, day: until } },
  });
}

/** The cure ends: cured when the cash covers what is owed, or because no facility is left. */
function endLiquidityCure(g: GameState, c: Company, out: StepOutput | null): void {
  c.liquidityCureUntilDay = null;
  notify(g, out, c.ownerId, {
    kind: 'system', tone: 'gain',
    text: `${c.name}: the cash covers the bank again, and the loan is current.`,
    msg: { key: 'company.note.liquidityCured', vars: { name: c.name } },
  });
}

/** The cure is still open on its fifth day: the company is in default (the status is set here; the bankruptcy is B2). */
function liquidityDefault(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  if (c.covenant.status === 'default') return;
  c.covenant = { status: 'default', cureUntilDay: null };
  c.liquidityCureUntilDay = null;
  notify(g, out, c.ownerId, {
    kind: 'system', tone: 'loss',
    text: `${c.name}: the bank loan is in default. Cash did not cover the interest by day ${day}.`,
    msg: { key: 'company.note.liquidityDefault', vars: { name: c.name, day } },
  });
}

/** The covenant at a filing: a new breach opens the cure, a cleared one clears it, and a default stays a default. */
export function covenantAtFiling(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  const last = c.filings[c.filings.length - 1];
  if (!last) return;
  // the cash side of net debt: related-party cash is out, and the loans to players count as cash (N1, B2)
  const cash = last.balance.cash - (last.relatedCash ?? 0) + (last.balance.loansOut ?? 0);
  const breach = covenantBreachOf(c, last.balance.debt, cash);
  // a cure that is already running keeps its deadline: a filing in breach does not restart it
  const until = c.covenant.status === 'cure' ? c.covenant.cureUntilDay : day + COMPANY.debt.cureDays;
  setCovenant(g, c, breach ? 'cure' : 'ok', breach ? until : null, out, !!breach);
}

/** Daily: a cure is re-tested on the live balance; the end of a cure still in breach is a default. */
function covenantDay(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  if (c.covenant.status !== 'cure') return;
  const lb = loanBook(c);
  const debt = totalDebt(c) + lb.debt;
  const live = covenantBreachOf(c, debt, c.cash - (c.relatedCash ?? 0) + lb.loansOut);
  if (!live) {
    setCovenant(g, c, 'ok', null, out, false);
  } else if (c.covenant.cureUntilDay !== null && day >= c.covenant.cureUntilDay) {
    setCovenant(g, c, 'default', c.covenant.cureUntilDay, out, true);
  }
}

function setCovenant(g: GameState, c: Company, status: CovenantStatus, cureUntilDay: number | null, out: StepOutput | null, breach: boolean): void {
  const prev = c.covenant.status;
  if (prev === 'default') return;
  c.covenant = { status, cureUntilDay };
  if (status === prev) return;
  if (status === 'cure' && breach) {
    notify(g, out, c.ownerId, { kind: 'system', tone: 'warn', text: `${c.name}: a covenant is in breach. Cure it by day ${cureUntilDay}.`, msg: { key: 'company.note.covenantCure', vars: { name: c.name, day: cureUntilDay ?? 0 } } });
  } else if (status === 'ok' && prev === 'cure') {
    notify(g, out, c.ownerId, { kind: 'system', tone: 'gain', text: `${c.name}: the covenant is cured.`, msg: { key: 'company.note.covenantCured', vars: { name: c.name } } });
  } else if (status === 'default') {
    notify(g, out, c.ownerId, { kind: 'system', tone: 'loss', text: `${c.name}: the covenant is in default.`, msg: { key: 'company.note.covenantDefault', vars: { name: c.name } } });
  }
}
