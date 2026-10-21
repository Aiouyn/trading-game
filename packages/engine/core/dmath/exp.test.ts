// T02-02 tests: ULP bounds on the committed reference vectors (tools/dmath-ref, 256-bit BigFloat), worked examples, faults,
// kahanSum, the cross-platform golden hash, and the two property tests.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonDecode } from '../canon';
import { sha256 } from '../crypto/sha256';
import { toHex } from '../crypto/hex';
import { EngineFault } from '../types';
import * as dmath from './index';
import { bitsToF64, clamp, exp, expm1, f64ToBits, frexp, kahanSum, lerp, ln, log10, log1p, log2, pow, scalb, sigmoid, tanh, ulpDistance } from './index';

/** 256-bit reference value of ln(x) from the committed ln.vec (the input must be one of its vectors). */
const refLnPoint = (x: number): number => { const v = load('ln'); const i = v.inputs.findIndex((a) => a[0] === f64ToBits(x)); if (i < 0) throw new Error(`no ln vector for ${x}`); return bitsToF64(v.expected[i]!); };
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'vectors');
/** 02 §3.8 max error per function (ULP). */
const BOUND = { exp: 2, expm1: 2, ln: 2, log1p: 2, log2: 3, log10: 3, pow: 4, tanh: 3, sigmoid: 3 } as const;
/** Every vector file in golden order (gen-vectors VECTOR_FNS; T02-03 appended the last nine). */
const ALL_FNS = ['exp', 'expm1', 'ln', 'log1p', 'log2', 'log10', 'pow', 'tanh', 'sigmoid',
  'sin', 'cos', 'atan', 'atan2', 'erf', 'erfc', 'normCdf', 'normInv', 'lgamma'] as const;
const FNS = ['exp', 'expm1', 'ln', 'log1p', 'log2', 'log10', 'pow', 'tanh', 'sigmoid'] as const;
const fcParams = { numRuns: 200, seed: 20202 };   // PARAM.tm_property_runs_pr default (20 §3.4)

interface Vec { fn: string; inputs: bigint[][]; expected: bigint[] }
const load = (fn: string): Vec => canonDecode(readFileSync(join(DIR, `${fn}.vec`))) as Vec;
const call = (fn: (typeof FNS)[number], a: number[]): number => (dmath[fn] as (...x: number[]) => number)(...a);
const be8 = (b: bigint): number[] => { const o: number[] = []; for (let i = 7; i >= 0; i--) o.push(Number((b >> BigInt(8 * i)) & 0xffn)); return o; };
const thrown = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `non-fault ${String(e)}`; } };

describe('T02-02 dmath: reference vectors', () => {
  for (const fn of FNS) {
    it(`02§3.8 ${fn}: max ULP error over the committed vectors ≤ ${BOUND[fn]}`, () => {
      const v = load(fn);
      expect(v.fn).toBe(fn); expect(v.inputs.length).toBe(10000); expect(v.expected.length).toBe(10000);
      let max = 0;
      v.inputs.forEach((a, i) => { const u = ulpDistance(call(fn, a.map(bitsToF64)), bitsToF64(v.expected[i]!)); if (u > max) max = u; });
      console.log(`${fn}: max ${max} ULP over ${v.inputs.length} vectors (bound ${BOUND[fn]})`);
      expect(max).toBeLessThanOrEqual(BOUND[fn]);
    });
  }
  it('golden.sha256 equals SHA-256 of the concatenated output bit patterns (cross-platform check; T02-03 extends it to 18 files)', () => {
    const bytes: number[] = [];
    for (const fn of ALL_FNS) for (const a of load(fn).inputs) bytes.push(...be8(f64ToBits((dmath as unknown as Record<string, (...x: number[]) => number>)[fn]!(...a.map(bitsToF64)))));
    expect(toHex(sha256(Uint8Array.from(bytes)))).toBe(readFileSync(join(DIR, 'golden.sha256'), 'utf8').trim());
  });
});

