import { describe, expect, it } from 'vitest';
import type { LpBar } from '@/world/launchpad/types';
import { TIMEFRAMES, candlesOf } from './CandleChart';

// The candle chart's pure part (review fix, Phase 10): the timeframes are built from the world's bars on the game clock, so a 1m candle
// is a real minute of trades and a 5m candle holds five minutes of them.

describe('candlesOf builds candles from bars on the game clock', () => {
  const minutes: LpBar[] = [
    [0, 1, 3, 1, 2],
    [12, 2, 4, 2, 3],
    [24, 3, 3.5, 0.5, 1],
    [36, 1, 2, 1, 2],
    [48, 2, 2, 2, 2],
    [60, 2, 5, 2, 4],
  ];

  it('the 1m frame is the minute bars themselves (a candle is a minute, not a flat sample)', () => {
    const c = candlesOf(minutes, 12);
    expect(c.length).toBe(6);
    expect(c[0]).toEqual({ t: 0, o: 1, h: 3, l: 1, c: 2 });
    expect(c[2]).toEqual({ t: 24, o: 3, h: 3.5, l: 0.5, c: 1 });
    expect(c.some((x) => x.h > x.l)).toBe(true);
  });

  it('a 5m candle opens at its first minute, takes the extremes, and closes at its last', () => {
    const c = candlesOf(minutes, 60);
    expect(c.length).toBe(2);
    // the bucket 0..59 holds the bars at 0, 12, 24, 36 and 48: open 1, high 4, low 0.5, close 2 (the bar at 48)
    expect(c[0]).toEqual({ t: 0, o: 1, h: 4, l: 0.5, c: 2 });
    expect(c[1]!.t).toBe(60);
  });

  it('an empty series has no candles, and the timeframes are the chart frames', () => {
    expect(candlesOf([], 12)).toEqual([]);
    expect(TIMEFRAMES.map((x) => x.id)).toEqual(['5s', '1m', '5m', '15m', '1h']);
    expect(TIMEFRAMES.find((x) => x.id === '5s')!.src).toBe('s');
    expect(TIMEFRAMES.find((x) => x.id === '1h')!.src).toBe('h');
  });
});
