// T02-03: sin, cos, atan, atan2 (02 §3.8). Coefficient literals are copied from fdlibm (netlib k_sin.c, k_cos.c, e_rem_pio2.c).
import { EngineFault } from '../types';
import { bitsToF64, f64ToBits } from './bits';

const TRIG_MAX = 1e6;                       // card: domain [-1e6, 1e6]
const INVPIO2 = 6.36619772367581382433e-01; // 2/π (fdlibm invpio2)
// Cody-Waite 3-part π/2 (card step 1; fdlibm e_rem_pio2.c): each PIO2_k has 33 bits, PIO2_kT = π/2 − (PIO2_1 + … + PIO2_k).
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
// fdlibm k_sin.c S1..S6 and k_cos.c C1..C6.
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
const PIO4 = 0.7853981633974483;

const PI = 3.141592653589793, PI_LO = 1.2246467991473532e-16;          // π = PI + PI_LO
const PIO2 = 1.5707963267948966, PIO2_LO = 6.123233995736766e-17;      // π/2
const PIO6 = 0.5235987755982989, PIO6_LO = -5.360408832255455e-17;     // π/6
const SQRT3 = 1.7320508075688772;
const TAN_PI12 = 0.2679491924311227;                                    // tan(π/12) = 2 − √3

function nanDomain(x: number, fn: string): void {
  if (x !== x) throw new EngineFault('I0.nan', `${fn}(NaN)`);
}
/** Round half-even to an integer (|v| < 2^31 here). */
function rhe(v: number): number { const f = Math.floor(v + 0.5); return f - v === 0.5 && f % 2 !== 0 ? f - 1 : f; }

/** x = n·π/2 + (y0 + y1), |y0| ≲ π/4. Three Cody-Waite rounds (fdlibm medium path, run unconditionally: fixed control flow). */
function remPio2(x: number): { n: number; y0: number; y1: number } {
  if (Math.abs(x) <= PIO4) return { n: 0, y0: x, y1: 0 };
  const fn = rhe(x * INVPIO2);
  let r = x - fn * PIO2_1, w = fn * PIO2_1T;            // fn·PIO2_1 exact (|fn| < 2^20, PIO2_1 has 33 bits)
  let t = r; w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w);
  t = r; w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w);
  const y0 = r - w;
  return { n: fn, y0, y1: (r - y0) - w };
}
/** fdlibm __kernel_sin(x, y, iy=1). */
function kSin(x: number, y: number): number {
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
/** fdlibm __kernel_cos(x, y), including the qx split for |x| ≥ 0.3 from k_cos.c (qx = x/4 with the low word cleared). */
function kCos(x: number, y: number): number {
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const ax = Math.abs(x);
  if (ax < 0.3) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ax > 0.78125 ? 0.28125 : bitsToF64(((f64ToBits(ax) >> 32n) - 0x00200000n) << 32n);
  const hz = 0.5 * z - qx, a = 1 - qx;
  return a - (hz - (z * r - x * y));
}

function domain(x: number, fn: string): void {
  nanDomain(x, fn);
  if (!(Math.abs(x) <= TRIG_MAX)) throw new EngineFault('I0.domain', `${fn}(${x}) outside [-1e6, 1e6]`);
}

export function sin(x: number): number {
  domain(x, 'sin');
  if (Math.abs(x) < 2 ** -27) return x;
  const { n, y0, y1 } = remPio2(x);
  switch (((n % 4) + 4) % 4) {
    case 0: return kSin(y0, y1);
    case 1: return kCos(y0, y1);
    case 2: return -kSin(y0, y1);
    default: return -kCos(y0, y1);
  }
}

export function cos(x: number): number {
  domain(x, 'cos');
  const { n, y0, y1 } = remPio2(x);
  switch (((n % 4) + 4) % 4) {
    case 0: return kCos(y0, y1);
    case 1: return -kSin(y0, y1);
    case 2: return -kCos(y0, y1);
    default: return kSin(y0, y1);
  }
}

/** 1/(2k+1)·(−1)^k for k = 0..11: the odd series of atan to degree 23 (card step 2). */
const ATAN_C = [1, -1 / 3, 1 / 5, -1 / 7, 1 / 9, -1 / 11, 1 / 13, -1 / 15, 1 / 17, -1 / 19, 1 / 21, -1 / 23] as const;
/** atan(t) for 0 ≤ t ≤ tan(π/12): t + t·z·P(z), z = t². */
function atanSeries(t: number): number {
  const z = t * t;
  let p = ATAN_C[11];
  for (let k = 10; k >= 1; k--) p = p * z + ATAN_C[k]!;
  return t + t * (z * p);
}
/** atan on 0 ≤ x ≤ 1 as hi + lo (the π/6 shift kept compensated). */
function atan01(x: number): { hi: number; lo: number } {
  if (x <= TAN_PI12) return { hi: atanSeries(x), lo: 0 };
  const t = (x * SQRT3 - 1) / (x + SQRT3);
  return { hi: PIO6, lo: PIO6_LO + atanSeries(t) };
}

export function atan(x: number): number {
  nanDomain(x, 'atan');
  const ax = Math.abs(x);
  let r: number;
  if (ax === Infinity) r = PIO2;
  else if (ax <= 1) { const a = atan01(ax); r = a.hi + a.lo; }
  else { const a = atan01(1 / ax); r = PIO2 - a.hi + (PIO2_LO - a.lo); }
  return x < 0 ? -r : x === 0 ? x : r;
}

const isNeg = (z: number): boolean => z < 0 || Object.is(z, -0);

/** atan2 with the IEEE quadrant table and signed zeros spelled out (card step 2). */
export function atan2(y: number, x: number): number {
  nanDomain(y, 'atan2'); nanDomain(x, 'atan2');
  const sy = isNeg(y) ? -1 : 1;
  if (y === 0) return isNeg(x) ? sy * PI : y;                       // atan2(±0, x≥+0) = ±0; atan2(±0, x≤−0) = ±π
  if (x === 0) return sy * PIO2;
  if (x === Infinity) return y === Infinity || y === -Infinity ? sy * PIO4 : sy * 0;
  if (x === -Infinity) return y === Infinity || y === -Infinity ? sy * 3 * PIO4 : sy * PI;
  if (y === Infinity || y === -Infinity) return sy * PIO2;
  const ay = Math.abs(y), ax = Math.abs(x);
  // a = atan(ay/ax) ∈ [0, π/2] as hi + lo; the quotient is formed once (its rounding is the one unavoidable error).
  let hi: number, lo: number;
  if (ay <= ax) { const q = ay / ax; const a = atan01(q); hi = a.hi; lo = a.lo; }
  else { const q = ax / ay; const a = atan01(q); hi = PIO2 - a.hi; lo = PIO2_LO - a.lo; }
  let r: number;
  if (isNeg(x)) r = (PI - hi) + (PI_LO - lo);                         // π − a
  else r = hi + lo;
  return sy * r;
}
