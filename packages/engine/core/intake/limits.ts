import { sortBy } from '../order';
import { SortedMap } from '../sorted';
import { isSystemChannel, type RawIntent } from './types';

/**
 * 24 R07: per actor (own channels) the `perActor` lowest nonces; per operator under a mandate (per principal) its `perActor` lowest;
 * then per principal at most `perPrincipal`, the character's own first, then operators by ascending actorId. SYSTEM/NPC/ADMIN bypass.
 */
export function applyRateLimits(intents: readonly RawIntent[], perActor: number, perPrincipal: number): { kept: RawIntent[]; rejected: RawIntent[] } {
  const kept: RawIntent[] = [], rejected: RawIntent[] = [];
  const byPrincipal = new SortedMap<string, SortedMap<string, RawIntent[]>>();
  for (const i of intents) {
    if (isSystemChannel(i.channel)) { kept.push(i); continue; }
    const principal = i.onBehalfOf ?? i.actorId;
    const m = byPrincipal.get(principal) ?? new SortedMap<string, RawIntent[]>();
    m.set(i.actorId, [...(m.get(i.actorId) ?? []), i]); byPrincipal.set(principal, m);
  }
  for (const [principal, actors] of byPrincipal) {
    const order = sortBy([...actors.keys()], (a) => [a === principal ? 0 : 1, a]);
    let budget = perPrincipal;
    for (const a of order) {
      const run = sortBy(actors.get(a)!, (i) => [i.nonce, i.intentId]);
      const n = Math.min(perActor, run.length, budget < 0 ? 0 : budget);
      kept.push(...run.slice(0, n)); rejected.push(...run.slice(n)); budget -= n;
    }
  }
  return { kept: sortBy(kept, (i) => [i.intentId]), rejected: sortBy(rejected, (i) => [i.intentId]) };
}
