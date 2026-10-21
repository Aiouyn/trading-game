// T02-02: exp / ln family of dmath (02 §3.8). Only + - * /, Math.sqrt-class exact ops and bit construction (bits.ts).
// Every constant below is the binary64 nearest to the stated value; the hex pattern is given where the card states it.
import { EngineFault } from '../types';
import { frexp, scalb } from './bits';

const LN2_HI = 0.6931471803691238;      // 0x3FE62E42FEE00000 (Cody-Waite, card step 2)
const LN2_LO = 1.9082149292705877e-10;  // 0x3DEA39EF35793C76
const LN2 = 0.6931471805599453;         // ln 2
const INV_LN2 = 1.4426950408889634;     // 1/ln 2
const INV_LN2_LO = 2.0355273740931033e-17;   // 1/ln 2 − INV_LN2 (double-double tail)
const INV_LN10 = 0.4342944819032518;    // 1/ln 10
const INV_LN10_LO = 1.098319650216765e-17;  // 1/ln 10 − INV_LN10
const THIRD_LO = 1.850371707708594e-17;     // 1/3 − 0.3333333333333333
const SQRT1_2 = 0.7071067811865476;     // √½
const EXP_MAX = 709.782712893384;       // card step 2: above -> I0.overflow
const EXP_MIN = -745.1332191019411;     // card step 2: below -> 0

/** 1/n! for n = 0..17 (exact double literals: nearest binary64; n! is exact in binary64 for n ≤ 22, so 1/n! is one correctly rounded division). */
const INV_FACT = [1, 1, 0.5, 0.16666666666666666, 0.041666666666666664, 0.008333333333333333, 0.001388888888888889,
  0.0001984126984126984, 0.0000248015873015873, 0.0000027557319223985893, 2.755731922398589e-7, 2.505210838544172e-8,
  2.08767569878681e-9, 1.6059043836821613e-10, 1.1470745597729725e-11, 7.647163731819816e-13, 4.779477332387385e-14,
  2.8114572543455206e-15] as const;
/** 1/(2j+1) for j = 0..10 (s, s³/3, …, s²¹/21). */
const INV_ODD = [1, 0.3333333333333333, 0.2, 0.14285714285714285, 0.1111111111111111, 0.09090909090909091,
  0.07692307692307693, 0.06666666666666667, 0.058823529411764705, 0.05263157894736842, 0.047619047619047616] as const;

const nanCheck = (x: number, fn: string): void => { if (x !== x) throw new EngineFault('I0.nan', `${fn}(NaN)`); };

/** Local round-half-even (card step 2: fixed.ts is a later task): floor(v + 0.5), ties to the even neighbour. */
function roundHalfEvenLocal(v: number): number {
  const f = Math.floor(v + 0.5);
  return f - v === 0.5 && f % 2 !== 0 ? f - 1 : f;
}
/** Σ_{n=from}^{to} c_n r^(n-from) in Horner form. */
function horner(r: number, c: readonly number[], from: number, to: number): number {
  let p = c[to]!;
  for (let n = to - 1; n >= from; n--) p = p * r + c[n]!;
  return p;
}

export function exp(x: number): number {
  nanCheck(x, 'exp');
  if (x > EXP_MAX) throw new EngineFault('I0.overflow', `exp(${x}) overflows (domain [-745, 709])`);
  if (x < EXP_MIN) return 0;
  const k = roundHalfEvenLocal(x / LN2);
  const hi = x - k * LN2_HI, lo = k * LN2_LO;   // hi is exact (LN2_HI has 32 significant bits, |k| < 2^11)
  const r = hi - lo;                              // |r| ≤ ln2/2
  // Degree-13 Taylor 1 + r + r²·(1/2! + r/3! + … + r^11/13!) in Horner form; the leading 1 + hi is added compensated
  // (Fast2Sum, exact) so the rounding of r and of 1 + r is not lost before the final rounding.
  const t = r * r * horner(r, INV_FACT, 2, 13);
  const s = 1 + hi, e1 = (1 - s) + hi;            // s + e1 = 1 + hi exactly (|1| ≥ |hi|)
  return scalb(s + ((e1 - lo) + t), k);
}

