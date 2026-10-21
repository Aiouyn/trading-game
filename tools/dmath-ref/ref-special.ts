// T02-03 reference erf/erfc/normCdf/normInv/lgamma on BigFloat (Node tool, NOT engine code), card step 9:
// erf by its Maclaurin series for |x| < 3, erfc by the asymptotic (Laplace) continued fraction beyond, at 256 bits;
// normInv by Newton on the reference normCdf; lgamma by Stirling with exact Bernoulli numbers after an upward shift.
import { BigFloat, roundToF64 } from './bigfloat';
import { refExpBF, refLnBF } from './ref-exp';
import { bfSqrt, refPi } from './ref-trig';

const STOP = -300;
let SQRT_PI: BigFloat | null = null;
const sqrtPi = (): BigFloat => (SQRT_PI ??= bfSqrt(refPi()));

/** erf(z), z BigFloat with |z| < 3 (Maclaurin: 2/√π Σ (−1)^n z^(2n+1)/(n!(2n+1)); ≤ 15 bits of cancellation at |z| = 3). */
function erfSeries(z: BigFloat): BigFloat {
  if (z.isZero()) return z;
  const z2 = z.mul(z);
  let pw = z, sum = z; const ref = z.top();
  for (let n = 1; n < 10000; n++) {
    pw = pw.mul(z2).div(BigFloat.int(n)).neg();          // (−1)^n z^(2n+1)/n!
    const t = pw.div(BigFloat.int(2 * n + 1));
    if (t.isZero() || t.top() < ref + STOP - 20) break;
    sum = sum.add(t);
  }
  return sum.mul2k(1).div(sqrtPi());
}
/** erfc(z), z ≥ 3: e^{−z²}/√π · 1/(z + (1/2)/(z + 1/(z + (3/2)/(z + 2/(z + …))))), evaluated backward with N terms, N doubled
 *  until two successive values agree to 2^-280 relative. */
function erfcCF(z: BigFloat): BigFloat {
  const cf = (N: number): BigFloat => {
    let t = z;
    for (let k = N; k >= 1; k--) t = z.add(BigFloat.int(k).mul2k(-1).div(t));
    return BigFloat.ONE.div(t);
  };
  let N = 64, prev = cf(N);
  for (;;) {
    N *= 2; const cur = cf(N), d = cur.sub(prev);
    if (d.isZero() || d.top() < cur.top() - 280) { prev = cur; break; }
    prev = cur;
    if (N > 1 << 20) throw new Error('erfcCF did not converge');
  }
  return refExpBF(z.mul(z).neg()).mul(prev).div(sqrtPi());
}
const THREE = BigFloat.int(3);
const lt3 = (a: BigFloat): boolean => a.abs().sub(THREE).m < 0n;
/** erf of a BigFloat argument. */
export function refErfBF(z: BigFloat): BigFloat {
  if (lt3(z)) return erfSeries(z);
  const v = BigFloat.ONE.sub(erfcCF(z.abs()));
  return z.m < 0n ? v.neg() : v;
}
/** erfc of a BigFloat argument (no cancellation for large positive z). */
export function refErfcBF(z: BigFloat): BigFloat {
  if (lt3(z)) return BigFloat.ONE.sub(erfSeries(z));
  return z.m > 0n ? erfcCF(z) : BigFloat.int(2).sub(erfcCF(z.abs()));
}
export function refErf(x: number): BigFloat { return refErfBF(BigFloat.fromF64(x)); }
export function refErfc(x: number): BigFloat { return refErfcBF(BigFloat.fromF64(x)); }

let SQRT2: BigFloat | null = null;
/** Φ(z) = ½·erfc(−z/√2), the division done in BigFloat. */
export function refNormCdfBF(z: BigFloat): BigFloat { return refErfcBF(z.neg().div(SQRT2 ??= bfSqrt(BigFloat.int(2)))).mul2k(-1); }
export function refNormCdf(x: number): BigFloat { return refNormCdfBF(BigFloat.fromF64(x)); }
let SQRT_2PI: BigFloat | null = null;
const phi = (z: BigFloat): BigFloat => refExpBF(z.mul(z).mul2k(-1).neg()).div(SQRT_2PI ??= bfSqrt(refPi().mul2k(1)));
/** Φ⁻¹(p) by Newton z ← z − (Φ(z) − p)/φ(z) from the AS241 double start (`start`); 5 steps (quadratic from ~50 bits). */
export function refNormInv(p: number, start: number): BigFloat {
  const bp = BigFloat.fromF64(p);
  let z = BigFloat.fromF64(start);
  for (let i = 0; i < 5; i++) z = z.sub(refNormCdfBF(z).sub(bp).div(phi(z)));
  return z;
}

/** Exact Bernoulli numbers B_0..B_n as [num, den] (Akiyama–Tanigawa), B_1 = +1/2 convention (unused). */
function bernoulli(n: number): [bigint, bigint][] {
  const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
  const out: [bigint, bigint][] = [], A: [bigint, bigint][] = [];
  for (let m = 0; m <= n; m++) {
    A.push([1n, BigInt(m + 1)]);
    for (let j = m; j >= 1; j--) {
      const [an, ad] = A[j - 1]!, [bn, bd] = A[j]!;
      let num = (an * bd - bn * ad) * BigInt(j), den = ad * bd; const g = gcd(num, den); num /= g; den /= g;
      A[j - 1] = [num, den];
    }
    out.push(A[0]!);
  }
  return out;
}
const BERN = bernoulli(160);
let HALF_LN_2PI: BigFloat | null = null;
const SHIFT_TO = 40;
/** ln Γ(x), x > 0: shift z = x + N ≥ 40, Stirling Σ_{k≥1} B_2k/(2k(2k−1) z^(2k−1)) until the term < 2^-300, minus ln Π(x+i). */
export function refLgamma(x: number): BigFloat {
  if (x === 1 || x === 2) return BigFloat.ZERO;   // Γ(1) = Γ(2) = 1 exactly
  const bx = BigFloat.fromF64(x);
  let z = bx, prod = BigFloat.ONE, shifted = false;
  while (roundToF64(z) < SHIFT_TO) { prod = prod.mul(z); z = z.add(BigFloat.ONE); shifted = true; }
  HALF_LN_2PI ??= refLnBF(refPi().mul2k(1)).mul2k(-1);
  const lnz = refLnBF(z);
  let s = z.sub(BigFloat.ONE.mul2k(-1)).mul(lnz).sub(z).add(HALF_LN_2PI);
  const ref = s.isZero() ? 0 : s.top(), z2 = z.mul(z);
  let zp = z;   // z^(2k−1)
  for (let k = 1; 2 * k <= 160; k++) {
    const [bn, bd] = BERN[2 * k]!;
    const t = new BigFloat(bn, 0).div(new BigFloat(bd * BigInt(2 * k * (2 * k - 1)), 0)).div(zp);
    if (t.isZero() || t.top() < Math.min(ref, 0) + STOP) break;
    s = s.add(t); zp = zp.mul(z2);
  }
  return shifted ? s.sub(refLnBF(prod)) : s;
}
