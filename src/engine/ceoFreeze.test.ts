import { describe, expect, it } from 'vitest';
import { createWorld } from './sim';
import { defaultConfig, normalizeLoadings } from './config';
import { failCompanyStock, grantLockedShares, listCompanyStock } from './companyAssets';
import { gateOn, NO_RESTRICTIONS, setFreeze, setWindow, type TradingRestrictions } from './restrictions';
import { openAccount } from './trading';
import type { AssetDef, WorldState } from './types';

/**
 * The CEO exit freeze (spec 9.1, X7, B2): an account frozen by a CEO change cannot trade any asset until the freeze day,
 * stacked with the window (both must allow a trade), and plans committed before the freeze are not frozen. Bankruptcy
 * (spec 5.3) settles every holder at zero through the delisting path.
 */

function coStock(id: string): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'tech', initialPrice: 100, sharesOutstanding: 1e6,
    vol: 1e-7, drift: 0, cycleBeta: 0, wMarket: 0.5, wSector: 0.5, wCrypto: 0,
    halfLifeDays: 1e9, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 1e9, qtyStep: 1, valueSource: 'company',
  } as AssetDef);
}

describe('the CEO exit freeze in the trading gate (X7)', () => {
  it('refuses every side and every asset for the frozen account until the freeze day, and not for others', () => {
    const r = setFreeze(NO_RESTRICTIONS, 'founder', 20);
    expect(gateOn(r, 5, 'founder', 'CO', 'sell')).toEqual({ code: 'ceoExitFreeze', untilDay: 20 });
    expect(gateOn(r, 5, 'founder', 'OTHER', 'buy')).toEqual({ code: 'ceoExitFreeze', untilDay: 20 });
    expect(gateOn(r, 19, 'founder', 'CO', 'buy')).toEqual({ code: 'ceoExitFreeze', untilDay: 20 });
    expect(gateOn(r, 20, 'founder', 'CO', 'sell')).toBeNull();
    expect(gateOn(r, 5, 'rival', 'CO', 'sell')).toBeNull();
  });

  it('plans committed before the change keep running (a plan is not frozen)', () => {
    const r = setFreeze(NO_RESTRICTIONS, 'founder', 20);
    expect(gateOn(r, 5, 'founder', 'CO', 'sell', 'plan')).toBeNull();
  });

  it('stacks with the window: a closed window refuses after the freeze lifts, and the freeze refuses first', () => {
    let r: TradingRestrictions = setWindow(NO_RESTRICTIONS, 'CO', { covered: ['founder'], open: [[30, 50]] });
    r = setFreeze(r, 'founder', 20);
    expect(gateOn(r, 5, 'founder', 'CO', 'sell')?.code).toBe('ceoExitFreeze');
    expect(gateOn(r, 25, 'founder', 'CO', 'sell')?.code).toBe('closedWindow');
    expect(gateOn(r, 35, 'founder', 'CO', 'sell')).toBeNull();
  });

  it('a later freeze never shortens an earlier one', () => {
    const r = setFreeze(setFreeze(NO_RESTRICTIONS, 'founder', 40), 'founder', 20);
    expect(r.freezes?.founder).toBe(40);
  });
});

describe('bankruptcy settles every holder at zero (spec 5.3, failCompanyStock)', () => {
  it('delists the stock, settles longs and shorts at zero, and conserves the cash across accounts', () => {
    let s: WorldState = createWorld('bankrupt', defaultConfig({ ticksPerDay: 10, assets: [], indices: [] }));
    for (const p of ['founder', 'rival', 'short']) s = openAccount(s, p, 1_000);
    s = listCompanyStock(s, coStock('CO'), 1, 1);
    s = grantLockedShares(s, 'founder', 'CO', 100, 1, 0);
    s = grantLockedShares(s, 'rival', 'CO', 50, 1, 0);
    const cashBefore = Object.values(s.accounts).reduce((x, a) => x + a.cash, 0);
    const r = failCompanyStock(s, 'CO');
    expect(r.state.config.assets.find((a) => a.id === 'CO')!.delisted).toBe(true);
    for (const p of ['founder', 'rival']) expect(r.state.accounts[p]!.positions.CO?.qty ?? 0).toBe(0);
    const cashAfter = Object.values(r.state.accounts).reduce((x, a) => x + a.cash, 0);
    expect(cashAfter).toBeCloseTo(cashBefore, 9);
  });

  it('is a no-op for a stock that is not a company stock or is already delisted', () => {
    let s: WorldState = createWorld('bankrupt2', defaultConfig({ ticksPerDay: 10, assets: [], indices: [] }));
    s = openAccount(s, 'p', 10);
    s = listCompanyStock(s, coStock('CO'), 1, 1);
    const once = failCompanyStock(s, 'CO');
    const twice = failCompanyStock(once.state, 'CO');
    expect(twice.state).toBe(once.state);
    expect(twice.events).toEqual([]);
  });
});
