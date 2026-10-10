import { COMPANY } from '@/content/company';
import { post } from './books';
import { BANK_POOL } from './debt';
import type { Company, CompanyWorld, Payout } from './types';

/**
 * Failure of a company (quant-company-building v1.7 spec 5.3, CB-043 to CB-046, CB-050, and the N5 exploit row). A company
 * owes its creditors out of its own assets only (limited liability). The founder's personal assets are protected, except
 * the guarantee. Covered payments made in the 63 gd before a default are clawed back, newest first, up to the creditors'
 * shortfall. The recipient is the account the company paid: a player, or a supply seller's company (then its cash, then its
 * owner). Loans from the company to a player are covered at their outstanding balance. What a recipient cannot pay becomes
 * personal debt. Everything here is pure over the company world and the player money the caller provides.
 */

/** The player money the failure path needs: read a balance, take money out, pay out, and realize a T1 business. */
export interface FailureMoney {
  money: {
    cash(pid: string): number;
    take(pid: string, amount: number): void;
    /** pays a player (a lender's share of the estate): a transfer. Without it, lenders are not paid in a default. */
    give?(pid: string, amount: number): void;
    /** sells one of the player's T1 businesses and returns its price (0 when there is none). The clawback uses it last. */
    sellT1?(pid: string): number;
  };
}

/** The most a salary can pay per gd before its excess is covered: max($50, 1% of TTM revenue / 252) (CB-050). */
export function salaryCapPerDay(c: Company): number {
  const F = COMPANY.failure;
  const ttm = c.closed.slice(-4).reduce((s, q) => s + q.revenue, 0);
  return Math.max(F.salaryCapFloor, (F.salaryCapRevenueShare * ttm) / COMPANY.yearDays);
}

/**
 * Records a covered payment. The log only needs the clawback lookback plus the safe-harbour span, so older entries are
 * dropped. There is no fixed count cap: a cap could drop a payment still inside the lookback (B2 review).
 */
export function recordPayout(c: Company, p: Omit<Payout, 'id'>): void {
  const keepFrom = p.day - COMPANY.failure.clawbackLookbackDays - COMPANY.failure.safeHarbourDays - 1;
  const kept = (c.payouts ?? []).filter((x) => x.day >= keepFrom);
  c.payoutSeq = (c.payoutSeq ?? 0) + 1;
  kept.push({ ...p, id: `${c.id}:pay${c.payoutSeq}` });
  c.payouts = kept;
}

/**
 * Adds surveillance points to a player (the insider backstop, spec 6.2). The company is the one the evidence concerns, so the
 * backstop can find the listed stock; the last ten reasons are kept for the record.
 */
export function addSurveillance(w: CompanyWorld, playerId: string, companyId: string, points: number, reason: string): void {
  w.insider ??= {};
  const rec = w.insider[playerId] ?? { points: 0, reasons: [] };
  rec.points += points;
  rec.reasons = [...rec.reasons, reason].slice(-10);
  rec.companyId = companyId;
  w.insider[playerId] = rec;
}

/**
 * Counts consecutive days with negative cash and reports whether the company defaults today (the trigger is
 * COMPANY.failure.defaultDays of them). A day with cash at zero or above resets the count.
 */
export function insolvencyStep(c: Company): boolean {
  c.insolventDays = c.cash < 0 ? (c.insolventDays ?? 0) + 1 : 0;
  return c.insolventDays >= COMPANY.failure.defaultDays;
}

/** A payment is in safe harbour (CB-045) when it is an ordinary repayment or contractor payment on terms signed 64+ gd before. */
function safeHarbour(p: Payout, day: number): boolean {
  if (p.insider || p.flagged) return false;
  if (p.kind !== 'repayment' && p.kind !== 'contractor') return false;
  return p.termsDay <= day - COMPANY.failure.safeHarbourDays;
}

/** The loans the company made to players and that are still outstanding, as covered items (spec 5.3: the balance). */
function loanOutItems(c: Company): Payout[] {
  return (c.contracts ?? [])
    .filter((k) => k.kind === 'loanOut' && !k.closed && k.balance > 0)
    .map((k) => ({
      id: k.id, day: k.signedDay, toPlayerId: k.payeeId, amount: k.balance, covered: k.balance, kind: 'loan' as const,
      termsDay: k.signedDay, flagged: false, insider: false,
    }));
}

/**
 * Claws back covered payments made in the lookback before the default day, newest first, up to `target` (the creditors'
 * shortfall). The first recipient owes the full amount it received. A player pays from its cash down to the court floor;
 * if that is short, one of its T1 businesses is sold. A company recipient (a supply seller) pays from its own cash, and the
 * rest is a personal debt of its owner. Anything still unpaid is a personal debt of the recipient. Returns the amount
 * claimed by the clawbacks (collected or not).
 */
