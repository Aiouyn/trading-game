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

/**
 * Candle sizes, as TradingView lists them. The intraday ones cut a game day's 390 session minutes from 09:30, so a 1h candle is
 * 09:30 to 10:30 and the day's last one is short (a US exchange's chart does the same). 1D is one game day; 1W is five game days
 * and 1M twenty-one, counted from game day 1 (the game has no weekdays, so its week and month close on the same game day every
 * time). The daily sizes are built from the daily bars. The size is independent of the range (the view presets below).
 */
export const INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M'] as const;
export type Interval = (typeof INTERVALS)[number];
/** Session minutes per intraday candle (0 for the daily sizes). */
export const INTERVAL_MINUTES: Record<Interval, number> = {
  '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '1D': 0, '1W': 0, '1M': 0,
};
/** Game days per candle of the daily sizes. */
export const INTERVAL_DAYS: Record<'1D' | '1W' | '1M', number> = { '1D': 1, '1W': 5, '1M': 21 };
/** True for a candle cut from the tick ring (1m to 4h). */
export function isIntraday(interval: Interval): boolean {
  return INTERVAL_MINUTES[interval] > 0;
}

/**
 * View presets: game days back from the newest tick. A preset moves the visible window only; the data does not change with it.
 */
export const CHART_RANGES = ['1D', '1W', '1M', '1Y', 'ALL'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const RANGE_DAYS: Record<ChartRange, number> = { '1D': 1, '1W': RING_DAYS, '1M': 21, '1Y': 252, ALL: MAX_DAILY_BARS };

/** A preset never shows fewer candles than this when the history has them (one candle on a range is a block, not a chart). */
export const MIN_VIEW_CANDLES = 20;

/** The first tick a preset shows (ALL shows everything: tick 0). */
export function rangeFromTick(h: History, range: ChartRange): number {
  if (range === 'ALL') return 0;
  return Math.max(1, h.lastTick - RANGE_DAYS[range] * h.ticksPerDay + 1);
}

/**
 * Real seconds one game session minute takes. A game day is `ticksPerDay` ticks of `tickMs(1)` real milliseconds, shown
 * over the 390-minute session (clock.ts), so one session minute is 9.2 real seconds at the default 720 ticks.
 */
export function realSecondsPerMinute(ticksPerDay: number): number {
  return (ticksPerDay * tickMs(1)) / 1000 / SESSION_MINUTES;
}

/** The real time one candle of an interval spans, in seconds (a 1D candle is one game day, 1W five, 1M twenty-one). */
export function candleRealSeconds(interval: Interval, ticksPerDay: number): number {
  const minutes = isIntraday(interval) ? INTERVAL_MINUTES[interval] : SESSION_MINUTES * INTERVAL_DAYS[interval as '1D' | '1W' | '1M'];
  return minutes * realSecondsPerMinute(ticksPerDay);
}

/**
 * The index of the candle bucket a tick falls in. A tick's minute is the session minute its clock label shows (clock.ts), so a
 * candle that starts at 13:30 opens on the first tick the clock reads 13:30. The close tick (16:00) belongs to the last minute
 * of the session. A candle never spans two game days.
 */
function bucketKey(tick: number, ticksPerDay: number, minutes: number): number {
  const day = dayIndex(tick, ticksPerDay);
  const inDay = Math.max(0, tick - day * ticksPerDay);
  const minute = Math.min(SESSION_MINUTES - 1, Math.floor((inDay * SESSION_MINUTES) / ticksPerDay));
  return day * 10000 + Math.floor(minute / minutes);
}

/** Daily bars grouped into candles of `days` game days, each group counted from game day 1. */
function groupDaily(h: History, daily: Bar[], days: number): Bar[] {
  const out: Bar[] = [];
  let key = NaN;
  for (const b of daily) {
    const g = Math.floor(dayIndex(b.time, h.ticksPerDay) / days);
    const cur = out[out.length - 1];
    if (cur && g === key) {
      if (b.high > cur.high) cur.high = b.high;
      if (b.low < cur.low) cur.low = b.low;
      cur.close = b.close;
      if (b.volume !== undefined) cur.volume = (cur.volume ?? 0) + b.volume;
    } else {
      out.push({ ...b });
      key = g;
    }
  }
  return out;
}

/**
 * OHLC candles of an interval, from the whole history the client holds. Intraday candles come from the tick ring and open at
 * the previous candle's close; a candle's time is its first tick. The newest candle is still forming: it grows with every tick.
 * The daily sizes group the daily bars. Nothing is read ahead of the newest tick.
 */
export function barsFor(h: History, id: string, interval: Interval): Bar[] {
  const s = h.series[id];
  if (!s || s.size === 0) return [];
  if (!isIntraday(interval)) return groupDaily(h, s.daily, INTERVAL_DAYS[interval as '1D' | '1W' | '1M']);
  const minutes = INTERVAL_MINUTES[interval];
  const { ticks, prices, cums } = lastTicks(h, id, s.size);
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

/** Crosshair label for a candle's time: the game day for the daily sizes, the day and clock for the intraday ones. */
export function barTimeLabel(tick: number, ticksPerDay: number, interval: Interval): string {
  const c = clockParts(tick, ticksPerDay);
  return isIntraday(interval) ? `${t('clock.dayShort', { day: c.day })} ${c.hhmm}` : t('clock.day', { day: c.day });
}

/**
 * The time axis label: the clock inside a day, the game day and clock on a day's first candle, and the game day on the daily
 * sizes.
 */
export function axisTimeLabel(tick: number, ticksPerDay: number, interval: Interval): string {
  const c = clockParts(tick, ticksPerDay);
  if (!isIntraday(interval)) return t('clock.day', { day: c.day });
  return c.tickInDay <= 1 ? `${t('clock.dayShort', { day: c.day })} ${c.hhmm}` : c.hhmm;
}
