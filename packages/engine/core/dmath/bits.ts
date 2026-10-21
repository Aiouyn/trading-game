// T02-02: IEEE-754 binary64 bit access (02 §3.8). One module-level view; engine code is single-threaded.
const F = new Float64Array(1);
const U = new BigUint64Array(F.buffer);
const SIGN = 0x8000000000000000n;

export function f64ToBits(x: number): bigint { F[0] = x; return U[0]!; }
export function bitsToF64(b: bigint): number { U[0] = BigInt.asUintN(64, b); return F[0]!; }

/** Monotone integer image of a double: negatives map to −(bits & 0x7fff…), so −0 and +0 coincide. */
const ordered = (x: number): bigint => { const b = f64ToBits(x); return b & SIGN ? -(b & ~SIGN) : b; };
/** |ordered bits(a) − ordered bits(b)| (number; exact below 2^53). */
export function ulpDistance(a: number, b: number): number { const d = ordered(a) - ordered(b); return Number(d < 0n ? -d : d); }

const pow2 = (k: number): number => bitsToF64(BigInt(k + 1023) << 52n);   // exact 2^k for −1022 ≤ k ≤ 1023
/** x · 2^k by exponent construction; out-of-range k is applied in two steps (subnormal results round once in the last step). */
export function scalb(x: number, k: number): number {
  if (k > 1023) return x * pow2(1023) * pow2(k - 1023);
  if (k < -1022) return x * pow2(-1022) * pow2(k + 1022 < -1022 ? -1022 : k + 1022);
  return x * pow2(k);
}
/** x = m · 2^e with m in [0.5, 1) (x ≠ 0, finite); frexp(0) = {0, 0}. */
export function frexp(x: number): { m: number; e: number } {
  if (x === 0) return { m: x, e: 0 };
  let b = f64ToBits(x), adj = 0;
  if (((b >> 52n) & 0x7ffn) === 0n) { b = f64ToBits(x * 18014398509481984); adj = -54; }   // subnormal: scale by 2^54 (exact)
  const ex = Number((b >> 52n) & 0x7ffn);
  const m = bitsToF64((b & ~(0x7ffn << 52n)) | (1022n << 52n));
  return { m, e: ex - 1022 + adj };
}
