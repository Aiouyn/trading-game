import { GOAL_LADDER, LESSON_IDS } from '@/content/learning';
import { ensureLedger } from './ledger';
import { say } from './say';
import type { CommandResult, GameState, Player, StepOutput } from './types';

/**
 * Learn completion and the goal ladder (Phase 3, section 4). A lesson's completion is kept on the player's server record,
 * never in the browser. The goal ladder is opt-in (off by default); its rungs are checked on the server and carry no
 * cash reward, and none of them gates a rule.
 */

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

/** Mark a lesson complete. Idempotent: a repeat is accepted and changes nothing. */
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

/** Whether a rung's condition holds now (server-side, from the player's record and ledger). */
function rungMet(g: GameState, p: Player, rung: (typeof GOAL_LADDER)[number]): boolean {
  // the same basis as the rank (markNetWorth, refreshed just before this check), so a goal never ticks ahead of a rank-up
  if (rung.nw !== undefined) return (p.markNetWorth ?? p.netWorth) >= rung.nw;
  if (rung.profit) {
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

/** The ladder as the viewer sees it: whether it is on, each rung and whether it is done, and the next rung. */
export function goalsView(p: Player): { optIn: boolean; rungs: { id: string; done: boolean; doneTick: number | null }[]; next: string | null } {
  const done = p.goals?.done ?? {};
  const rungs = GOAL_LADDER.map((r) => ({ id: r.id, done: done[r.id] !== undefined, doneTick: done[r.id] ?? null }));
  return { optIn: !!p.goals?.optIn, rungs, next: rungs.find((r) => !r.done)?.id ?? null };
}
