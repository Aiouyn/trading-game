// T02-06: stream seeding (02 §3.10.2) and lazy per-tick entropy mixing (02 §3.10.3); RngStream shape of 02 §2.7.
import { sha256, sha256Concat } from '../crypto/sha256';
import { utf8 } from '../crypto/hex';
import type { Tick } from '../types';
import { xoNext } from './xoshiro';

export type RootKind = 'PUBLIC' | 'SECRET';
export interface RngStreamState { key: string; keyHash: Uint32Array; root: RootKind; s: Uint32Array; epoch: number; lastMixedTick: number; draws: bigint }

const ZERO_FIX = 0x9e3779b9;
const SEED_WARMUP = 8, MIX_DISCARD = 4;

/** 4 little-endian uint32 words of bytes[0..16). */
function le4(b: Uint8Array): Uint32Array {
  const w = new Uint32Array(4);
  for (let i = 0; i < 4; i++) w[i] = (b[4 * i]! | (b[4 * i + 1]! << 8) | (b[4 * i + 2]! << 16) | (b[4 * i + 3]! << 24)) >>> 0;
  return w;
}
const allZero = (s: Uint32Array): boolean => s[0] === 0 && s[1] === 0 && s[2] === 0 && s[3] === 0;

/** Seed state from (epochRoot, key) only, so adding a stream never changes another (02 §3.10.2). The 8 warm-up outputs are not draws. */
export function seedStream(key: string, root: RootKind, epochRoot: Uint8Array, epoch: number): RngStreamState {
  const s = le4(sha256Concat('TYC/rng', epochRoot, key));
  if (allZero(s)) s[0] = ZERO_FIX;
  for (let i = 0; i < SEED_WARMUP; i++) xoNext(s);
  return { key, keyHash: le4(sha256(utf8(key))), root, s, epoch, lastMixedTick: -1, draws: 0n };
}

/** XOR the tick's entropy words 0..3 and the key hash into s, fix all-zero, discard 4 outputs (not counted as draws). */
export function mixEntropy(st: RngStreamState, tick: Tick, entropyWords: Uint32Array): void {
  for (let i = 0; i < 4; i++) st.s[i] = (st.s[i]! ^ entropyWords[i]! ^ st.keyHash[i]!) >>> 0;
  if (allZero(st.s)) st.s[0] = ZERO_FIX;
  for (let i = 0; i < MIX_DISCARD; i++) xoNext(st.s);
  st.lastMixedTick = tick;
}
