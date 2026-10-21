import { sha256Concat } from '../crypto/sha256';
import { u48be } from '../crypto/hex';

export interface TickEntropy { tick: number; value: Uint8Array; words: Uint32Array }

/** 02 §3.11.2: value = SHA-256('TYC/tick-entropy' ‖ worldId ‖ u48be(N) ‖ e(N) ‖ intentsRoot ‖ prevWorldHash). */
export function deriveTickEntropy(worldId: string, tick: number, eN: Uint8Array, intentsRoot: Uint8Array, prevWorldHash: Uint8Array): TickEntropy {
  const value = sha256Concat('TYC/tick-entropy', worldId, u48be(tick), eN, intentsRoot, prevWorldHash);
  const words = new Uint32Array(8);
  for (let i = 0; i < 8; i++) words[i] = ((value[4 * i]! << 24) | (value[4 * i + 1]! << 16) | (value[4 * i + 2]! << 8) | value[4 * i + 3]!) >>> 0;
  return { tick, value, words };
}
/** SHA-256('TYC/fallback' ‖ prevTickHash) (02 §3.11.1). */
export function fallbackEntropy(prevTickHash: Uint8Array): Uint8Array { return sha256Concat('TYC/fallback', prevTickHash); }
/** 02 §3.21: SHA-256(localSeed ‖ N). SPEC GAP: N's byte encoding is not given; u48be (the tick width used by ids) is assumed. */
export function localSeedEntropy(localSeed: Uint8Array, tick: number): Uint8Array { return sha256Concat(localSeed, u48be(tick)); }
