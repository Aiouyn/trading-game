import { openAccount, Rng, seedStream } from '@/engine';
import { LIFE_BY_ID, resaleValue } from '@/content/lifestyle';
import { TPD, cashOf, credit, debit, notify, playerBusinesses, spendableCash, transfer } from './core';
import { businessSalePrice } from './assets';
import { STRENGTHS, entriesOf } from './cyber';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import type { CommandResult, GameState, InsuranceState, StepOutput } from './types';

/**
 * One-switch insurance (lead-phase6.md 6D, bible 01 §6 and 03): a single Settings/Security toggle.
 *
 * Covers the insured value of collectibles (lifestyle items at resale) and shops (businesses at sale value). Premium: 0.4% of
 * the insured value per real week, a sink. Loss sources, rolled once per game day (`lossDay`): a hack drain (cash taken by an
 * open hostile session), a shop fire, a shop theft, and a collectible theft. Each loss is booked as a sink where it occurs;
 * a claim (`insuredLoss`) pays from the NPC insurer's account as a transfer, never as a faucet. The payout is the loss less
 * an excess of 10% of the insured value (the deductible), capped at 80% of the loss, and never more than the insurer holds.
 * The switch cannot go on during an active breach or within 24 real hours after one (a hostile session opening or closing
 * stamps the breach, see cyber.ts).
 *
 * The loss sources and the insurer exist only in a world whose first policy went on (`insuranceMarket`). Worlds that never
 * sold a policy draw no loss and keep their history: the loss stream is seeded lazily, so their state is unchanged.
 */

export const INSURANCE = {
  premiumRate: 0.004,
  /** the deductible: 10% of the insured value, taken off each claim (an excess; a share of the loss would never bind) */
  deductible: 0.1,
  /** the cap: a claim pays at most 80% of its loss */
  payoutCap: 0.8,
  breachLockTicks: 24 * TPD,
  insurerId: 'npc:insurer',
  insurerCapital: 2_000_000,
} as const;

/**
 * The loss sources: rates per real week (168 game days, so the daily chance is the weekly rate over 168) and shares of the
 * loss base. A hack drain is a daily share of net worth per open hostile session, scaled by the session's strength.
 */
export const LOSS = {
  hackDrainPerDay: 0.0001,
  fireRatePerWeek: 0.01,
  fireShare: 0.3,
  shopTheftRatePerWeek: 0.02,
  theftShare: 0.15,
  collectibleTheftRatePerWeek: 0.02,
  daysPerWeek: 7 * 24,
} as const;

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, data?: Record<string, number | string>): CommandResult => ({ ok: false, error, ...(data ? { data } : {}) });

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

/**
 * The reason the switch cannot go on now, or null when it can: a refusal code, with the hours to wait for the lockout.
 * Switching on needs something insured: a policy on nothing would only collect a zero premium.
 */
export function insuranceBlock(g: GameState, pid: string): { code: 'insBreach' | 'insLockout' | 'insNothing'; hours?: number } | null {
  if (inBreach(g, pid)) return { code: 'insBreach' };
  const at = g.cyber.breachedAt?.[pid];
  if (at !== undefined && g.market.tick - at < INSURANCE.breachLockTicks) {
    return { code: 'insLockout', hours: Math.ceil((INSURANCE.breachLockTicks - (g.market.tick - at)) / TPD) };
  }
  if (insuredValue(g, pid) <= 0) return { code: 'insNothing' };
  return null;
}

function ensureInsurer(g: GameState): void {
  g.insuranceMarket = true;
  if (g.market.accounts[INSURANCE.insurerId]) return;
  g.market = openAccount(g.market, INSURANCE.insurerId, 0);
  credit(g, INSURANCE.insurerId, INSURANCE.insurerCapital, 'insurer capital');
}

/**
 * Switch the policy on or off. Switching on is refused during a breach, the 24 hours after one, or with nothing insured; off
 * is always allowed. Refusals are codes (insBreach, insLockout with the hours, insNothing) that the client turns into copy.
 */
