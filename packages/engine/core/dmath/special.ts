// T02-03: erf, erfc, normCdf, normPdf, normInv, lgamma (02 §3.8).
// erf/erfc: W. J. Cody, "Rational Chebyshev approximations for the error function" (1969), coefficients copied from the
// netlib specfun CALERF tables (A, B, C, D, P, Q; double-precision "CD" lines). normInv: Wichura, AS241 PPND16 (Appl. Statist.
// 37(3), 1988), coefficients copied from lib.stat.cmu.edu/apstat/241. lgamma: Lanczos g = 7, n = 9 (card step 5 literals).
import { EngineFault } from '../types';
import { exp, ln } from './exp';
import { sin } from './trig';

const SQRPI = 5.6418958354775628695e-1;   // 1/√π (CALERF SQRPI)
const ERF_SPLIT1 = 0.5, ERF_SPLIT2 = 4;    // card step 3: |x| ≤ 0.5, 0.5 < |x| ≤ 4, |x| > 4
const ERFC_XBIG = 26.543;                  // E-67: erfc(x) = 0 for x > 26.543 (strict)
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

// erfc: fdlibm s_erf.c erfc (netlib fdlibm, Sun Microsystems 1993), coefficients copied verbatim (QA #33 NO-GO: the Cody region 2/3
// erfc reached 5.81 ULP). fdlibm forms exp(−x²) as exp(−z² − 0.5625)·exp((z − x)(z + x) + R/S), z = x with the low 32 bits cleared.
const ERX = 8.45062911510467529297e-01;
const PP = [1.28379167095512558561e-01, -3.25042107247001499370e-01, -2.84817495755985104766e-02, -5.77027029648944159157e-03, -2.37630166566501626084e-05] as const;
const QQ = [0, 3.97917223959155352819e-01, 6.50222499887672944485e-02, 5.08130628187576562776e-03, 1.32494738004321644526e-04, -3.96022827877536812320e-06] as const;
const PA = [-2.36211856075265944077e-03, 4.14856118683748331666e-01, -3.72207876035701323847e-01, 3.18346619901161753674e-01, -1.10894694282396677476e-01, 3.54783043256182359371e-02, -2.16637559486879084300e-03] as const;
const QA = [0, 1.06420880400844228286e-01, 5.40397917702171048937e-01, 7.18286544141962662868e-02, 1.26171219808761642112e-01, 1.36370839120290507362e-02, 1.19844998467991074170e-02] as const;
const RA = [-9.86494403484714822705e-03, -6.93858572707181764372e-01, -1.05586262253232909814e+01, -6.23753324503260060396e+01, -1.62396669462573470355e+02, -1.84605092906711035994e+02, -8.12874355063065934246e+01, -9.81432934416914548592e+00] as const;
const SA = [0, 1.96512716674392571292e+01, 1.37657754143519042600e+02, 4.34565877475229228821e+02, 6.45387271733267880336e+02, 4.29008140027567833386e+02, 1.08635005541779435134e+02, 6.57024977031928170135e+00, -6.04244152148580987438e-02] as const;
const RB = [-9.86494292470009928597e-03, -7.99283237680523006574e-01, -1.77579549177547519889e+01, -1.60636384855821916062e+02, -6.37566443368389627722e+02, -1.02509513161107724954e+03, -4.83519191608651397019e+02] as const;
const SB = [0, 3.03380607434824582924e+01, 3.25792512996573918826e+02, 1.53672958608443695994e+03, 3.19985821950859553908e+03, 2.55305040643316442583e+03, 4.74528541206955367215e+02, -2.24409524465858183362e+01] as const;
/** c[0] + s·(c[1] + s·(… + s·c[n])), with c[0] replaced by 1 when one is set (fdlibm's "one + s·(…)" denominators). */
function horner(c: readonly number[], s: number, one = false): number {
  let r = c[c.length - 1]!;
  for (let i = c.length - 2; i >= 1; i--) r = c[i]! + s * r;
  return (one ? 1 : c[0]!) + s * r;
}
const BUF = new DataView(new ArrayBuffer(8));
/** x with the low 32 bits of its binary64 pattern cleared (fdlibm __LO(z) = 0). */
function clearLo(x: number): number { BUF.setFloat64(0, x); BUF.setUint32(4, 0); return BUF.getFloat64(0); }
const ERFC_HIGH = 2.857142857142857;   // 1/0.35 (fdlibm ix < 0x4006DB6D)

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
  if (y > ERFC_XBIG) return 0;
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
  const ax = Math.abs(x);
  if (ax === Infinity) return x > 0 ? 0 : 2;
  if (ax < 0.84375) {
    if (ax < 1.3877787807814457e-17) return 1 - x;                       // |x| < 2^−56
    const z = x * x, y = horner(PP, z) / horner(QQ, z, true);
    if (x < 0.25) return 1 - (x + x * y);
    return 0.5 - (x * y + (x - 0.5));
  }
  if (ax < 1.25) {
    const sv = ax - 1, P = horner(PA, sv), Q = horner(QA, sv, true);
    return x >= 0 ? (1 - ERX) - P / Q : 1 + (ERX + P / Q);
  }
  if (x > ERFC_XBIG) return 0;                                            // E-67: strict >, erfc(26.543) itself is computed
  if (x <= -6) return 2;                                                  // fdlibm: two − tiny rounds to 2
  const sv = 1 / (ax * ax);
  const R = ax < ERFC_HIGH ? horner(RA, sv) : horner(RB, sv), S = ax < ERFC_HIGH ? horner(SA, sv, true) : horner(SB, sv, true);
  const z = clearLo(ax);
  const r = exp(-z * z - 0.5625) * exp((z - ax) * (z + ax) + R / S);
  return x > 0 ? r / ax : 2 - r / ax;
}

const SQRT2 = 1.4142135623730951;
const SQRT_2PI = 2.5066282746310007;      // √(2π)
/** −26.543·√2 in binary64; −NORMCDF_CUT/√2 rounds to exactly 26.543, so x ≥ NORMCDF_CUT maps into the computed erfc range. */
const NORMCDF_CUT = -ERFC_XBIG * SQRT2;
export function normCdf(x: number): number {
  nan(x, 'normCdf');
  if (x < NORMCDF_CUT) return 0;                                          // E-67: 0 only for x < −26.543·√2 (strict)
  return 0.5 * erfc(-x / SQRT2);
}
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
  if (x === 1 || x === 2) return 0;   // AC-02-03-LGAMMA-ZEROS: Γ(1) = Γ(2) = 1, exactly 0 (special-cased, Quant ruling)
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
