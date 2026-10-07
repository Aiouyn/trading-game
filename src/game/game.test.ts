import { describe, expect, it } from 'vitest';
import { createWorld, defaultConfig, openAccount, placeOrder, step } from '@/engine';
import { clockLabel, clockParts, dayIndex } from './clock';
import { compactMoney, money, price, signedMoney, signedPct } from './format';
import { candles, createHistory, dayOpen, record, sparkline } from './history';
import { CLASS_LICENSE, hasLicense, licenseCheck, lockedText, requiredLicense } from './license';
import { rankProgress } from './rank';
import { chipQty, firstTradeCap, hasTraded, previewTicket } from './ticket';
import { wireFromEvents } from './wire';

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

describe('rank', () => {
  it('starts at R0 Broke and measures progress to R1 Hustler at $20k', () => {
    const r = rankProgress(5000, 5000);
    expect(r.rank.id).toBe('R0');
    expect(r.next?.name).toBe('Hustler');
    expect(r.progress).toBe(0);
    expect(rankProgress(12500, 12500).progress).toBeCloseTo(0.5);
  });
  it('never demotes: rank follows peak net worth', () => {
    expect(rankProgress(21000, 9000).rank.id).toBe('R1');
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

describe('ticket: Simple-mode first-trade cap', () => {
  function world() {
    return openAccount(createWorld('ticket-test', defaultConfig()), 'p');
  }

  it('caps the first buy at 20% of cash and the chips respect it', () => {
    const w = world();
    expect(hasTraded(w, 'p')).toBe(false);
    expect(firstTradeCap(w, 'p')).toBe(1000);
    const max = chipQty(w, 'p', { assetId: 'HLCN', side: 'buy', type: 'market' }, 1);
    expect(max).toBeGreaterThan(0);
    expect(previewTicket(w, 'p', { assetId: 'HLCN', side: 'buy', type: 'market', qty: max }).block).toBeNull();
    const over = previewTicket(w, 'p', { assetId: 'HLCN', side: 'buy', type: 'market', qty: max + 1 });
    expect(over.total).toBeGreaterThan(1000);
    expect(over.block).toBe('Over the first-trade cap');
  });

  it('lifts the cap once anything has filled', () => {
    let w = world();
    w = placeOrder(w, { playerId: 'p', assetId: 'PLLS', side: 'buy', type: 'market', qty: 2 }).state;
    const r = step(w);
    expect(r.fills).toHaveLength(1);
    expect(hasTraded(r.state, 'p')).toBe(true);
    expect(firstTradeCap(r.state, 'p')).toBe(Infinity);
    const max = chipQty(r.state, 'p', { assetId: 'PLLS', side: 'buy', type: 'market' }, 1);
    expect(previewTicket(r.state, 'p', { assetId: 'PLLS', side: 'buy', type: 'market', qty: max }).total).toBeGreaterThan(1000);
  });

  it('blocks fractional stock quantities and sells beyond the position', () => {
    const w = world();
    expect(previewTicket(w, 'p', { assetId: 'HLCN', side: 'buy', type: 'market', qty: 1.5 }).block).toBe('Whole shares only');
    expect(previewTicket(w, 'p', { assetId: 'HLCN', side: 'sell', type: 'market', qty: 1 }).block).toBe('You hold none');
    expect(previewTicket(w, 'p', { assetId: 'AUC', side: 'buy', type: 'market', qty: 0.01 }).block).toBeNull();
  });
});

describe('wire', () => {
  it('only writes headlines for real engine events and fills', () => {
    let w = createWorld('wire-test', defaultConfig());
    let items = 0;
    let events = 0;
    for (let i = 0; i < 720 * 20; i++) {
      const r = step(w);
      w = r.state;
      events += r.events.length;
      items += wireFromEvents(w, r.events, r.fills).length;
    }
    expect(items).toBe(events);
  });
});

describe('licenses', () => {
  const w = openAccount(createWorld('lic', defaultConfig()), 'p');

  it('gates by license flag, not ticker', () => {
    for (const def of w.config.assets) expect(requiredLicense(def).id).toBe(CLASS_LICENSE[def.assetClass]);
    const custom = { ...w.config.assets[0]!, license: 'pro' as const };
    expect(requiredLicense(custom).id).toBe('pro');
  });

  it('locks commodities until Owner and keeps stocks and crypto open', () => {
    const gold = licenseCheck(w, 'p', 'GOLD');
    expect(gold.ok).toBe(false);
    if (!gold.ok) expect(lockedText(gold, compactMoney)).toBe('Pro license at Owner, $250k');
    expect(licenseCheck(w, 'p', 'OIL').ok).toBe(false);
    expect(licenseCheck(w, 'p', 'HLCN').ok).toBe(true);
    expect(licenseCheck(w, 'p', 'AUC').ok).toBe(true);
  });

  it('opens Pro at a $250k peak and never takes it back', () => {
    expect(hasLicense(249_999, 'pro')).toBe(false);
    expect(hasLicense(250_000, 'pro')).toBe(true);
    const rich = structuredClone(w);
    rich.accounts.p!.peakEquity = 300_000;
    expect(licenseCheck(rich, 'p', 'GOLD').ok).toBe(true);
  });
});
