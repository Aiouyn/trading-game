// T02-09: entity hashes, the partition-independent logicalStateHash term (19 Rule 3.6.6) and the partition stateHash Merkle (02 §3.6.3).
import { canonEncode } from '../canon';
import { concatBytes, sha256, sha256Concat } from '../crypto/sha256';
import { toHex } from '../crypto/hex';
import { cmpStr } from '../order';
import { KIND_TAG_ORDER, kindOf, type Id } from '../types';

/** SHA-256(canonEncode(entity)). */
export function entityHash(entity: unknown): Uint8Array { return sha256(canonEncode(entity)); }

export const MOD_2_256: bigint = 1n << 256n;
const u256 = (b: Uint8Array): bigint => BigInt(`0x${toHex(b)}`);
/** u256(SHA-256(id ‖ entityHash)), id UTF-8. */
export function logicalTerm(id: Id, eh: Uint8Array): bigint { return u256(sha256Concat(id, eh)); }
/** 64 lowercase hex chars of x mod 2^256. */
export function hex256(x: bigint): string { return (((x % MOD_2_256) + MOD_2_256) % MOD_2_256).toString(16).padStart(64, '0'); }

const ZERO = Uint8Array.of(0);
/** Leaf of the partition tree: sha256Concat(table, 0x00, id, 0x00, eh). */
export const partitionLeaf = (table: string, id: Id, eh: Uint8Array): Uint8Array => sha256Concat(table, ZERO, id, ZERO, eh);
const kindRank = (id: Id): number => { const i = KIND_TAG_ORDER.indexOf(kindOf(id)); return i < 0 ? KIND_TAG_ORDER.length : i; };
/** Leaf order: KIND_TAG_ORDER index of kindOf(id) (unknown kinds after, by kind), then table, then id (cmpStr). */
export function cmpLeaf(a: { table: string; id: Id }, b: { table: string; id: Id }): -1 | 0 | 1 {
  const ra = kindRank(a.id), rb = kindRank(b.id);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (ra === KIND_TAG_ORDER.length) { const c = cmpStr(kindOf(a.id), kindOf(b.id)); if (c !== 0) return c; }
  return cmpStr(a.table, b.table) || cmpStr(a.id, b.id);
}
/** T02-07 tree shape, implemented locally (card step 5): leaf sha256(0x00 ‖ leaf), node sha256(0x01 ‖ l ‖ r), odd node promoted;
 *  empty -> sha256('TYC/empty'). Input leaves must already be in cmpLeaf order. */
export function merkleOfLeaves(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256Concat('TYC/empty');
  let level = leaves.map((l) => sha256(concatBytes([ZERO, l])));
  while (level.length > 1) {
    const up: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) up.push(i + 1 < level.length ? sha256(concatBytes([Uint8Array.of(1), level[i]!, level[i + 1]!])) : level[i]!);
    level = up;
  }
  return level[0]!;
}
/** Merkle root over (table, id, eh), sorted by kindTag (KIND_TAG_ORDER of kindOf(id)), table, id. */
export function partitionMerkle(entries: readonly { table: string; id: Id; eh: Uint8Array }[]): Uint8Array {
  const sorted = [...entries].sort(cmpLeaf);
  return merkleOfLeaves(sorted.map((e) => partitionLeaf(e.table, e.id, e.eh)));
}
