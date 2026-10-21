// T02-03 trig worked examples and domain/signed-zero rules (vector bounds for sin/cos are in special.test.ts, 02#14).
import { describe, expect, it } from 'vitest';
import { EngineFault } from '../types';
import { roundToF64 } from '../../../../tools/dmath-ref/bigfloat';
import { refAtan, refAtan2 } from '../../../../tools/dmath-ref/ref-trig';
import { atan, atan2, cos, sin, ulpDistance } from './index';

const thrown = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `non-fault ${String(e)}`; } };

describe('T02-03 trig', () => {
  it('worked examples', () => {
    expect(Object.is(sin(0), 0)).toBe(true); expect(Object.is(sin(-0), -0)).toBe(true);
    expect(cos(0)).toBe(1);
    expect(ulpDistance(sin(0.5235987755982988), 0.5)).toBeLessThanOrEqual(1);       // sin(π/6 literal)
    expect(ulpDistance(atan2(1, -1), 2.356194490192345)).toBeLessThanOrEqual(2);    // 3π/4
    expect(Object.is(atan2(-0, -0), -Math.PI)).toBe(true);
  });
  it('atan2 IEEE quadrant table and signed zeros', () => {
    expect(Object.is(atan2(0, -0), Math.PI)).toBe(true);
    expect(Object.is(atan2(0, 0), 0)).toBe(true); expect(Object.is(atan2(-0, 0), -0)).toBe(true);
    expect(Object.is(atan2(-0, 1), -0)).toBe(true); expect(atan2(0, -1)).toBe(Math.PI); expect(atan2(-0, -1)).toBe(-Math.PI);
    expect(atan2(1, 0)).toBe(Math.PI / 2); expect(atan2(-1, -0)).toBe(-Math.PI / 2);
    expect(atan2(1, Infinity)).toBe(0); expect(atan2(1, -Infinity)).toBe(Math.PI);
    expect(atan2(Infinity, Infinity)).toBe(Math.PI / 4); expect(atan2(-Infinity, -Infinity)).toBe(-3 * Math.PI / 4);
    expect(atan2(Infinity, 3)).toBe(Math.PI / 2);
    for (const [y, x] of [[1, 1], [1, -1], [-1, -1], [-1, 1], [3, 4], [-4, 3]] as const) expect(ulpDistance(atan2(y, x), Math.atan2(y, x))).toBeLessThanOrEqual(2);
  });
  it('atan odd, limits, reduction branches', () => {
    expect(Object.is(atan(-0), -0)).toBe(true);
    expect(atan(Infinity)).toBe(Math.PI / 2); expect(atan(-Infinity)).toBe(-Math.PI / 2);
    expect(ulpDistance(atan(1), Math.PI / 4)).toBeLessThanOrEqual(3);   // ≤ 3 ULP bound (QA #33); vector max over 10000 is 1 ULP
    for (const x of [0.1, 0.27, 0.5, 2, 1e10]) expect(atan(-x)).toBe(-atan(x));
  });
  it('sin/cos domain [-1e6, 1e6] and NaN', () => {
    for (const x of [1e6 + 1, -1e6 - 1, Infinity, -Infinity]) { expect(thrown(() => sin(x))).toBe('I0.domain'); expect(thrown(() => cos(x))).toBe('I0.domain'); }
    expect(thrown(() => sin(1e6))).toBe(null);
    expect(thrown(() => cos(NaN))).toBe('I0.nan'); expect(thrown(() => atan2(NaN, 1))).toBe('I0.nan');
  });
  it('quadrant selection (n mod 4) for each case, both signs', () => {
    for (const x of [1, 2, 4, 5, -1, -2, -4, -5, 1000.5, -1000.5]) {
      expect(ulpDistance(sin(x), Math.sin(x))).toBeLessThanOrEqual(1);
      expect(ulpDistance(cos(x), Math.cos(x))).toBeLessThanOrEqual(1);
    }
  });
});

describe('QA #33: atan / atan2 within 3 ULP of the 256-bit reference (fdlibm s_atan.c / e_atan2.c)', () => {
  const ref = (v: ReturnType<typeof refAtan>): number => roundToF64(v);
  it('QA cases: atan(tan(π/12)) was 3.34 ULP, atan2(−6.53e-4, 2.44e-3) was 3.85 ULP', () => {
    for (const x of [0.2679491924311227, 0.26794919243112264, 0.2679491924311228, 0.4375, 0.6875, 1.1875, 2.4375]) {
      expect(ulpDistance(atan(x), ref(refAtan(x)))).toBeLessThanOrEqual(3);
      expect(ulpDistance(atan(-x), ref(refAtan(-x)))).toBeLessThanOrEqual(3);
    }
    for (const [y, x] of [[-6.53e-4, 2.44e-3], [6.53e-4, -2.44e-3], [2.44e-3, -6.53e-4], [-2.44e-3, -6.53e-4]] as const) expect(ulpDistance(atan2(y, x), ref(refAtan2(y, x)))).toBeLessThanOrEqual(3);
  });
  it('dense sweep: atan on 10,001 log-spaced points in [1e-10, 1e10] and 10,001 linear points in [0, 3]; atan2 on 4,000 angles × 11 radii', () => {
    let m = 0;
    for (let i = 0; i <= 10000; i++) {
      const xl = 10 ** (-10 + 20 * i / 10000), xs = 3 * i / 10000;
      m = Math.max(m, ulpDistance(atan(xl), ref(refAtan(xl))), ulpDistance(atan(xs), ref(refAtan(xs))));
    }
    for (let i = 0; i < 4000; i++) {
      const th = -Math.PI + 2 * Math.PI * (i + 0.5) / 4000, r = 10 ** (-5 + (i % 11)), y = r * Math.sin(th), x = r * Math.cos(th);
      m = Math.max(m, ulpDistance(atan2(y, x), ref(refAtan2(y, x))));
    }
    expect(m).toBeLessThanOrEqual(3);
  }, 300000);
});
