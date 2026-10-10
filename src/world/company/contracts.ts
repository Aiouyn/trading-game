import { COMPANY } from '@/content/company';
import { post } from './books';
import { addSurveillance, recordPayout } from './failure';
import { ownerSetOf } from './owners';
import type { CompanyEnv, Outcome } from './company';
import type { CompanyReject, CompanyWorld, Company, ContractDeal } from './types';

/**
 * Contracts with player accounts (B2; spec 5.3 covered payments, 6.3 related parties, DECISIONS C4). Three kinds, each with
 * a term:
 * - a contractor's fee, paid by the company each game day (the day rate must sit in the band of the market rate);
 * - a loan from a player to the company, repaid in equal daily instalments (a prepayment is an extra, flagged payment);
 * - a loan from the company to a player, whose outstanding balance is covered at a default.
 * Every payment to a player is a covered payment for the clawback: its insider status is the status at signing or on the
 * payment's day (either is enough, G9). A loan is debt in net debt and a loan out is a receivable, so borrowing from an
 * alt cannot lift the valuation (the money is owed back).
 */

/** Whether `pid` is an insider of the company now (spec 5.3): the owner set (founder, alts, alliance), the CEO, or a holder of
 * at least `insiderStake` of the shares (the bridge reads the listed stock; a private company has no such holder). */
export function insiderNow(w: CompanyWorld, c: Company, pid: string, env: CompanyEnv): boolean {
  if (ownerSetOf(w, c.ownerId).includes(pid)) return true;
  if (c.ceo?.kind === 'player' && c.ceo.playerId === pid) return true;
  return (env.stakeOf?.(pid, c.id) ?? 0) >= COMPANY.failure.insiderStake;
}

/** The net debt pieces of the contracts: debt to players (loans in) and receivables from players (loans out). */
export function loanBook(c: Company): { debt: number; loansOut: number } {
  let debt = 0;
  let loansOut = 0;
  for (const k of c.contracts ?? []) {
    if (k.closed) continue;
    if (k.kind === 'loanIn') debt += k.balance;
    else if (k.kind === 'loanOut') loansOut += k.balance;
  }
  return { debt, loansOut };
}

function nextId(c: Company, kind: string): string {
  c.contractSeq = (c.contractSeq ?? 0) + 1;
  return `${c.id}:${kind}${c.contractSeq}`;
}

function fail<T>(reject: CompanyReject): Outcome<T> {
  return { ok: false, reject };
}

/** The owner's contractor deal: `perDay` to `payeeId` until the term ends, inside the band of the market day rate (spec 6.3). */
export function signContractor(
  w: CompanyWorld, c: Company, env: CompanyEnv, playerId: string, args: { payeeId: string; perDay: number },
): Outcome<{ id: string; endDay: number }> {
  if (c.bankrupt) return fail({ code: 'companyBankrupt' });
  if (c.ownerId !== playerId) return fail({ code: 'notFounder' });
  if (!(Number.isFinite(args.perDay) && args.perDay > 0)) return fail({ code: 'negativeAmount' });
  const K = COMPANY.contract;
  const min = Math.round(K.marketPerDay * (1 - COMPANY.supply.band) * 100) / 100;
  const max = Math.round(K.marketPerDay * (1 + COMPANY.supply.band) * 100) / 100;
  if (!(args.perDay >= min && args.perDay <= max)) {
    if (ownerSetOf(w, c.ownerId).includes(args.payeeId)) {
      addSurveillance(w, playerId, c.id, COMPANY.failure.insiderPoints.relatedOutOfBand, 'related contract priced out of band');
    }
    return fail({ code: 'contractPriceOutOfBand', min, max });
  }
  const deal: ContractDeal = {
    id: nextId(c, 'ctr'), kind: 'contractor', payeeId: args.payeeId, perDay: args.perDay, principal: 0, balance: 0,
    signedDay: env.day, endDay: env.day + K.termDays, insiderAtSigning: insiderNow(w, c, args.payeeId, env), closed: false,
  };
  c.contracts = [...(c.contracts ?? []), deal];
  return { ok: true, value: { id: deal.id, endDay: deal.endDay } };
}

