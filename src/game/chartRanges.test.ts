import { describe, expect, it } from 'vitest';
import {
  CHART_RANGES, INTERVALS, INTERVAL_MINUTES, MIN_VIEW_CANDLES, axisTimeLabel, barsFor, candleRealSeconds, createHistory, isIntraday,
  rangeFromTick, realSecondsPerMinute, record, type Bar, type Interval,
} from './history';
import { clockParts } from './clock';
import { latestValues } from './indicators';

const TPD = 720;

/** A history with ticks 1..n of a wiggling price (tick t trades near 100 + t/100 with a small swing) and a rising volume. */
function filled(n: number, ids = ['X']) {
  const h = createHistory(ids, TPD, ids);
  let cum = 0;
  for (let t = 0; t <= n; t++) {
    cum += 2 + (t % 3);
    const prices: Record<string, number> = {};
    const cums: Record<string, number> = {};
    for (const id of ids) {
      prices[id] = 100 + t / 100 + Math.sin(t / 7) * 0.5;
      cums[id] = cum;
    }
    record(h, t, prices, cums);
  }
  return h;
}

/** Session minutes since 09:30 of a tick, read back from the clock's own label (independent of the bucket code). */
function sessionMinute(tick: number): number {
  const [hh, mm] = clockParts(tick, TPD).hhmm.split(':').map(Number) as [number, number];
  // the close tick reads 16:00 and belongs to the session's last minute (history.ts bucketKey)
  return Math.min(389, hh * 60 + mm - (9 * 60 + 30));
}

/** Candles of an intraday size built from the raw ticks, one candle per (game day, bucket of session minutes). */
function bruteIntraday(h: ReturnType<typeof filled>, id: string, minutes: number): Bar[] {
  const s = h.series[id]!;
  const ticks: { t: number; p: number }[] = [];
  for (let k = 0; k < s.size; k++) {
    const t = h.lastTick - s.size + 1 + k;
    const idx = (s.head - s.size + k + h.capacity * 2) % h.capacity;
    ticks.push({ t, p: s.ring[idx]! });
  }
  const groups = new Map<string, { t: number; p: number }[]>();
  for (const x of ticks) {
    const day = clockParts(x.t, TPD).day;
    const key = `${day}|${Math.floor(sessionMinute(x.t) / minutes)}`;
    const g = groups.get(key) ?? [];
    g.push(x);
    groups.set(key, g);
  }
  const out: Bar[] = [];
  for (const g of groups.values()) {
    const ps = g.map((x) => x.p);
    const open = out.length ? out[out.length - 1]!.close : ps[0]!;
    out.push({ time: g[0]!.t, open, high: Math.max(open, ...ps), low: Math.min(open, ...ps), close: ps[ps.length - 1]! });
  }
  return out;
}

