import { ANALYST_TIERS, DESK, WEEK_DAYS, type AnalystTier } from '@/content/learning';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { overhead, spendableCash, today } from './core';
import { say } from './say';
import { usd } from './text/template';
import type { CommandResult, GameState, Player, StepOutput } from './types';

/**
 * The hired analyst and the Research Desk (D-19). Salary and upkeep are paid a game week ahead: at the hire (or unlock)
 * day, and then each week on its anniversary, from spendable cash only (restricted cash cannot pay). No refund. When the
 * cash is short at a due day, the analyst leaves or the desk locks, with one inbox line and no debt. The desk's files are
 * kept while it is locked, and resuming costs one week's upkeep.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

const tierName = (t: AnalystTier): string => (t === 'junior' ? 'Junior' : 'Senior');
const rankName = (id: string): string => RANKS.find((r) => r.id === id)?.name ?? id;

/** Hire an analyst at the chosen tier: one at a time; the first week is paid now. */
export function hireAnalyst(g: GameState, p: Player, tier: AnalystTier, out: StepOutput | null): CommandResult {
  const spec = ANALYST_TIERS[tier];
  if (!spec) return fail('unknown analyst tier');
  if (rankIndex(p.rankId) < rankIndex(spec.minRank)) return fail(`analysts open at ${rankName(spec.minRank)}`);
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

/** Unlock the Research Desk once at Operator: the one-time fee and the first week's upkeep, both now. */
export function unlockDesk(g: GameState, p: Player, out: StepOutput | null): CommandResult {
  if (rankIndex(p.rankId) < rankIndex(DESK.minRank)) return fail(`the Research Desk opens at ${rankName(DESK.minRank)}`);
  if (p.desk) return fail(p.desk.lapsed ? 'the desk is locked: resume it instead' : 'the desk is already unlocked');
  const total = DESK.unlockCost + DESK.weeklyUpkeep;
  if (spendableCash(g, p.id) < total) return fail('not enough spendable cash to unlock the desk');
  overhead(g, p.id, total, 'research desk');
  const d = today(g);
  p.desk = { unlockedDay: d, paidThroughDay: d + WEEK_DAYS, lapsed: false };
  say(g, out, p.id, 'work', 'brass', { key: 'work.desk.unlocked', vars: { unlock: usd(DESK.unlockCost), upkeep: usd(DESK.weeklyUpkeep) } });
  return ok(p.desk);
}

/** Resume a locked desk: one week's upkeep now. The unlock fee is not paid again. */
export function resumeDesk(g: GameState, p: Player, out: StepOutput | null): CommandResult {
  if (!p.desk) return fail('the desk is not unlocked');
  if (!p.desk.lapsed) return fail('the desk is not locked');
  if (rankIndex(p.rankId) < rankIndex(DESK.minRank)) return fail(`the Research Desk opens at ${rankName(DESK.minRank)}`);
  if (spendableCash(g, p.id) < DESK.weeklyUpkeep) return fail('not enough spendable cash for the week');
  overhead(g, p.id, DESK.weeklyUpkeep, 'research desk');
  p.desk = { ...p.desk, paidThroughDay: today(g) + WEEK_DAYS, lapsed: false };
  say(g, out, p.id, 'work', 'brass', { key: 'work.desk.resumed', vars: { upkeep: usd(DESK.weeklyUpkeep) } });
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
      if (spendableCash(g, p.id) >= DESK.weeklyUpkeep) {
        overhead(g, p.id, DESK.weeklyUpkeep, 'research desk');
        p.desk = { ...p.desk, paidThroughDay: p.desk.paidThroughDay + WEEK_DAYS };
      } else {
        p.desk = { ...p.desk, lapsed: true };
        say(g, out, p.id, 'work', 'warn', { key: 'work.desk.lapsed', vars: { upkeep: usd(DESK.weeklyUpkeep) } });
      }
    }
  }
}
