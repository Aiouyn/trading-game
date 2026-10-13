import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { defaultConfig, FRACTIONAL_SHARE } from './config';
import { clearOrders, estimateFill, halfSpread, openAccount, placeOrder, roundQty } from './trading';
import type { WorldState } from './types';
import { universeConfig } from './universe';

/**
 * Phase 10 review follow-ups (fills). A fund's trades fill in the fund's own market account, so its ticket preview must price
 * under that account (R-10-1: the preview equals the fill). A halted asset quotes a wider spread (R-10-2).
 */
const cfg = defaultConfig();
const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);
const def = (id: string) => universeConfig().assets.find((a) => a.id === id)!;

function busy(seed: string): WorldState {
  return stepMany(openAccount(createWorld(seed, cfg), 'buyer', 1e6), cfg.ticksPerDay * 2).state;
}

describe('a fund trade is priced under the fund\'s own account (R-10-1, the ticket preview)', () => {
  it('the estimate under the fund account equals its fill; the player\'s account would give a different preview', () => {
    const base = openAccount(busy('p10-fund'), 'fund-acct', 1e6);
    const i = idx(base, 'HLCN');
    const q = roundQty(def('HLCN'), 2000 / Math.exp(base.assets[i]!.lnP));
    // the fund account has its own same-direction tally from an earlier clip; the player's tally is empty
    // a tick passes after the clip: a fill prices off its tick's pre-trade mid, so a second fill in the same tick would differ
    const warm = stepMany(clearOrders(placeOrder(base, { playerId: 'fund-acct', assetId: 'HLCN', side: 'buy', type: 'market', qty: q * 3 }).state, false).state, 1).state;
    const est = estimateFill(warm, { assetId: 'HLCN', side: 'buy', qty: q, playerId: 'fund-acct' });
    const placed = placeOrder(warm, { playerId: 'fund-acct', assetId: 'HLCN', side: 'buy', type: 'market', qty: q }).state;
    const fill = clearOrders(placed, false).fills.find((f) => f.playerId === 'fund-acct')!;
    expect(fill.price).toBeCloseTo(est.price, 10);
    // the wrong account (the player's, with no tally) prices the same clip cheaper: the preview would have lied
    const wrong = estimateFill(warm, { assetId: 'HLCN', side: 'buy', qty: q, playerId: 'buyer' });
    expect(Math.abs(wrong.price - fill.price)).toBeGreaterThan(1e-9);
    expect(wrong.impactBps).toBeLessThan(est.impactBps);
  });
});

describe('a halted asset quotes a wider spread (R-10-2)', () => {
  it('twice the spread while halted, one and a half times for the rest of the day after the reopen, and the normal spread otherwise', () => {
    const s = busy('p10-halt');
    const i = idx(s, 'HLCN');
    const calm = { ...s, assets: s.assets.map((a, k) => (k === i ? { ...a, haltUntil: -1, haltedToday: false } : a)) };
    const base = halfSpread(calm, i);
    const halted = { ...s, assets: s.assets.map((a, k) => (k === i ? { ...a, haltUntil: s.tick + 10, haltedToday: true } : a)) };
    const reopened = { ...s, assets: s.assets.map((a, k) => (k === i ? { ...a, haltUntil: -1, haltedToday: true } : a)) };
    expect(halfSpread(halted, i) / base).toBeCloseTo(2, 10);
    expect(halfSpread(reopened, i) / base).toBeCloseTo(1.5, 10);
    expect(halfSpread(calm, i)).toBeGreaterThan(0);
  });

  it('the step of an ordinary stock is still the fractional share', () => {
    expect(FRACTIONAL_SHARE).toBe(0.0001);
  });
});
