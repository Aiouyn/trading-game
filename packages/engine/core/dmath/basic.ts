// T02-02: fixed basic algorithms (02 §3.7.2 rule 4, §3.8).
import { EngineFault } from '../types';

/** Neumaier-compensated sum in the given iteration order (callers pass sorted collections). */
export function kahanSum(xs: Iterable<number>): number {
  let s = 0, c = 0;
  for (const x of xs) {
    const t = s + x;
    c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s;
    s = t;
  }
  return s + c;
}
export function clamp(x: number, a: number, b: number): number {
  if (Number.isNaN(x) || Number.isNaN(a) || Number.isNaN(b)) throw new EngineFault('I0.nan', 'clamp of NaN');
  return Math.min(Math.max(x, a), b);
}
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
