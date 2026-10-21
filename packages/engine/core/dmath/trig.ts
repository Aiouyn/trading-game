// T02-03: sin, cos, atan, atan2 (02 §3.8). Coefficient literals are copied from fdlibm (netlib k_sin.c, k_cos.c, e_rem_pio2.c, s_atan.c, e_atan2.c).
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
const PIO2 = 1.5707963267948966;                                          // π/2

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

/** fdlibm s_atan.c (netlib, Sun Microsystems 1993): atan(atanhi[i]) breakpoints 0.5, 1, 1.5, ∞ as hi + lo. */
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00] as const;
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17] as const;
/** fdlibm s_atan.c aT[0..10]: atan(x) ≈ x − x·(s1 + s2) on |x| < 7/16. */
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02] as const;

/** atan(ax) for finite ax ≥ 0, the fdlibm s_atan.c reduction (QA #33: replaces the π/6-shift series, 3.34 ULP at tan(π/12)). */
function atanPos(ax: number): number {
  if (ax >= 7.378697629483821e19) return ATANHI[3] + ATANLO[3];          // ≥ 2^66
  let id = -1, x = ax;
  if (ax < 0.4375) { if (ax < 1.862645149230957e-9) return ax; }        // < 2^−29
  else if (ax < 1.1875) {
    if (ax < 0.6875) { id = 0; x = (2 * ax - 1) / (2 + ax); } else { id = 1; x = (ax - 1) / (ax + 1); }
  } else if (ax < 2.4375) { id = 2; x = (ax - 1.5) / (1 + 1.5 * ax); } else { id = 3; x = -1 / ax; }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  return ATANHI[id]! - ((x * (s1 + s2) - ATANLO[id]!) - x);
}

export function atan(x: number): number {
  nanDomain(x, 'atan');
  if (x === 0) return x;
  const r = Math.abs(x) === Infinity ? PIO2 : atanPos(Math.abs(x));
  return x < 0 ? -r : r;
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
  // fdlibm e_atan2.c: z = atan(|y/x|) with the |y/x| > 2^60 and (x < 0, |y/x| < 2^−60) shortcuts, then π − (z − π_lo) for x < 0.
  const q = ay / ax;
  let z: number;
  if (q > 1.152921504606847e18) z = PIO2 + 0.5 * PI_LO;
  else if (isNeg(x) && q < 8.673617379884035e-19) z = 0;
  else z = atanPos(q);
  const r = isNeg(x) ? PI - (z - PI_LO) : z;
  return sy * r;
}
