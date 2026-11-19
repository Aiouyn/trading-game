// Small shared helpers for the chart layers: stable hashes, the intraday volume profile and the one volume model.
// Everything here is a pure function of its arguments, so the same seed and the same minute draw the same numbers.

import { marketsOpen } from '../society/index.ts';

/** A day the exchange holds a session: Monday to Friday, and not one of the city's holidays. Day 0 is a Monday. */
export function tradingDay(day: number): boolean {
  return ((((day % 7) + 7) % 7) < 5) && marketsOpen({ day } as never);
}

export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function mix(a: number, b: number, c: number): number {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul((c + 0x165667b1) | 0, 0x9e3779b1);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return x >>> 0;
}
export const unit01 = (a: number, b: number, c: number): number => (mix(a, b, c) + 0.5) / 4294967296;
export function normal(a: number, b: number, c: number): number {
  const u = unit01(a, b, c * 2), v = unit01(a, b, c * 2 + 1);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Minutes in an exchange session, 09:30 to 16:00 inclusive. */
export const SESSION_MIN = 391;

/**
 * How trading spreads over the session: heavy at the open, quiet at lunch, heavy again into the close.
 * PROFILE[i] is the weight of the i-th minute (mean 1 over the session); CUM[i] is the sum of the weights before minute i.
 */
export const PROFILE: Float64Array = (() => {
  const p = new Float64Array(SESSION_MIN);
  let sum = 0;
  for (let i = 0; i < SESSION_MIN; i++) {
    p[i] = 0.55 + 2.6 * Math.exp(-i / 22) + 1.7 * Math.exp(-(SESSION_MIN - 1 - i) / 28);
    sum += p[i];
  }
  for (let i = 0; i < SESSION_MIN; i++) p[i] *= SESSION_MIN / sum;
  return p;
})();
export const CUM: Float64Array = (() => {
  const c = new Float64Array(SESSION_MIN + 1);
  for (let i = 0; i < SESSION_MIN; i++) c[i + 1] = c[i] + PROFILE[i];
  return c;
})();

/** The share of its shares a name trades on a quiet day: a stable trait of the name, between about 0.15% and 0.5%. */
export function turnoverOf(id: string): number {
  const s = fnv(id);
  return 0.0025 * Math.exp(0.45 * normal(s, 17, 1));
}

/**
 * Shares traded in one session: the name's own turnover, more on a big move and much more on news.
 * Used for the year before day one and for the live minutes alike, so the two are on one scale.
 */
export function dayVolume(id: string, out: number, move: number, news: boolean): number {
  return Math.max(1, Math.round(out * turnoverOf(id) * (0.7 + 9 * Math.abs(move)) * (news ? 2.2 : 1)));
}
