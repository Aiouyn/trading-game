import { concatBytes, sha256, sha256Concat } from './crypto/sha256';
import { fromHex, toHex } from './crypto/hex';
import { EngineFault } from './types';

const leafHash = (l: Uint8Array): Uint8Array => sha256(concatBytes([Uint8Array.of(0), l]));
const nodeHash = (l: Uint8Array, r: Uint8Array): Uint8Array => sha256(concatBytes([Uint8Array.of(1), l, r]));

function nextLevel(level: Uint8Array[]): Uint8Array[] {
  const up: Uint8Array[] = [];
  for (let i = 0; i < level.length; i += 2) up.push(i + 1 < level.length ? nodeHash(level[i]!, level[i + 1]!) : level[i]!);
  return up;
}

/** leaf = sha256(0x00 ‖ leaf), node = sha256(0x01 ‖ l ‖ r), odd node promoted; empty -> sha256('TYC/empty'). */
export function merkleRoot(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256Concat('TYC/empty');
  let level = leaves.map(leafHash);
  while (level.length > 1) level = nextLevel(level);
  return level[0]!;
}

export interface MerkleProof { index: number; siblings: { hash: string; left: boolean }[] }

export function merkleProof(leaves: readonly Uint8Array[], index: number): MerkleProof {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) throw new EngineFault('I0.merkle_index', `index ${index} out of range`);
  const siblings: { hash: string; left: boolean }[] = [];
  let level = leaves.map(leafHash), i = index;
  while (level.length > 1) {
    const s = i ^ 1;
    if (s < level.length) siblings.push({ hash: toHex(level[s]!), left: s < i });
    level = nextLevel(level); i >>= 1;
  }
  return { index, siblings };
}

export function verifyMerkleProof(root: Uint8Array, leaf: Uint8Array, p: MerkleProof): boolean {
  let h = leafHash(leaf);
  for (const s of p.siblings) { const x = fromHex(s.hash); h = s.left ? nodeHash(x, h) : nodeHash(h, x); }
  return toHex(h) === toHex(root);
}