/** A player lends `amount` to the company (the lender's own act): cash moves in as a transfer and the loan is repaid over the term. */
export function lendToCompany(
  w: CompanyWorld, c: Company, env: CompanyEnv, lenderId: string, amount: number,
): Outcome<{ id: string; perDay: number }> {
  if (c.bankrupt) return fail({ code: 'companyBankrupt' });
  const K = COMPANY.contract;
  if (!(Number.isFinite(amount) && amount > 0)) return fail({ code: 'negativeAmount' });
  if (amount < K.minLoan) return fail({ code: 'loanTooSmall', min: K.minLoan });
  const cash = env.money.cash(lenderId);
  if (cash < amount) return fail({ code: 'insufficientFunds', shortfall: amount - cash });
  env.money.take(lenderId, amount);
  post(w, c, env.day, 'loanIn', amount, true);
  const deal: ContractDeal = {
    id: nextId(c, 'loan'), kind: 'loanIn', payeeId: lenderId, perDay: amount / K.termDays, principal: amount, balance: amount,
    signedDay: env.day, endDay: env.day + K.termDays, insiderAtSigning: insiderNow(w, c, lenderId, env), closed: false,
  };
  c.contracts = [...(c.contracts ?? []), deal];
  return { ok: true, value: { id: deal.id, perDay: deal.perDay } };
}

/** The owner lends `amount` out of the company to a player: the company's cash must cover it (no credit). */
export function lendToPlayer(
  w: CompanyWorld, c: Company, env: CompanyEnv, playerId: string, args: { payeeId: string; amount: number },
): Outcome<{ id: string }> {
  if (c.bankrupt) return fail({ code: 'companyBankrupt' });
  if (c.ownerId !== playerId) return fail({ code: 'notFounder' });
  if (!env.money.give) return fail({ code: 'unknownAction' });
  if (!(Number.isFinite(args.amount) && args.amount > 0)) return fail({ code: 'negativeAmount' });
  if (c.cash < args.amount) return fail({ code: 'insufficientFunds', shortfall: args.amount - c.cash });
  post(w, c, env.day, 'loanOut', -args.amount, true);
  env.money.give(args.payeeId, args.amount);
  const deal: ContractDeal = {
    id: nextId(c, 'lent'), kind: 'loanOut', payeeId: args.payeeId, perDay: 0, principal: args.amount, balance: args.amount,
    signedDay: env.day, endDay: env.day, insiderAtSigning: insiderNow(w, c, args.payeeId, env), closed: false,
  };
  c.contracts = [...(c.contracts ?? []), deal];
  return { ok: true, value: { id: deal.id } };
}

function openDeal(c: Company, id: string, kind: ContractDeal['kind']): ContractDeal | null {
  return (c.contracts ?? []).find((k) => k.id === id && k.kind === kind && !k.closed) ?? null;
}

/** The owner pays extra principal on a loan from a player: a flagged payment, which the clawback always reaches (spec 5.3). */
export function prepayLoan(
  w: CompanyWorld, c: Company, env: CompanyEnv, playerId: string, args: { contractId: string; amount: number },
): Outcome<{ balance: number }> {
  if (c.bankrupt) return fail({ code: 'companyBankrupt' });
  if (c.ownerId !== playerId) return fail({ code: 'notFounder' });
  if (!env.money.give) return fail({ code: 'unknownAction' });
  const k = openDeal(c, args.contractId, 'loanIn');
  if (!k) return fail({ code: 'contractNotFound' });
  if (!(Number.isFinite(args.amount) && args.amount > 0)) return fail({ code: 'negativeAmount' });
  if (args.amount > k.balance + 1e-9) return fail({ code: 'loanBalance', balance: k.balance });
  if (c.cash < args.amount) return fail({ code: 'insufficientFunds', shortfall: args.amount - c.cash });
  const pay = Math.min(args.amount, k.balance);
  post(w, c, env.day, 'loanPrepay', -pay, true);
  env.money.give(k.payeeId, pay);
  k.balance -= pay;
  if (k.balance <= 1e-9) { k.balance = 0; k.closed = true; }
  recordPayout(c, {
    day: env.day, toPlayerId: k.payeeId, amount: pay, covered: pay, kind: 'repayment', termsDay: k.signedDay, flagged: true,
    insider: k.insiderAtSigning || insiderNow(w, c, k.payeeId, env),
  });
  return { ok: true, value: { balance: k.balance } };
}

