import { cmpStr, sortBy } from '../order';
import { SortedSet } from '../sorted';
import type { RawIntent } from './types';

export interface GatewayBatch { gatewayId: string; forTick: number; intents: RawIntent[]; closedAtMs: number }

/**
 * Batches for `tick` closed within the grace are taken; a late one is rolled whole into N+1 (never split).
 * SPEC GAP: batches whose forTick is not `tick` are neither taken nor rolled (the card does not say); they are ignored.
 */
export function assembleTickBatch(tick: number, batches: readonly GatewayBatch[], sealedAtMs: number, graceMs: number):
  { intake: RawIntent[]; rolledToNext: GatewayBatch[]; lateGateways: string[] } {
  const intake: RawIntent[] = [], rolledToNext: GatewayBatch[] = [], late = new SortedSet<string>();
  for (const b of batches) {
    if (b.forTick !== tick) continue;
    if (b.closedAtMs <= sealedAtMs + graceMs) intake.push(...b.intents);
    else { rolledToNext.push(b); late.add(b.gatewayId); }
  }
  return {
    intake: sortBy(intake, (i) => [i.intentId, i.actorId, i.nonce]),
    rolledToNext: sortBy(rolledToNext, (b) => [b.gatewayId, b.closedAtMs]),
    lateGateways: [...late].sort(cmpStr),
  };
}