export function expm1(x: number): number {
  nanCheck(x, 'expm1');
  const a = Math.abs(x);
  if (a < 1e-5) return x * (1 + x * (0.5 + x * INV_FACT[3]));   // x + x²/2 + x³/6
  if (a < 0.5) return x * horner(x, INV_FACT, 1, 17);             // Taylor to degree 17
  return exp(x) - 1;
}

export function ln(x: number): number {
  nanCheck(x, 'ln');
  if (!(x > 0)) throw new EngineFault('I0.domain', `ln(${x})`);
  if (x === Infinity) throw new EngineFault('I0.overflow', 'ln(Infinity)');
  // QA #25: the single-double series lost up to 3 ULP near 1 (s = (m−1)/(m+1) and 2s·Σ each round once at the result's own
  // magnitude, with nothing to absorb it). Root fix: evaluate the same reduction in double-double (lnDD) and round once.
  const l = lnDD(x);
  return l.hi + l.lo;
}

export function log1p(x: number): number {
  nanCheck(x, 'log1p');
  if (Math.abs(x) < 1e-4) return x * (1 + x * (-0.5 + x * (0.3333333333333333 + x * -0.25)));   // x − x²/2 + x³/3 − x⁴/4
  const u = 1 + x;
  return ln(u) - ((u - 1) - x) / u;
}

/** ln(x)·(1/ln 2) and ln(x)·(1/ln 10), the product taken in double-double (lnDD × constant pair) and rounded once. */
function lnTimes(x: number, c: number, cLo: number): number {
  nanCheck(x, 'log');
  if (!(x > 0)) throw new EngineFault('I0.domain', `log(${x})`);
  if (x === Infinity) throw new EngineFault('I0.overflow', 'log(Infinity)');
  const l = lnDD(x), t = twoProd(l.hi, c);
  return t.p + (t.err + (l.hi * cLo + l.lo * c));
}
export function log2(x: number): number { return lnTimes(x, INV_LN2, INV_LN2_LO); }
export function log10(x: number): number { return lnTimes(x, INV_LN10, INV_LN10_LO); }

const SPLIT = 134217729;   // 2^27 + 1 (Veltkamp)
/** Dekker two-product: a·b = p + err exactly. */
function twoProd(a: number, b: number): { p: number; err: number } {
  const p = a * b;
  let t = SPLIT * a; const ah = t - (t - a), al = a - ah;
  t = SPLIT * b; const bh = t - (t - b), bl = b - bh;
  return { p, err: ((ah * bh - p) + ah * bl + al * bh) + al * bl };
}
interface DD { hi: number; lo: number }
/** Fast2Sum renormalisation (|hi| ≥ |lo|). */
function norm(hi: number, lo: number): DD { const h = hi + lo; return { hi: h, lo: lo - (h - hi) }; }
/** Double-double sum (TwoSum on the high parts). */
function ddAdd(a: DD, b: DD): DD {
  const h = a.hi + b.hi, bb = h - a.hi, err = (a.hi - (h - bb)) + (b.hi - bb);
  return norm(h, err + (a.lo + b.lo));
}
/** Double-double product (a.hi + a.lo)(b.hi + b.lo), renormalised. */
function ddMul(a: DD, b: DD): DD {
  const t = twoProd(a.hi, b.hi);
  if (!Number.isFinite(t.err)) return { hi: t.p, lo: 0 };   // split overflow near 2^1024: the product is ≥ 2^996, hi alone
  const lo = t.err + (a.hi * b.lo + a.lo * b.hi), hi = t.p + lo;
  return { hi, lo: lo - (hi - t.p) };
}
/** x^n for integer 1 ≤ n ≤ 64 by repeated squaring (fixed loop over the bits of n), carried in double-double so the result is exact
 *  whenever x^n is representable and otherwise within the 4 ULP pow bound (plain double squaring drifts by up to ~12 ULP at n = 57). */
function powInt(base: DD, n: number): DD {
  let r: DD = { hi: 1, lo: 0 }, b = base;
  for (;;) {
    if (n % 2 === 1) r = ddMul(r, b);
    n = Math.floor(n / 2);
    if (n === 0) return r;
    b = ddMul(b, b);
  }
}
/** 1/x as a double-double (Dekker remainder of the division). */
function ddRecip(x: number): DD {
  const q = 1 / x, t = twoProd(q, x);
  return norm(q, ((1 - t.p) - t.err) / x);
}

