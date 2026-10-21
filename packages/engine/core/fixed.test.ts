// T02-04 tests (02 §3.9; AT 02#15–#17).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { accrue, allocate, assertFinite, divRoundHalfEven, fromMoney, fxConvert, MICRO, MICRO_N, mulRate, mulRateE12, normZero, notional,
  proRata, roundHalfEven, safeDiv, toMoney, toPrice, toQty } from './fixed';
import { SortedMap } from './sorted';
import { EngineFault, type Ccy } from './types';

const code = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `other: ${String(e)}`; } };
const obj = (m: Map<string, bigint>): Record<string, bigint> => { const o: Record<string, bigint> = {}; for (const [k, v] of m) o[k] = v; return o; };

/** Exact half-even of x·scale from the float's bits (x = mant·2^exp exactly). */
function exactMicro(x: number, scale: bigint = MICRO_N): bigint {
  if (x === 0) return 0n;
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
  const b = dv.getBigUint64(0), neg = b >> 63n === 1n, ex = Number((b >> 52n) & 0x7ffn), fr = b & ((1n << 52n) - 1n);
  const mant = ex === 0 ? fr : fr | (1n << 52n), e = (ex === 0 ? 1 : ex) - 1075;
  let n = mant * scale, d = 1n;
  if (e >= 0) n <<= BigInt(e); else d <<= BigInt(-e);
  const q = divRoundHalfEven(n, d);
  return neg ? -q : q;
}

