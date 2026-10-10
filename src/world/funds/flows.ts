import { placeOrder, type WorldState } from '@/engine';
import { FUND_RULES, FUND_TIME } from '@/content/funds';
import { cashOf, transfer } from '../core';
import { say } from '../say';
import { usd } from '../text/template';
import type { CommandResult, GameState, StepOutput } from '../types';
import { depositRefusal, redeemRefusal } from './rules';
import { navOf, navPerUnitOf, requestSeq, unitsOf } from './state';
import type { Fund } from './types';

/**
 * Deposits and redemptions. A deposit moves cash into the fund at once (a liability until the next day close), and a
 * redemption reserves its units at once. Both settle at the day-close NAV. Redemptions pass the 20% daily gate, pro-rata,
 * unless the fund is frozen, winding, in its breaker, or in a mandate notice. A payout comes from fund cash that no deposit
 * is waiting on; a fund short of cash sells pro-rata at market to meet it.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, data?: unknown): CommandResult => ({ ok: false, error, ...(data !== undefined ? { data } : {}) });

/** The day-close flows skip gating while a fund is frozen, winding, in its breaker, or waiting out a mandate notice. */
export function gateFree(f: Fund, tick: number): boolean {
  return f.status !== 'open' || tick < f.breakerUntil || f.pendingMandate !== null;
}

export function requestDeposit(g: GameState, pid: string, f: Fund, amount: number, out: StepOutput | null): CommandResult {
  const err = depositRefusal(g, f, pid, amount);
  if (err) return fail(err);
  transfer(g, pid, f.accountId, amount);
  f.requests.push({ id: requestSeq(f), kind: 'deposit', investorId: pid, amount, units: 0, tick: g.market.tick });
  say(g, out, pid, 'fund', 'info', { key: 'funds.deposit.requested', vars: { fund: f.name, amount: usd(amount) } });
  return ok({ fundId: f.id });
}

export function requestRedeem(g: GameState, pid: string, f: Fund, units: number, out: StepOutput | null): CommandResult {
  const err = redeemRefusal(g, f, pid, units);
  if (err) return fail(err);
  f.holders[pid] = (f.holders[pid] ?? 0) - units;
  if (f.holders[pid]! <= 1e-12) delete f.holders[pid];
  f.reserved[pid] = (f.reserved[pid] ?? 0) + units;
  f.requests.push({ id: requestSeq(f), kind: 'redeem', investorId: pid, amount: 0, units, tick: g.market.tick });
  say(g, out, pid, 'fund', 'info', { key: 'funds.redeem.requested', vars: { fund: f.name } });
  return ok({ fundId: f.id });
}

/** Cash in the fund that is not waiting for a deposit to settle: what payouts may use. */
export function freeCash(g: GameState, f: Fund): number {
  let pending = 0;
  for (const r of f.requests) if (r.kind === 'deposit') pending += r.amount;
  return Math.max(0, cashOf(g, f.accountId) - pending);
}

/**
 * The day-close settlement at the NAV of this close. Deposits first (units at the close price, FIFO), then the redemptions:
 * the gate caps the value settled today at 20% of AUM, pro-rata over the requests, and the rest waits for the next close.
 * A redemption within 2 real days of its holder's deposit pays the 1% early-exit fee, which stays in the fund.
 */
export function settleDay(g: GameState, f: Fund, out: StepOutput | null): void {
  const tick = g.market.tick;
  const nav = navOf(g, f);
  const units = unitsOf(f);
  const px = units > 0 ? nav / units : f.navPerUnit;
  if (!(px > 0)) return; // a wiped-out fund: nothing settles at a non-positive price (deposits and redemptions wait)

  const deposits = f.requests.filter((r) => r.kind === 'deposit');
  f.requests = f.requests.filter((r) => r.kind !== 'deposit');
  for (const d of deposits) {
    f.holders[d.investorId] = (f.holders[d.investorId] ?? 0) + d.amount / px;
    f.depositedTick[d.investorId] = tick;
    say(g, out, d.investorId, 'fund', 'gain', { key: 'funds.deposit.settled', vars: { fund: f.name, amount: usd(d.amount), nav: usd(px) } });
  }

  const reds = f.requests.filter((r) => r.kind === 'redeem');
  const requested = reds.reduce((s, r) => s + r.units * px, 0);
  const cap = gateFree(f, tick) ? Infinity : FUND_RULES.redeemGatePct * Math.max(0, nav);
  const ratio = requested <= cap ? 1 : cap / requested;
  for (const r of reds) {
    const exec = r.units * ratio;
    if (!(exec > 1e-9)) continue;
    f.reserved[r.investorId] = (f.reserved[r.investorId] ?? 0) - exec;
    if (f.reserved[r.investorId]! <= 1e-12) delete f.reserved[r.investorId];
    r.units -= exec;
    const value = exec * px;
    const early = tick - (f.depositedTick[r.investorId] ?? -Infinity) < FUND_TIME.earlyExitTicks;
    const fee = early ? value * FUND_RULES.earlyExitFeePct : 0;
    f.payable[r.investorId] = (f.payable[r.investorId] ?? 0) + value - fee;
    f.credited[r.investorId] = (f.credited[r.investorId] ?? 0) + value - fee;
    if (r.investorId === f.managerId) f.managerEntitled += value - fee;
    if (fee > 0) say(g, out, r.investorId, 'fund', 'warn', { key: 'funds.redeem.earlyFee', vars: { fund: f.name, fee: usd(fee) } });
    if (ratio < 1 && r.units > 1e-9) say(g, out, r.investorId, 'fund', 'warn', { key: 'funds.redeem.gated', vars: { fund: f.name, part: `${Math.round(ratio * 100)}%` } });
  }
  f.requests = f.requests.filter((r) => r.kind !== 'redeem' || r.units > 1e-9);
}

