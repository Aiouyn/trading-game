import { LP, NPC, TPD } from './constants';
import { formulaCashAt } from './curve';
import type { LpToken } from './types';

/**
 * The NPC demand of a token (lead-launchpad.md L6.1, as amended by v1.2). NPC buying answers the buzz ARRIVALS, not the buzz stock:
 * a launch's buzz, a viral shock and a buzz item each add demand (dollars). v1.2 (L6.4) the cohort buys the whole arrival in the
 * tick it arrives (absorb.ts), so no player can act between the arrival and the fill; v1.2 (L6.5) a player's buy is not an arrival;
 * v1.2 (L6.6) one arrival is capped at the cash that takes the curve to graduation from its current point. An arrival also resets
 * the cohort's reference peak to the buzz now, so the capitulation (flow.ts) measures the fade from the last arrival. Pure, and free
 * of imports that would cycle back to launch.ts.
 */

/** The buzz of a token now: the base hype and the two promo parts. */
export function buzzOf(t: LpToken): number {
  return t.buzz.base + t.buzz.board + t.buzz.wire;
}

/**
 * The most dollars one arrival may put into the curve (L6.6): the spend (fee included) that takes the curve from its current token
 * reserve to graduation. The curve's cash to graduation is the formula's cash at the graduation reserve less the cash now; the spend
 * that pays it is that cash over (1 - FEE_RATE), plus one cent so the rounding of the fee cannot leave the fill a few tokens short
 * (quoteBuy clips a fill that reaches the graduation reserve to exactly that reserve, so the buy never overshoots it).
 */
export function arrivalCap(t: LpToken): number {
  const cashToGrad = formulaCashAt(LP.GRAD_Y) - formulaCashAt(t.y);
  return cashToGrad > 0 ? cashToGrad / (1 - LP.FEE_RATE) + 0.01 : 0;
}

/**
 * The viral hazard of a live token (lead-launchpad.md L6.7, v1.3): the chance of one shock in a tick, at the token's age. The rate is
 * VIRAL_PER_DAY shocks per game day at launch and falls as exp(-age / VIRAL_TAU_DAYS), with age in game days, so a token's virality
 * is front-loaded. The chance is the rate over a tick (the per-tick draw of flow.ts).
 */
export function viralPerTick(ageTicks: number): number {
  const ageDays = Math.max(0, ageTicks) / TPD;
  return (NPC.VIRAL_PER_DAY / TPD) * Math.exp(-ageDays / NPC.VIRAL_TAU_DAYS);
}

/**
 * The share of a cohort's tokens sold per tick by the bleed alone (lead-launchpad.md L6.8, v1.3): a half-life of BLEED_HALF_TAU times
 * tau, so the cohort's holding halves in that time whatever the price. The capitulation and profit terms are added to it (flow.ts).
 */
export function bleedPerTick(): number {
  const halfLifeTicks = NPC.BLEED_HALF_TAU * NPC.VIRAL_TAU_DAYS * TPD;
  return 1 - Math.pow(0.5, 1 / halfLifeTicks);
}

/**
 * One arrival of `buzzAdd` buzz (already added to the token's buzz by the caller): the pending demand grows by the demand per unit of
 * buzz, capped at arrivalCap, and the peak restarts at the buzz now. A non-positive arrival does nothing. The caller then absorbs
 * the pending demand in the same tick (absorb.ts).
 */
export function arrive(t: LpToken, buzzAdd: number): void {
  if (!(buzzAdd > 0)) return;
  const demand = Math.min(buzzAdd * NPC.DEMAND_PER_BUZZ, arrivalCap(t));
  t.npcPending = (t.npcPending ?? 0) + demand;
  t.npcPeak = buzzOf(t);
}