describe('T02-04 fixed', () => {
  it('02#15 roundHalfEven ties to even; toMoney(1.25), toMoney(1e12); divRoundHalfEven(5,2) = 2, (7,2) = 4', () => {
    expect(roundHalfEven(0.5)).toBe(0); expect(roundHalfEven(1.5)).toBe(2); expect(roundHalfEven(2.5)).toBe(2); expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-1.5)).toBe(-2); expect(roundHalfEven(2.4)).toBe(2); expect(roundHalfEven(2.6)).toBe(3); expect(roundHalfEven(-2.6)).toBe(-3);
    expect(toMoney(1.25, 'FDL')).toBe(1_250_000n);
    expect(toMoney(1e12, 'FDL')).toBe(1_000_000_000_000_000_000n);
    expect(divRoundHalfEven(5n, 2n)).toBe(2n); expect(divRoundHalfEven(7n, 2n)).toBe(4n);
  });
  it('roundHalfEven signed zero (02 §3.9.1 verbatim, §3.7.2 rule 3): negatives that round to zero give +0; -0 in gives -0, normalised by normZero', () => {
    // floor(x) = -1 and d ≥ 0.5 for every x in [-0.5, 0): the result is f + 1 = -1 + 1 = +0 (ties included: -0.5 -> f odd -> f + 1)
    for (const x of [-0.5, -0.49999999999999994, -0.3, -1e-300, -Number.MIN_VALUE]) expect(Object.is(roundHalfEven(x), 0)).toBe(true);
    expect(Object.is(roundHalfEven(0), 0)).toBe(true); expect(Object.is(roundHalfEven(0.3), 0)).toBe(true);
    // -0: floor(-0) = -0, d = 0 < 0.5 -> returns f = -0. §3.9.1 has no normalisation step; §3.7.2 rule 3 normalises at the state write.
    expect(Object.is(roundHalfEven(-0), -0)).toBe(true);
    expect(Object.is(normZero(roundHalfEven(-0)), 0)).toBe(true);
    for (const x of [-0.5, -0.3, -1e-300]) expect(Object.is(normZero(roundHalfEven(x)), 0)).toBe(true);
  });
  it('roundHalfEven: |x| ≥ 2^52 unchanged; non-finite -> I0.nan', () => {
    expect(roundHalfEven(2 ** 52 + 1)).toBe(2 ** 52 + 1); expect(roundHalfEven(-(2 ** 52) - 3)).toBe(-(2 ** 52) - 3);
    expect(roundHalfEven(4503599627370495.5)).toBe(4503599627370496);   // just below 2^52: tie to even
    expect(code(() => roundHalfEven(NaN))).toBe('I0.nan');
  });
  it('02#16 toMoney(NaN) and toMoney(Infinity) produce invariant failure I0.nan, never a value', () => {
    expect(code(() => toMoney(NaN, 'FDL'))).toBe('I0.nan');
    expect(code(() => toMoney(Infinity, 'FDL'))).toBe('I0.nan');
    expect(code(() => toMoney(-Infinity, 'EUN'))).toBe('I0.nan');
  });
  it('toMoney: unknown ccy -> I0.ccy; −0 -> 0n; ≥ 2^53 branch; negative half-even', () => {
    expect(code(() => toMoney(1, 'XXX' as Ccy))).toBe('I0.ccy');
    expect(toMoney(-0, 'FDL')).toBe(0n);
    expect(toMoney(1e13, 'PYN')).toBe(10_000_000_000_000_000_000n);
    expect(toMoney(-2.5e-6, 'FDL')).toBe(-2n);   // fl(x·1e6) = −2.5 -> −2 (the exact x·1e6 is a hair above 2.5 in magnitude; see property note)
    expect(toMoney(0.5e-6, 'FDL')).toBe(0n); expect(toMoney(1.5e-6, 'FDL')).toBe(2n); expect(toMoney(-1.25, 'SRL')).toBe(-1_250_000n);
  });
  it('02#17 allocate(100n, [1,1,1]) -> {a:34n, b:33n, c:33n} (extra unit to the lowest id)', () => {
    expect(obj(allocate(100n, [{ id: 'c', w: 1n }, { id: 'a', w: 1n }, { id: 'b', w: 1n }]))).toEqual({ a: 34n, b: 33n, c: 33n });
    expect([...allocate(100n, [{ id: 'c', w: 1n }, { id: 'a', w: 1n }, { id: 'b', w: 1n }]).keys()]).toEqual(['a', 'b', 'c']);
  });
  it('02#17 property: for 10,000 random cases the parts always sum exactly to the total', () => {
    fc.assert(fc.property(
      fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }),
      fc.array(fc.bigInt({ min: 0n, max: 10n ** 12n }), { minLength: 1, maxLength: 50 }).filter((ws) => ws.some((w) => w > 0n)),
      (total, ws) => {
        const parts = allocate(total, ws.map((w, i) => ({ id: `e${String(i).padStart(2, '0')}`, w })));
        let s = 0n; for (const v of parts.values()) s += v;
        return s === total && parts.size === ws.length;
      }), { numRuns: 10_000, seed: 2004 });
  });
  it('allocate: largest remainder first, ties by id; negative total negates; faults', () => {
    // 10 split 85/10/5 -> 8.5, 1, 0.5: base 8,1,0; R = 1 -> largest remainder (0.5 tie: fnd vs gov by id)
    expect(obj(allocate(10n, [{ id: 'gov', w: 85n }, { id: 'fnd', w: 10n }, { id: 'vic', w: 5n }]))).toEqual({ fnd: 1n, gov: 9n, vic: 0n });
    expect(obj(allocate(7n, [{ id: 'a', w: 1n }, { id: 'b', w: 2n }]))).toEqual({ a: 2n, b: 5n });
    expect([...allocate(7n, [{ id: 'b', w: 2n }, { id: 'a', w: 1n }]).keys()]).toEqual(['a', 'b']);   // ascending id, not remainder order   // 2.33/4.67 -> b gets the extra
    expect(obj(allocate(-100n, [{ id: 'a', w: 1n }, { id: 'b', w: 1n }, { id: 'c', w: 1n }]))).toEqual({ a: -34n, b: -33n, c: -33n });
    expect(obj(allocate(5n, [{ id: 'a', w: 0n }, { id: 'b', w: 3n }]))).toEqual({ a: 0n, b: 5n });
    expect(code(() => allocate(5n, [{ id: 'a', w: 0n }]))).toBe('I0.allocate');
    expect(code(() => allocate(5n, [{ id: 'a', w: -1n }, { id: 'b', w: 3n }]))).toBe('I0.allocate');
    expect(code(() => allocate(5n, [{ id: 'a', w: 1n }, { id: 'a', w: 3n }]))).toBe('I0.allocate_dup');
  });
  it('proRata = allocate over the holdings, as a SortedMap', () => {
    const r = proRata(1_000n, new SortedMap<string, bigint>([['chr_b', 1n], ['chr_a', 2n]]));
    expect(r).toBeInstanceOf(SortedMap); expect([...r.entries()]).toEqual([['chr_a', 667n], ['chr_b', 333n]]);
  });
  it('worked examples: accrue, mulRate, fxConvert, notional, negative divRoundHalfEven', () => {
    expect(accrue(1_000_000_000_000n, 36_400n, 1)).toBe(100_000_000n);
    expect(accrue(250_000_000n, 50_000n, 7)).toBe(240_385n);
    expect(mulRate(1_000_000n, 2_500n)).toBe(2_500n);
    expect(mulRate(3n, 500_000n)).toBe(2n); expect(mulRate(5n, 500_000n)).toBe(2n);
    expect(mulRateE12(10n ** 12n, 3n)).toBe(3n); expect(mulRateE12(1n, 5n * 10n ** 11n)).toBe(0n); expect(mulRateE12(3n, 5n * 10n ** 11n)).toBe(2n);
    expect(fxConvert(10_000_000n, 1_085_000n)).toBe(10_850_000n);
    expect(notional(150n, 2_500_000n, 100n)).toBe(3_750_000n); expect(notional(3n, 5n, 2n)).toBe(8n);
    expect(fxConvert(3n, 500_000n)).toBe(2n); expect(fxConvert(-7n, 500_000n)).toBe(-4n);
    expect(divRoundHalfEven(-5n, 2n)).toBe(-2n); expect(divRoundHalfEven(-7n, 2n)).toBe(-4n);
    expect(divRoundHalfEven(-8n, 3n)).toBe(-3n); expect(divRoundHalfEven(8n, 3n)).toBe(3n); expect(divRoundHalfEven(-7n, 3n)).toBe(-2n);
    expect(code(() => divRoundHalfEven(1n, 0n))).toBe('I0.div_zero'); expect(code(() => divRoundHalfEven(1n, -2n))).toBe('I0.div_zero');
  });
  it('toQty half-even and LOT_FLOOR toward zero; lotScale bound; toPrice; fromMoney', () => {
    expect(toQty(1.5, 1n)).toBe(2n); expect(toQty(2.5, 1n)).toBe(2n);
    expect(toQty(2.7, 1n, 'LOT_FLOOR')).toBe(2n); expect(toQty(-2.7, 1n, 'LOT_FLOOR')).toBe(-2n);
    expect(toQty(0.125, 100n)).toBe(12n);   // 12.5 -> 12
    expect(code(() => toQty(1, 2n ** 31n + 1n))).toBe('I0.lot_scale'); expect(toQty(1, 2n ** 31n)).toBe(2n ** 31n);
    expect(code(() => toQty(NaN, 1n))).toBe('I0.nan');
    expect(toPrice(2.5)).toBe(2_500_000n); expect(toPrice(2.5e-6)).toBe(2n); expect(toPrice(1.5e-6)).toBe(2n); expect(toPrice(-2.6e-6)).toBe(-3n); expect(toPrice(1e13)).toBe(10n ** 19n);
    expect(code(() => toPrice(NaN))).toBe('I0.nan');
    expect(fromMoney(1_250_000n)).toBe(1.25); expect(MICRO).toBe(1_000_000);
  });
  // SPEC NOTE (open question): 02 §3.9.2 (binding, D022) rounds the IEEE product v = fl(x·1e6), not the exact x·1e6. The two differ
  // by one micro-unit when the product's own rounding crosses a .5 boundary (e.g. x = −999991577.0973265). So the property is checked as:
  // (1) toMoney(x) is exactly half-even of the double v (exact BigInt from v's bits), and (2) it is within 1 micro of exact x·1e6.
  it('property: toMoney is round-half-to-even of x·1e6 (exact BigInt from the float bits), x in [-1e9, 1e9]', () => {
    fc.assert(fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (x) => {
      const m = toMoney(x, 'FDL'), ex = exactMicro(x), d = m - ex;
      return m === exactMicro(x * MICRO, 1n) && d >= -1n && d <= 1n;
    }), { numRuns: 10_000, seed: 2005 });
  });
  it('safeDiv, normZero, assertFinite', () => {
    expect(safeDiv(1, 0, 7)).toBe(7); expect(safeDiv(6, 3, 7)).toBe(2); expect(safeDiv(1e308, 1e-308, 7)).toBe(7);
    expect(Object.is(normZero(-0), 0)).toBe(true); expect(normZero(-1)).toBe(-1);
    expect(assertFinite(3, 'x')).toBe(3); expect(code(() => assertFinite(NaN, 'x'))).toBe('I0.nan');
  });

  it('AC-02-04-ACCRUE-DAYS (E-55): non-safe-integer days throw I0.accrue_days, never RangeError', () => {
    for (const d of [1.5, NaN, Infinity, -Infinity, 2 ** 53]) expect(code(() => accrue(1_000_000n, 36_400n, d))).toBe('I0.accrue_days');
    expect(accrue(1_000_000n, 36_400n, 0)).toBe(0n);
    expect(accrue(1_000_000n, 36_400n, -364)).toBe(-36_400n);
  });

  it('AC-02-04-ALLOC-ORDER (E-55): keys ascending by cmpStr for any input order; ties by id; one scoped Map disable', () => {
    const ws = [{ id: 'c', w: 1n }, { id: 'a', w: 1n }, { id: 'B', w: 1n }, { id: 'b', w: 1n }];
    const ref = allocate(10n, ws);
    expect([...ref.keys()]).toEqual(['B', 'a', 'b', 'c']);
    expect(obj(ref)).toEqual({ B: 3n, a: 3n, b: 2n, c: 2n });   // remainder 2 tie-broken by id ascending
    fc.assert(fc.property(fc.shuffledSubarray(ws, { minLength: 4, maxLength: 4 }), (sh) => {
      const m = allocate(10n, sh);
      expect([...m.keys()]).toEqual(['B', 'a', 'b', 'c']);
      expect(obj(m)).toEqual(obj(ref));
    }), { numRuns: 200 });
    expect(code(() => allocate(1n, [{ id: 'x', w: 1n }, { id: 'x', w: 2n }]))).toBe('I0.allocate_dup');
    const src = readFileSync(fileURLToPath(new URL('./fixed.ts', import.meta.url)), 'utf8');
    expect(src.split('eslint-disable-next-line no-restricted-globals').length - 1).toBe(1);
    expect(src.split('eslint-disable').length - 1).toBe(1);
  });

  it('AC-02-04-LOTSCALE (E-55): lotScale outside 1..2^31 throws I0.lot_scale', () => {
    for (const l of [0n, -1n, 2n ** 31n + 1n]) expect(code(() => toQty(1, l))).toBe('I0.lot_scale');
    expect(toQty(1, 1n)).toBe(1n);
    expect(toQty(1, 2n ** 31n)).toBe(2n ** 31n);
  });
});
