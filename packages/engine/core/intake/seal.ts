import { canonEncode, canonHash } from '../canon';
import { toHex } from '../crypto/hex';
import { merkleRoot } from '../merkle';
import { sortBy } from '../order';
import { SortedMap, SortedSet } from '../sorted';
import type { TickEntropy } from '../entropy/tick-entropy';
import { applyRateLimits } from './limits';
import { fairOrder, orderKeyOf } from './order';
import { isSystemChannel, type EnvelopeReject, type EnvelopeRejectCode, type RawIntent, type SealedIntentFull } from './types';

export interface NonceBook { last(actorId: string): bigint | undefined }
export interface SealInput { tick: number; raw: readonly RawIntent[]; nonces: NonceBook;
  limits: { maxAgeTicks: number; perActor: number; perPrincipal: number }; knownKinds: (kind: string) => boolean;
  schemaOk: (kind: string, payload: unknown) => boolean }
export interface EnvelopeOutput { accepted: RawIntent[]; rejected: EnvelopeReject[]; nextNonces: SortedMap<string, bigint>; intentsRoot: Uint8Array }

/**
 * The intentsRoot leaf: canonEncode of the intent without its gateway transport fields (receivedSeq, gatewayId).
 * SPEC GAP: T02-07 step 3 says "canonEncode of each sealed intent"; 02 AT 22 requires the root to be unchanged when receivedSeq and
 * gatewayId are permuted, so those two fields are left out of the leaf.
 */
export function intentLeaf(i: RawIntent): Uint8Array {
  const { receivedSeq: _r, gatewayId: _g, ...rest } = i;
  return canonEncode(rest);
}

/** Stage A (before entropy): envelope checks and the order-free intents root. */
export function checkEnvelopes(i: SealInput): EnvelopeOutput {
  const rejected: EnvelopeReject[] = [];
  const rej = (r: RawIntent, code: EnvelopeRejectCode): void => { rejected.push({ intentId: r.intentId, actorId: r.actorId, code, module: '02' }); };
  // canonical processing order: never the gateway order
  const raw = sortBy(i.raw, (r) => [r.intentId, r.actorId, r.nonce, toHex(canonHash(intentLeaf(r)))]);
  const seenIds = new SortedSet<string>();
  const survivors: RawIntent[] = [];
  for (const r of raw) {
    if (seenIds.has(r.intentId)) { rej(r, 'REJECT_REPLAY'); continue; }
    seenIds.add(r.intentId);
    if (!i.knownKinds(r.kind) || !i.schemaOk(r.kind, r.payload)) { rej(r, 'REJECT_SCHEMA'); continue; }
    if (!isSystemChannel(r.channel) && r.signatureValid === false) { rej(r, 'REJECT_SIGNATURE'); continue; }
    if (r.clientTick < i.tick - i.limits.maxAgeTicks) { rej(r, 'REJECT_STALE'); continue; }
    survivors.push(r);
  }
  // replay: per actor, nonces strictly above the last sealed one and strictly increasing within the batch
  const nextNonces = new SortedMap<string, bigint>();
  const fresh: RawIntent[] = [];
  for (const r of sortBy(survivors, (x) => [x.actorId, x.nonce, x.intentId])) {
    if (isSystemChannel(r.channel)) { fresh.push(r); continue; }
    const floor = nextNonces.get(r.actorId) ?? i.nonces.last(r.actorId);
    if (floor !== undefined && r.nonce <= floor) { rej(r, 'REJECT_REPLAY'); continue; }
    nextNonces.set(r.actorId, r.nonce); fresh.push(r);
  }
  const { kept, rejected: limited } = applyRateLimits(fresh, i.limits.perActor, i.limits.perPrincipal);
  for (const r of limited) rej(r, 'REJECT_RATE_LIMIT');
  // nextNonces = max accepted nonce per actor
  const accepted = sortBy(kept, (r) => [r.intentId]);
  const finalNonces = new SortedMap<string, bigint>();
  for (const r of accepted) if (!isSystemChannel(r.channel)) { const p = finalNonces.get(r.actorId); if (p === undefined || r.nonce > p) finalNonces.set(r.actorId, r.nonce); }
  return { accepted, rejected: sortBy(rejected, (r) => [r.intentId, r.code]), nextNonces: finalNonces, intentsRoot: merkleRoot(accepted.map(intentLeaf)) };
}

/** Stage B (after TickEntropy(N) is derived from intentsRoot): orderKeys and fair processing order. */
export function sealTick(accepted: readonly RawIntent[], tick: number, entropy: TickEntropy): SealedIntentFull[] {
  const keyed = accepted.map((r) => ({ ...r, orderKey: orderKeyOf(entropy.value, r.intentId) }));
  return fairOrder(keyed).map((r) => ({ ...r, tick }));
}
