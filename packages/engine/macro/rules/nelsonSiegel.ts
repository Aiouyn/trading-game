// T04-07 Nelson-Siegel (04 §3.7.5): any-maturity interpolation of the curve nodes. Plain float64, fixed loop order (G8); exp via dmath.
import { dmath } from '@tycoon/engine-core';
import type { CurvePoint } from '../schema';

export interface NelsonSiegel { L: number; S: number; C: number; lambda: number }

/** [1, f, f − e^(−τ/λ)], f = (1 − e^(−τ/λ))/(τ/λ); τ = 0 gives the limit [1, 1, 0]. */
export function nsBasis(tau: number, lambda: number): [number, number, number] {
  if (tau === 0) return [1, 1, 0];
  const x = tau / lambda, e = dmath.exp(-x), f = (1 - e) / x;
  return [1, f, f - e];
}

/** Least squares on the nodes: (AᵀA)·[L, S, C] = Aᵀy, rows A_k = nsBasis(τ_k, λ), Gaussian elimination with partial pivoting
 *  (largest |pivot|, first row on a tie). */
export function nsFit(nodes: CurvePoint[], lambda: number): NelsonSiegel {
  const m: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];   // augmented [AᵀA | Aᵀy]
  for (const n of nodes) {
    const a = nsBasis(n.tenorYears, lambda);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) m[r]![c]! += a[r]! * a[c]!;
      m[r]![3]! += a[r]! * n.yield;
    }
  }
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    if (piv !== col) { const t = m[col]!; m[col] = m[piv]!; m[piv] = t; }
    for (let r = col + 1; r < 3; r++) {
      const k = m[r]![col]! / m[col]![col]!;
      for (let c = col; c < 4; c++) m[r]![c]! -= k * m[col]![c]!;
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) {
    let s = m[r]![3]!;
    for (let c = r + 1; c < 3; c++) s -= m[r]![c]! * x[c]!;
    x[r] = s / m[r]![r]!;
  }
  return { L: x[0]!, S: x[1]!, C: x[2]!, lambda };
}

/** L + S·f + C·(f − e^(−τ/λ)). */
export function nsZero(ns: NelsonSiegel, tau: number): number {
  const [, f, g] = nsBasis(tau, ns.lambda);
  return ns.L + ns.S * f + ns.C * g;
}