export function clawback(w: CompanyWorld, c: Company, env: FailureMoney, day: number, target: number): number {
  const lo = day - COMPANY.failure.clawbackLookbackDays;
  const items = [...(c.payouts ?? []), ...loanOutItems(c)]
    .filter((p) => p.day >= lo && p.day < day && !safeHarbour(p, day))
    .reverse()
    .sort((a, b) => b.day - a.day);
  let remaining = target;
  const owed: Record<string, number> = {};
  let owedTotal = 0;
  for (const p of items) {
    if (remaining <= 0) break;
    const take = Math.min(p.covered, remaining);
    if (take <= 0) continue;
    const key = p.toCompanyId ? `c:${p.toCompanyId}` : `p:${p.toPlayerId}`;
    owed[key] = (owed[key] ?? 0) + take;
    owedTotal += take;
    remaining -= take;
  }
  const floor = COMPANY.failure.floor;
  for (const key of Object.keys(owed).sort()) {
    const amount = owed[key]!;
    if (key.startsWith('c:')) {
      const co = w.companies[key.slice(2)];
      if (!co) continue;
      const got = Math.min(amount, Math.max(0, co.cash));
      if (got > 0) {
        // related cash goes first: it is the cash that was never income (N1), so its clawback leaves the net debt unchanged
        const rel = Math.min(got, Math.max(0, co.relatedCash ?? 0));
        if (rel > 0) co.relatedCash = (co.relatedCash ?? 0) - rel;
        post(w, co, day, 'clawback', -got, true);
        c.estate = (c.estate ?? 0) + got;
      }
      if (amount - got > 0) {
        w.personalDebt ??= {};
        w.personalDebt[co.ownerId] = (w.personalDebt[co.ownerId] ?? 0) + (amount - got);
      }
      continue;
    }
    const pid = key.slice(2);
    let got = Math.min(amount, Math.max(0, env.money.cash(pid) - floor));
    if (got < amount && env.money.sellT1 && env.money.sellT1(pid) > 0) {
      got = Math.min(amount, Math.max(0, env.money.cash(pid) - floor));
    }
    if (got > 0) {
      env.money.take(pid, got);
      c.estate = (c.estate ?? 0) + got;
    }
    if (amount - got > 0) {
      w.personalDebt ??= {};
      w.personalDebt[pid] = (w.personalDebt[pid] ?? 0) + (amount - got);
    }
  }
  return owedTotal;
}

export interface BankruptcyResult {
  recovery: number;
  paid: number;
  shortfall: number;
  clawed: number;
}

/** Unpaid loans from players to the company: the creditor claims a default settles (they rank with the payables). */
function loansIn(c: Company) {
  return (c.contracts ?? []).filter((k) => k.kind === 'loanIn' && !k.closed && k.balance > 0);
}

/**
 * The default (spec 5.3). The waterfall, in order:
 * 1. the company's own cash goes to its estate; non-cash assets are realized at the sector's recovery rate, clamped to
 *    20-60% (the liquidator's money, a faucet);
 * 2. clawbacks reach the creditors' shortfall (the overdraft, the payables, the loans from players and the bank loans);
 * 3. the creditors are paid pro rata from the estate (payables to outside suppliers are a sink; the overdraft is an
 *    internal settlement; the loans from players are paid to their lenders; the bank loans are paid to the bank pool);
 * 4. the founder's guarantees are called (the company-level one, then each guaranteed bank loan, up to what is still owed on
 *    it), each up to its amount and above the court floor; what a guarantor cannot pay is personal debt;
 * 5. the creditors are paid again from the estate; what is still unpaid is written off (the payables, the loans and the bank
 *    principal are closed), and the leftover estate is booked as a sink: it is the liquidator's share, which leaves the world
 *    (equity is wiped out, so nothing is returned to it).
 * Equity is wiped out: the holders' positions are settled by the bridge through the engine's delisting.
 */
