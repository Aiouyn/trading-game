import { describe, expect, it } from 'vitest';
import { createWorld, defaultConfig, openAccount, placeOrder, portfolio, step } from '@/engine';
import { candles, createHistory, ensureSeries, record } from './history';
import { allocation, orderLog } from './portfolioView';

function traded() {
  let w = openAccount(createWorld('pf-test', defaultConfig()), 'p');
  const stock = w.config.assets.find((a) => a.assetClass === 'stock')!.id;
  const crypto = w.config.assets.find((a) => a.assetClass === 'crypto')!.id;
  w = placeOrder(w, { playerId: 'p', assetId: stock, side: 'buy', type: 'market', qty: 3 }).state;
  w = step(w).state;
  w = placeOrder(w, { playerId: 'p', assetId: crypto, side: 'buy', type: 'market', qty: 0.01 }).state;
  w = step(w).state;
  return { w, stock, crypto };
}

describe('portfolio view', () => {
  it('splits equity by asset class with cash last and weights summing to 1', () => {
    const { w } = traded();
    const slices = allocation(w, 'p');
    expect(slices.at(-1)!.id).toBe('cash');
    expect(slices.map((s) => s.id)).toContain('stock');
    const total = slices.reduce((a, s) => a + s.weight, 0);
    expect(total).toBeCloseTo(1, 9);
    const value = slices.reduce((a, s) => a + s.value, 0);
    expect(value).toBeCloseTo(portfolio(w, 'p').equity, 6);
  });

  it('is all cash before the first trade', () => {
    const w = openAccount(createWorld('pf-empty', defaultConfig()), 'p');
    expect(allocation(w, 'p')).toEqual([{ id: 'cash', label: 'Cash', value: 5000, weight: 1 }]);
    expect(orderLog(w, 'p')).toEqual([]);
  });

  it('lists orders newest first and caps the list', () => {
    const { w, stock, crypto } = traded();
    const log = orderLog(w, 'p');
    expect(log.map((o) => o.assetId)).toEqual([crypto, stock]);
    expect(orderLog(w, 'p', 1)).toHaveLength(1);
  });

  it('records a net worth series that starts late and still charts', () => {
    const h = createHistory(['A'], 10);
    for (let t = 0; t < 25; t++) record(h, t, { A: 100 + t });
    ensureSeries(h, ['NW']);
    expect(h.series.NW!.size).toBe(0);
    for (let t = 25; t < 40; t++) record(h, t, { A: 100 + t, NW: 5000 + t });
    expect(h.series.NW!.size).toBe(15);
    expect(h.series.A!.size).toBe(40);
    const bars = candles(h, 'NW', '1W');
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.at(-1)!.close).toBe(5039);
    expect(bars.every((b) => b.volume === undefined)).toBe(true);
    // ensureSeries never clobbers an existing series
    ensureSeries(h, ['NW']);
    expect(h.series.NW!.size).toBe(15);
  });
});
