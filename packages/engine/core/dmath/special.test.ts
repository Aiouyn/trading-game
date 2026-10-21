// T02-03 tests: 02#14 (seven vector files within the §3.8 bounds + golden hash), AS241 transcription hash sums, worked examples.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonDecode } from '../canon';
import { sha256 } from '../crypto/sha256';
import { toHex } from '../crypto/hex';
import { EngineFault } from '../types';
import { roundToF64 } from '../../../../tools/dmath-ref/bigfloat';
import { refErf, refLgamma, refNormCdf } from '../../../../tools/dmath-ref/ref-special';
import * as dmath from './index';
import { bitsToF64, erf, erfc, f64ToBits, lgamma, normCdf, normInv, normPdf, ulpDistance } from './index';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'vectors');
interface Vec { fn: string; inputs: bigint[][]; expected: bigint[] }
const load = (fn: string): Vec => canonDecode(readFileSync(join(DIR, `${fn}.vec`))) as Vec;
const call = (fn: string, a: number[]): number => (dmath as unknown as Record<string, (...x: number[]) => number>)[fn]!(...a);
const thrown = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `non-fault ${String(e)}`; } };
const rel = (a: number, b: number): number => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));
/** Every vector file, in golden order (tools/dmath-ref/gen-vectors.ts VECTOR_FNS). */
const ALL_FNS = ['exp', 'expm1', 'ln', 'log1p', 'log2', 'log10', 'pow', 'tanh', 'sigmoid',
  'sin', 'cos', 'atan', 'atan2', 'erf', 'erfc', 'normCdf', 'normInv', 'lgamma'] as const;

describe('02#14 dmath.exp, ln, pow, sin, cos, normInv, erf match the 20 test-vector file (10,000 vectors each) within the stated ULP bounds and bit-exactly across platforms', () => {
  const ULP = { exp: 2, ln: 2, pow: 4, sin: 2, cos: 2, erf: 4 } as const;
  for (const fn of ['exp', 'ln', 'pow', 'sin', 'cos', 'erf'] as const) {
    it(`${fn}: max ULP ≤ ${ULP[fn]}`, () => {
      const v = load(fn); expect(v.inputs.length).toBe(10000);
      let max = 0;
      v.inputs.forEach((a, i) => { const u = ulpDistance(call(fn, a.map(bitsToF64)), bitsToF64(v.expected[i]!)); if (u > max) max = u; });
      console.log(`${fn}: max ${max} ULP over 10000 vectors (bound ${ULP[fn]})`);
      expect(max).toBeLessThanOrEqual(ULP[fn]);
    });
  }
  it('normInv: max relative error ≤ 1e-15', () => {
    const v = load('normInv'); expect(v.inputs.length).toBe(10000);
    let max = 0, maxU = 0;
    v.inputs.forEach((a, i) => { const o = normInv(bitsToF64(a[0]!)), e = bitsToF64(v.expected[i]!); max = Math.max(max, rel(o, e)); maxU = Math.max(maxU, ulpDistance(o, e)); });
    console.log(`normInv: max relative ${max.toExponential(3)} (${maxU} ULP) over 10000 vectors (bound 1e-15)`);
    expect(max).toBeLessThanOrEqual(1e-15);
  });
  it('unbounded functions (atan, atan2, erfc, normCdf, lgamma): 10000 vectors each, error reported, golden-hash pinned', () => {
    for (const fn of ['atan', 'atan2', 'erfc', 'normCdf', 'lgamma']) {
      const v = load(fn); expect(v.inputs.length).toBe(10000);
      let maxU = 0, maxR = 0, flushed = 0;
      v.inputs.forEach((a, i) => {
        const o = call(fn, a.map(bitsToF64)), e = bitsToF64(v.expected[i]!);
        if (o === 0 && e !== 0 && Math.abs(e) < 2.3e-308) { flushed++; return; }   // CALERF XBIG flush (erfc ≥ 26.543)
        maxU = Math.max(maxU, ulpDistance(o, e)); maxR = Math.max(maxR, rel(o, e));
      });
      console.log(`${fn}: max ${maxU} ULP, max relative ${maxR.toExponential(3)}, ${flushed} subnormal results flushed to 0`);
      expect(Number.isFinite(maxU)).toBe(true);
    }
  });
  it('golden.sha256 equals SHA-256 of the engine output bit patterns over all 18 vector files', () => {
    const bytes: number[] = [];
    for (const fn of ALL_FNS) for (const a of load(fn).inputs) {
      const b = f64ToBits(call(fn, a.map(bitsToF64)));
      for (let i = 7; i >= 0; i--) bytes.push(Number((b >> BigInt(8 * i)) & 0xffn));
    }
    expect(toHex(sha256(Uint8Array.from(bytes)))).toBe(readFileSync(join(DIR, 'golden.sha256'), 'utf8').trim());
  });
});

