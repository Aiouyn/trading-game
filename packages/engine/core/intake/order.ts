import { sha256Concat } from '../crypto/sha256';
import { toHex } from '../crypto/hex';
import { cmpStr, sortBy } from '../order';
import { SortedMap } from '../sorted';
import type { RawIntent } from './types';

/** hex SHA-256('TYC/order' ‖ TickEntropy(N).value ‖ intentId) */
export function orderKeyOf(entropyValue: Uint8Array, intentId: string): string { return toHex(sha256Concat('TYC/order', entropyValue, intentId)); }

/** 02 §3.12 rule 3: per-actor runs in nonce order, placed at the actor's smallest orderKey. receivedSeq is never read. */
export function fairOrder(intents: readonly (RawIntent & { orderKey: string })[]): (RawIntent & { orderKey: string })[] {
  const groups = new SortedMap<string, (RawIntent & { orderKey: string })[]>();
  for (const i of intents) groups.set(i.actorId, [...(groups.get(i.actorId) ?? []), i]);
  const runs = [...groups].map(([actor, g]) => {
    const run = sortBy(g, (i) => [i.nonce, i.intentId]);
    let pos = run[0]!.orderKey; for (const i of run) if (cmpStr(i.orderKey, pos) < 0) pos = i.orderKey;
    return { actor, pos, run };
  });
  return sortBy(runs, (r) => [r.pos, r.actor]).flatMap((r) => r.run);
}
