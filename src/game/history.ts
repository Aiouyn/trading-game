import { t } from '@/i18n';
import { clockParts, dayIndex, SESSION_MINUTES, tickMs } from './clock';

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

/**
 * Replace one series with a server back-fill (recent tick prices ending at `lastTick`, daily
 * bars, cumulative volumes). If the client has already recorded newer ticks, the series is padded
 * with its newest price so the ring stays aligned to h.lastTick. Mutates.
 */
export function loadSeries(
  h: History, id: string, payload: { daily: Bar[]; ticks: number[]; lastTick: number; cums?: number[] },
): void {
  const s = h.series[id] ?? (h.series[id] = { ring: new Array<number>(h.capacity).fill(0), head: 0, size: 0, daily: [] });
  const prices = payload.ticks.slice();
  const cums = payload.cums?.slice();
  const lag = h.lastTick > payload.lastTick ? h.lastTick - payload.lastTick : 0;
  for (let k = 0; k < lag; k++) {
    prices.push(prices[prices.length - 1] ?? 0);
    if (cums) cums.push(cums[cums.length - 1] ?? NaN);
  }
  const take = Math.min(h.capacity, prices.length);
  const from = prices.length - take;
  s.ring = new Array<number>(h.capacity).fill(0);
  for (let k = 0; k < take; k++) s.ring[k] = prices[from + k]!;
  s.size = take;
  s.head = take % h.capacity;
  if (cums) {
    s.cum = new Array<number>(h.capacity).fill(NaN);
    for (let k = 0; k < take; k++) s.cum[k] = cums[from + k]!;
    s.lastCum = cums[cums.length - 1];
  }
  s.daily = payload.daily.map((b) => ({ ...b }));
  if (h.lastTick < payload.lastTick) h.lastTick = payload.lastTick;
}

/** Game-time candle sizes, in session minutes (a game day has 390 of them, 09:30 to 16:00). 1D is the daily bar. */
export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
export type Interval = (typeof INTERVALS)[number];
export const INTERVAL_MINUTES: Record<Interval, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 0 };

/** Range presets, in game days. 1D and 1W come from the tick ring (5 game days); 1M and longer come from the daily bars. */
export const CHART_RANGES = ['1D', '1W', '1M', '1Y', 'ALL'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const RANGE_DAYS: Record<ChartRange, number> = { '1D': 1, '1W': RING_DAYS, '1M': 21, '1Y': 252, ALL: MAX_DAILY_BARS };

/** Ranges that the tick ring covers. Intraday intervals need it, so the other ranges draw daily bars only. */
export function rangeIsIntraday(range: ChartRange): boolean {
  return range === '1D' || range === '1W';
}

/** The fewest candles a chart draws for a range: one candle on a range is a block, not a chart (UX fix). */
export const MIN_CANDLES = 20;

/**
 * How many candles an interval draws over a range. Intraday intervals cut the range's session minutes into candles (a
 * 1D range is 390 minutes; a candle never spans two days). The daily bar draws one candle per game day of the range. A
 * daily range draws no intraday candle at all.
 */
export function candleCount(range: ChartRange, interval: Interval): number {
  if (interval === '1D') return RANGE_DAYS[range];
  if (!rangeIsIntraday(range)) return 0;
  return Math.floor((RANGE_DAYS[range] * SESSION_MINUTES) / INTERVAL_MINUTES[interval]);
}

/** The intervals a range offers: those that draw at least MIN_CANDLES candles (1D: 1m, 5m, 15m; 1W adds 1h; 1M and up: 1D). */
export function intervalsFor(range: ChartRange): Interval[] {
  return INTERVALS.filter((i) => candleCount(range, i) >= MIN_CANDLES);
}

/**
 * The interval a range opens with when the current one is not offered: the current one if it fits, else 5m (the default)
 * if the range offers it, else the range's first interval. Used when the range changes (UX fix: the interval follows).
 */
export function fitInterval(range: ChartRange, current: Interval): Interval {
  const allowed = intervalsFor(range);
  if (allowed.includes(current)) return current;
  return allowed.includes('5m') ? '5m' : allowed[0]!;
}

/**
 * Real seconds one game session minute takes. A game day is `ticksPerDay` ticks of `tickMs(1)` real milliseconds, shown
 * over the 390-minute session (clock.ts), so one session minute is 9.2 real seconds at the default 720 ticks.
 */
export function realSecondsPerMinute(ticksPerDay: number): number {
  return (ticksPerDay * tickMs(1)) / 1000 / SESSION_MINUTES;
}

/** The real time one candle of an interval spans, in seconds (a 1D bar is one game day). */
export function candleRealSeconds(interval: Interval, ticksPerDay: number): number {
  const minutes = interval === '1D' ? SESSION_MINUTES : INTERVAL_MINUTES[interval];
  return minutes * realSecondsPerMinute(ticksPerDay);
}

/**
 * The index of the candle bucket a tick falls in. Buckets are whole session minutes inside a game day, so a 1h candle
 * is 09:30 to 10:30 and the day's last candle is short. Days never share a bucket.
 */
function bucketKey(tick: number, ticksPerDay: number, minutes: number): number {
  const day = dayIndex(tick, ticksPerDay);
  const inDay = tick - day * ticksPerDay;
  const minute = Math.floor((Math.max(0, inDay - 1) * SESSION_MINUTES) / ticksPerDay);
  return day * 10000 + Math.floor(minute / minutes);
}

/**
 * OHLC bars for an interval over a range. Intraday bars come from the tick ring and open at the previous bar's close; a
 * bar's time is its first tick. Daily ranges and the 1D interval read the daily bars.
 */
export function barsFor(h: History, id: string, interval: Interval, range: ChartRange): Bar[] {
  const s = h.series[id];
  if (!s || s.size === 0) return [];
  if (interval === '1D' || !rangeIsIntraday(range)) return s.daily.slice(-RANGE_DAYS[range]).map((b) => ({ ...b }));
  const minutes = INTERVAL_MINUTES[interval];
  const { ticks, prices, cums } = lastTicks(h, id, RANGE_DAYS[range] * h.ticksPerDay);
  const bars: Bar[] = [];
  let key = NaN;
  for (let k = 0; k < ticks.length; k++) {
    const t = ticks[k]!;
    const p = prices[k]!;
    const dv = cums && k > 0 ? volDelta(cums[k], cums[k - 1]) : 0;
    const cur = bars[bars.length - 1];
    const next = bucketKey(t, h.ticksPerDay, minutes);
    if (cur && next === key) {
      if (p > cur.high) cur.high = p;
      if (p < cur.low) cur.low = p;
      cur.close = p;
      if (cums) cur.volume = (cur.volume ?? 0) + dv;
    } else {
      const open = cur ? cur.close : p;
      const bar: Bar = { time: t, open, high: Math.max(open, p), low: Math.min(open, p), close: p };
      if (cums) bar.volume = dv;
      bars.push(bar);
      key = next;
    }
  }
  return bars;
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
  return daily ? t('clock.day', { day: c.day }) : `${t('clock.dayShort', { day: c.day })} ${c.hhmm}`;
}

/**
 * The time axis label for a range: the clock on a day (1D), the game day and clock on the week (1W), and the game day on
 * the daily ranges. Daily bars are labelled by day only.
 */
export function axisTimeLabel(tick: number, ticksPerDay: number, range: ChartRange, daily: boolean): string {
  const c = clockParts(tick, ticksPerDay);
  if (daily) return t('clock.day', { day: c.day });
  if (range === '1W') return `${t('clock.dayShort', { day: c.day })} ${c.hhmm}`;
  return c.hhmm;
}
