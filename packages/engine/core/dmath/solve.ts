// T02-03: fixed-iteration solvers (02 §3.8): loops run exactly `iters` times, never "until converged".
import { EngineFault } from '../types';

function iterCheck(iters: number): void {
  if (!Number.isSafeInteger(iters) || iters < 0) throw new EngineFault('I0.domain', `iters ${iters}`);
}

/** Exactly `iters` halvings of [a, b], keeping the sign-change half; returns the midpoint of the final bracket. */
export function solveBisection(f: (x: number) => number, a: number, b: number, iters: number): number {
  iterCheck(iters);
  let fa = f(a);
  for (let k = 0; k < iters; k++) {
    const m = (a + b) / 2, fm = f(m);
    if (fm === 0) { a = m; b = m; fa = fm; }
    else if ((fm < 0) === (fa < 0)) { a = m; fa = fm; }
    else b = m;
  }
  return (a + b) / 2;
}

/** Exactly `iters` Newton steps; df = 0 -> x is kept (no update) for that step. */
export function newton(f: (x: number) => number, df: (x: number) => number, x0: number, iters: number): number {
  iterCheck(iters);
  let x = x0;
  for (let k = 0; k < iters; k++) { const d = df(x); if (d !== 0) x -= f(x) / d; }
  return x;
}
