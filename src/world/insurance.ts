import { openAccount } from '@/engine';
import { LIFE_BY_ID, resaleValue } from '@/content/lifestyle';
import { TPD, cashOf, credit, debit, notify, spendableCash, transfer, playerBusinesses } from './core';
import { businessSalePrice } from './assets';
import { entriesOf } from './cyber';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import type { CommandResult, GameState, InsuranceState, StepOutput } from './types';

/**
 * One-switch insurance (lead-phase6.md 6D, bible 01 §6 and 03): a single Settings/Security toggle.
 *
 * Covers the insured value of collectibles (lifestyle items at resale) and shops (businesses at sale value). Premium: 0.4% of
 * the insured value per real week, a sink. A claim (`insuredLoss`, from a loss source: a hack drain, a shop fire or theft, a
 * collectible theft) pays from the NPC insurer's account as a transfer, never as a faucet. The payout is the loss less a 10%
 * deductible, capped at 80% of the loss, and never more than the insurer holds. The switch cannot go on during an active
 * breach or within 24 real hours after one.
 *
 * Booked: the premium is a sink ("insurance premium"); the insurer's starting capital is one faucet ("insurer capital") when the
 * first policy goes on; a payout is a transfer, so the money identity holds without a sink. Every loss source books its own
 * loss as a sink where it occurs; this module only moves the payout.
 */

export const INSURANCE = {
  premiumRate: 0.004,
  deductible: 0.1,
  payoutCap: 0.8,
  breachLockTicks: 24 * TPD,
  insurerId: 'npc:insurer',
  insurerCapital: 2_000_000,
} as const;

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

const cents = (x: number): number => Math.round(x * 100) / 100;

/** The insured value of a player: collectibles at resale plus shops at sale value. Consumed experiences insure to nothing. */
export function insuredValue(g: GameState, pid: string): number {
  const p = g.players[pid];
  if (!p) return 0;
  let v = 0;
  for (const o of p.lifestyle) {
    const item = LIFE_BY_ID.get(o.itemId);
    if (!item || item.cls === 'consumed') continue;
    v += resaleValue(item, o.paid, (g.market.tick - o.boughtTick) / TPD, g.collectibles);
  }
  for (const b of playerBusinesses(g, pid)) v += businessSalePrice(b.invested);
  return cents(v);
}

/** Whether the player has a hostile session open on them right now. */
export function inBreach(g: GameState, pid: string): boolean {
  return entriesOf(g, pid).some((e) => !!e.hostile);
}

/** The reason the switch cannot go on now, or null when it can. */
export function insuranceBlock(g: GameState, pid: string): string | null {
  if (inBreach(g, pid)) return 'You are in an active breach. Insurance cannot be switched on during one. Close the session, then try again.';
  const at = g.cyber.breachedAt?.[pid];
  if (at !== undefined && g.market.tick - at < INSURANCE.breachLockTicks) {
    return 'You were breached within the last 24 hours. Insurance opens 24 hours after the last breach. Wait, then switch it on.';
  }
  return null;
}

function ensureInsurer(g: GameState): void {
  if (g.market.accounts[INSURANCE.insurerId]) return;
  g.market = openAccount(g.market, INSURANCE.insurerId, 0);
  credit(g, INSURANCE.insurerId, INSURANCE.insurerCapital, 'insurer capital');
}

/** Switch the policy on or off. Switching on is refused during a breach or the 24 hours after one; off is always allowed. */
export function setInsurance(g: GameState, pid: string, on: boolean, out: StepOutput | null = null): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('No player account. Join the world first.');
  const cur: InsuranceState = p.insurance ?? { on: false, sinceTick: -1, premiums: 0, paidOut: 0 };
  if (on === cur.on) return ok({ on });
  if (on) {
    const block = insuranceBlock(g, pid);
    if (block) return fail(block);
    ensureInsurer(g);
    p.insurance = { on: true, sinceTick: g.market.tick, premiums: cur.premiums, paidOut: cur.paidOut };
    notify(g, out, pid, { kind: 'system', tone: 'info', text: 'Insurance is on. The premium is 0.4% of your insured value each real week.', msg: { key: 'insurance.on' } });
  } else {
    p.insurance = { ...cur, on: false };
    notify(g, out, pid, { kind: 'system', tone: 'info', text: 'Insurance is off. Nothing is refunded and nothing new is covered.', msg: { key: 'insurance.off' } });
  }
  return ok({ on });
}

/**
 * The weekly premium, at each real week's start (stepGame). A policy that cannot pay its premium lapses, with a line to the
 * owner. The premium is a sink; no cash is ever taken past the owner's spendable cash.
 */
export function insuranceWeek(g: GameState, out: StepOutput | null): void {
  if (g.market.tick === 0 || g.market.tick % TOURNAMENT_WEEK_TICKS !== 0) return;
  for (const p of Object.values(g.players)) {
    if (p.npc || !p.insurance?.on) continue;
    const premium = cents(insuredValue(g, p.id) * INSURANCE.premiumRate);
    if (premium <= 0) continue;
    if (spendableCash(g, p.id) < premium) {
      p.insurance = { ...p.insurance, on: false };
      notify(g, out, p.id, { kind: 'system', tone: 'loss', text: 'Insurance lapsed: the weekly premium was more than your spendable cash.', msg: { key: 'insurance.lapsed' } });
      continue;
    }
    debit(g, p.id, premium, 'insurance premium');
    p.insurance = { ...p.insurance, premiums: p.insurance.premiums + premium };
  }
}

export interface InsuredLossResult {
  payout: number;
  covered: number;
}

/**
 * A claim for a loss the caller has already booked as a sink. Pays the policy's share from the NPC insurer as a transfer.
 * Nothing is paid without a policy in force, or when the insurer holds nothing.
 */
export function insuredLoss(g: GameState, pid: string, loss: number, cause: string, out: StepOutput | null = null): InsuredLossResult {
  const p = g.players[pid];
  if (!p || p.npc || !p.insurance?.on || !(loss > 0)) return { payout: 0, covered: 0 };
  const deductible = loss * INSURANCE.deductible;
  const covered = Math.max(0, loss - deductible);
  const capped = Math.min(covered, loss * INSURANCE.payoutCap);
  const insurerCash = cashOf(g, INSURANCE.insurerId);
  const payout = cents(Math.min(capped, insurerCash));
  if (payout <= 0) {
    notify(g, out, pid, { kind: 'system', tone: 'loss', text: `The insurer could not pay your ${cause} claim.`, msg: { key: 'insurance.unpaid', vars: { cause } } });
    return { payout: 0, covered };
  }
  transfer(g, INSURANCE.insurerId, pid, payout);
  p.insurance = { ...p.insurance, paidOut: p.insurance.paidOut + payout };
  notify(g, out, pid, { kind: 'system', tone: 'gain', text: `Insurance paid $${payout.toFixed(2)} on your ${cause} claim.`, msg: { key: 'insurance.paid', vars: { cause, amount: payout.toFixed(2) } } });
  return { payout, covered };
}