/** The player repays part of a loan the company took from it (the player's own act, a transfer into the company). */
export function repayLoanOut(
  w: CompanyWorld, c: Company, env: CompanyEnv, playerId: string, args: { contractId: string; amount: number },
): Outcome<{ balance: number }> {
  if (c.bankrupt) return fail({ code: 'companyBankrupt' });
  const k = openDeal(c, args.contractId, 'loanOut');
  if (!k) return fail({ code: 'contractNotFound' });
  if (k.payeeId !== playerId) return fail({ code: 'notParty' });
  if (!(Number.isFinite(args.amount) && args.amount > 0)) return fail({ code: 'negativeAmount' });
  if (args.amount > k.balance + 1e-9) return fail({ code: 'loanBalance', balance: k.balance });
  const cash = env.money.cash(playerId);
  if (cash < args.amount) return fail({ code: 'insufficientFunds', shortfall: args.amount - cash });
  const pay = Math.min(args.amount, k.balance);
  env.money.take(playerId, pay);
  post(w, c, env.day, 'loanRepaid', pay, true);
  k.balance -= pay;
  if (k.balance <= 1e-9) { k.balance = 0; k.closed = true; }
  return { ok: true, value: { balance: k.balance } };
}

/**
 * The day's contract flows for one company (called for day - 1, like the supply flows). A contractor is paid its day rate to
 * the end of the term (a day without cash is skipped, and the fee is an opex and an OCF cost). A loan from a player is repaid
 * its instalment while it has a balance, and only with cash on hand (a missed instalment is no default; the company's
 * negative cash is). Principal repayments are financing, not P&L. Every payment is a covered payment (spec 5.3).
 */
export function contractDay(w: CompanyWorld, c: Company, env: CompanyEnv, day: number): void {
  if (c.bankrupt || !c.contracts?.length || !env.money.give) return;
  for (const k of c.contracts) {
    if (k.closed) continue;
    if (k.kind === 'contractor') {
      if (day > k.endDay) { k.closed = true; continue; }
      if (k.signedDay > day || c.cash < k.perDay) continue;
      post(w, c, day, 'contract', -k.perDay, true);
      env.money.give(k.payeeId, k.perDay);
      c.qtd.opex += k.perDay;
      c.qtd.ocf -= k.perDay;
      recordPayout(c, {
        day, toPlayerId: k.payeeId, amount: k.perDay, covered: k.perDay, kind: 'contractor', termsDay: k.signedDay,
        flagged: false, insider: k.insiderAtSigning || insiderNow(w, c, k.payeeId, env),
      });
    } else if (k.kind === 'loanIn') {
      const pay = Math.min(k.perDay, k.balance);
      if (k.signedDay >= day || pay <= 0 || c.cash < pay) continue;
      post(w, c, day, 'loanRepay', -pay, true);
      env.money.give(k.payeeId, pay);
      k.balance -= pay;
      if (k.balance <= 1e-9) { k.balance = 0; k.closed = true; }
      recordPayout(c, {
        day, toPlayerId: k.payeeId, amount: pay, covered: pay, kind: 'repayment', termsDay: k.signedDay, flagged: false,
        insider: k.insiderAtSigning || insiderNow(w, c, k.payeeId, env),
      });
    }
  }
  c.contracts = c.contracts.filter((k) => !k.closed);
}
