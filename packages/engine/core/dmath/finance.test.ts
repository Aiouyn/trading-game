// T02-03 Black-Scholes, fixed-iteration solvers and Cholesky (card test plan).
import { describe, expect, it } from 'vitest';
import { BigFloat, roundToF64 } from '../../../../tools/dmath-ref/bigfloat';
import { refExpBF, refLnBF } from '../../../../tools/dmath-ref/ref-exp';
import { refNormCdfBF } from '../../../../tools/dmath-ref/ref-special';
import { bfSqrt, refPi } from '../../../../tools/dmath-ref/ref-trig';
import { EngineFault } from '../types';
import { exp as dexp, bsGreeks, bsPrice, cholesky, matVec, newton, solveBisection, ulpDistance } from './index';
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
  it('T ≤ 0 or σ = 0: intrinsic value of the discounted forward legs (T clamped to 0)', () => {
    expect(bsPrice({ ...A, T: 0, S: 110 })).toBe(10); expect(bsPrice({ ...A, T: 0, S: 90 })).toBe(0);
    expect(bsPrice({ ...A, kind: 'PUT', T: 0, S: 90 })).toBe(10);
    expect(bsPrice({ ...A, T: -2, S: 110 })).toBe(10);                                         // clamped, not e^{+qT}
    expect(bsPrice({ ...A, sigma: 0, S: 100 })).toBe(100 - 100 * Math.exp(-0.05));
  });
  it('E-63.5: σ = 0 or T = 0 → price is intrinsic on the forward, max(0, ±(S·e^{−qT} − K·e^{−rT}))', () => {
    for (const [S, K, T, r, q] of [[110, 100, 1, 0.05, 0.02], [90, 100, 1, 0.05, 0.02], [100, 100, 0.5, 0.03, 0.01], [100, 95, 2, -0.01, 0.04], [100, 100, 1, 0.03, 0.03]] as const) {   // last: F = Kd exactly (closed form would be 0/0)
      const F = S * Math.exp(-q * T), Kd = K * Math.exp(-r * T);
      expect(bsPrice({ kind: 'CALL', S, K, T, r, q, sigma: 0 })).toBe(F - Kd > 0 ? F - Kd : 0);
      expect(bsPrice({ kind: 'PUT', S, K, T, r, q, sigma: 0 })).toBe(Kd - F > 0 ? Kd - F : 0);
      expect(bsPrice({ kind: 'CALL', S, K, T: 0, r, q, sigma: 0.3 })).toBe(S - K > 0 ? S - K : 0);
      expect(bsPrice({ kind: 'PUT', S, K, T: 0, r, q, sigma: 0.3 })).toBe(K - S > 0 ? K - S : 0);
    }
  });
  it('AC-02-03-GREEK-LIMITS: exact limit values at T ≤ 0 and σ = 0; faults only for σ < 0, S ≤ 0, K ≤ 0, non-finite', () => {
    const z = { gamma: 0, vega: 0, theta: 0, rho: 0 };
    const B: BsInput = { kind: 'CALL', S: 110, K: 100, T: 0, r: 0.05, q: 0.02, sigma: 0.2 };
    expect(bsGreeks(B)).toEqual({ delta: 1, ...z });                                             // F > Kd
    expect(bsGreeks({ ...B, kind: 'PUT' })).toEqual({ delta: 0, ...z });
    expect(bsGreeks({ ...B, S: 90 })).toEqual({ delta: 0, ...z });
    expect(bsGreeks({ ...B, S: 90, kind: 'PUT' })).toEqual({ delta: -1, ...z });
    expect(bsGreeks({ ...B, S: 100 })).toEqual({ delta: 0.5, ...z });                            // exact tie
    expect(bsGreeks({ ...B, S: 100, kind: 'PUT' })).toEqual({ delta: -0.5, ...z });
    expect(bsGreeks({ ...B, T: -1 })).toEqual({ delta: 1, ...z });                               // T clamped to 0
    for (const g of [bsGreeks(B), bsGreeks({ ...B, kind: 'PUT', S: 90 })]) for (const v of Object.values(g)) expect(Object.is(v, -0)).toBe(false);
    // σ = 0, T = 1: F = 110·e^{−0.02}, Kd = 100·e^{−0.05}
    const T1 = { ...B, T: 1, sigma: 0 }, eq = Math.exp(-0.02), F = 110 * eq, Kd = 100 * Math.exp(-0.05);
    expect(bsGreeks(T1)).toEqual({ delta: eq, gamma: 0, vega: 0, theta: 0.02 * F - 0.05 * Kd, rho: Kd });
    expect(bsGreeks({ ...T1, kind: 'PUT' })).toEqual({ delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 });
    const P1 = { ...T1, kind: 'PUT' as const, S: 80 }, F80 = 80 * eq;
    expect(bsGreeks(P1)).toEqual({ delta: -eq, gamma: 0, vega: 0, theta: 0.05 * Kd - 0.02 * F80, rho: -Kd });
    expect(bsGreeks({ ...P1, kind: 'CALL' })).toEqual({ delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 });
    const tie = { ...T1, S: 100 * Math.exp(-0.05) / eq };                                        // F = Kd exactly?
    if (tie.S * eq === Kd) expect(bsGreeks(tie).delta).toBe(0.5 * eq);
    for (const bad of [{ sigma: -0.1 }, { S: 0 }, { S: -1 }, { K: 0 }, { K: -5 }, { T: Infinity }, { r: Infinity }, { q: -Infinity }, { sigma: Infinity }, { S: Infinity }]) {
      expect(thrown(() => bsGreeks({ ...B, ...bad }))).toBe('I0.domain'); expect(thrown(() => bsPrice({ ...B, ...bad }))).toBe('I0.domain');
    }
    expect(thrown(() => bsGreeks({ ...B, S: NaN }))).toBe('I0.nan');
  });
  it('Quant theta ruling (σ = 0, T > 0): call (qF − rKd)·I, put (rKd − qF)·J, I = J = ½ at an exact tie; per ACT_364 year (E-63.6)', () => {
    // exact tie with T > 0: q = 0 so F = S exactly, S := K·e^{−rT} computed with the engine's exp
    for (const [K, T, r] of [[100, 1, 0.05], [80, 0.25, 0.03], [120, 2, -0.01]] as const) {
      const Kd = K * dexp(-r * T), tie: BsInput = { kind: 'CALL', S: Kd, K, T, r, q: 0, sigma: 0 };
      expect(bsGreeks(tie).theta).toBe(0.5 * (0 * Kd - r * Kd));
      expect(bsGreeks({ ...tie, kind: 'PUT' }).theta).toBe(0.5 * (r * Kd - 0 * Kd));
      expect(bsGreeks(tie).theta).not.toBe(0);
    }
    // theta = 0 at T ≤ 0 regardless of σ
    for (const T of [0, -1]) for (const sigma of [0, 0.2]) for (const kind of ['CALL', 'PUT'] as const) expect(bsGreeks({ kind, S: 110, K: 100, T, r: 0.05, q: 0.02, sigma }).theta).toBe(0);
  });
  it('AC-02-03-THETA-PARITY: callTheta − putTheta = qF − rKd for T > 0 only (σ = 0 and σ > 0; T ≤ 0 excluded: both thetas are 0)', () => {
    for (const sigma of [0, 0.2, 0.6]) for (const S of [60, 90, 100, 110, 160]) for (const [T, r, q] of [[1, 0.05, 0.02], [0.25, 0.03, 0.06], [2, -0.01, 0.04], [0.5, 0, 0]] as const) {
      const i: BsInput = { kind: 'CALL', S, K: 100, T, r, q, sigma };
      const F = S * dexp(-q * T), Kd = 100 * dexp(-r * T), lhs = bsGreeks(i).theta - bsGreeks({ ...i, kind: 'PUT' }).theta, rhs = q * F - r * Kd;
      expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(F), Math.abs(Kd)));
    }
    const tie: BsInput = { kind: 'CALL', S: 100 * dexp(-0.05), K: 100, T: 1, r: 0.05, q: 0, sigma: 0 };   // tie: ½ + ½ = 1
    expect(bsGreeks(tie).theta - bsGreeks({ ...tie, kind: 'PUT' }).theta).toBe(-0.05 * tie.S);
  });
  it('AC-02-03-GREEK-LIMITS: at T = 1e-9, σ = 0.2 the closed-form greeks are within 1e-6 of the limits away from the strike', () => {
    for (const S of [50, 90, 99, 101, 110, 200]) for (const kind of ['CALL', 'PUT'] as const) for (const [r, q] of [[0, 0], [0.05, 0.02]] as const) {
      const live = bsGreeks({ kind, S, K: 100, T: 1e-9, r, q, sigma: 0.2 }), lim = bsGreeks({ kind, S, K: 100, T: 0, r, q, sigma: 0.2 });
      for (const k of ['delta', 'gamma', 'vega', 'rho'] as const) expect(Math.abs(live[k] - lim[k])).toBeLessThanOrEqual(1e-6);
      // theta: the ruling's T ≤ 0 limit is 0; the T → 0⁺ closed form tends to q·F·1 − r·Kd·1 (carry), so compare at r = q = 0
      if (r === 0 && q === 0) expect(Math.abs(live.theta - lim.theta)).toBeLessThanOrEqual(1e-6);
    }
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
