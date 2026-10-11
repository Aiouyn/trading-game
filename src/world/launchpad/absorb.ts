import type { StepOutput, GameState } from '../types';
import type { LpToken } from './types';
import { buyCurve } from './trade';

/**
 * The instant absorption of NPC demand (lead-launchpad.md L6.4, v1.2). A buzz arrival (a launch, a viral shock, a buzz item) is bought
 * by the NPC cohort in full in the tick it arrives: the caller runs this right after the arrival, before any player can act. The
 * pending demand is what the arrival added (capped per arrival, demand.ts arrivalCap). The buy is one curve fill through the same
 * settlement as every NPC fill (trade.ts buyCurve, the npcRetail faucet). A refused fill (a buy too small to fill) keeps the demand
 * pending, so no demand vanishes unbooked. A fill that graduates the token ends the demand: a graduated token has no curve to buy.
 */
export function absorbPending(g: GameState, t: LpToken, out: StepOutput | null): void {
  const pending = t.npcPending ?? 0;
  // under a cent is not money: it is dropped, and a graduated token has no demand left
  if (t.status !== 'live' || !(pending * 100 >= 1)) {
    t.npcPending = 0;
    return;
  }
  const r = buyCurve(g, null, t.ticker, Math.round(pending * 100), 1, out, true);
  if (!r.ok) return;
  const spent = ((r.data as { spendCents: number }).spendCents ?? 0) / 100;
  const left = pending - spent;
  t.npcPending = t.status === 'live' && left >= 0.01 ? left : 0;
}
