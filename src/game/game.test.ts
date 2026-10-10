import { describe, expect, it } from 'vitest';
import { clockLabel, clockParts, dayIndex } from './clock';
import { compactMoney, money, price, signedChange, signedMoney, signedPct } from './format';
import { candles, createHistory, dayOpen, ensureVolume, record, sparkline } from './history';

const M = '\u2212';

describe('format', () => {
  it('uses separators, two decimals and the real minus', () => {
    expect(money(48212.4)).toBe('$48,212.40');
    expect(money(-12.5)).toBe(`${M}$12.50`);
    expect(signedMoney(1284.1)).toBe('+$1,284.10');
    expect(signedMoney(-292.8)).toBe(`${M}$292.80`);
    expect(signedMoney(0.001)).toBe('$0.00');
    expect(signedPct(0.0274)).toBe('+2.74%');
    expect(signedPct(-0.0105)).toBe(`${M}1.05%`);
    expect(price(41000)).toBe('41,000.00');
    expect(price(0.034)).toBe('0.0340');
    expect(compactMoney(5000)).toBe('$5k');
    expect(compactMoney(20000)).toBe('$20k');
    expect(compactMoney(1_400_000)).toBe('$1.4M');
  });
});

describe('clock', () => {
  it('maps ticks to a 09:30-16:00 session that matches the engine day boundary', () => {
    expect(clockLabel(0, 720)).toBe('Day 1 \u00b7 09:30');
    expect(clockParts(360, 720).hhmm).toBe('12:45');
    expect(clockLabel(720, 720)).toBe('Day 1 \u00b7 16:00');
    expect(clockLabel(721, 720)).toBe('Day 2 \u00b7 09:30');
    expect(dayIndex(720, 720)).toBe(0);
    expect(dayIndex(721, 720)).toBe(1);
  });
});

describe('history and candles', () => {
  const tpd = 720;
  function filled(n: number) {
    const h = createHistory(['X'], tpd);
    for (let t = 0; t <= n; t++) record(h, t, { X: 100 + t });
    return h;
  }

  it('builds daily OHLC bars that open at the previous close', () => {
    const h = filled(tpd * 2);
    const d = h.series.X!.daily;
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ time: 0, open: 100, close: 100 + tpd, high: 100 + tpd, low: 100 });
    expect(d[1]).toMatchObject({ time: tpd + 1, open: 100 + tpd, close: 100 + 2 * tpd });
    expect(dayOpen(h, 'X')).toBe(100 + tpd);
  });

  it('aggregates intraday bars on fixed tick buckets with continuous opens', () => {
    const h = filled(tpd * 3);
    const bars = candles(h, 'X', '1D');
    expect(bars.length).toBeGreaterThanOrEqual(60);
    expect(bars.length).toBeLessThanOrEqual(61);
    for (const b of bars) expect(b.time % 12).toBe(0);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]!.time).toBeGreaterThan(bars[i - 1]!.time);
      expect(bars[i]!.open).toBe(bars[i - 1]!.close);
    }
    const last = bars.at(-1)!;
    expect(last.close).toBe(100 + 3 * tpd);
  });

  it('keeps only the last five days of ticks in the ring', () => {
    const h = filled(tpd * 7);
    expect(h.series.X!.size).toBe(tpd * 5);
    expect(candles(h, 'X', '1W').length).toBeLessThanOrEqual(61);
    expect(sparkline(h, 'X', 5, 48)).toHaveLength(48);
  });
});

describe('volume bars', () => {
  it('builds bar volume from cumVolume differences, also when ticks are skipped', () => {
    const tpd = 720;
    const every = createHistory(['A'], tpd, ['A']);
    const skipped = createHistory(['A'], tpd, ['A']);
    let cum = 0;
    for (let t = 1; t <= 48; t++) {
      cum += t; // t units traded at tick t
      record(every, t, { A: 100 }, { A: cum });
      if (t % 3 === 0) record(skipped, t, { A: 100 }, { A: cum }); // app only saw every 3rd tick
    }
    const sum = (a: number, b: number) => a + (b > 0 ? b : 0);
    const total = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i).reduce(sum, 0);
    const bars = candles(every, 'A', '1D');
    const bar12 = bars.find((b) => b.time === 12)!; // ticks 12..23
    expect(bar12.volume).toBe(total(12, 23));
    expect(every.series.A!.daily.at(-1)!.volume).toBe(total(2, 48)); // first reading has no baseline
    // the skipped history attributes each 3-tick chunk to the tick that recorded it
    expect(skipped.series.A!.daily.at(-1)!.volume).toBe(total(4, 48));
  });

  it('indices carry no volume and old saves gain volume rings', () => {
    const h = createHistory(['GX', 'A'], 720, ['A']);
    record(h, 1, { GX: 1000, A: 10 }, { A: 5 });
    expect(candles(h, 'GX', '1D')[0]!.volume).toBeUndefined();
    const old = createHistory(['A'], 720);
    ensureVolume(old, ['A']);
    record(old, 1, { A: 10 }, { A: 5 });
    record(old, 2, { A: 10 }, { A: 9 });
    expect(old.series.A!.daily.at(-1)!.volume).toBe(4);
  });

  it('shows the day change in the quote precision', () => {
    expect(signedChange(0.0394, 141.89)).toBe('+0.04');
    expect(signedChange(-0.4603, 64)).toBe(`${M}0.46`);
    expect(signedChange(-0.001, 64)).toBe('+0.00');
  });
});
