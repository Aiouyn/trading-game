import type { RegimeDef, RegimeId } from './types';

/**
 * Long-run share of game days in each macro regime (V1-PHASE1 F13 follow-up, expectedVol).
 *
 * The regime chain (sim.ts) leaves a regime with probability 1 / meanDays on a day, then goes to one of its `next` regimes.
 * The embedded chain (which regime comes next) has a stationary law e, and a regime's share of game days is e_r x meanDays_r,
 * normalized: a regime that is visited often but left quickly holds fewer days. The solve is exact (Gaussian elimination on
 * the four-state system), so the same config always gives the same shares.
 */
export function regimeTimeShares(regimes: Record<RegimeId, RegimeDef>): Record<RegimeId, number> {
  const ids = Object.keys(regimes) as RegimeId[];
  const n = ids.length;
  const at = new Map(ids.map((id, i) => [id, i] as const));
  // P[i][j]: probability that a change of regime from i goes to j (the `next` weights, normalized)
  const P: number[][] = ids.map(() => new Array<number>(n).fill(0));
  ids.forEach((id, i) => {
    const next = regimes[id]!.next;
    const total = Object.values(next).reduce((a, w) => a + (w ?? 0), 0);
    if (!(total > 0)) throw new Error(`regimeTimeShares: ${id} has no next regime`);
    for (const [to, w] of Object.entries(next)) {
      const j = at.get(to as RegimeId);
      if (j === undefined) throw new Error(`regimeTimeShares: ${id} goes to unknown regime ${to}`);
      P[i]![j]! += (w ?? 0) / total;
    }
  });
  // e P = e with sum e = 1: rows of (P^T - I) e = 0, the last row replaced by the normalization
  const A: number[][] = ids.map((_, r) => ids.map((_, s) => P[s]![r]! - (r === s ? 1 : 0)));
  const b = new Array<number>(n).fill(0);
  A[n - 1] = new Array<number>(n).fill(1);
  b[n - 1] = 1;
  const e = solve(A, b);
  const days = ids.map((id, i) => e[i]! * regimes[id]!.meanDays);
  const total = days.reduce((a, x) => a + x, 0);
  return Object.fromEntries(ids.map((id, i) => [id, days[i]! / total])) as Record<RegimeId, number>;
}

/** Gaussian elimination with partial pivoting (small dense systems only). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}
