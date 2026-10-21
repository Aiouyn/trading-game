// T02-03 Black-Scholes, fixed-iteration solvers and Cholesky (card test plan).
import { describe, expect, it } from 'vitest';
import { BigFloat, roundToF64 } from '../../../../tools/dmath-ref/bigfloat';
import { refExpBF, refLnBF } from '../../../../tools/dmath-ref/ref-exp';
import { refNormCdfBF } from '../../../../tools/dmath-ref/ref-special';
import { bfSqrt, refPi } from '../../../../tools/dmath-ref/ref-trig';
import { EngineFault } from '../types';
import { bsGreeks, bsPrice, cholesky, matVec, newton, solveBisection, ulpDistance } from './index';
import type { BsInput } from './index';

const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const thrown = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof EngineFault ? e.code : `non-fault ${String(e)}`; } };

/** Black-Scholes price and greeks re-derived on the 256-bit reference path (card: second example). */
function refBs(i: BsInput): { price: number; delta: number; gamma: number; vega: number; theta: number; rho: number } {
  const F = (x: number): BigFloat => BigFloat.fromF64(x);
  const S = F(i.S), K = F(i.K), T = F(i.T), r = F(i.r), q = F(i.q), s = F(i.sigma);
  const rt = bfSqrt(T), sq = s.mul(rt);
  const d1 = refLnBF(S.div(K)).add(r.sub(q).add(s.mul(s).mul2k(-1)).mul(T)).div(sq), d2 = d1.sub(sq);
  const eq = refExpBF(q.mul(T).neg()), er = refExpBF(r.mul(T).neg());
  const pdf = refExpBF(d1.mul(d1).mul2k(-1).neg()).div(bfSqrt(refPi().mul2k(1)));
  const N = refNormCdfBF, call = i.kind === 'CALL';
  const price = call ? S.mul(eq).mul(N(d1)).sub(K.mul(er).mul(N(d2))) : K.mul(er).mul(N(d2.neg())).sub(S.mul(eq).mul(N(d1.neg())));
  const decay = S.mul(eq).mul(pdf).mul(s).div(rt.mul2k(1)).neg();
  const theta = call ? decay.sub(r.mul(K).mul(er).mul(N(d2))).add(q.mul(S).mul(eq).mul(N(d1)))
    : decay.add(r.mul(K).mul(er).mul(N(d2.neg()))).sub(q.mul(S).mul(eq).mul(N(d1.neg())));
  return {
    price: roundToF64(price),
    delta: roundToF64(call ? eq.mul(N(d1)) : eq.mul(N(d1.neg())).neg()),
    gamma: roundToF64(eq.mul(pdf).div(S.mul(sq))), vega: roundToF64(S.mul(eq).mul(pdf).mul(rt)), theta: roundToF64(theta),
    rho: roundToF64(call ? K.mul(T).mul(er).mul(N(d2)) : K.mul(T).mul(er).mul(N(d2.neg())).neg()),
  };
}

describe('T02-03 Black-Scholes', () => {
  const A: BsInput = { kind: 'CALL', S: 100, K: 100, T: 1, r: 0.05, q: 0, sigma: 0.2 };
  it('S=100 K=100 T=1 r=0.05 q=0 σ=0.2: call, put, delta, parity', () => {
    const c = bsPrice(A), p = bsPrice({ ...A, kind: 'PUT' });
    expect(rel(c, 10.450583572185565)).toBeLessThanOrEqual(1e-9);
    expect(rel(p, 5.573526022256971)).toBeLessThanOrEqual(1e-9);
    expect(rel(bsGreeks(A).delta, 0.6368306511756191)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs((c - p) - (100 - 100 * Math.exp(-0.05)))).toBeLessThanOrEqual(1e-12);
  });
  it('S=50 K=55 T=0.5 r=0.03 q=0.01 σ=0.35 vs the reference BigFloat closed form (1e-9 relative), both kinds, all greeks', () => {
    for (const kind of ['CALL', 'PUT'] as const) {
      const i: BsInput = { kind, S: 50, K: 55, T: 0.5, r: 0.03, q: 0.01, sigma: 0.35 };
      const ref = refBs(i), g = bsGreeks(i);
      expect(rel(bsPrice(i), ref.price)).toBeLessThanOrEqual(1e-9);
      for (const k of ['delta', 'gamma', 'vega', 'theta', 'rho'] as const) expect(rel(g[k], ref[k])).toBeLessThanOrEqual(1e-9);
    }
    const ref = refBs(A), g = bsGreeks(A);   // first example greeks too
    for (const k of ['delta', 'gamma', 'vega', 'theta', 'rho'] as const) expect(rel(g[k], ref[k])).toBeLessThanOrEqual(1e-9);
  });
  it('T ≤ 0 or σ ≤ 0: intrinsic value of the discounted forward legs; greeks fault', () => {
    expect(bsPrice({ ...A, T: 0, S: 110 })).toBe(10); expect(bsPrice({ ...A, T: 0, S: 90 })).toBe(0);
    expect(bsPrice({ ...A, kind: 'PUT', T: 0, S: 90 })).toBe(10);
    const s0 = bsPrice({ ...A, sigma: 0, S: 100 });
    expect(s0).toBe(100 - 100 * Math.exp(-0.05) > 0 ? 100 - 100 * Math.exp(-0.05) : 0);
    expect(thrown(() => bsGreeks({ ...A, T: 0 }))).toBe('I0.domain');
  });
});

describe('T02-03 solvers and Cholesky', () => {
  it('solveBisection(x² − 2, 0, 2, 60) within 1 ULP of √2; newton 8 steps likewise', () => {
    expect(ulpDistance(solveBisection((x) => x * x - 2, 0, 2, 60), Math.SQRT2)).toBeLessThanOrEqual(1);
    expect(ulpDistance(newton((x) => x * x - 2, (x) => 2 * x, 1, 8), Math.SQRT2)).toBeLessThanOrEqual(1);
  });
  it('fixed iteration counts: f is evaluated exactly iters + 1 (bisection) / iters (newton) times, no early exit', () => {
    let n = 0; solveBisection((x) => { n++; return x - 1; }, 0, 2, 60); expect(n).toBe(61);   // exact root at the first midpoint
    let m = 0; newton((x) => { m++; return x * x - 4; }, (x) => 2 * x, 2, 8); expect(m).toBe(8);  // already converged
    expect(solveBisection((x) => x - 1, 0, 2, 60)).toBe(1);
  });
  it('newton: df = 0 keeps x', () => { expect(newton((x) => x * x + 1, () => 0, 3, 5)).toBe(3); });
  it('bisection keeps the sign-change half (decreasing f)', () => {
    expect(ulpDistance(solveBisection((x) => 2 - x * x, 0, 2, 60), Math.SQRT2)).toBeLessThanOrEqual(1);
  });
  it('cholesky [[4,2],[2,3]] = [[2,0],[1,√2]]; non-PD throws; matVec', () => {
    expect(cholesky([[4, 2], [2, 3]])).toEqual([[2, 0], [1, Math.SQRT2]]);
    expect(thrown(() => cholesky([[1, 2], [2, 1]]))).toBe('I0.not_pd');
    expect(thrown(() => cholesky([[0, 0], [0, 1]]))).toBe('I0.not_pd');
    const a = [[4, 12, -16], [12, 37, -43], [-16, -43, 98]];
    expect(cholesky(a)).toEqual([[2, 0, 0], [6, 1, 0], [-8, 5, 3]]);
    expect(matVec(a, [1, 0, -1])).toEqual([20, 55, -114]);
  });
});
