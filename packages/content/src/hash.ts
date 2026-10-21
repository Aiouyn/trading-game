// T22A-01 step 2: contentHash = sha256(canon({ [fileName]: fileJson })) (22 §0.1 rule 5). canon sorts map keys,
// so key order inside a file never changes the hash; any value byte does.
import { canonEncode, sha256, toHex } from '@tycoon/engine-core';

export function contentHashOf(files: Readonly<Record<string, unknown>>): string {
  return toHex(sha256(canonEncode(files)));
}

export function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.getOwnPropertyNames(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}
