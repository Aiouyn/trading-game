// Broker chart overlays: simple and exponential moving averages of the closes the plot shows (the numbers toPoints()
// made for the canvas, G1; nothing here reads a server string). One value per bar, null until the bar has `n` closes
// behind it in the shown history: no value is made up for the bars before it (a short range has none at all).
// The math is the p10 chart's (src/game/indicators.ts sma/ema), with one change: the EMA starts from the SMA of its
// first n closes (the usual seed) instead of the very first close, so its first value is an n-bar average, not a
// value leaning on one close.

import type { StudyKind } from "./chartStudies";

/** SMA(n): the mean of each bar's last n closes (summed afresh per window, so no running-sum drift on long ranges). */
export function sma(closes: readonly number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += closes[j]!;
    out[i] = s / n;
  }
  return out;
}

/** EMA(n), k = 2 / (n + 1): seeded with the SMA of the first n closes at bar n - 1, then e = c·k + e·(1 − k). */
export function ema(closes: readonly number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(closes.length).fill(null);
  if (closes.length < n) return out;
  const k = 2 / (n + 1);
  let e = 0;
  for (let j = 0; j < n; j++) e += closes[j]!;
  e /= n;
  out[n - 1] = e;
  for (let i = n; i < closes.length; i++) {
    e = closes[i]! * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

export const study = (kind: StudyKind, closes: readonly number[], n: number) => (kind === "sma" ? sma(closes, n) : ema(closes, n));
