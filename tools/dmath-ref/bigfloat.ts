// T02-02 reference generator (Node tool, NOT engine code): arbitrary-precision binary floating point on bigint.
// value = m · 2^e, |m| kept to PREC bits (truncation; the 2^-256 relative error is far below the 2^-53 rounding we measure).
export const PREC = 256;

const bitLen = (m: bigint): number => (m < 0n ? -m : m).toString(2).length;

export class BigFloat {
  readonly m: bigint; readonly e: number;
  constructor(m: bigint, e: number) {
    if (m === 0n) { this.m = 0n; this.e = 0; return; }
    const extra = bitLen(m) - PREC;
    if (extra > 0) { this.m = m / (1n << BigInt(extra)); this.e = e + extra; } else { this.m = m; this.e = e; }
  }
  static ZERO = new BigFloat(0n, 0);
  static ONE = new BigFloat(1n, 0);
  static int(n: number | bigint): BigFloat { return new BigFloat(BigInt(n), 0); }
  /** Exact image of a finite double. */
  static fromF64(x: number): BigFloat {
    if (!Number.isFinite(x)) throw new Error(`fromF64(${x})`);
    if (x === 0) return BigFloat.ZERO;
    const v = new DataView(new ArrayBuffer(8)); v.setFloat64(0, x);
    const b = v.getBigUint64(0), neg = b >> 63n === 1n, ex = Number((b >> 52n) & 0x7ffn), frac = b & ((1n << 52n) - 1n);
    const m = ex === 0 ? frac : frac | (1n << 52n), e = (ex === 0 ? 1 : ex) - 1075;
    return new BigFloat(neg ? -m : m, e);
  }
  isZero(): boolean { return this.m === 0n; }
  neg(): BigFloat { return new BigFloat(-this.m, this.e); }
  abs(): BigFloat { return this.m < 0n ? this.neg() : this; }
  /** Exponent of the leading bit (value in [2^t, 2^(t+1))). */
  top(): number { return this.e + bitLen(this.m) - 1; }
  add(o: BigFloat): BigFloat {
    if (this.isZero()) return o; if (o.isZero()) return this;
    // align at the smaller exponent but never below (largest top − 2·PREC): smaller parts are below the kept precision anyway
    const floor = Math.max(Math.min(this.e, o.e), Math.max(this.top(), o.top()) - 2 * PREC);
    const al = (x: BigFloat): bigint => (x.e >= floor ? x.m << BigInt(x.e - floor) : x.m >> BigInt(floor - x.e));
    return new BigFloat(al(this) + al(o), floor);
  }
  sub(o: BigFloat): BigFloat { return this.add(o.neg()); }
  mul(o: BigFloat): BigFloat { return new BigFloat(this.m * o.m, this.e + o.e); }
  div(o: BigFloat): BigFloat {
    if (o.isZero()) throw new Error('div by 0');
    const sh = PREC + bitLen(o.m) + 2;
    return new BigFloat((this.m << BigInt(sh)) / o.m, this.e - o.e - sh);
  }
  mul2k(k: number): BigFloat { return new BigFloat(this.m, this.e + k); }
  cmpAbsPow2(k: number): boolean { return this.isZero() || this.top() < k; }   // |v| < 2^k
  toNumberApprox(): number { return roundToF64(this); }
}

/** Correctly rounded (half-even) to binary64, including subnormals; overflow -> ±Infinity. */
export function roundToF64(v: BigFloat): number {
  if (v.isZero()) return 0;
  const neg = v.m < 0n, m = neg ? -v.m : v.m, L = bitLen(m), t = v.e + L - 1;
  if (t > 1023) return neg ? -Infinity : Infinity;
  const p = t >= -1022 ? 53 : 53 - (-1022 - t);            // available precision (subnormal range)
  let q: bigint, k: number;
  if (p <= 0) {                                               // below half the smallest subnormal or around it
    const half = -1075;                                       // 2^-1075 = half of 2^-1074
    if (t < half) return neg ? -0 : 0;
    // t === -1075: value in [2^-1075, 2^-1074): rounds to 2^-1074 unless exactly the half (tie to even 0)
    const isHalf = m === 1n << BigInt(L - 1);
    q = isHalf ? 0n : 1n; k = -1074;
  } else {
    const sh = L - p;
    if (sh <= 0) { q = m << BigInt(-sh); k = v.e + sh; }
    else {
      q = m >> BigInt(sh); const rem = m - (q << BigInt(sh)), half = 1n << BigInt(sh - 1);
      if (rem > half || (rem === half && (q & 1n) === 1n)) q += 1n;
      k = v.e + sh;
    }
  }
  // q ≤ 2^53, so Number(q) is exact; scale by 2^k exactly in two steps (the result is representable).
  let r = Number(q);
  const step = (j: number): void => { r *= 2 ** j; };
  if (k < -1000) { step(-1000); step(k + 1000); } else if (k > 1000) { step(1000); step(k - 1000); } else step(k);
  return neg ? -r : r;
}