export function bankrupt(w: CompanyWorld, c: Company, env: FailureMoney, day: number): BankruptcyResult {
  const F = COMPANY.failure;
  const recovery = Math.min(F.recoveryMax, Math.max(F.recoveryMin, F.recovery[c.sector]));
  c.estate = c.estate ?? 0;
  if (c.cash > 0) {
    c.estate += c.cash;
    c.cash = 0;
  }
  const realized = recovery * (c.ar + c.inv + c.ppe);
  if (realized > 0) {
    w.flows.faucet += realized;
    c.estate += realized;
  }
  c.ar = 0;
  c.inv = 0;
  c.ppe = 0;

  const claims0 = c.ap + Math.max(0, -c.cash) + loansIn(c).reduce((s, k) => s + k.balance, 0) + bankOwed(c);
  const clawed = clawback(w, c, env, day, Math.max(0, claims0 - c.estate));
  let paid = payCreditors(w, c, env);

  const shortfall1 = Math.max(0, claims0 - paid);
  if (shortfall1 > 0 && callGuarantees(w, c, env, shortfall1) > 0) paid += payCreditors(w, c, env);

  // what is still owed is written off: the payables are gone, the loans from players are closed, the bank principal is
  // closed, and the unpaid overdraft stays as the dead company's negative cash. The loans to players are collected above
  // (or written off with the estate)
  c.ap = 0;
  for (const k of c.contracts ?? []) {
    if (k.kind === 'loanIn') { k.balance = 0; k.closed = true; }
    if (k.kind === 'loanOut') { k.balance = 0; k.closed = true; }
  }
  c.debts = [];
  const leftover = c.estate;
  if (leftover > 0) w.flows.sink += leftover;
  c.estate = 0;
  const shortfall = Math.max(0, claims0 - paid);
  c.bankrupt = { day, recovery, paid, shortfall, clawed };
  return { recovery, paid, shortfall, clawed };
}

/** The principal the company still owes the NPC bank pool (B1, debt.ts); the bank is a creditor of the default. */
function bankOwed(c: Company): number {
  return c.debts.reduce((s, d) => s + d.principal, 0);
}

/**
 * Calls the founder's personal guarantees on the company's debts (spec 5.3 step 4; debt.ts): the company-level guarantee first,
 * then each guaranteed bank loan, up to the principal still owed on it after the pro-rata payment. Every call is capped by the
 * shortfall still open and taken above the court floor; what a guarantor cannot pay is personal debt. Returns the amount that
 * reached the estate.
 */
function callGuarantees(w: CompanyWorld, c: Company, env: FailureMoney, shortfall: number): number {
  const F = COMPANY.failure;
  const calls: { playerId: string; amount: number }[] = [];
  if (c.guarantee) calls.push({ playerId: c.guarantee.playerId, amount: c.guarantee.amount });
  for (const d of c.debts) {
    if (d.guarantor && d.guaranteedAmount > 0 && d.principal > 0) {
      calls.push({ playerId: d.guarantor, amount: Math.min(d.guaranteedAmount, d.principal) });
    }
  }
  let open = shortfall;
  let reached = 0;
  for (const call of calls) {
    const want = Math.min(open, call.amount);
    if (want <= 0) continue;
    open -= want;
    const got = Math.min(want, Math.max(0, env.money.cash(call.playerId) - F.floor));
    if (got > 0) {
      env.money.take(call.playerId, got);
      c.estate = (c.estate ?? 0) + got;
      reached += got;
    }
    if (want - got > 0) {
      w.personalDebt ??= {};
      w.personalDebt[call.playerId] = (w.personalDebt[call.playerId] ?? 0) + (want - got);
    }
  }
  return reached;
}

/**
 * Pays the company's creditors pro rata from its estate: the overdraft (an internal settlement, so the company's cash moves
 * toward zero), the payables (paid to outside suppliers, a sink), the loans from players (paid to the lenders, a transfer) and
 * the bank loans (paid to the bank pool, a transfer). With no way to pay a player (no `give`), the loans are left as claims.
 * Returns the amount paid.
 */
function payCreditors(w: CompanyWorld, c: Company, env: FailureMoney): number {
  const od = Math.max(0, -c.cash);
  const loans = env.money.give ? loansIn(c) : [];
  const debt = loans.reduce((s, k) => s + k.balance, 0);
  const bank = w.investors[BANK_POOL];
  const bankDebts = bank ? c.debts.filter((d) => d.principal > 0) : [];
  const bankClaims = bankDebts.reduce((s, d) => s + d.principal, 0);
  const claims = c.ap + od + debt + bankClaims;
  if (claims <= 0 || (c.estate ?? 0) <= 0) return 0;
  const f = Math.min(1, (c.estate ?? 0) / claims);
  const payOd = od * f;
  const payAp = c.ap * f;
  c.estate = (c.estate ?? 0) - payOd - payAp;
  c.cash += payOd;
  w.flows.sink += payAp;
  c.ap -= payAp;
  let paidDebt = 0;
  for (const k of loans) {
    const pay = k.balance * f;
    if (pay <= 0) continue;
    k.balance -= pay;
    if (k.balance <= 1e-9) {
      k.balance = 0;
      k.closed = true;
    }
    c.estate = (c.estate ?? 0) - pay;
    env.money.give!(k.payeeId, pay);
    paidDebt += pay;
  }
  let paidBank = 0;
  if (bank) {
    for (const d of bankDebts) {
      const pay = d.principal * f;
      if (pay <= 0) continue;
      d.principal -= pay;
      c.estate = (c.estate ?? 0) - pay;
      bank.cash += pay;
      paidBank += pay;
    }
  }
  return payOd + payAp + paidDebt + paidBank;
}
