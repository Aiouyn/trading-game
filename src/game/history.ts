import { clockParts, dayIndex } from './clock';

/**
 * Price history the engine does not keep. Per series (each asset plus indices):
 * a ring of the last RING_DAYS of tick prices and a list of daily OHLC bars.
 * Plain data so it can be saved next to the WorldState.
 */
export const RING_DAYS = 5;
export const MAX_DAILY_BARS = 400;

export interface Bar {
  /** start tick of the bar (chart time) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** units traded in the bar (assets only; indices have none) */
  volume?: number;
}

export interface SeriesHistory {
  /** tick prices, ring buffer */
  ring: number[];
  /** index of the next write */
  head: number;
  /** number of valid entries */
  size: number;
  /** completed and current daily bars; time = first tick of the day */
  daily: Bar[];
  /** engine cumVolume at each ring slot (NaN = unknown, e.g. a pre-volume save); absent for indices */
  cum?: number[];
  /** cumVolume at the last recorded tick */
  lastCum?: number;
}

export interface History {
  version: 1;
  ticksPerDay: number;
  capacity: number;
  /** tick of the newest recorded price */
  lastTick: number;
  series: Record<string, SeriesHistory>;
}

export function createHistory(ids: string[], ticksPerDay: number, volumeIds: string[] = []): History {
  const capacity = ticksPerDay * RING_DAYS;
  const series: Record<string, SeriesHistory> = {};
  for (const id of ids) series[id] = { ring: new Array<number>(capacity).fill(0), head: 0, size: 0, daily: [] };
  for (const id of volumeIds) if (series[id]) series[id].cum = new Array<number>(capacity).fill(NaN);
  return { version: 1, ticksPerDay, capacity, lastTick: -1, series };
}

/** Add empty series a newer app records (e.g. net worth) to an older saved history. Mutates. */
export function ensureSeries(h: History, ids: string[]): History {
  for (const id of ids) {
    if (!h.series[id]) h.series[id] = { ring: new Array<number>(h.capacity).fill(0), head: 0, size: 0, daily: [] };
  }
  return h;
}

/** Give a history saved before volume existed its volume rings (bars start at 0). Mutates. */
export function ensureVolume(h: History, volumeIds: string[]): History {
  for (const id of volumeIds) {
    const s = h.series[id];
    if (s && !s.cum) s.cum = new Array<number>(h.capacity).fill(NaN);
  }
  return h;
}

/** Volume between two cumVolume readings; unknown or reset readings count as 0. */
function volDelta(cum: number | undefined, prev: number | undefined): number {
  if (cum === undefined || prev === undefined || !Number.isFinite(cum) || !Number.isFinite(prev)) return 0;
  return Math.max(0, cum - prev);
}

/**
 * Record one tick of prices and, for assets, the engine's cumVolume (mutates; history lives
 * outside React state for speed). Volume is always a cumVolume difference, so it stays right
 * when ticks are skipped or recorded in batches.
 */
export function record(h: History, tick: number, priceById: Record<string, number>, cumById: Record<string, number> = {}): void {
  const d = dayIndex(tick, h.ticksPerDay);
  const dayStart = d * h.ticksPerDay + (tick <= 0 ? 0 : 1);
  for (const id in h.series) {
    const p = priceById[id];
    if (p === undefined || !Number.isFinite(p)) continue;
    const s = h.series[id]!;
    const cum = s.cum ? cumById[id] : undefined;
    const dv = volDelta(cum, s.lastCum);
    if (s.cum) {
      s.cum[s.head] = cum ?? NaN;
      if (cum !== undefined) s.lastCum = cum;
    }
    s.ring[s.head] = p;
    s.head = (s.head + 1) % h.capacity;
    if (s.size < h.capacity) s.size++;
    const last = s.daily[s.daily.length - 1];
    if (last && dayIndex(last.time, h.ticksPerDay) === d) {
      if (p > last.high) last.high = p;
      if (p < last.low) last.low = p;
      last.close = p;
      if (s.cum) last.volume = (last.volume ?? 0) + dv;
    } else {
      const open = last ? last.close : p;
      const bar: Bar = { time: dayStart, open, high: Math.max(open, p), low: Math.min(open, p), close: p };
      if (s.cum) bar.volume = dv;
      s.daily.push(bar);
      if (s.daily.length > MAX_DAILY_BARS) s.daily.splice(0, s.daily.length - MAX_DAILY_BARS);
    }
  }
  h.lastTick = tick;
}

