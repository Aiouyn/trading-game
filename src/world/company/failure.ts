import { COMPANY } from '@/content/company';
import type { Company, CompanyWorld, Payout } from './types';

/**
 * Failure of a company (quant-company-building v1.7 spec 5.3, CB-043 to CB-046, CB-050, and the N5 exploit row). A company
 * owes its creditors out of its own assets only (limited liability). The founder's personal assets are protected, except
 * the guarantee. Covered payments made to players in the 63 gd before a default can be clawed back from the first recipient,
 * newest first, up to the creditors' shortfall; what a recipient cannot pay becomes personal debt. Everything here is pure
 * over the company world and the player money of the caller, so the bridge can run it at the day's close.
 */

/** The player money the failure path needs: read a balance, and take money out (a clawback or a guarantee call). */
export interface FailureMoney {
  money: { cash(pid: string): number; take(pid: string, amount: number): void };
}

/** The most a salary can pay per gd before its excess is covered: max($50, 1% of TTM revenue / 252) (CB-050). */
export function salaryCapPerDay(c: Company): number {
  const F = COMPANY.failure;
  const ttm = c.closed.slice(-4).reduce((s, q) => s + q.revenue, 0);
  return Math.max(F.salaryCapFloor, (F.salaryCapRevenueShare * ttm) / COMPANY.yearDays);
}

/** Records a covered payment. The log keeps the last clawback window plus a margin, so it stays small. */
export function recordPayout(c: Company, p: Omit<Payout, 'id'>): void {
  const log = c.payouts ?? [];
  const keepFrom = p.day - COMPANY.failure.clawbackLookbackDays - COMPANY.failure.safeHarbourDays - 1;
  const kept = log.filter((x) => x.day >= keepFrom);
  kept.push({ ...p, id: `${c.id}:pay${p.day}:${kept.length}` });
  c.payouts = kept.length > 200 ? kept.slice(kept.length - 200) : kept;
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

/**
 * Claws back covered payments made in the lookback before the default day, newest first, up to `target` (the creditors'
 * shortfall). Each recipient is charged the sum of what it received (the first recipient owes the full amount). The part
 * collected from its cash, above the court floor, goes to the company's estate; the rest is personal debt. Returns the
 * amount owed (collected or not), which is the creditor claim the clawbacks reach.
 */
export function clawback(w: CompanyWorld, c: Company, env: FailureMoney, day: number, target: number): number {
  const log = c.payouts ?? [];
  const lo = day - COMPANY.failure.clawbackLookbackDays;
  let remaining = target;
  const owed: Record<string, number> = {};
  let owedTotal = 0;
  for (let i = log.length - 1; i >= 0 && remaining > 0; i--) {
    const p = log[i]!;
    if (p.day < lo || p.day >= day || safeHarbour(p, day)) continue;
    const take = Math.min(p.covered, remaining);
    if (take <= 0) continue;
    owed[p.toPlayerId] = (owed[p.toPlayerId] ?? 0) + take;
    owedTotal += take;
    remaining -= take;
  }
  const floor = COMPANY.failure.floor;
  for (const pid of Object.keys(owed).sort()) {
    const amount = owed[pid]!;
    const got = Math.min(amount, Math.max(0, env.money.cash(pid) - floor));
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

/**
 * The default (spec 5.3). The waterfall, in order:
 * 1. the company's own cash goes to its estate; non-cash assets are realized at the sector's recovery rate, clamped to
 *    20-60% (the liquidator's money, a faucet);
 * 2. clawbacks reach the creditors' shortfall (the overdraft and the payables);
 * 3. the creditors are paid pro rata from the estate (payables to outside suppliers are a sink; the overdraft is owed to the
 *    company's own lenders and is settled inside the company);
 * 4. the founder's guarantee is called, up to its amount and above the court floor; the rest of it is personal debt;
 * 5. the creditors are paid again from the estate; what is still unpaid is written off, and the leftover (equity's share,
 *    which is zero) goes to the liquidator.
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

  const claims0 = c.ap + Math.max(0, -c.cash);
  const clawed = clawback(w, c, env, day, Math.max(0, claims0 - c.estate));
  let paid = payCreditors(w, c);

  const shortfall1 = Math.max(0, claims0 - paid);
  const g = c.guarantee;
  if (g && shortfall1 > 0) {
    const want = Math.min(shortfall1, g.amount);
    const got = Math.min(want, Math.max(0, env.money.cash(g.playerId) - F.floor));
    if (got > 0) {
      env.money.take(g.playerId, got);
      c.estate += got;
    }
    if (want - got > 0) {
      w.personalDebt ??= {};
      w.personalDebt[g.playerId] = (w.personalDebt[g.playerId] ?? 0) + (want - got);
    }
    paid += payCreditors(w, c);
  }

  // what is still owed is written off: the payables are gone, and the unpaid overdraft stays as the dead company's negative cash
  c.ap = 0;
  const leftover = c.estate;
  if (leftover > 0) w.flows.sink += leftover;
  c.estate = 0;
  const shortfall = Math.max(0, claims0 - paid);
  c.bankrupt = { day, recovery, paid, shortfall, clawed };
  return { recovery, paid, shortfall, clawed };
}

/**
 * Pays the company's creditors pro rata from its estate: the overdraft (an internal settlement, so the company's cash moves
 * toward zero) and the payables (paid to outside suppliers, a sink). Returns the amount paid.
 */
function payCreditors(w: CompanyWorld, c: Company): number {
  const od = Math.max(0, -c.cash);
  const claims = c.ap + od;
  if (claims <= 0 || (c.estate ?? 0) <= 0) return 0;
  const f = Math.min(1, (c.estate ?? 0) / claims);
  const payOd = od * f;
  const payAp = c.ap * f;
  c.estate = (c.estate ?? 0) - payOd - payAp;
  c.cash += payOd;
  w.flows.sink += payAp;
  c.ap -= payAp;
  return payOd + payAp;
}