describe('T02-03 Quant rulings on #33', () => {
  it('erfc keeps the CALERF 26.543 cutoff and returns exactly +0 past it', () => {
    for (const x of [26.543, 26.5430001, 27, 30, 1e10, 1e300]) expect(Object.is(erfc(x), 0)).toBe(true);
    expect(erfc(26.542)).toBeGreaterThan(0);
    for (const x of [26.543, 40, 1e300]) expect(erfc(-x)).toBe(2);
  });
  it('AC-02-03-ERF-SPLIT (E-63.5): within 4 ULP of the 256-bit reference on a dense grid over [0.46875, 0.5] (both signs); split stays at 0.5', () => {
    let max = 0;
    for (let i = 0; i <= 2000; i++) {
      const x = 0.46875 + (0.5 - 0.46875) * i / 2000;
      for (const s of [1, -1]) max = Math.max(max, ulpDistance(erf(s * x), roundToF64(refErf(s * x))));
    }
    console.log(`ERF-SPLIT: max ${max} ULP over 4002 points in ±[0.46875, 0.5] (bound 4)`);
    expect(max).toBeLessThanOrEqual(4);
  });
  it('AC-02-03-NORMCDF-TAIL: relative error ≤ 5e-13 on [-37.5, 0] vs the reference; exactly 0 below -26.543·√2', () => {
    let max = 0;
    for (let i = 0; i <= 3000; i++) { const x = -37.5 * i / 3000; const e = roundToF64(refNormCdf(x)); max = Math.max(max, Math.abs(normCdf(x) - e) / e); }
    console.log(`NORMCDF-TAIL: max relative ${max.toExponential(3)} over 3001 points in [-37.5, 0]`);
    expect(max).toBeLessThanOrEqual(5e-13);
    const edge = -26.543 * Math.SQRT2;
    for (const x of [edge - 1e-12, -37.54, -38, -100, -1e300, -Infinity]) expect(Object.is(normCdf(x), 0)).toBe(true);
  });
});

