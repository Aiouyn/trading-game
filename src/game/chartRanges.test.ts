import { describe, expect, it } from 'vitest';
import { candleCount, candleRealSeconds, axisTimeLabel, barsFor, createHistory, fitInterval, intervalsFor, rangeIsIntraday, realSecondsPerMinute, record } from './history';
import { latestValues } from './indicators';

const TPD = 720;

/** A history with `n` ticks of a rising price: tick t trades at 100 + t/100 (so a wiggle is small against the price). */
function filled(n: number) {
  const h = createHistory(['X'], TPD, ['X']);
  let cum = 0;
  for (let t = 0; t <= n; t++) {
    cum += 2;
    record(h, t, { X: 100 + t / 100 }, { X: cum });
  }
  return h;
}

describe('game-time intervals and ranges', () => {
  it('a game day is 390 session minutes, so one session minute is about 9.2 real seconds', () => {
    expect(realSecondsPerMinute(TPD)).toBeCloseTo(3600 / 390, 6);
    expect(candleRealSeconds('1m', TPD)).toBeCloseTo(9.23, 1);
    expect(candleRealSeconds('5m', TPD)).toBeCloseTo(46.15, 1);
    expect(candleRealSeconds('1h', TPD)).toBeCloseTo(553.8, 1);
    // a daily bar is a whole game day: one real hour at the default 720 ticks
    expect(candleRealSeconds('1D', TPD)).toBeCloseTo(3600, 6);
  });

  it('the daily ranges offer only the daily bar; 1D and 1W offer every intraday interval', () => {
    expect(intervalsFor('1M')).toEqual(['1D']);
    expect(intervalsFor('1Y')).toEqual(['1D']);
    expect(intervalsFor('ALL')).toEqual(['1D']);
    expect(rangeIsIntraday('1W')).toBe(true);
    expect(rangeIsIntraday('1M')).toBe(false);
  });

  it('an interval is offered only when it draws at least 20 candles over the range (no one-candle chart)', () => {
    // a day is 390 session minutes: 1m, 5m and 15m give 390, 78 and 26 candles; 1h gives 6, 4h 1 and 1D 1
    expect(intervalsFor('1D')).toEqual(['1m', '5m', '15m']);
    // a week is five days: 1h gives 32 candles, 4h 8 and the daily bar 5
    expect(intervalsFor('1W')).toEqual(['1m', '5m', '15m', '1h']);
    for (const r of ['1D', '1W', '1M', '1Y', 'ALL'] as const) {
      for (const i of intervalsFor(r)) expect(candleCount(r, i)).toBeGreaterThanOrEqual(20);
    }
  });

  it('the interval follows a range change: one the range does not offer moves to 5m (or the range\'s own bar)', () => {
    expect(fitInterval('1D', '1D')).toBe('5m');
    expect(fitInterval('1D', '15m')).toBe('15m');
    expect(fitInterval('1W', '1h')).toBe('1h');
    expect(fitInterval('1M', '5m')).toBe('1D');
    expect(fitInterval('1D', '4h')).toBe('5m');
  });

  it('a candle never spans two game days, so each day opens its own bucket', () => {
    const h = filled(TPD * 2 + 300);
    for (const iv of ['15m', '1h', '4h'] as const) {
      const bars = barsFor(h, 'X', iv, '1W');
      for (let i = 1; i < bars.length; i++) expect(bars[i]!.time).toBeGreaterThan(bars[i - 1]!.time);
      // the first tick of each day starts a fresh candle: no candle's time is inside another day's tick run
      const starts = bars.map((b) => b.time);
      expect(starts).toContain(TPD + 1);
      expect(starts).toContain(2 * TPD + 1);
    }
  });

  it('a 1m candle holds about two ticks and the open of each candle is the previous close', () => {
    const h = filled(TPD);
    const bars = barsFor(h, 'X', '1m', '1D');
    expect(bars.length).toBeGreaterThan(300);
    for (let i = 1; i < bars.length; i++) expect(bars[i]!.open).toBe(bars[i - 1]!.close);
  });

  it('a daily range reads the daily bars, not the tick ring', () => {
    const h = filled(TPD * 3);
    expect(barsFor(h, 'X', '5m', '1M')).toHaveLength(h.series.X!.daily.length);
    expect(barsFor(h, 'X', '1D', '1W')).toHaveLength(Math.min(5, h.series.X!.daily.length));
  });

  it('axis labels: the clock on a day, the game day and clock on a week, the game day on the longer ranges', () => {
    expect(axisTimeLabel(TPD + 1, TPD, '1D', false)).toBe('09:30');
    expect(axisTimeLabel(TPD + 1, TPD, '1W', false)).toBe('D2 09:30');
    expect(axisTimeLabel(TPD + 1, TPD, '1M', true)).toBe('Day 2');
    expect(axisTimeLabel(TPD * 4 + 1, TPD, '1Y', true)).toBe('Day 5');
  });
});

describe('legend values', () => {
  it('gives the latest value of each active indicator, and nothing before it is warmed up', () => {
    const h = filled(60);
    const bars = barsFor(h, 'X', '1m', '1D');
    const v = latestValues(bars, ['sma20', 'rsi', 'sma50'], TPD);
    expect(v.sma20).toHaveLength(1);
    expect(v.sma50).toHaveLength(0);
    expect(v.rsi?.[0]).toBeGreaterThanOrEqual(0);
  });
});
