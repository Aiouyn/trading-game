import type { Bar } from './history';

/** Chart studies on bar closes. Each returns one value per bar (NaN until warmed up). */

export function sma(bars: Bar[], n: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i]!.close;
    if (i >= n) sum -= bars[i - n]!.close;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(bars: Bar[], n: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  const k = 2 / (n + 1);
  let e = NaN;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i]!.close;
    e = Number.isNaN(e) ? c : c * k + e * (1 - k);
    if (i >= n - 1) out[i] = e;
  }
  return out;
}

export function bollinger(bars: Bar[], n = 20, width = 2): { mid: number[]; upper: number[]; lower: number[] } {
  const mid = sma(bars, n);
  const upper = new Array<number>(bars.length).fill(NaN);
  const lower = new Array<number>(bars.length).fill(NaN);
  for (let i = n - 1; i < bars.length; i++) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (bars[j]!.close - mid[i]!) ** 2;
    const sd = Math.sqrt(v / n);
    upper[i] = mid[i]! + width * sd;
    lower[i] = mid[i]! - width * sd;
  }
  return { mid, upper, lower };
}

/** Volume-weighted average price, reset at each game day (bars carry their start tick). */
export function vwap(bars: Bar[], ticksPerDay: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let pv = 0;
  let v = 0;
  let day = -1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const d = Math.floor(Math.max(0, b.time - 1) / ticksPerDay);
    if (d !== day) { pv = 0; v = 0; day = d; }
    const typical = (b.high + b.low + b.close) / 3;
    const vol = b.volume ?? 0;
    pv += typical * vol;
    v += vol;
    out[i] = v > 0 ? pv / v : typical;
  }
  return out;
}

/** Wilder's RSI (0..100). */
export function rsi(bars: Bar[], n = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i]!.close - bars[i - 1]!.close;
    const g = Math.max(0, d);
    const l = Math.max(0, -d);
    if (i <= n) {
      gain += g / n;
      loss += l / n;
      if (i === n) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

export type IndicatorId = 'sma20' | 'sma50' | 'ema12' | 'bb' | 'vwap' | 'rsi';

export const INDICATORS: { id: IndicatorId; label: string; hint: string }[] = [
  { id: 'sma20', label: 'SMA 20', hint: 'Average of the last 20 closes' },
  { id: 'sma50', label: 'SMA 50', hint: 'Average of the last 50 closes' },
  { id: 'ema12', label: 'EMA 12', hint: 'Faster average that weights recent closes' },
  { id: 'bb', label: 'Bollinger', hint: '20-bar average ± 2 standard deviations' },
  { id: 'vwap', label: 'VWAP', hint: 'Average price weighted by volume, resets daily' },
  { id: 'rsi', label: 'RSI', hint: 'Momentum from 0 to 100: above 70 stretched, below 30 washed out' },
];