describe('game-time candle sizes', () => {
  it('offers the TradingView list, and a range moves only the view (the sizes do not depend on it)', () => {
    expect(INTERVALS).toEqual(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M']);
    expect(CHART_RANGES).toEqual(['1D', '1W', '1M', '1Y', 'ALL']);
    expect(INTERVAL_MINUTES['30m']).toBe(30);
    expect(isIntraday('4h')).toBe(true);
    expect(isIntraday('1W')).toBe(false);
  });

  it('a game day is 390 session minutes, so one session minute is about 9.2 real seconds', () => {
    expect(realSecondsPerMinute(TPD)).toBeCloseTo(3600 / 390, 6);
    expect(candleRealSeconds('1m', TPD)).toBeCloseTo(9.23, 1);
    expect(candleRealSeconds('3m', TPD)).toBeCloseTo(27.7, 1);
    expect(candleRealSeconds('1h', TPD)).toBeCloseTo(553.8, 1);
    // the daily sizes: a 1D candle is one game day (one real hour at 720 ticks), 1W five and 1M twenty-one
    expect(candleRealSeconds('1D', TPD)).toBeCloseTo(3600, 6);
    expect(candleRealSeconds('1W', TPD)).toBeCloseTo(5 * 3600, 6);
    expect(candleRealSeconds('1M', TPD)).toBeCloseTo(21 * 3600, 6);
  });

  it('every intraday size matches a brute-force grouping of the raw ticks (OHLC, first tick, volume is not summed away)', () => {
    const h = filled(TPD + 400);
    for (const iv of ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h'] as Interval[]) {
      const got = barsFor(h, 'X', iv);
      const want = bruteIntraday(h, 'X', INTERVAL_MINUTES[iv]);
      expect(got.length, iv).toBe(want.length);
      for (let i = 0; i < got.length; i++) {
        const g = got[i]!;
        const w = want[i]!;
        expect(g.time, `${iv} time ${i}`).toBe(w.time);
        expect(g.high, `${iv} high ${i}`).toBeCloseTo(w.high, 10);
        expect(g.low, `${iv} low ${i}`).toBeCloseTo(w.low, 10);
        expect(g.close, `${iv} close ${i}`).toBeCloseTo(w.close, 10);
        expect(g.open, `${iv} open ${i}`).toBeCloseTo(w.open, 10);
      }
    }
  });

  it('candles are clock-aligned: an hourly candle opens on the hour from 09:30, a 2h candle at 09:30, 11:30, 13:30 and 15:30', () => {
    const h = filled(TPD);
    const starts = (iv: Interval) => barsFor(h, 'X', iv).map((b) => clockParts(b.time, TPD).hhmm);
    expect(starts('1h').slice(0, 3)).toEqual(['09:30', '10:30', '11:30']);
    expect(starts('2h').slice(0, 4)).toEqual(['09:30', '11:30', '13:30', '15:30']);
    expect(starts('4h').slice(0, 2)).toEqual(['09:30', '13:30']);
    expect(starts('15m').slice(0, 3)).toEqual(['09:30', '09:45', '10:00']);
  });

  it('a candle never spans two game days, and each day opens its own candle', () => {
    const h = filled(TPD * 2 + 300);
    for (const iv of ['15m', '1h', '4h'] as Interval[]) {
      const bars = barsFor(h, 'X', iv);
      for (let i = 1; i < bars.length; i++) expect(bars[i]!.time).toBeGreaterThan(bars[i - 1]!.time);
      const starts = bars.map((b) => b.time);
      expect(starts).toContain(TPD + 1);
      expect(starts).toContain(2 * TPD + 1);
    }
  });

  it('each intraday candle opens at the previous candle close', () => {
    const h = filled(TPD);
    for (const iv of ['1m', '5m', '1h'] as Interval[]) {
      const bars = barsFor(h, 'X', iv);
      for (let i = 1; i < bars.length; i++) expect(bars[i]!.open).toBe(bars[i - 1]!.close);
    }
  });

  it('the weekly and monthly sizes group the daily bars in five and twenty-one game days, counted from day 1', () => {
    const h = filled(TPD * 30 + 5);
    const daily = h.series.X!.daily;
    const w = barsFor(h, 'X', '1W');
    expect(w).toHaveLength(Math.ceil(daily.length / 5));
    expect(w[0]!.open).toBe(daily[0]!.open);
    expect(w[0]!.close).toBe(daily[4]!.close);
    expect(w[0]!.high).toBe(Math.max(...daily.slice(0, 5).map((b) => b.high)));
    expect(w[0]!.low).toBe(Math.min(...daily.slice(0, 5).map((b) => b.low)));
    expect(w[0]!.time).toBe(daily[0]!.time);
    expect(w[1]!.time).toBe(daily[5]!.time);
    const m = barsFor(h, 'X', '1M');
    expect(m).toHaveLength(Math.ceil(daily.length / 21));
    expect(m[0]!.close).toBe(daily[20]!.close);
    expect(barsFor(h, 'X', '1D')).toHaveLength(daily.length);
  });

  it('the newest candle forms live: its close is the newest price and it grows with every tick', () => {
    const h = filled(200);
    const before = barsFor(h, 'X', '1h').at(-1)!;
    const p = 123.45;
    record(h, 201, { X: p }, { X: 9999 });
    const after = barsFor(h, 'X', '1h').at(-1)!;
    expect(after.time).toBe(before.time);
    expect(after.close).toBe(p);
    expect(after.high).toBeGreaterThanOrEqual(before.high);
  });

  it('a preset is a window of the history: from the first tick it covers, and ALL from tick 0', () => {
    const h = filled(TPD * 3);
    expect(rangeFromTick(h, 'ALL')).toBe(0);
    expect(rangeFromTick(h, '1D')).toBe(h.lastTick - TPD + 1);
    expect(rangeFromTick(h, '1W')).toBe(Math.max(1, h.lastTick - 5 * TPD + 1));
    expect(MIN_VIEW_CANDLES).toBeGreaterThanOrEqual(10);
  });

  it('axis labels: the clock inside a day, the game day and clock on a day’s first candle, the game day on the daily sizes', () => {
    expect(axisTimeLabel(TPD + 1, TPD, '1h')).toBe('D2 09:30');
    expect(axisTimeLabel(TPD + 2, TPD, '1m')).toBe('09:31');
    expect(axisTimeLabel(TPD + 1, TPD, '1D')).toBe('Day 2');
    expect(axisTimeLabel(TPD * 4 + 1, TPD, '1M')).toBe('Day 5');
  });
});

describe('legend values', () => {
  it('gives the latest value of each active indicator, and nothing before it is warmed up', () => {
    const h = filled(60);
    const bars = barsFor(h, 'X', '1m');
    const v = latestValues(bars, ['sma20', 'rsi', 'sma50'], TPD);
    expect(v.sma20).toHaveLength(1);
    expect(v.sma50).toHaveLength(0);
    expect(v.rsi?.[0]).toBeGreaterThanOrEqual(0);
  });
});