describe('T02-03 worked examples (card test plan)', () => {
  it('erf, normCdf, normInv, lgamma', () => {
    expect(Object.is(erf(0), 0)).toBe(true);
    expect(ulpDistance(erf(1), 0.8427007929497149)).toBeLessThanOrEqual(4);
    expect(ulpDistance(normCdf(1.959963984540054), 0.975)).toBeLessThanOrEqual(4);
    expect(rel(normInv(0.975), 1.959963984540054)).toBeLessThanOrEqual(1e-15);
    expect(rel(lgamma(10), 12.801827480081469)).toBeLessThanOrEqual(1e-14);
  });
  it('AS241 PPND16 three regions and symmetry', () => {
    expect(normInv(0.5)).toBe(0);
    for (const p of [2 ** -2, 2 ** -4, 2 ** -40]) expect(normInv(1 - p)).toBe(-normInv(p));   // 1 − p exact; one per region
    expect(rel(normInv(2 ** -40), -7.047700256664409)).toBeLessThanOrEqual(1e-15);   // r > 5 region; 256-bit reference value
    expect(rel(normInv(0.025), -1.959963984540054)).toBeLessThanOrEqual(1e-15);
  });
  it('faults: normInv outside (0, 1), lgamma x ≤ 0, NaN', () => {
    for (const p of [0, 1, -0.1, 1.1, Infinity]) {
      expect(thrown(() => normInv(p))).toBe('I0.domain');
      try { normInv(p); } catch (e) { expect((e as Error).message).toMatch(/^normInv\(.*\) outside \(0, 1\)$/); }   // its own guard, not ln's
    }
    for (const x of [0, -1, -Infinity, Infinity]) expect(thrown(() => lgamma(x))).toBe('I0.domain');
    expect(thrown(() => erf(NaN))).toBe('I0.nan'); expect(thrown(() => normInv(NaN))).toBe('I0.nan');
  });
  it('lgamma reflection for 0 < x < 0.5 and the tiny-x form', () => {
    expect(rel(lgamma(0.5), 0.5723649429247001)).toBeLessThanOrEqual(1e-14);      // ln √π
    expect(rel(lgamma(5e-324), 744.4400719213812)).toBeLessThanOrEqual(1e-15);     // −ln(5e-324)
  });
  it('erfc / normPdf symmetry', () => {
    expect(erfc(0)).toBe(1); expect(erfc(-Infinity)).toBe(2);
    expect(ulpDistance(normPdf(0), 0.3989422804014327)).toBeLessThanOrEqual(1);
    // 256-bit reference values e^{−x²/2}/√(2π), correctly rounded: the engine is exact at these points
    for (const [x, r] of [[0.5, 0.35206532676429947], [1, 0.24197072451914334], [1.5, 0.12951759566589172], [2, 0.05399096651318805]] as const) expect(normPdf(x)).toBe(r);
  });
  it('AS241 transcription: hash sums of the coefficient mantissas (AB 55.88319 28806 14901 4439, CD 49.33206 50330 16102 89036, EF 47.52583 31754 92896 71629)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'special.ts'), 'utf8');
    const block = (name: string): number[] => {
      const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src)!;
      return m[1]!.split(',').map((t) => Number(t.trim())).filter((v) => v !== 1 || name === 'A' || name === 'C' || name === 'E');
    };
    const mant = (v: number): number => { let m = Math.abs(v); while (m >= 10) m /= 10; while (m < 1) m *= 10; return m; };
    const sum = (names: string[]): number => names.flatMap(block).reduce((s, v) => s + mant(v), 0);
    expect(sum(['A', 'B'])).toBeCloseTo(55.8831928806149014439, 10);
    expect(sum(['C', 'D'])).toBeCloseTo(49.33206503301610289036, 10);
    expect(sum(['E', 'F'])).toBeCloseTo(47.52583317549289671629, 10);
  });
});

describe('AC-02-03-LGAMMA-ZEROS (Quant ruling): |lgamma − ref| ≤ 1e-14 absolute on [0.5, 3]; lgamma(1) = lgamma(2) = 0 exactly', () => {
  it('lgamma.vec (10,000 vectors): absolute ≤ 1e-14 on [0.5, 3], relative ≤ 1e-14 elsewhere for x > 0', () => {
    const v = load('lgamma'); let mAbs = 0, mRel = 0, nIn = 0;
    v.inputs.forEach((a, i) => {
      const x = bitsToF64(a[0]!), o = lgamma(x), e = bitsToF64(v.expected[i]!);
      if (x >= 0.5 && x <= 3) { nIn++; mAbs = Math.max(mAbs, Math.abs(o - e)); } else mRel = Math.max(mRel, rel(o, e));
    });
    console.log(`lgamma.vec: ${nIn} inputs in [0.5, 3] max abs ${mAbs.toExponential(3)}; others max rel ${mRel.toExponential(3)}`);
    expect(mAbs).toBeLessThanOrEqual(1e-14); expect(mRel).toBeLessThanOrEqual(1e-14);
  });
  it('lgamma(1) and lgamma(2) are exactly +0', () => {
    expect(Object.is(lgamma(1), 0)).toBe(true); expect(Object.is(lgamma(2), 0)).toBe(true);
  });
  it('10,001-point grid on [0.5, 3.0] against the tools/dmath-ref reference: absolute error ≤ 1e-14', async () => {
    let m = 0;
    for (let i = 0; i <= 10000; i++) {
      const x = 0.5 + 2.5 * i / 10000;
      m = Math.max(m, Math.abs(lgamma(x) - roundToF64(refLgamma(x))));
      if (i % 250 === 0) await new Promise((r) => setTimeout(r, 0));   // keep the vitest worker RPC alive during the ~60 s reference run
    }
    expect(m).toBeLessThanOrEqual(1e-14);
  }, 600000);
});
