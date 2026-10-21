// T02-03: erf, erfc, normCdf, normPdf, normInv, lgamma (02 §3.8).
// erf/erfc: W. J. Cody, "Rational Chebyshev approximations for the error function" (1969), coefficients copied from the
// netlib specfun CALERF tables (A, B, C, D, P, Q; double-precision "CD" lines). normInv: Wichura, AS241 PPND16 (Appl. Statist.
// 37(3), 1988), coefficients copied from lib.stat.cmu.edu/apstat/241. lgamma: Lanczos g = 7, n = 9 (card step 5 literals).
import { EngineFault } from '../types';
import { exp, ln } from './exp';
import { sin } from './trig';

const SQRPI = 5.6418958354775628695e-1;   // 1/√π (CALERF SQRPI)
const ERF_SPLIT1 = 0.5, ERF_SPLIT2 = 4;    // card step 3: |x| ≤ 0.5, 0.5 < |x| ≤ 4, |x| > 4
const ERFC_XBIG = 26.543;                  // CALERF XBIG: erfc(x) underflows to 0 above
const CA = [3.16112374387056560e00, 1.13864154151050156e02, 3.77485237685302021e02, 3.20937758913846947e03, 1.85777706184603153e-1] as const;
const CB = [2.36012909523441209e01, 2.44024637934444173e02, 1.28261652607737228e03, 2.84423683343917062e03] as const;
const CC = [5.64188496988670089e-1, 8.88314979438837594e00, 6.61191906371416295e01, 2.98635138197400131e02,
  8.81952221241769090e02, 1.71204761263407058e03, 2.05107837782607147e03, 1.23033935479799725e03, 2.15311535474403846e-8] as const;
const CD = [1.57449261107098347e01, 1.17693950891312499e02, 5.37181101862009858e02, 1.62138957456669019e03,
  3.29079923573345963e03, 4.36261909014324716e03, 3.43936767414372164e03, 1.23033935480374942e03] as const;
const CP = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2,
  6.58749161529837803e-4, 1.63153871373020978e-2] as const;
const CQ = [2.56852019228982242e00, 1.87295284992346047e00, 5.27905102951428412e-1, 6.05183413124413191e-2,
  2.33520497626869185e-3] as const;

const nan = (x: number, fn: string): void => { if (x !== x) throw new EngineFault('I0.nan', `${fn}(NaN)`); };
const trunc = (v: number): number => (v < 0 ? -Math.floor(-v) : Math.floor(v));

/** CALERF region 1 (|x| ≤ 0.5): erf(x) = x·R(x²). */
function erfSmall(x: number): number {
  const y = Math.abs(x), ysq = y > 1.11e-16 ? y * y : 0;
  let num = CA[4] * ysq, den = ysq;
  for (let i = 0; i < 3; i++) { num = (num + CA[i]!) * ysq; den = (den + CB[i]!) * ysq; }
  return x * (num + CA[3]) / (den + CB[3]);
}
/** exp(−y²) as exp(−ysq²)·exp(−(y−ysq)(y+ysq)), ysq = trunc(16y)/16 (card step 3). */
function expNegSq(y: number): number {
  const ysq = trunc(y * 16) / 16, del = (y - ysq) * (y + ysq);
  return exp(-ysq * ysq) * exp(-del);
}
/** erfc(y) for y > 0.5 (CALERF regions 2 and 3). */
function erfcPos(y: number): number {
  if (y <= ERF_SPLIT2) {
    let num = CC[8] * y, den = y;
    for (let i = 0; i < 7; i++) { num = (num + CC[i]!) * y; den = (den + CD[i]!) * y; }
    return expNegSq(y) * ((num + CC[7]) / (den + CD[7]));
  }
  if (y >= ERFC_XBIG) return 0;
  const ysq = 1 / (y * y);
  let num = CP[5] * ysq, den = ysq;
  for (let i = 0; i < 4; i++) { num = (num + CP[i]!) * ysq; den = (den + CQ[i]!) * ysq; }
  const r = (SQRPI - ysq * (num + CP[4]) / (den + CQ[4])) / y;
  return expNegSq(y) * r;
}

export function erf(x: number): number {
  nan(x, 'erf');
  const y = Math.abs(x);
  if (y <= ERF_SPLIT1) return erfSmall(x);
  if (y === Infinity) return x > 0 ? 1 : -1;
  const r = (0.5 - erfcPos(y)) + 0.5;
  return x < 0 ? -r : r;
}

