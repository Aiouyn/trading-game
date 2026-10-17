import type { Msg } from '@/i18n';
import { ANALYST_TIERS, DESK, WEEK_DAYS, type AnalystTier } from '@/content/learning';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { overhead, spendableCash, today } from './core';
import { say } from './say';
import { usd } from './text/template';
import type { CommandResult, GameState, Player, StepOutput } from './types';

/**
 * The hired analyst and the Research Desk (D-19). Salary is paid a game week ahead: at the hire day, and then each week on its anniversary. The Research Desk is a
 * subscription: a free trial from the unlock, then a monthly fee on each period's anniversary (R-10-7). Both come from
 * spendable cash only (restricted cash cannot pay). No refund. When the cash is short at a due day, the analyst leaves or
 * the desk locks, with one inbox line and no debt. The desk's files are kept while it is locked, and resuming costs a month.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, msg?: Msg): CommandResult => ({ ok: false, error, ...(msg ? { msg } : {}) });

const tierName = (t: AnalystTier): string => (t === 'junior' ? 'Junior' : 'Senior');
const rankName = (id: string): string => RANKS.find((r) => r.id === id)?.name ?? id;

/** Hire an analyst at the chosen tier: one at a time; the first week is paid now. */
export function hireAnalyst(g: GameState, p: Player, tier: AnalystTier, out: StepOutput | null): CommandResult {
  const spec = ANALYST_TIERS[tier];
  if (!spec) return fail('unknown analyst tier');
  if (rankIndex(p.rankId) < rankIndex(spec.minRank)) return fail(`analysts open at ${rankName(spec.minRank)}`, { key: 'work.refuse.analystRank', vars: { rank: `@rank.${spec.minRank}` } });
  if (p.analyst) return fail('you already have an analyst: let them go first');
  if (spendableCash(g, p.id) < spec.weeklyCost) return fail('not enough spendable cash for the first week');
  overhead(g, p.id, spec.weeklyCost, 'analyst salary');
  const d = today(g);
  p.analyst = { tier, hiredDay: d, paidThroughDay: d + WEEK_DAYS };
  say(g, out, p.id, 'work', 'info', { key: 'work.analyst.hired', vars: { tier: tierName(tier), cost: usd(spec.weeklyCost) } });
  return ok(p.analyst);
}

/** Let the analyst go. The week already paid is not refunded. */
export function fireAnalyst(g: GameState, p: Player, out: StepOutput | null): CommandResult {
  if (!p.analyst) return fail('you have no analyst');
  p.analyst = null;
  say(g, out, p.id, 'work', 'info', { key: 'work.analyst.fired' });
  return ok();
}

/**
 * Start the Research Desk trial (R-10-7): free for `trialDays`, no charge now. The first monthly fee is due when the trial ends
 * (workDay), so a player who does not want the desk simply lets the trial lapse without paying.
 */
export function unlockDesk(g: GameState, p: Player, out: StepOutput | null): CommandResult {
  if (rankIndex(p.rankId) < rankIndex(DESK.minRank)) return fail(`the Research Desk opens at ${rankName(DESK.minRank)}`, { key: 'desk.refuse.opensAt', vars: { rank: `@rank.${DESK.minRank}` } });
  if (p.desk) return fail(p.desk.lapsed ? 'the desk is locked: resume it instead' : 'the desk is already unlocked');
  const d = today(g);
  p.desk = { unlockedDay: d, paidThroughDay: d + DESK.trialDays, lapsed: false };
  say(g, out, p.id, 'work', 'brass', { key: 'work.desk.unlocked', vars: { days: DESK.trialDays, fee: usd(DESK.monthlyFee) } });
  return ok(p.desk);
}

/** Resume a locked desk: the month's fee now, and the next month from today. */
export function resumeDesk(g: GameState, p: Player, out: StepOutput | null): CommandResult {
  if (!p.desk) return fail('the desk is not unlocked');
  if (!p.desk.lapsed) return fail('the desk is not locked');
  if (rankIndex(p.rankId) < rankIndex(DESK.minRank)) return fail(`the Research Desk opens at ${rankName(DESK.minRank)}`, { key: 'desk.refuse.opensAt', vars: { rank: `@rank.${DESK.minRank}` } });
  if (spendableCash(g, p.id) < DESK.monthlyFee) return fail('not enough spendable cash for the month');
  overhead(g, p.id, DESK.monthlyFee, 'research desk');
  p.desk = { ...p.desk, paidThroughDay: today(g) + DESK.periodDays, lapsed: false };
  say(g, out, p.id, 'work', 'brass', { key: 'work.desk.resumed', vars: { fee: usd(DESK.monthlyFee) } });
  return ok(p.desk);
}

/**
 * The due checks, once per game day (stepGame's day boundary): pay each due week from spendable cash, or lapse. An analyst
 * who cannot be paid leaves; a desk that cannot be paid locks. Each lapse writes one line and no debt is kept.
 */
export function workDay(g: GameState, out: StepOutput | null): void {
  const d = today(g);
  for (const p of Object.values(g.players)) {
    if (p.npc) continue;
    if (p.analyst && d >= p.analyst.paidThroughDay) {
      const cost = ANALYST_TIERS[p.analyst.tier].weeklyCost;
      if (spendableCash(g, p.id) >= cost) {
        overhead(g, p.id, cost, 'analyst salary');
        p.analyst = { ...p.analyst, paidThroughDay: p.analyst.paidThroughDay + WEEK_DAYS };
      } else {
        p.analyst = null;
        say(g, out, p.id, 'work', 'warn', { key: 'work.analyst.lapsed', vars: { cost: usd(cost) } });
      }
    }
    if (p.desk && !p.desk.lapsed && d >= p.desk.paidThroughDay) {
      if (spendableCash(g, p.id) >= DESK.monthlyFee) {
        overhead(g, p.id, DESK.monthlyFee, 'research desk');
        p.desk = { ...p.desk, paidThroughDay: p.desk.paidThroughDay + DESK.periodDays };
        say(g, out, p.id, 'work', 'info', { key: 'work.desk.billed', vars: { fee: usd(DESK.monthlyFee) } });
      } else {
        p.desk = { ...p.desk, lapsed: true };
        say(g, out, p.id, 'work', 'warn', { key: 'work.desk.lapsed', vars: { fee: usd(DESK.monthlyFee) } });
      }
    }
  }
}
