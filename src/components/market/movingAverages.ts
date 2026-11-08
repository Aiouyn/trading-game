// Broker chart overlays: SMA, EMA, Bollinger Bands, RSI and VWAP of the bars the plot shows (the numbers toPoints()
// made for the canvas, G1; nothing here reads a server string). One value per bar, null until the bar has enough
// history behind it in the shown bars (or, VWAP, traded volume): no value is made up for the bars before it.
// The math is the p10 chart's (src/game/indicators.ts), with two changes: the EMA starts from the SMA of its first n
// closes (the usual seed) instead of the very first close; RSI on a flat line is 50; VWAP has no value without volume
// (p10 drew the typical price there).

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


/** Bollinger Bands (p10's: n = 20, k = 2): the SMA(n) ± k population standard deviations of the same n closes (÷ n,
 *  not n − 1). [upper, lower]; none before the n-th bar. */
export function bollinger(closes: readonly number[], n: number, k = 2): [(number | null)[], (number | null)[]] {
  const mid = sma(closes, n);
  const up = mid.map(() => null as number | null), lo = up.slice();
  mid.forEach((m, i) => {
    if (m === null) return;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (closes[j]! - m) ** 2;
    const sd = Math.sqrt(v / n);
    up[i] = m + k * sd;
    lo[i] = m - k * sd;
  });
  return [up, lo];
}

/** Wilder's RSI(n), 0..100 (p10's): the first value at bar n (it takes n changes, so n + 1 closes), seeded with the
 *  plain mean gain and loss of those n changes, then smoothed by (avg·(n − 1) + x) / n. Only gains: 100; only losses:
 *  0; no change at all (flat): 50, neither side (p10 said 100 there, which reads as "overbought" on a flat line). */
export function rsi(closes: readonly number[], n: number): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  let g = 0, l = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const up = d > 0 ? d : 0, down = d < 0 ? -d : 0;
    if (i <= n) { g += up / n; l += down / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + down) / n; }
    if (i >= n) out[i] = l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l);
  }
  return out;
}

export interface VwapBar { readonly t: number; readonly h: number; readonly l: number; readonly c: number; readonly v: number }
/** VWAP (p10's): Σ(typical · volume) / Σ volume, typical = (high + low + close) / 3, restarting at each game day (`day`
 *  ticks; 00:00). `from` is the tick its sum starts at: the day's first tick when that bar is shown, else the first
 *  shown bar of that day (the range or the recording starts later: the value is only since then). No value while the
 *  sum has no volume (nothing traded yet that day): no price is made up from bars nobody traded. */
export function vwap(bars: readonly VwapBar[], day: number): { values: (number | null)[]; from: (number | null)[] } {
  const values: (number | null)[] = [], from: (number | null)[] = [];
  let pv = 0, vol = 0, d = -1, start = 0;
  for (const b of bars) {
    const bd = Math.floor(b.t / day);
    if (bd !== d) { d = bd; pv = 0; vol = 0; start = b.t; }
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    vol += b.v;
    values.push(vol > 0 ? pv / vol : null);
    from.push(start);
  }
  return { values, from };
}
