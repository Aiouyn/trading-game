import { CHALLENGE_WEEKS_KEPT, GOAL_LADDER, LESSON_IDS } from '@/content/learning';
import { ensureLedger } from './ledger';
import { say } from './say';
import type { CommandResult, GameState, Player, StepOutput } from './types';

/**
 * Learn completion, the goal ladder and the weekly challenge's attempt record (Phase 3, section 4). A lesson's completion,
 * a goal and a claimed challenge week are kept on the player's server record, never in the browser. The goal ladder is
 * opt-in (off by default); its rungs are checked on the server and carry no cash reward, and none of them gates a rule.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

/**
 * Mark a lesson complete. Idempotent: a repeat is accepted and changes nothing.
 * Trust note: each lesson's check runs in the browser (src/components/apps/practice/lessonCheck.ts, in its own sandbox),
 * so the server accepts the learner's claim that the check passed. It checks the lesson id only. Completion carries no
 * reward and gates no rule, so the claim is recorded as progress and not as proof.
 */
export function completeLesson(p: Player, lessonId: string): CommandResult {
  if (!(LESSON_IDS as readonly string[]).includes(lessonId)) return fail('unknown lesson');
  p.lessons ??= [];
  if (!p.lessons.includes(lessonId)) p.lessons.push(lessonId);
  return ok({ lessons: p.lessons });
}

/** Turn the goal ladder on or off. Turning it off hides it; the rungs done stay done. */
export function setGoalsOptIn(p: Player, on: boolean): CommandResult {
  p.goals = { optIn: on, done: p.goals?.done ?? {} };
  return ok(p.goals);
}

/**
 * Claim this player's one weekly challenge attempt for an ISO week. Durable: a reload or a new page cannot reopen it.
 * It records only the week key. The week itself is not checked against the server clock (the client draws the week from
 * its own date), so a claim can only ever use up the claimant's own attempt.
 */
export function claimChallenge(p: Player, weekKey: string): CommandResult {
  if (!/^\d{4}-W\d{2}$/.test(weekKey)) return fail('unknown week');
  p.challengeWeeks ??= [];
  if (p.challengeWeeks.includes(weekKey)) return fail('already attempted this week');
  p.challengeWeeks.push(weekKey);
  if (p.challengeWeeks.length > CHALLENGE_WEEKS_KEPT) p.challengeWeeks.splice(0, p.challengeWeeks.length - CHALLENGE_WEEKS_KEPT);
  return ok({ challengeWeeks: p.challengeWeeks });
}

/** A rung's live reading from the same basis its check uses (the rank basis for net worth, peak positions for the hold rung). */
function rungReading(p: Player, rung: (typeof GOAL_LADDER)[number]): { value: number; target: number; unit: 'money' | 'count' } | null {
  if (rung.nw !== undefined) return { value: Math.max(0, p.markNetWorth ?? p.netWorth), target: rung.nw, unit: 'money' };
  if (rung.positions !== undefined) return { value: p.stats.maxPositions, target: rung.positions, unit: 'count' };
  return null;
}

/** Whether a rung's condition holds now (server-side, from the player's record and ledger). */
function rungMet(g: GameState, p: Player, rung: (typeof GOAL_LADDER)[number]): boolean {
  // the same basis as the rank (markNetWorth, refreshed just before this check), so a goal never ticks ahead of a rank-up
  if (rung.nw !== undefined) return (p.markNetWorth ?? p.netWorth) >= rung.nw;
  if (rung.profit) {
    if (p.stats.winningTrades > 0) return true;
    const L = ensureLedger(g, p.id);
    return !!L?.trips.some((t) => t.realizedPnl > 0);
  }
  if (rung.positions !== undefined) return p.stats.maxPositions >= rung.positions;
  return false;
}

/**
 * Check the ladder for an opted-in player: each rung is done once, when its condition first holds, and stays done. Rungs
 * are independent (a holding of three assets counts without any closed trade). Returns the rungs newly done.
 */
export function checkGoals(g: GameState, p: Player, out: StepOutput | null): string[] {
  if (!p.goals?.optIn || p.npc) return [];
  const fresh: string[] = [];
  for (const rung of GOAL_LADDER) {
    if (p.goals.done[rung.id] !== undefined) continue;
    if (!rungMet(g, p, rung)) continue;
    p.goals.done[rung.id] = g.market.tick;
    fresh.push(rung.id);
    say(g, out, p.id, 'system', 'brass', { key: `goal.done.${rung.id}` });
  }
  return fresh;
}

/** The most an open rung's bar can show before its check records it. */
const OPEN_CAP = 0.99;

/** One rung as the viewer sees it. `progress` is 0..1 and never reads full while the rung is open. */
export interface RungView {
  id: string;
  done: boolean;
  doneTick: number | null;
  /** 0..1: a done rung is 1; an open one is capped just below full until the next check records it */
  progress: number;
  /** the reading toward the target (net worth dollars or positions held); null for the profit rung */
  value: number | null;
  target: number | null;
  /** what value and target count: dollars, assets held, or null for the profit rung */
  unit: 'money' | 'count' | null;
}

/** The ladder as the viewer sees it: whether it is on, each rung with its progress, and the next rung. */
export function goalsView(g: GameState, p: Player): { optIn: boolean; rungs: RungView[]; next: string | null } {
  const done = p.goals?.done ?? {};
  const rungs: RungView[] = GOAL_LADDER.map((rung) => {
    const isDone = done[rung.id] !== undefined;
    const reading = rungReading(p, rung);
    if (!reading) return { id: rung.id, done: isDone, doneTick: done[rung.id] ?? null, progress: isDone ? 1 : 0, value: null, target: null, unit: null };
    const ratio = Math.min(1, Math.max(0, reading.value / reading.target));
    // an open rung stays just short of full: the reading can cross its target between two checks
    const progress = isDone ? 1 : Math.min(ratio, OPEN_CAP);
    return { id: rung.id, done: isDone, doneTick: done[rung.id] ?? null, progress, value: Math.min(reading.value, reading.target), target: reading.target, unit: reading.unit };
  });
  return { optIn: !!p.goals?.optIn, rungs, next: rungs.find((r) => !r.done)?.id ?? null };
}