describe('T02-02 dmath: worked examples', () => {
  it('exact values (Object.is)', () => {
    expect(Object.is(exp(0), 1)).toBe(true);
    expect(Object.is(exp(1), 2.718281828459045)).toBe(true);
    expect(Object.is(ln(1), 0)).toBe(true);
    expect(ulpDistance(ln(2.718281828459045), 1)).toBeLessThanOrEqual(1);
    expect(Object.is(exp(-746), 0)).toBe(true);
    expect(Object.is(pow(2, 10), 1024)).toBe(true);
    expect(ulpDistance(pow(10, -2), 0.01)).toBeLessThanOrEqual(1);
    expect(Object.is(sigmoid(0), 0.5)).toBe(true);
    expect(Object.is(tanh(0), 0)).toBe(true);
  });
  it('pow special cases: pow(x, 0) = 1, pow(1, y) = 1, pow(0, y > 0) = 0', () => {
    expect(pow(7.5, 0)).toBe(1); expect(pow(1, 1e300)).toBe(1); expect(pow(0, 2.5)).toBe(0);
    expect(pow(3, 5)).toBe(243); expect(pow(2, -3)).toBe(0.125); expect(pow(1.5, 64)).toBe(1.5 ** 64);
  });
  it('faults: exp(NaN) I0.nan, ln(-1) I0.domain, pow(-2, 0.5) I0.domain, exp(710) I0.overflow', () => {
    expect(thrown(() => exp(NaN))).toBe('I0.nan');
    expect(thrown(() => ln(-1))).toBe('I0.domain');
    expect(thrown(() => ln(0))).toBe('I0.domain');
    expect(thrown(() => pow(-2, 0.5))).toBe('I0.domain');
    expect(thrown(() => pow(0, -1))).toBe('I0.domain');
    expect(thrown(() => exp(710))).toBe('I0.overflow');
    expect(thrown(() => clamp(NaN, 0, 1))).toBe('I0.nan');
    expect(thrown(() => log2(-1))).toBe('I0.domain');
    expect(thrown(() => pow(-0.5, 0.5))).toBe('I0.domain');
    expect(thrown(() => pow(1e300, 2))).toBe('I0.overflow');      // integer branch
    expect(thrown(() => pow(1e300, 2.5))).toBe('I0.overflow');    // exp branch
    expect(exp(-Infinity)).toBe(0); expect(exp(-1e300)).toBe(0);
  });
  it('QA #25: pow(0, 0) = 1 (y = 0 is checked before x = 0); ln(+Infinity) throws I0.overflow (card, E-53)', () => {
    expect(pow(0, 0)).toBe(1); expect(pow(0, -0)).toBe(1);
    expect(thrown(() => ln(Infinity))).toBe('I0.overflow');
    expect(thrown(() => log2(Infinity))).toBe('I0.overflow');
  });
  it('QA #25: ln near 1 within 2 ULP (double-double reduction)', () => {
    // 256-bit reference (tools/dmath-ref refLn), also in ln.vec
    for (const x of [1.0002431733420274, 1.0155840120081805, 1 + 2 ** -52, 1 - 2 ** -53])
      expect(ulpDistance(ln(x), refLnPoint(x))).toBeLessThanOrEqual(2);
  });
  it('QA #25: pow with integer y in −64..−1 does not overflow on finite results; underflows to subnormal / 0', () => {
    // expected = correctly rounded (1/x)^n, computed exactly with rationals (≡ the 256-bit reference after rounding)
    const cases: [number, number, number][] = [[438748.6334683518, -54, 2.0909712036790256e-305], [4.34e-8, -41, 7.29324982039474e+301],
      [75912.29952825277, -64, 4.5711195229e-313], [10627020.847781157, -46, 5e-324]];
    for (const [x, y, want] of cases) expect(ulpDistance(pow(x, y), want)).toBeLessThanOrEqual(4);
    expect(pow(1e10, -64)).toBe(0);                                   // result below the subnormal range
    expect(thrown(() => pow(1e-10, -64))).toBe('I0.overflow');         // genuinely infinite result still faults
    expect(pow(2, -1074)).toBe(5e-324);
    // results near 2^1024: the Veltkamp split overflows inside ddMul; the product must stay finite (no NaN fault)
    expect(ulpDistance(pow(1.3e154, 2), 1.6899999999999998e+308)).toBeLessThanOrEqual(4);
    expect(ulpDistance(pow(7.7e-155, -2), 1.6866250632484398e+308)).toBeLessThanOrEqual(4);                                // exp branch unchanged (|y| > 64)
  });
  it('QA #25 (2): pow integer y < 0 near the range ends: 1/x via rescaled mantissa (no split overflow)', () => {
    // expected = correctly rounded exact rational (1/x)^n, i.e. the tools/dmath-ref value after rounding
    expect(ulpDistance(pow(1.18e304, -1), 8.474576271186441e-305)).toBeLessThanOrEqual(4);
    expect(pow(2.2250738585072014e-308, -1)).toBe(2 ** 1022);
    expect(ulpDistance(pow(1.7976931348623157e308, -1), 5.562684646268003e-309)).toBeLessThanOrEqual(4);   // subnormal
    expect(pow(1e301, -2)).toBe(0);
    expect(pow(1e301, -64)).toBe(0);
    expect(thrown(() => pow(5e-324, -1))).toBe('I0.overflow');   // 2^1074 is not finite
  });
  it('QA #25 (2): full-range sweep, integer |y| ≤ 64: no fault on a finite result, overflow only when the result overflows', () => {
    let n = 0;
    for (let i = 0; i <= 2200; i++) {
      const x = 2 ** (-1074 + i * (2097 / 2200)) * 1.37;
      if (!(x > 0) || !Number.isFinite(x)) continue;
      for (let y = -64; y <= 64; y++) {
        if (y === 0) continue;
        const L = y * log2(x);
        if (L < 1023.99) { expect(thrown(() => pow(x, y))).toBeNull(); n++; }
        else if (L > 1024.01) expect(thrown(() => pow(x, y))).toBe('I0.overflow');
      }
    }
    expect(n).toBeGreaterThan(150000);
  });
  it('domain edges: exp(709.78) finite, exp(-745.2) = 0, expm1 → −1, tanh/sigmoid saturate', () => {
    expect(Number.isFinite(exp(709.78))).toBe(true); expect(exp(-745.2)).toBe(0);
    expect(expm1(-800)).toBe(-1); expect(tanh(23)).toBe(1); expect(tanh(-23)).toBe(-1);
    expect(sigmoid(800)).toBe(1); expect(sigmoid(-800)).toBe(0);
    expect(log1p(0)).toBe(0); expect(log10(1000)).toBe(3); expect(log2(1024)).toBe(10);
  });
  it('kahanSum([1e16, 1, -1e16]) = 1 (naive sum gives 0); clamp; lerp', () => {
    expect(1e16 + 1 - 1e16).toBe(0);
    expect(kahanSum([1e16, 1, -1e16])).toBe(1);
    expect(clamp(5, 0, 3)).toBe(3); expect(clamp(-1, 0, 3)).toBe(0); expect(clamp(2, 0, 3)).toBe(2);
    expect(lerp(2, 6, 0.25)).toBe(3);
  });
  it('bits: ulpDistance is monotone across zero, scalb/frexp round-trip incl. subnormals', () => {
    expect(ulpDistance(0, -0)).toBe(0); expect(ulpDistance(5e-324, -5e-324)).toBe(2); expect(ulpDistance(1, 1 + 2 ** -52)).toBe(1);
    expect(scalb(1, -1074)).toBe(5e-324); expect(scalb(1.5, 1023)).toBe(1.5 * 2 ** 1023); expect(scalb(3, -1075)).toBe(1e-323);   // 1.5·2^-1074 ties to even
    for (const x of [1, 0.75, 5e-324, 2.2250738585072014e-308, 1.7976931348623157e308, -3]) {
      const { m, e } = frexp(x); expect(Math.abs(m) >= 0.5 && Math.abs(m) < 1).toBe(true); expect(scalb(m, e)).toBe(x);
    }
  });
});

describe('T02-02 dmath: properties', () => {
  // SPEC NOTE: the card states x in [-700, 700]; for |x| < 1 ln(exp(x)) cannot stay within 4 ULP of x (exp(x) rounds at ~1e-16
  // absolute, far above ulp(x)), so the property runs on 1 ≤ |x| ≤ 700 (reported as an open question).
  it('ln(exp(x)) within 4 ULP of x for 1 ≤ |x| ≤ 700', () => {
    fc.assert(fc.property(fc.double({ min: 1, max: 700, noNaN: true }), fc.boolean(), (a, neg) => {
      const x = neg ? -a : a; return ulpDistance(ln(exp(x)), x) <= 4;
    }), fcParams);
  });
  it('sigmoid(x) + sigmoid(−x) within 2 ULP of 1', () => {
    fc.assert(fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (x) => ulpDistance(sigmoid(x) + sigmoid(-x), 1) <= 2), fcParams);
  });
});
