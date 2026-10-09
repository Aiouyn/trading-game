import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { defaultConfig } from './config';
import { crowding, dailyReturns, equitySharpe, mom63Signal, regimeAtOpen, sharpe, signalScores, signedFlow, SIGNAL_IDS, valueGapSignal } from './signals';
import type { Fill } from './types';

describe('learnability signal helpers', () => {
  it('ids match the band names', () => {
    expect([...SIGNAL_IDS]).toEqual(['value_gap', 'mom63']);
  });

  it('value_gap is ln(value / price) from public state, and reading it changes nothing', () => {
    const s = stepMany(createWorld('sig', defaultConfig({ ticksPerDay: 24 })), 24 * 10).state;
    const before = JSON.stringify(s);
    const g = valueGapSignal(s);
    expect(JSON.stringify(s)).toBe(before);
    s.config.assets.forEach((d, i) => expect(g[d.id]).toBe(s.assets[i]!.lnV - s.assets[i]!.lnP));
    expect(signalScores('value_gap', s, {}, 0)).toEqual(g);
  });

  it('mom63 reads only printed closes, refuses a day that has not printed, NaN before 63 days', () => {
    const closes = { A: Array.from({ length: 100 }, (_, k) => 100 * Math.exp(0.001 * k)), B: Array.from({ length: 100 }, () => 50) };
    const m = mom63Signal(closes, 80);
    expect(m.A).toBeCloseTo(0.063, 12);
    expect(m.B).toBe(0);
    expect(Number.isNaN(mom63Signal(closes, 62).A)).toBe(true);
    expect(() => mom63Signal(closes, 100)).toThrow();
    // a future close never matters
    const bent = { A: [...closes.A], B: closes.B };
    bent.A[81] = 1e9;
    expect(mom63Signal(bent, 80)).toEqual(m);
  });

  it('Sharpe is mean daily return over sample daily sd, annualized with daysPerYear', () => {
    const r = [0.01, -0.005, 0.002, 0.004];
    const m = r.reduce((a, b) => a + b) / 4;
    const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / 3);
    expect(sharpe(r, 252)).toBeCloseTo((m / sd) * Math.sqrt(252), 12);
    expect(sharpe(r, 100)).toBeCloseTo((m / sd) * 10, 12);
    expect(sharpe([0.01], 252)).toBe(0);
    expect(sharpe([0.01, 0.01], 252)).toBe(0);
    const eq = [100, 101, 99.99, 100.2];
    expect(dailyReturns(eq)[1]).toBeCloseTo(99.99 / 101 - 1, 15);
    expect(equitySharpe(eq, 252)).toBe(sharpe(dailyReturns(eq), 252));
  });

  it('regime at the open is the engine regime on state', () => {
    const s = createWorld('rg', defaultConfig({ ticksPerDay: 24, initialRegime: 'contraction' }));
    expect(regimeAtOpen(s)).toBe('contraction');
  });

  it('signed flow and crowding vs advNotional, by direction, strictly above 10%', () => {
    const fills: Fill[] = [
      { orderId: 'a', playerId: 'p', assetId: 'X', side: 'buy', qty: 10, price: 100, fee: 1, tick: 5 },
      { orderId: 'b', playerId: 'p', assetId: 'X', side: 'sell', qty: 2, price: 100, fee: 1, tick: 9 },
      { orderId: 'c', playerId: 'q', assetId: 'X', side: 'buy', qty: 99, price: 100, fee: 1, tick: 6 },
      { orderId: 'd', playerId: 'p', assetId: 'Y', side: 'buy', qty: 99, price: 100, fee: 1, tick: 6 },
      { orderId: 'e', playerId: 'p', assetId: 'X', side: 'buy', qty: 50, price: 100, fee: 1, tick: 20 },
    ];
    expect(signedFlow(fills, 'p', 'X', 0, 20)).toBe(800);
    expect(signedFlow(fills, 'p', 'X', 6, 21)).toBe(4800);
    expect(crowding(800, 7000, 1)).toEqual({ shareOfAdv: 800 / 7000, crowded: true });
    expect(crowding(800, 8000, 1).crowded).toBe(false); // exactly 10% is not above it
    expect(crowding(800, 7000, -1).crowded).toBe(false);
    expect(crowding(-800, 7000, -1).crowded).toBe(true);
    expect(crowding(800, 20000, 1, 0.03).crowded).toBe(true);
  });
});
