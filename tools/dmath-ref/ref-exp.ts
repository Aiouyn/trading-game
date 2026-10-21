// T02-02 reference functions on BigFloat (Node tool, NOT engine code).
import { BigFloat, PREC, roundToF64 } from './bigfloat';

const STOP = -300;   // Taylor terms below 2^-300 (relative to O(1) sums) are dropped
let LN2_CACHE: BigFloat | null = null;
/** ln 2 = Σ_{k≥1} 1/(k·2^k) (AGM-free series). */
export function refLn2(): BigFloat {
  if (LN2_CACHE) return LN2_CACHE;
  let s = BigFloat.ZERO;
  for (let k = 1; k <= 2 * PREC + 64; k++) s = s.add(BigFloat.ONE.div(BigFloat.int(k)).mul2k(-k));
  return (LN2_CACHE = s);
}

/** Σ_{n≥start} r^n/n! until the term is below 2^STOP relative to the first kept term. */
function expSeries(r: BigFloat, start: 0 | 1): BigFloat {
  let term = start === 0 ? BigFloat.ONE : r, sum = term;
  const ref = term.isZero() ? 0 : term.top();
  for (let n = start + 1; n < 2000; n++) {
    term = term.mul(r).div(BigFloat.int(n));
    if (term.isZero() || term.top() < ref + STOP) break;
    sum = sum.add(term);
  }
  return sum;
}
/** e^x for BigFloat x: reduce by ln 2, Taylor, scale. */
export function refExpBF(x: BigFloat): BigFloat {
  const k = Math.round(roundToF64(x) / Math.LN2);
  const r = x.sub(refLn2().mul(BigFloat.int(k)));
  return expSeries(r, 0).mul2k(k);
}
export function refExp(x: number): BigFloat { return refExpBF(BigFloat.fromF64(x)); }
/** e^x − 1 without cancellation: direct series for |x| < 1. */
export function refExpm1(x: number): BigFloat {
  const b = BigFloat.fromF64(x);
  return Math.abs(x) < 1 ? expSeries(b, 1) : refExp(x).sub(BigFloat.ONE);
}
/** ln x (x > 0) by Newton on refExp: y ← y + x·e^-y − 1 (quadratic; 7 steps from a double start reach > 256 bits). */
export function refLnBF(x: BigFloat): BigFloat {
  let y = BigFloat.fromF64(Math.log(roundToF64(x)));
  for (let i = 0; i < 7; i++) y = y.add(x.mul(refExpBF(y.neg())).sub(BigFloat.ONE));
  return y;
}
export function refLn(x: number): BigFloat {
  if (!(x > 0)) throw new Error(`refLn(${x})`);
  return x === 1 ? BigFloat.ZERO : refLnBF(BigFloat.fromF64(x));
}
/** ln(1 + x): alternating series for |x| < 0.5 (no cancellation), else refLn of the exact 1 + x. */
export function refLog1p(x: number): BigFloat {
  const b = BigFloat.fromF64(x);
  if (Math.abs(x) >= 0.5) return refLnBF(BigFloat.ONE.add(b));
  let pw = b, sum = b; const ref = b.isZero() ? 0 : b.top();
  for (let n = 2; n < 4000; n++) {
    pw = pw.mul(b); const t = pw.div(BigFloat.int(n));
    if (t.isZero() || t.top() < ref + STOP) break;
    sum = n % 2 === 0 ? sum.sub(t) : sum.add(t);
  }
  return sum;
}
export function refPow(x: number, y: number): BigFloat {
  if (y === 0 || x === 1) return BigFloat.ONE;
  return refExpBF(BigFloat.fromF64(y).mul(refLn(x)));
}
export function refTanh(x: number): BigFloat {
  if (Math.abs(x) >= 40) return BigFloat.int(Math.sign(x));   // 1 − tanh|x| < 2e-34: rounds to ±1 exactly (keeps 2x in exponent range)
  const e = refExpm1(2 * x);   // 2x is exact
  return e.div(e.add(BigFloat.int(2)));
}
export function refSigmoid(x: number): BigFloat {
  if (x >= 800) return BigFloat.ONE;          // 1 − σ < e^-800: rounds to 1
  if (x <= -800) return BigFloat.ZERO;       // σ < e^-800 < 2^-1075: rounds to 0
  return BigFloat.ONE.div(BigFloat.ONE.add(refExp(-x))); }
let LN10_CACHE: BigFloat | null = null;
export function refLog2(x: number): BigFloat { return refLn(x).div(refLn2()); }
export function refLog10(x: number): BigFloat { return refLn(x).div(LN10_CACHE ??= refLnBF(BigFloat.int(10))); }
