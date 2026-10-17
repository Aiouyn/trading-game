import type { StepOutput, GameState } from '../types';
import type { LpToken } from './types';
import { MICROFLOW, orderByTokenStream, spendableCents, tokenTraders } from './microflow';
import { buyCurve } from './trade';

/**
 * The instant absorption of NPC demand (lead-launchpad.md L6.4). The caller runs this in the tick the arrival lands, before any
 * player can act. With funded traders on, the arrival is split across that token's accounts in token-stream order. Each account
 * pays at most the cash it already holds. Dollars nobody can pay are dropped: npcPending ends at 0, so a later tick cannot mint
 * them. The isolated cohort harness (MICROFLOW off) still uses one faucet fill, and a curve refusal there keeps the demand.
 */
export function absorbPending(g: GameState, t: LpToken, out: StepOutput | null): void {
  const pending = t.npcPending ?? 0;
  if (t.status !== 'live' || !(pending * 100 >= 1)) {
    t.npcPending = 0;
    return;
  }
  if (!MICROFLOW.enabled) {
    const r = buyCurve(g, null, t.ticker, Math.round(pending * 100), 1, out, true);
    if (!r.ok) return;
    const spent = ((r.data as { spendCents: number }).spendCents ?? 0) / 100;
    const left = pending - spent;
    t.npcPending = t.status === 'live' && left >= 0.01 ? left : 0;
    return;
  }
  const ordered = orderByTokenStream(t, tokenTraders(g, t));
  let leftCents = Math.round(pending * 100);
  for (const w of ordered) {
    if (t.status !== 'live' || leftCents < 1) break;
    const slice = Math.min(leftCents, spendableCents(g, w));
    if (slice < 1) continue;
    const r = buyCurve(g, null, t.ticker, slice, 1, out, true, false, w, 'hold');
    if (!r.ok) continue;
    leftCents -= (r.data as { spendCents?: number }).spendCents ?? 0;
  }
  t.npcPending = 0;
}
