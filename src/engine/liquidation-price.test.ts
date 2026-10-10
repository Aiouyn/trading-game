import { describe, expect, it } from 'vitest';
import { createWorld } from './sim';
import { universeConfig } from './universe';
import { equityOf, grossExposure, liquidationPrice, openAccount, setAccountPermissions } from './trading';
import type { WorldState } from './types';

// The chart's liquidation line is the engine's own trigger (trading.ts clearOrders): equity below the liquidation ratio
// of gross exposure, both marked on mid. Moving one asset's mid across the line must flip that test and no other.

const ratio = (s: WorldState, id: string): number => {
  const acct = s.accounts[id]!;
  return equityOf(s, acct) / grossExposure(s, acct);
};

/** The same world with one asset's mid set to x (the engine reads mid as exp(lnP)). */
function priced(s: WorldState, assetId: string, x: number): WorldState {
  const i = s.config.assets.findIndex((a) => a.id === assetId);
  const assets = s.assets.slice();
  assets[i] = { ...assets[i]!, lnP: Math.log(x) };
  return { ...s, assets };
}

/** An account with one position and the given cash (negative cash is a margin loan, which openAccount itself refuses). */
function holding(s: WorldState, id: string, assetId: string, qty: number, cash: number): WorldState {
  let out = openAccount(s, id, 0);
  out = setAccountPermissions(out, id, { maxLeverage: 4, canShort: true });
  const acct = out.accounts[id]!;
  return { ...out, accounts: { ...out.accounts, [id]: { ...acct, cash, positions: { [assetId]: { qty, avgCost: 0, realizedPnl: 0 } } } } };
}

describe('liquidation price (the chart line)', () => {
  const base = createWorld('liquidation-price', universeConfig());
  const stock = base.config.assets.find((a) => a.assetClass === 'stock' && a.listed !== false)!.id;
  const i = base.config.assets.findIndex((a) => a.id === stock);
  const P0 = Math.exp(base.assets[i]!.lnP);
  const q = 100;
  const L = base.config.margin?.liquidation ?? 0.2;

  it('a levered long is liquidated when the price falls to the line, and not above it', () => {
    // a margin loan of half the position's value: equity is cash plus the position at mid
    const s = holding(base, 'lev', stock, q, -0.5 * P0 * q);
    const x = liquidationPrice(s, 'lev', stock)!;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(P0);
    expect(ratio(priced(s, stock, x * (1 + 1e-6)), 'lev')).toBeGreaterThan(L);
    expect(ratio(priced(s, stock, x * (1 - 1e-6)), 'lev')).toBeLessThan(L);
    expect(ratio(priced(s, stock, x), 'lev')).toBeCloseTo(L, 9);
  });

  it('a short is liquidated when the price rises to the line, and not below it', () => {
    // short proceeds plus half the proceeds as equity
    const s = holding(base, 'sh', stock, -q, 1.5 * P0 * q);
    const x = liquidationPrice(s, 'sh', stock)!;
    expect(x).toBeGreaterThan(P0);
    expect(ratio(priced(s, stock, x * (1 - 1e-6)), 'sh')).toBeGreaterThan(L);
    expect(ratio(priced(s, stock, x * (1 + 1e-6)), 'sh')).toBeLessThan(L);
  });

  it('is null with no position, and for a cash long that no price can liquidate', () => {
    expect(liquidationPrice(base, 'nobody', stock)).toBeNull();
    const cashLong = holding(base, 'cash', stock, q, 10 * P0 * q);
    expect(liquidationPrice(cashLong, 'cash', stock)).toBeNull();
  });

  it('is null for a non-margin account, even with a negative balance the engine never liquidates', () => {
    // a plain account (no leverage, no shorting): clearOrders skips it, so the chart must draw no line
    let s = openAccount(base, 'plain', 0);
    const acct = s.accounts['plain']!;
    s = { ...s, accounts: { ...s.accounts, plain: { ...acct, cash: -0.5 * P0 * q, positions: { [stock]: { qty: q, avgCost: 0, realizedPnl: 0 } } } } };
    expect(liquidationPrice(s, 'plain', stock)).toBeNull();
    const short = { ...s, accounts: { ...s.accounts, plain: { ...s.accounts['plain']!, positions: { [stock]: { qty: -q, avgCost: 0, realizedPnl: 0 } } } } };
    expect(liquidationPrice(short, 'plain', stock)).toBeNull();
  });
});