export function setInsurance(g: GameState, pid: string, on: boolean, out: StepOutput | null = null): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('noPlayer');
  const cur: InsuranceState = p.insurance ?? { on: false, sinceTick: -1, premiums: 0, paidOut: 0 };
  if (on === cur.on) return ok({ on });
  if (on) {
    const block = insuranceBlock(g, pid);
    if (block) return fail(block.code, block.hours !== undefined ? { hours: block.hours } : undefined);
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
 * A claim for a loss the caller has already booked as a sink. The covered part is the loss less the excess (10% of the
 * insured value, at claim time); the payout is that covered part capped at 80% of the loss, and never more than the insurer
 * holds. The payout is a transfer from the insurer. Nothing is paid without a policy in force.
 */
export function insuredLoss(g: GameState, pid: string, loss: number, cause: string, out: StepOutput | null = null): InsuredLossResult {
  const p = g.players[pid];
  if (!p || p.npc || !p.insurance?.on || !(loss > 0)) return { payout: 0, covered: 0 };
  const excess = cents(insuredValue(g, pid) * INSURANCE.deductible);
  const covered = Math.max(0, cents(loss - excess));
  const capped = Math.min(covered, cents(loss * INSURANCE.payoutCap));
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

/**
 * The loss sources, once per game day (securityDay), in a world whose insurance market is open. Every loss is booked as a
 * sink where it occurs, and a claim pays the insured part back as a transfer. The rolls draw from a seeded stream of their
 * own, with a fixed set of draws per player per day, so a replay of the same commands gives the same losses.
 */
export function lossDay(g: GameState, out: StepOutput | null): void {
  if (!g.insuranceMarket) return;
  g.rng.losses ??= seedStream(g.seed, 'world:losses');
  const rng = new Rng(g.rng.losses);
  const chance = (weeklyRate: number) => weeklyRate / LOSS.daysPerWeek;
  for (const p of Object.values(g.players)) {
    if (p.npc) continue;
    const pid = p.id;
    // hack drain: each open hostile session takes a share of net worth, scaled by its strength, from cash
    for (const e of entriesOf(g, pid)) {
      if (!e.hostile) continue;
      const drain = Math.min(cents(p.netWorth * LOSS.hackDrainPerDay * STRENGTHS[e.hostile.strength].m), spendableCash(g, pid));
      if (drain <= 0) continue;
      debit(g, pid, drain, 'hack drain');
      notify(g, out, pid, { kind: 'security', tone: 'loss', text: `A hostile session drained $${drain.toFixed(2)} from your cash.`, msg: { key: 'loss.hack', vars: { amount: drain.toFixed(2) } } });
      insuredLoss(g, pid, drain, 'hack drain', out);
    }
    // shop fire, then shop theft, per business
    for (const b of playerBusinesses(g, pid)) {
      const value = businessSalePrice(b.invested);
      const fire = rng.chance(chance(LOSS.fireRatePerWeek));
      const theft = rng.chance(chance(LOSS.shopTheftRatePerWeek));
      if (fire) {
        const loss = Math.min(cents(value * LOSS.fireShare), spendableCash(g, pid));
        if (loss > 0) {
          debit(g, pid, loss, 'shop fire');
          notify(g, out, pid, { kind: 'security', tone: 'loss', text: `A fire damaged one of your shops: $${loss.toFixed(2)} lost.`, msg: { key: 'loss.fire', vars: { amount: loss.toFixed(2) } } });
          insuredLoss(g, pid, loss, 'shop fire', out);
        }
      }
      if (theft) {
        const loss = Math.min(cents(value * LOSS.theftShare), spendableCash(g, pid));
        if (loss > 0) {
          debit(g, pid, loss, 'shop theft');
          notify(g, out, pid, { kind: 'security', tone: 'loss', text: `Thieves took $${loss.toFixed(2)} from one of your shops.`, msg: { key: 'loss.shopTheft', vars: { amount: loss.toFixed(2) } } });
          insuredLoss(g, pid, loss, 'shop theft', out);
        }
      }
    }
    // collectible theft: one owned collectible (not an experience) is taken. The item is an asset, not cash, so nothing is
    // booked as a sink here: the claim alone moves money (from the insurer), and an uninsured theft costs the item only.
    const owned = p.lifestyle.filter((o) => {
      const item = LIFE_BY_ID.get(o.itemId);
      return !!item && item.cls !== 'consumed';
    });
    if (owned.length && rng.chance(chance(LOSS.collectibleTheftRatePerWeek))) {
      const pick = owned[Math.floor(rng.uniform() * owned.length)]!;
      const item = LIFE_BY_ID.get(pick.itemId)!;
      const value = cents(resaleValue(item, pick.paid, (g.market.tick - pick.boughtTick) / TPD, g.collectibles));
      p.lifestyle = p.lifestyle.filter((o) => o.uid !== pick.uid);
      notify(g, out, pid, { kind: 'security', tone: 'loss', text: `${item.name} was stolen.`, msg: { key: 'loss.theft', vars: { item: item.name } } });
      insuredLoss(g, pid, value, 'collectible theft', out);
    }
  }
  g.rng.losses = rng.state();
}
