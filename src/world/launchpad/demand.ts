import { NPC } from './constants';
import type { LpToken } from './types';

/**
 * The NPC demand of a token (lead-launchpad.md L6.1, fast pump and slow bleed). NPC buying answers the buzz ARRIVALS, not the buzz
 * stock: a launch's buzz, a viral shock, a buzz item and a copycat buy each add pending demand (dollars) that the cohort buys with
 * the buy half-life (flow.ts). An arrival also resets the cohort's reference peak to the buzz now, so the capitulation (flow.ts)
 * measures the fade from the last arrival, not from the launch. Pure, and free of imports that would cycle back to launch.ts.
 */

/** The buzz of a token now: the base hype and the two promo parts. */
export function buzzOf(t: LpToken): number {
  return t.buzz.base + t.buzz.board + t.buzz.wire;
}

/**
 * One arrival of `buzzAdd` buzz (already added to the token's buzz by the caller): the pending demand grows by the demand per unit
 * of buzz, and the peak restarts at the buzz now. A non-positive arrival does nothing.
 */
export function arrive(t: LpToken, buzzAdd: number): void {
  if (!(buzzAdd > 0)) return;
  t.npcPending = (t.npcPending ?? 0) + buzzAdd * NPC.DEMAND_PER_BUZZ;
  t.npcPeak = buzzOf(t);
}
