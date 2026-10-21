import { sha256Concat } from '../crypto/sha256';
import { u32be } from '../crypto/hex';
import { sortBy } from '../order';

/** u53 of SHA-256(e(N) ‖ domain ‖ sorted ids joined '|' ‖ u32be(index)) / 2^53, in [0, 1). */
export function partyRollU(eN: Uint8Array, rollDomain: string, subjectIds: readonly string[], rollIndex: number): number {
  const d = sha256Concat(eN, rollDomain, sortBy(subjectIds, (s) => [s]).join('|'), u32be(rollIndex));
  let v = 0n; for (let i = 0; i < 7; i++) v = (v << 8n) | BigInt(d[i]!);
  return Number(v >> 3n) / 9007199254740992;
}
