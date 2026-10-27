// T02-06: xoshiro128** (02 §3.10.1 verbatim). `s` is a Uint32Array, so every assignment wraps to uint32.
export function rotl(x: number, k: number): number { return ((x << k) | (x >>> (32 - k))) >>> 0; }

/** Advances s and returns the next uint32. */
export function xoNext(s: Uint32Array): number {
  const result = Math.imul(rotl(Math.imul(s[1]!, 5), 7), 9) >>> 0;
  const t = (s[1]! << 9) >>> 0;
  s[2]! ^= s[0]!; s[3]! ^= s[1]!; s[1]! ^= s[2]!; s[0]! ^= s[3]!;
  s[2]! ^= t;
  s[3] = rotl(s[3]!, 11);
  return result;
}
