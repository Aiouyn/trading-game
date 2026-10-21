// T02-03 reference sin/cos/atan/atan2 on BigFloat (Node tool, NOT engine code).
// π: Machin's formula π = 16·atan(1/5) − 4·atan(1/239) evaluated in 300-bit fixed point on bigint (card step 9). Argument
// reduction x − n·π/2 is done exactly in that fixed point (x is an exact dyadic rational), then Taylor series in BigFloat.
import { BigFloat, roundToF64 } from './bigfloat';

export const PI_BITS = 300;
const ONE_FX = 1n << BigInt(PI_BITS);
/** atan(1/k)·2^PI_BITS by the Gregory series (fixed point, truncating; the 300-bit result is exact to well under 2^-290). */
function atanInvFx(k: bigint): bigint {
  const GUARD = 20n, one = ONE_FX << GUARD, k2 = k * k;
  let pw = one / k, sum = 0n;
  for (let n = 0n; pw !== 0n; n++) { const t = pw / (2n * n + 1n); sum += n % 2n === 0n ? t : -t; pw /= k2; }
  return sum >> GUARD;
}
let PI_FX: bigint | null = null;
/** π·2^300 (floor). */
export function piFixed(): bigint { return (PI_FX ??= 16n * atanInvFx(5n) - 4n * atanInvFx(239n)); }
/** π as a BigFloat (256-bit mantissa; truncation of the 300-bit value). */
export function refPi(): BigFloat { return new BigFloat(piFixed(), -PI_BITS); }

const STOP = -300;
/** Σ (−1)^k r^(2k+start)/(2k+start)! for start 1 (sin) or 0 (cos). */
function sinCosSeries(r: BigFloat, start: 0 | 1): BigFloat {
  const r2 = r.mul(r);
  let term = start === 1 ? r : BigFloat.ONE, sum = term;
  if (term.isZero()) return sum;
  const ref = term.top();
  for (let n = start + 2; n < 4000; n += 2) {
    term = term.mul(r2).div(BigFloat.int((n - 1) * n)).neg();
    if (term.isZero() || term.top() < ref + STOP) break;
    sum = sum.add(term);
  }
  return sum;
}
/** Exact x − n·π/2 (n = nearest integer to x·2/π), r as BigFloat. */
function reduce(x: number): { n: number; r: BigFloat } {
  const bx = BigFloat.fromF64(x);
  const n = Math.round(x / (Math.PI / 2));
  // r = x − n·π/2 in 2^-(300+1074) fixed point (x is m·2^e with e ≥ −1074)
  const S = PI_BITS + 1100;
  const xFx = bx.e >= -S ? bx.m << BigInt(bx.e + S) : 0n;
  const halfPiFx = piFixed() << BigInt(S - PI_BITS - 1);
  return { n, r: new BigFloat(xFx - BigInt(n) * halfPiFx, -S) };
}
export function refSin(x: number): BigFloat {
  if (x === 0) return BigFloat.ZERO;
  const { n, r } = reduce(x);
  const k = ((n % 4) + 4) % 4;
  const v = k === 0 || k === 2 ? sinCosSeries(r, 1) : sinCosSeries(r, 0);
  return k >= 2 ? v.neg() : v;
}
export function refCos(x: number): BigFloat {
  const { n, r } = reduce(x);
  const k = ((n % 4) + 4) % 4;
  const v = k === 0 || k === 2 ? sinCosSeries(r, 0) : sinCosSeries(r, 1);
  return k === 1 || k === 2 ? v.neg() : v;
}

/** BigFloat square root by Newton from a double start (6 steps: 53 → > 256 bits). */
export function bfSqrt(a: BigFloat): BigFloat {
  if (a.isZero()) return a;
  const t = a.top(), sh = t % 2 === 0 ? t : t - 1;   // a = a'·2^sh, sh even, a' in [1, 4)
  const a1 = a.mul2k(-sh);
  let y = BigFloat.fromF64(Math.sqrt(roundToF64(a1)));
  for (let i = 0; i < 6; i++) y = y.add(a1.div(y)).mul2k(-1);
  return y.mul2k(sh / 2);
}
let SQRT3: BigFloat | null = null, TAN_PI12: BigFloat | null = null;
/** atan(t) for 0 ≤ t ≤ 1 (BigFloat): above tan(π/12) shift by π/6 (card step 9 / step 2), then the odd Taylor series. */
function atan01BF(t: BigFloat): BigFloat {
  SQRT3 ??= bfSqrt(BigFloat.int(3)); TAN_PI12 ??= BigFloat.int(2).sub(SQRT3);
  if (t.sub(TAN_PI12).m > 0n) {
    const u = t.mul(SQRT3).sub(BigFloat.ONE).div(t.add(SQRT3));
    return refPi().div(BigFloat.int(6)).add(atan01BF(u));
  }
  if (t.isZero()) return t;
  const t2 = t.mul(t), ref = t.top();
  let pw = t, sum = t;
  for (let k = 1; k < 4000; k++) {
    pw = pw.mul(t2); const term = pw.div(BigFloat.int(2 * k + 1));
    if (term.isZero() || term.top() < ref + STOP) break;
    sum = k % 2 === 1 ? sum.sub(term) : sum.add(term);
  }
  return sum;
}
/** atan of a positive BigFloat. */
function atanPosBF(a: BigFloat): BigFloat {
  if (a.sub(BigFloat.ONE).m > 0n) return refPi().mul2k(-1).sub(atan01BF(BigFloat.ONE.div(a)));
  return atan01BF(a);
}
export function refAtan(x: number): BigFloat {
  if (x === 0) return BigFloat.ZERO;
  const v = atanPosBF(BigFloat.fromF64(Math.abs(x)));
  return x < 0 ? v.neg() : v;
}
/** atan2 for finite (y, x) not both zero; the quotient |y|/|x| is formed in BigFloat (no double rounding). */
export function refAtan2(y: number, x: number): BigFloat {
  if (y === 0) return Object.is(x, -0) || x < 0 ? (Object.is(y, -0) ? refPi().neg() : refPi()) : BigFloat.ZERO;
  const sy = y < 0 ? -1 : 1;
  let a: BigFloat;
  if (x === 0) a = refPi().mul2k(-1);
  else {
    a = atanPosBF(BigFloat.fromF64(Math.abs(y)).div(BigFloat.fromF64(Math.abs(x))));
    if (x < 0) a = refPi().sub(a);
  }
  return sy < 0 ? a.neg() : a;
}
