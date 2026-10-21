// T02-02/T02-03 vector generator (Node tool, NOT engine code). Usage: npx tsx tools/dmath-ref/gen-vectors.ts [count=10000] [seed=20202]
// Writes packages/engine/core/dmath/vectors/<fn>.vec = canonEncode({ fn, inputs: [[bits…]], expected: [bits] }), every double as its
// u64 IEEE-754 bit pattern (bigint), expected = refX(input) correctly rounded (half-even) to binary64.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonDecode, canonEncode } from '../../packages/engine/core/canon';
import { sha256 } from '../../packages/engine/core/crypto/sha256';
import { toHex } from '../../packages/engine/core/crypto/hex';
import * as dmath from '../../packages/engine/core/dmath';

import { BigFloat, roundToF64 } from './bigfloat';
import { refExp, refExpm1, refLn, refLog10, refLog1p, refLog2, refPow, refSigmoid, refTanh } from './ref-exp';
import { refErf, refErfc, refLgamma, refNormCdf, refNormInv } from './ref-special';
import { refAtan, refAtan2, refCos, refSin } from './ref-trig';

export const VECTOR_FNS = ['exp', 'expm1', 'ln', 'log1p', 'log2', 'log10', 'pow', 'tanh', 'sigmoid',
  'sin', 'cos', 'atan', 'atan2', 'erf', 'erfc', 'normCdf', 'normInv', 'lgamma'] as const;   // T02-03 appends the last nine
export const VECTOR_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packages/engine/core/dmath/vectors');

const bits = (x: number): bigint => { const v = new DataView(new ArrayBuffer(8)); v.setFloat64(0, x); return v.getBigUint64(0); };

