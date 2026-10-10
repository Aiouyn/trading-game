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
import { post } from './company';
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
 * The day's debt flows: interest on every loan (a transfer to the bank pool, a cost of the quarter below EBIT). A covenant
 * in cure adds its rate (+0.05%/gd). A day's interest the company's cash cannot cover is a missed payment, a default at once.
 * (Interest accrues daily here, so cash below zero with a facility drawn always misses that day's payment; the five-day
 * grace of §5 is therefore not a separate rule in B1. Flagged for Ledger.) Then the covenant cure: a company in cure is tested
 * again on its live numbers, cured when the breach clears, and in default when the cure ends in breach. Default is a status
 * here; the bankruptcy is a later step (B2).
 */
export function debtDay(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  const pool = g.companies!.investors[BANK_POOL];
  const cure = c.covenant.status === 'cure';
  const due = c.debts.reduce((x, d) => x + d.principal * (d.ratePerDay + (cure ? COMPANY.debt.cureRatePerDay : 0)), 0);
  if (due > 0 && pool) {
    if (c.cash < due) {
      setCovenant(g, c, 'default', day, out, true);
      return;
    }
    for (const d of c.debts) {
      const interest = d.principal * (d.ratePerDay + (cure ? COMPANY.debt.cureRatePerDay : 0));
      if (interest <= 0) continue;
      post(g.companies!, c, day, 'interest', -interest, true);
      pool.cash += interest;
      c.qtd.interest += interest;
      c.qtd.ocf -= interest;
    }
  }
  covenantDay(g, c, day, out);
}

/** The covenant at a filing: a new breach opens the cure, a cleared one clears it, and a default stays a default. */
export function covenantAtFiling(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  const last = c.filings[c.filings.length - 1];
  if (!last) return;
  const breach = covenantBreachOf(c, last.balance.debt, last.balance.cash);
  // a cure that is already running keeps its deadline: a filing in breach does not restart it
  const until = c.covenant.status === 'cure' ? c.covenant.cureUntilDay : day + COMPANY.debt.cureDays;
  setCovenant(g, c, breach ? 'cure' : 'ok', breach ? until : null, out, !!breach);
}

/** Daily: a cure is re-tested on the live balance; the end of a cure still in breach is a default. */
function covenantDay(g: GameState, c: Company, day: number, out: StepOutput | null): void {
  if (c.covenant.status !== 'cure') return;
  const debt = totalDebt(c);
  const live = covenantBreachOf(c, debt, c.cash);
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