/** Last n tick prices, oldest first, with their ticks (and cumVolume readings when kept). */
export function lastTicks(h: History, id: string, n: number): { ticks: number[]; prices: number[]; cums?: number[] } {
  const s = h.series[id];
  if (!s) return { ticks: [], prices: [] };
  const count = Math.min(n, s.size);
  const prices = new Array<number>(count);
  const ticks = new Array<number>(count);
  const cums = s.cum ? new Array<number>(count) : undefined;
  for (let k = 0; k < count; k++) {
    const idx = (s.head - count + k + h.capacity * 2) % h.capacity;
    prices[k] = s.ring[idx]!;
    if (cums) cums[k] = s.cum![idx]!;
    ticks[k] = h.lastTick - count + 1 + k;
  }
  return { ticks, prices, cums };
}

export type RangeId = '1H' | '1D' | '1W' | '1Q' | '1Y';

export interface RangeSpec {
  id: RangeId;
  /** ticks per bar, or 'daily' */
  bucket: number | 'daily';
  /** ticks shown (intraday) or daily bars shown */
  span: number;
}

export function rangeSpec(id: RangeId, ticksPerDay: number): RangeSpec {
  switch (id) {
    case '1H': return { id, bucket: 2, span: Math.round(ticksPerDay * 60 / 390) };
    case '1D': return { id, bucket: 12, span: ticksPerDay };
    case '1W': return { id, bucket: 60, span: ticksPerDay * RING_DAYS };
    case '1Q': return { id, bucket: 'daily', span: 63 };
    case '1Y': return { id, bucket: 'daily', span: 252 };
  }
}

export const RANGES: RangeId[] = ['1H', '1D', '1W', '1Q', '1Y'];

/**
 * OHLC bars for a range. Intraday buckets are aligned to absolute tick multiples so bars
 * stay put as time passes; each bar opens at the previous bar's close.
 */
export function candles(h: History, id: string, range: RangeId): Bar[] {
  const spec = rangeSpec(range, h.ticksPerDay);
  const s = h.series[id];
  if (!s || s.size === 0) return [];
  if (spec.bucket === 'daily') return s.daily.slice(-spec.span).map((b) => ({ ...b }));
  const b = spec.bucket;
  const { ticks, prices, cums } = lastTicks(h, id, spec.span + b + 1);
  const firstAllowed = h.lastTick - spec.span + 1;
  const bars: Bar[] = [];
  let prevClose: number | undefined;
  for (let k = 0; k < ticks.length; k++) {
    const t = ticks[k]!;
    const p = prices[k]!;
    const dv = cums && k > 0 ? volDelta(cums[k], cums[k - 1]) : 0;
    const start = Math.floor(t / b) * b;
    const cur = bars[bars.length - 1];
    if (cur && cur.time === start) {
      if (p > cur.high) cur.high = p;
      if (p < cur.low) cur.low = p;
      cur.close = p;
      if (cums) cur.volume = (cur.volume ?? 0) + dv;
    } else {
      const open = cur ? cur.close : (prevClose ?? p);
      const bar: Bar = { time: start, open, high: Math.max(open, p), low: Math.min(open, p), close: p };
      if (cums) bar.volume = dv;
      bars.push(bar);
    }
    prevClose = p;
  }
  return bars.filter((bar) => bar.time + b - 1 >= firstAllowed);
}

/** Price at the start of the current day (previous close), for day change. */
export function dayOpen(h: History, id: string): number | undefined {
  const s = h.series[id];
  const last = s?.daily[s.daily.length - 1];
  return last?.open;
}

/** Downsampled prices for a sparkline over the last `days` days. */
export function sparkline(h: History, id: string, days: number, points = 48): number[] {
  const { prices } = lastTicks(h, id, Math.min(h.capacity, days * h.ticksPerDay));
  if (prices.length <= points) return prices;
  const out: number[] = [];
  const stepSize = prices.length / points;
  for (let k = 0; k < points; k++) out.push(prices[Math.min(prices.length - 1, Math.floor((k + 1) * stepSize) - 1)]!);
  return out;
}

/** Axis and crosshair label for a bar time. */
export function barTimeLabel(tick: number, ticksPerDay: number, daily: boolean): string {
  const c = clockParts(tick, ticksPerDay);
  return daily ? `Day ${c.day}` : `D${c.day} ${c.hhmm}`;
}
