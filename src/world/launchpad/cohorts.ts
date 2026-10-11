import type { LpToken, NpcCohort } from './types';

/**
 * The NPC cohorts of a token (lead-launchpad.md L6.8, v1.3). Each arrival the cohort buys (a launch's buzz, a viral shock, a buzz item,
 * the sniper's entry) is one cohort: its tokens, the cash they cost and the tick they were bought. The token's npcBal and npcCost are
 * the sums over the cohorts, so the rest of the module (liquidation, graduation, the gate) reads the same totals as before.
 *
 * A snapshot from before v1.3 has no cohorts, and a test or an old record may set npcBal or npcCost directly. In either case the
 * cohorts are rebuilt as one cohort of the whole holding (from the token's launch tick), so the totals are always the truth.
 */

/** The cohorts of a token, rebuilt from its totals when they do not agree with them. Oldest first. */
export function cohortsOf(t: LpToken): NpcCohort[] {
  const cs = t.npcCohorts;
  if (cs) {
    let tokens = 0;
    let cost = 0;
    for (const c of cs) {
      tokens += c.tokens;
      cost += c.cost;
    }
    if (tokens === t.npcBal && Math.abs(cost - t.npcCost) < 1e-6) return cs;
  }
  const rebuilt: NpcCohort[] = t.npcBal > 0 ? [{ tick: t.createdTick, tokens: t.npcBal, cost: t.npcCost }] : [];
  t.npcCohorts = rebuilt;
  return rebuilt;
}

/** Adds one arrival's buy to the cohorts (the buy is a whole number of tokens; its cost is the cash paid, fee excluded). */
export function addCohort(t: LpToken, tick: number, tokens: number, cost: number): void {
  const cs = cohortsOf(t);
  if (tokens > 0) cs.push({ tick, tokens, cost });
  syncTotals(t, cs);
}

/**
 * Takes tokens out of the cohorts and returns the cost basis they carried. With a plan (one count per cohort, the sum equal to the
 * tokens taken) each cohort gives exactly its planned count; without one the oldest cohorts go first. The cost leaves each cohort
 * pro rata to the tokens it gives up.
 */
export function takeFromCohorts(t: LpToken, tokens: number, plan?: number[]): number {
  const cs = cohortsOf(t);
  let removed = 0;
  if (plan) {
    cs.forEach((c, i) => {
      removed += takeOne(c, Math.min(c.tokens, Math.max(0, plan[i] ?? 0)));
    });
  } else {
    let rem = tokens;
    for (const c of cs) {
      if (rem <= 0) break;
      const take = Math.min(rem, c.tokens);
      removed += takeOne(c, take);
      rem -= take;
    }
  }
  const kept = cs.filter((c) => c.tokens > 0);
  syncTotals(t, kept);
  return removed;
}

function takeOne(c: NpcCohort, take: number): number {
  if (!(take > 0) || !(c.tokens > 0)) return 0;
  const per = c.cost / c.tokens;
  const out = per * take;
  c.tokens -= take;
  c.cost = Math.max(0, c.cost - out);
  return out;
}

/** The token's totals from the cohorts. */
function syncTotals(t: LpToken, cs: NpcCohort[]): void {
  t.npcCohorts = cs;
  let tokens = 0;
  let cost = 0;
  for (const c of cs) {
    tokens += c.tokens;
    cost += c.cost;
  }
  t.npcBal = tokens;
  t.npcCost = cost;
}