/** Fixed xorshift32 sequence; u() in [0, 1) from two draws (53 bits). */
function xorshift(seed: number): { u(): number; sign(): number } {
  let s = seed >>> 0 || 1;
  const n = (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  return { u: () => ((n() >>> 5) * 67108864 + (n() >>> 6)) / 9007199254740992, sign: () => (n() & 1 ? -1 : 1) };
}
/** log-uniform magnitude in [10^lo, 10^hi). */
const logU = (u: number, lo: number, hi: number): number => 10 ** (lo + (hi - lo) * u);

type Gen = (r: ReturnType<typeof xorshift>, i: number) => number[];
const mixed = (lo: number, hi: number, magLo: number, magHi: number): Gen => (r, i) => {
  if (i % 2 === 0) return [lo + (hi - lo) * r.u()];
  const x = r.sign() * logU(r.u(), magLo, magHi);
  return [x < lo ? lo : x > hi ? hi : x];
};
const positive: Gen = (r, i) => i % 4 === 0 ? [1 + r.sign() * logU(r.u(), -16, -1)] : [logU(r.u(), -307, 308)];
const EDGES: Record<(typeof VECTOR_FNS)[number], number[][]> = {
  exp: [[0], [5e-324], [-5e-324], [1], [-1], [709.78], [709], [-745], [-745.13], [-708.5], [0.5 * Math.LN2], [-0.5 * Math.LN2]],
  expm1: [[0], [5e-324], [-5e-324], [1], [-1], [1e-5], [-1e-5], [0.5], [-0.5], [709], [-800]],
  ln: [[5e-324], [2.2250738585072014e-308], [1], [2], [0.5], [Math.SQRT2], [Math.SQRT1_2], [1.7976931348623157e308], [1 + 2 ** -52], [1 - 2 ** -53], [1.0002431733420274], [1.0155840120081805]],
  log1p: [[0], [5e-324], [-5e-324], [1e-4], [-1e-4], [-0.999999], [1], [1e300]],
  log2: [[5e-324], [1], [2], [1024], [0.5], [1.7976931348623157e308]],
  log10: [[5e-324], [1], [10], [1000], [0.001], [1.7976931348623157e308]],
  pow: [[2, 10], [10, -2], [2, 0.5], [1e-10, 30.5], [1e10, -30.5], [3, 64], [3, -64], [1.0001, 1e6], [438748.6334683518, -54], [4.34e-8, -41], [75912.29952825277, -64], [181375.75309165695, -61],
    [10627020.847781157, -46], [18762152.589803282, -42], [1e10, -64]],
  tanh: [[0], [5e-324], [-5e-324], [0.55], [-0.55], [0.5499999999999999], [22], [-22], [22.5], [1e300], [-1e300]],
  sigmoid: [[0], [5e-324], [-5e-324], [1], [-1], [36], [-36], [745], [-745], [800], [-800], [1e300], [-1e300]],
  sin: [[0], [-0], [5e-324], [1e-9], [Math.PI / 6], [Math.PI / 4], [Math.PI / 2], [Math.PI], [3], [1e6], [-1e6], [710.4], [0.3], [0.78125], [355]],
  cos: [[0], [5e-324], [Math.PI / 4], [Math.PI / 2], [Math.PI], [1e6], [-1e6], [0.3], [0.78125], [0.29999999999999993], [355]],
  atan: [[0], [-0], [5e-324], [1], [-1], [0.2679491924311227], [0.26794919243112275], [1e300], [-1e300], [1.0000000000000002], [0.9999999999999999]],
  atan2: [[0, 1], [-0, 1], [0, -1], [-0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [1e-300, 1e300], [1e300, 1e-300], [1e-300, -1e300]],
  erf: [[0], [-0], [5e-324], [1e-20], [0.5], [0.5000000000000001], [1], [-1], [3], [4], [4.000000000000001], [5.9], [6], [-6]],
  erfc: [[0], [0.5], [0.5000000000000001], [-0.5], [1], [3], [4], [4.000000000000001], [10], [26.5], [26.6], [-6], [27]],
  normCdf: [[0], [1.959963984540054], [-1.959963984540054], [1], [-1], [-8], [-20], [-37.5], [8.2], [5e-324]],
  normInv: [[0.5], [0.975], [0.025], [0.075], [0.925], [1e-300], [5e-324], [0.9999999999999999], [1e-10], [0.5 - 0.425], [0.5 + 0.425],
    [6.388754400538087e-12]],
  lgamma: [[1], [2], [10], [0.5], [0.4999999999999999], [5e-324], [1e-300], [3], [1e300], [2.5], [100], [1e-8]],
};
const GENS: Record<(typeof VECTOR_FNS)[number], Gen> = {
  exp: mixed(-745, 709, -300, 2.85),
  expm1: mixed(-800, 709, -300, 2.85),
  ln: positive, log2: positive, log10: positive,
  log1p: (r, i) => i % 2 === 0 ? [-logU(r.u(), -300, -1e-9) ] : [logU(r.u(), -300, 300)],
  pow: (r, i) => {   // x log-uniform in [1e-10, 1e10]; y with |y·ln x| ≤ 700; every 8th an integer |y| ≤ 64
    const x = logU(r.u(), -10, 10), lx = Math.abs(Math.log(x)) || 1;
    if (i % 8 === 0) return [x, Math.min(64, Math.floor(700 / lx)) * (r.u() * 2 - 1) | 0];
    return [x, r.sign() * logU(r.u(), -6, Math.log10(700 / lx))];
  },
  tanh: mixed(-30, 30, -300, 300),
  sigmoid: mixed(-800, 800, -300, 300),
  sin: mixed(-1e6, 1e6, -300, 6), cos: mixed(-1e6, 1e6, -300, 6),
  atan: (r, i) => i % 4 === 0 ? [20 * r.u() - 10] : [r.sign() * logU(r.u(), -300, 300)],
  atan2: (r, i) => i % 4 === 0 ? [20 * r.u() - 10, 20 * r.u() - 10] : [r.sign() * logU(r.u(), -50, 50), r.sign() * logU(r.u(), -50, 50)],
  erf: mixed(-6, 6, -300, 0.78), erfc: mixed(-6, 27, -300, 1.43), normCdf: mixed(-38, 9, -300, 1.58),
  normInv: (r, i) => {   // p ∈ (0, 1): uniform, lower tail log-uniform in [1e-300, 0.5), upper tail 1 − 10^[-16, -0.302]
    if (i % 3 === 0) return [r.u() || 0.5];
    if (i % 3 === 1) return [logU(r.u(), -300, -0.302)];
    return [1 - logU(r.u(), -16, -0.302)];
  },
  lgamma: (r, i) => i % 2 === 0 ? [30 * r.u() || 1] : [logU(r.u(), -300, 300)],
};
const REFS: Record<(typeof VECTOR_FNS)[number], (...a: number[]) => BigFloat> = {
  exp: (x) => refExp(x!), expm1: (x) => refExpm1(x!), ln: (x) => refLn(x!), log1p: (x) => refLog1p(x!), log2: (x) => refLog2(x!),
  log10: (x) => refLog10(x!), pow: (x, y) => refPow(x!, y!), tanh: (x) => refTanh(x!), sigmoid: (x) => refSigmoid(x!),
  sin: (x) => refSin(x!), cos: (x) => refCos(x!), atan: (x) => refAtan(x!), atan2: (y, x) => refAtan2(y!, x!),
  erf: (x) => refErf(x!), erfc: (x) => refErfc(x!), normCdf: (x) => refNormCdf(x!),
  normInv: (p) => refNormInv(p!, dmath.normInv(p!)),   // Newton start only; the 5 Newton steps on refNormCdf fix the value
  lgamma: (x) => refLgamma(x!),
};
/** Signed-zero results the BigFloat path cannot carry (BigFloat has one zero). */
const SIGNED_ZERO: Partial<Record<(typeof VECTOR_FNS)[number], (...a: number[]) => number | null>> = {
  sin: (x) => (x === 0 ? x : null), atan: (x) => (x === 0 ? x : null), erf: (x) => (x === 0 ? x : null),
  atan2: (y, x) => (y === 0 && !(Object.is(x, -0) || x! < 0) ? y : null),
};

export function generateVectors(fn: string, count: number, seed: number): { inputs: number[][]; expected: number[] } {
  const f = fn as (typeof VECTOR_FNS)[number];
  if (!GENS[f]) throw new Error(`unknown fn ${fn}`);
  const r = xorshift(seed ^ (VECTOR_FNS.indexOf(f) * 0x9e3779b1));
  const inputs: number[][] = [...EDGES[f]];
  for (let i = 0; inputs.length < count; i++) inputs.push(GENS[f](r, i));
  const expected = inputs.map((a) => SIGNED_ZERO[f]?.(...a) ?? roundToF64(REFS[f](...a)));
  writeFileSync(join(VECTOR_DIR, `${fn}.vec`), canonEncode({ fn, inputs: inputs.map((a) => a.map(bits)), expected: expected.map(bits) }));
  return { inputs, expected };
}

/** golden.sha256 = SHA-256 over the concatenated big-endian u64 bit patterns of the ENGINE dmath outputs on every committed vector,
 *  in VECTOR_FNS order (exp.test.ts recomputes it; 20B runs that test on arm64). */
export function writeGolden(): string {
  const bytes: number[] = [];
  for (const fn of VECTOR_FNS) {
    const v = canonDecode(readFileSync(join(VECTOR_DIR, `${fn}.vec`))) as { inputs: bigint[][] };
    for (const a of v.inputs) {
      const out = bits((dmath[fn] as (...x: number[]) => number)(...a.map(dmath.bitsToF64)));
      for (let i = 7; i >= 0; i--) bytes.push(Number((out >> BigInt(8 * i)) & 0xffn));
    }
  }
  const h = toHex(sha256(Uint8Array.from(bytes)));
  writeFileSync(join(VECTOR_DIR, 'golden.sha256'), `${h}\n`);
  return h;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const count = Number(process.argv[2] ?? 10000), seed = Number(process.argv[3] ?? 20202);
  for (const fn of VECTOR_FNS) { const t = process.hrtime.bigint(); generateVectors(fn, count, seed); console.log(fn, `${(process.hrtime.bigint() - t) / 1000000n} ms`); }
  console.log('golden', writeGolden());
}
