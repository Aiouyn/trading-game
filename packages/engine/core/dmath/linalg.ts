// T02-03: fixed-loop Cholesky and matrix-vector product (02 §3.8; used by 05 factor correlation).
import { EngineFault } from '../types';

/** Lower L with A = L·Lᵀ (classical row-by-row loops in fixed i, j, k order). Diagonal ≤ 0 -> EngineFault('I0.not_pd'). */
export function cholesky(a: readonly (readonly number[])[]): number[][] {
  const n = a.length;
  for (const row of a) if (row.length !== n) throw new EngineFault('I0.domain', 'cholesky: matrix not square');
  const L: number[][] = [];
  for (let i = 0; i < n; i++) L.push(new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
      if (i === j) {
        if (!(s > 0)) throw new EngineFault('I0.not_pd', `cholesky: pivot ${i} = ${s}`);
        L[i]![i] = Math.sqrt(s);
      } else L[i]![j] = s / L[j]![j]!;
    }
  }
  return L;
}

export function matVec(a: readonly (readonly number[])[], v: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const row = a[i]!;
    if (row.length !== v.length) throw new EngineFault('I0.domain', 'matVec: dimension mismatch');
    let s = 0;
    for (let j = 0; j < v.length; j++) s += row[j]! * v[j]!;
    out.push(s);
  }
  return out;
}
