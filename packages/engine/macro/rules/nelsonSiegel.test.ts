import { describe, expect, it } from 'vitest';
import { dmath } from '@tycoon/engine-core';
import { nsBasis, nsFit, nsZero } from './nelsonSiegel';

const NODES = [0.25, 0.5, 1, 2, 5, 10, 30];
const LAMBDA = 1.8;   // macro_ns_lambda (E-100)

describe('T04-07 Nelson-Siegel', () => {
  it('nsBasis(0) = [1, 1, 0]; nsBasis(τ) = [1, f, f − e^(−τ/λ)]', () => {
    expect(nsBasis(0, LAMBDA)).toEqual([1, 1, 0]);
    const x = 2 / LAMBDA, e = dmath.exp(-x), f = (1 - e) / x;
    expect(nsBasis(2, LAMBDA)).toEqual([1, f, f - e]);
    expect(nsBasis(1e-3, LAMBDA)[1]).toBeCloseTo(1, 3); expect(nsBasis(1e-3, LAMBDA)[2]).toBeCloseTo(0, 3);   // continuous at the τ = 0 limit
    expect(nsBasis(1000, LAMBDA)[1]).toBeCloseTo(LAMBDA / 1000, 12);
  });
  it('a fit of nodes generated from (L, S, C) = (0.04, −0.02, 0.01) recovers them within 1e−12', () => {
    const gen = { L: 0.04, S: -0.02, C: 0.01, lambda: LAMBDA };
    const ns = nsFit(NODES.map((t) => ({ tenorYears: t, yield: nsZero(gen, t) })), LAMBDA);
    expect(Math.abs(ns.L - 0.04)).toBeLessThan(1e-12); expect(Math.abs(ns.S + 0.02)).toBeLessThan(1e-12); expect(Math.abs(ns.C - 0.01)).toBeLessThan(1e-12);
    expect(ns.lambda).toBe(LAMBDA);
    for (const [L, S, C] of [[0.03, 0.01, -0.02], [-0.005, 0.002, 0.03], [0.1, -0.08, 0]] as const) {
      const g = nsFit(NODES.map((t) => ({ tenorYears: t, yield: nsZero({ L, S, C, lambda: 2.5 }, t) })), 2.5);
      expect(Math.abs(g.L - L) + Math.abs(g.S - S) + Math.abs(g.C - C)).toBeLessThan(1e-11);
    }
  });
  it('a flat curve fits L = y, S = C = 0; nsZero(τ = 0) = L + S', () => {
    const ns = nsFit(NODES.map((t) => ({ tenorYears: t, yield: 0.0275 })), LAMBDA);
    expect(ns.L).toBeCloseTo(0.0275, 13); expect(ns.S).toBeCloseTo(0, 12); expect(ns.C).toBeCloseTo(0, 12);
    expect(nsZero({ L: 0.04, S: -0.02, C: 0.01, lambda: LAMBDA }, 0)).toBe(0.02);
  });
  it('least squares: a noisy node set leaves residuals orthogonal to the basis (normal equations hold)', () => {
    const pts = NODES.map((t, k) => ({ tenorYears: t, yield: 0.03 + 0.001 * Math.sin(k + 1) }));
    const ns = nsFit(pts, LAMBDA);
    for (let j = 0; j < 3; j++) {
      let dot = 0;
      for (const p of pts) dot += nsBasis(p.tenorYears, LAMBDA)[j]! * (p.yield - nsZero(ns, p.tenorYears));
      expect(Math.abs(dot)).toBeLessThan(1e-15);
    }
  });
  it('deterministic: two runs are bit-equal; node order permutations give the same fit within 1e−15', () => {
    const pts = NODES.map((t, k) => ({ tenorYears: t, yield: 0.02 + 0.0007 * k - 0.00002 * k * k }));
    const a = nsFit(pts, LAMBDA), b = nsFit(pts.map((p) => ({ ...p })), LAMBDA);
    expect(Object.is(a.L, b.L) && Object.is(a.S, b.S) && Object.is(a.C, b.C)).toBe(true);
    const r = nsFit([...pts].reverse(), LAMBDA);
    expect(Math.abs(r.L - a.L) + Math.abs(r.S - a.S) + Math.abs(r.C - a.C)).toBeLessThan(1e-12);
  });
  it('ill-scaled nodes (two at τ ≪ λ, two at τ ≫ λ) still recover the generator', () => {
    const gen = { L: 0.05, S: -0.01, C: 0.02, lambda: 0.5 };
    const ns = nsFit([0.1, 0.3, 30, 60].map((t) => ({ tenorYears: t, yield: nsZero(gen, t) })), 0.5);
    expect(Math.abs(ns.L - 0.05) + Math.abs(ns.S + 0.01) + Math.abs(ns.C - 0.02)).toBeLessThan(1e-10);
  });
});