export function erfc(x: number): number {
  nan(x, 'erfc');
  const y = Math.abs(x);
  if (y <= ERF_SPLIT1) return 1 - erfSmall(x);
  if (y === Infinity) return x > 0 ? 0 : 2;
  const r = erfcPos(y);
  return x < 0 ? 2 - r : r;
}

const SQRT2 = 1.4142135623730951;
const SQRT_2PI = 2.5066282746310007;      // √(2π)
export function normCdf(x: number): number { nan(x, 'normCdf'); return 0.5 * erfc(-x / SQRT2); }
export function normPdf(x: number): number { nan(x, 'normPdf'); return exp(-x * x / 2) / SQRT_2PI; }

// AS241 PPND16.
const SPLIT1 = 0.425, SPLIT2 = 5, CONST1 = 0.180625, CONST2 = 1.6;
const A = [3.3871328727963666080e0, 1.3314166789178437745e+2, 1.9715909503065514427e+3, 1.3731693765509461125e+4,
  4.5921953931549871457e+4, 6.7265770927008700853e+4, 3.3430575583588128105e+4, 2.5090809287301226727e+3] as const;
const B = [1, 4.2313330701600911252e+1, 6.8718700749205790830e+2, 5.3941960214247511077e+3, 2.1213794301586595867e+4,
  3.9307895800092710610e+4, 2.8729085735721942674e+4, 5.2264952788528545610e+3] as const;
const C = [1.42343711074968357734e0, 4.63033784615654529590e0, 5.76949722146069140550e0, 3.64784832476320460504e0,
  1.27045825245236838258e0, 2.41780725177450611770e-1, 2.27238449892691845833e-2, 7.74545014278341407640e-4] as const;
const D = [1, 2.05319162663775882187e0, 1.67638483018380384940e0, 6.89767334985100004550e-1, 1.48103976427480074590e-1,
  1.51986665636164571966e-2, 5.47593808499534494600e-4, 1.05075007164441684324e-9] as const;
const E = [6.65790464350110377720e0, 5.46378491116411436990e0, 1.78482653991729133580e0, 2.96560571828504891230e-1,
  2.65321895265761230930e-2, 1.24266094738807843860e-3, 2.71155556874348757815e-5, 2.01033439929228813265e-7] as const;
const F = [1, 5.99832206555887937690e-1, 1.36929880922735805310e-1, 1.48753612908506148525e-2, 7.86869131145613259100e-4,
  1.84631831751005468180e-5, 1.42151175831644588870e-7, 2.04426310338993978564e-15] as const;
/** Σ c_k r^k (k = 0..7), AS241's nested form. */
const poly7 = (c: readonly number[], r: number): number =>
  ((((((c[7]! * r + c[6]!) * r + c[5]!) * r + c[4]!) * r + c[3]!) * r + c[2]!) * r + c[1]!) * r + c[0]!;

export function normInv(p: number): number {
  nan(p, 'normInv');
  if (!(p > 0 && p < 1)) throw new EngineFault('I0.domain', `normInv(${p}) outside (0, 1)`);
  const q = p - 0.5;
  if (Math.abs(q) <= SPLIT1) { const r = CONST1 - q * q; return q * poly7(A, r) / poly7(B, r); }
  let r = Math.sqrt(-ln(q < 0 ? p : 1 - p));     // card step 4: r = sqrt(−ln(min(p, 1 − p)))
  let z: number;
  if (r <= SPLIT2) { r -= CONST2; z = poly7(C, r) / poly7(D, r); }
  else { r -= SPLIT2; z = poly7(E, r) / poly7(F, r); }
  return q < 0 ? -z : z;
}

const LANCZOS_G = 7;
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7] as const;
const HALF_LN_2PI = 0.9189385332046728;  // ½·ln(2π)
const PI = 3.141592653589793;
const TINY = 2 ** -30;

export function lgamma(x: number): number {
  nan(x, 'lgamma');
  if (!(x > 0) || x === Infinity) throw new EngineFault('I0.domain', `lgamma(${x}) requires 0 < x < ∞`);
  // Reflection (card step 5). For x < 2^-30, sin(πx)/(πx) = 1 − (πx)²/6 rounds to 1, so ln(π/sin(πx)) = −ln x exactly in binary64;
  // using that form avoids π/sin(πx) overflowing (x = 5e-324) and the subnormal rounding of πx.
  if (x < TINY) return -ln(x) - lgamma(1 - x);
  if (x < 0.5) return ln(PI / Math.abs(sin(PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return HALF_LN_2PI + (z + 0.5) * ln(t) - t + ln(a);
}