/**
 * Pay what is owed from fund cash that no deposit waits on, investors first (in the order they were owed), then the
 * manager's crystallized fees. The manager is paid only his own redemption and the fees; the custody counters record both.
 */
export function payOut(g: GameState, f: Fund, out: StepOutput | null): void {
  let avail = freeCash(g, f);
  for (const pid of Object.keys(f.payable)) {
    const owed = f.payable[pid]!;
    if (!(owed > 1e-9)) { delete f.payable[pid]; continue; }
    const pay = Math.min(owed, avail);
    if (!(pay > 1e-9)) continue;
    transfer(g, f.accountId, pid, pay);
    f.paidOut[pid] = (f.paidOut[pid] ?? 0) + pay;
    avail -= pay;
    if (owed - pay > 1e-9) f.payable[pid] = owed - pay; else delete f.payable[pid];
    if (pid === f.managerId) f.managerReceived += pay;
    say(g, out, pid, 'fund', 'gain', { key: 'funds.redeem.paid', vars: { fund: f.name, amount: usd(pay) } });
  }
  if (f.feePayable > 1e-9 && avail > 1e-9) {
    const pay = Math.min(f.feePayable, avail);
    transfer(g, f.accountId, f.managerId, pay);
    f.paidOut[f.managerId] = (f.paidOut[f.managerId] ?? 0) + pay;
    f.feePayable -= pay;
    if (f.feePayable <= 1e-9) f.feePayable = 0;
    f.managerReceived += pay;
    say(g, out, f.managerId, 'fund', 'gain', { key: 'funds.fee.paid', vars: { fund: f.name, amount: usd(pay) } });
  }
}

/**
 * The fund sells, pro-rata by value, enough of its long positions to cover what is owed and not paid. Market orders fill at
 * the next tick (the engine's normal impact and fees). It does not sell twice: a fund with open orders waits for them.
 */
export function raiseCash(g: GameState, f: Fund): void {
  const owed = Object.values(f.payable).reduce((s, v) => s + v, 0) + f.feePayable;
  const need = owed - freeCash(g, f);
  if (!(need > 1e-9)) return;
  const acct = g.market.accounts[f.accountId];
  if (!acct) return;
  if (g.market.orders.some((o) => o.status === 'open' && o.playerId === f.accountId)) return;
  const longs = Object.entries(acct.positions).filter(([, p]) => p.qty > 0);
  const value = longs.reduce((s, [id, p]) => s + p.qty * markOf(g.market, id), 0);
  if (!(value > 0)) return;
  const share = Math.min(1, (need * 1.02) / value);
  for (const [id, p] of longs) {
    const raw = p.qty * share;
    const def = g.market.config.assets.find((a) => a.id === id);
    if (!def) continue;
    const qty = def.assetClass === 'stock' ? Math.min(p.qty, Math.floor(raw + 1e-9)) : Math.min(p.qty, Math.floor(raw * 1e6) / 1e6);
    if (!(qty > 0)) continue;
    const r = placeOrder(g.market, { playerId: f.accountId, assetId: id, side: 'sell', type: 'market', qty, tif: 'gtc' });
    g.market = r.state;
  }
}

function markOf(world: WorldState, assetId: string): number {
  const i = world.config.assets.findIndex((a) => a.id === assetId);
  return i < 0 ? 0 : Math.exp(world.assets[i]!.lnP);
}

/**
 * S5 restitution comes from the manager's stake first: the stake's units are cancelled up to `value` at NAV. No cash moves, so
 * the fund's equity is unchanged and the other holders' share of it rises by what the stake gave up. Returns the value taken.
 */
export function cancelStake(g: GameState, f: Fund, value: number): number {
  const held = f.holders[f.managerId] ?? 0;
  const px = navPerUnitOf(g, f);
  if (!(value > 0) || !(px > 0) || held <= 0) return 0;
  const u = Math.min(held, value / px);
  f.holders[f.managerId] = held - u;
  if (f.holders[f.managerId]! <= 1e-12) delete f.holders[f.managerId];
  return u * px;
}

/** The notice and the notify helper, for the court and risk paths (one line to every holder). */
export function tellHolders(g: GameState, f: Fund, out: StepOutput | null, msg: { key: string; vars?: Record<string, string | number> }): void {
  const seen = new Set<string>([f.managerId, ...Object.keys(f.holders), ...Object.keys(f.reserved)]);
  for (const pid of seen) say(g, out, pid, 'fund', 'info', msg);
}