/** ln x as hi + lo (≈ 2^-100 relative): the §3.8 ln reduction (m in [√½, √2), s = (m−1)/(m+1), odd series to s^21) carried in
 *  double-double: s gets its division remainder (Dekker), e·ln2 uses the Cody-Waite pair, partial sums are joined with exact two-sums.
 *  Replaces the card's Newton tail (x·exp(−lh) − 1), whose error is exp's own rounding (≈1e-16) and so cannot meet 4 ULP for large |y·ln x|. */
function lnDD(x: number): DD {
  let { m, e } = frexp(x);
  if (m < SQRT1_2) { m *= 2; e -= 1; }
  const u = m - 1;                            // exact (Sterbenz)
  const d = 2 + u, dLo = (2 - d) + u;         // Fast2Sum: d + dLo = 2 + u exactly
  const s = u / d, sd = twoProd(s, d);
  const S = norm(s, (((u - sd.p) - sd.err) - s * dLo) / d);   // S = u/(2+u) to ~2^-106
  const S2 = ddMul(S, S);
  // R = 1/3 + s²/5 + … + s^18/21, with 1/3 carried as a double-double; T = 2·S·S²·R (the s³ … s²¹ terms)
  const R = norm(INV_ODD[1], THIRD_LO + S2.hi * horner(S2.hi, INV_ODD, 2, 10));
  const T = ddMul(ddMul(S, S2), R);
  const lnm = ddAdd({ hi: 2 * S.hi, lo: 2 * S.lo }, { hi: 2 * T.hi, lo: 2 * T.lo });
  return ddAdd({ hi: e * LN2_HI, lo: e * LN2_LO }, lnm);   // e·LN2_HI is exact
}

/** x > 0; pow(0, y > 0) = 0; pow(x, 0) = 1; x < 0 (or 0 with y ≤ 0) -> EngineFault('I0.domain'). */
export function pow(x: number, y: number): number {
  nanCheck(x, 'pow'); nanCheck(y, 'pow');
  if (y === 0) return 1;
  if (x === 1) return 1;
  if (x === 0) { if (y > 0) return 0; throw new EngineFault('I0.domain', `pow(0, ${y})`); }
  if (x < 0) throw new EngineFault('I0.domain', `pow(${x}, ${y})`);
  // Small integer exponents (|y| ≤ 64) use repeated squaring: exact whenever the power is representable (2^10 = 1024 exactly).
  if (Math.floor(y) === y && Math.abs(y) <= 64) {
    // QA #25: y < 0 used 1/(x^|y|), which overflowed in x^|y| although the result is finite. Now (1/x)^|y|: every partial product
    // lies between 1 and the result, so it overflows only if the result does and underflows (to 0 / subnormal) with it.
    const r = powInt(y > 0 ? { hi: x, lo: 0 } : ddRecip(x), Math.abs(y));
    const v = r.hi + r.lo;
    if (!Number.isFinite(v)) throw new EngineFault('I0.overflow', `pow(${x}, ${y}) overflows`);
    return v;
  }
  const l = lnDD(x);                         // ln x = l.hi + l.lo (extra-precision tail)
  const { p, err } = twoProd(y, l.hi);
  const lo = err + y * l.lo;                 // y·ln x = p + lo
  const v = exp(p) * (1 + lo);               // low part applied as exp(hi)·(1 + lo)
  if (!Number.isFinite(v)) throw new EngineFault('I0.overflow', `pow(${x}, ${y}) overflows`);
  return v;
}

export function tanh(x: number): number {
  nanCheck(x, 'tanh');
  if (Math.abs(x) > 22) return x > 0 ? 1 : -1;
  if (Math.abs(x) < 0.55) { const e = expm1(2 * x); return e / (e + 2); }
  return 1 - 2 / (exp(2 * x) + 1);
}

export function sigmoid(x: number): number {
  nanCheck(x, 'sigmoid');
  if (x >= 0) return 1 / (1 + exp(-x));
  const e = exp(x);
  return e / (1 + e);
}

