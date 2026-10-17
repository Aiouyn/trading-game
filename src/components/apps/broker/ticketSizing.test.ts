import { describe, expect, it } from 'vitest';
import { createWorld, estimateFill, openAccount, placeOrder, type WorldState } from '@/engine';
import { clearOrders } from '@/engine/trading';
import { universeConfig } from '@/engine/universe';
import { floorQuantity, quantityGrid, ticketEstimate, unitsForBudget } from './ticketSizing';

const cfg = universeConfig();
const def = (id: string) => cfg.assets.find((a) => a.id === id)!;
const world = () => openAccount(createWorld('ticket-sizing', cfg), 'personal', 1e6);

describe('ticket dollar budgets and the submitted quantity', () => {
  it.each(['HLCN', 'AUC', 'MRE', 'AV10', 'GOLD'])('%s buys within budget using its real fee and own impact', (id) => {
    const s = world();
    const q = unitsForBudget(s, id, 1000, 'personal');
    const e = ticketEstimate(s, id, 'buy', q, 'personal');
    expect(q).toBeGreaterThan(0);
    expect(floorQuantity(def(id), q)).toBe(q);
    expect(e).toEqual(estimateFill(s, { assetId: id, side: 'buy', qty: q, playerId: 'personal' }));
    expect(e.total).toBeLessThanOrEqual(1000);
    expect(ticketEstimate(s, id, 'buy', q + quantityGrid(def(id)).step, 'personal').total).toBeGreaterThan(1000);
    const placed = placeOrder(s, { playerId: 'personal', assetId: id, side: 'buy', type: 'market', qty: q });
    expect(placed.order.rejectReason).toBeUndefined();
    const fill = clearOrders(placed.state, false).fills.find((f) => f.playerId === 'personal')!;
    expect(fill).toBeDefined();
    expect(fill.price).toBe(e.price);
    expect(fill.fee).toBe(e.fee);
  });

  it('crypto retains eight decimals and FX uses whole base-currency units', () => {
    expect(quantityGrid(def('AUC'))).toEqual({ step: 1e-8, decimals: 8 });
    expect(floorQuantity(def('AUC'), 0.000000019)).toBe(0.00000001);
    expect(quantityGrid(def('MRE'))).toEqual({ step: 1, decimals: 0 });
    expect(floorQuantity(def('MRE'), 12.99)).toBe(12);
    expect(quantityGrid({ ...def('HLCN'), qtyStep: 0.25 })).toEqual({ step: 0.25, decimals: 2 });
    expect(floorQuantity({ ...def('HLCN'), qtyStep: 0.25 }, 1.4)).toBe(1.25);
  });

  it('a low-priced fractional stock applies the 1% cap even below the $1 minimum', () => {
    const s = world();
    const q = unitsForBudget(s, 'HLCN', 0.1, 'personal', 0.5);
    const e = ticketEstimate(s, 'HLCN', 'buy', q, 'personal', 0.5);
    expect(q).toBeGreaterThan(0);
    expect(e.fee).toBeCloseTo(q * 0.5 * 0.01, 12);
    expect(e.total).toBeLessThanOrEqual(0.1);
    expect(unitsForBudget(s, 'HLCN', 1e-9, 'personal')).toBe(0);
  });

  it('FX, bond and commodity budgets below $1 do not reserve a fictitious $1 fee', () => {
    const s = world();
    for (const id of ['AV10', 'GOLD']) {
      const q = unitsForBudget(s, id, 0.5, 'personal', 1);
      expect(q).toBeGreaterThan(0);
      expect(ticketEstimate(s, id, 'buy', q, 'personal', 1).total).toBeLessThanOrEqual(0.5);
    }
    expect(unitsForBudget(s, 'MRE', 0.5, 'personal', 0.1)).toBe(4);
  });

  it('a fund preview and budget read the fund own tally, then match its actual fill', () => {
    let s: WorldState = openAccount(world(), 'fund-account', 1e6);
    s = { ...s, accounts: { ...s.accounts, personal: { ...s.accounts.personal!, ownImpact: { HLCN: { tick: s.tick, buy: 1e8, sell: 0 } } },
      'fund-account': { ...s.accounts['fund-account']!, ownImpact: { HLCN: { tick: s.tick, buy: 5000, sell: 0 } } } } };
    const q = unitsForBudget(s, 'HLCN', 1000, 'fund-account');
    const fund = ticketEstimate(s, 'HLCN', 'buy', q, 'fund-account');
    expect(fund.price).toBeLessThan(ticketEstimate(s, 'HLCN', 'buy', q, 'personal').price);
    expect(fund.total).toBeLessThanOrEqual(1000);
    const r = placeOrder(s, { playerId: 'fund-account', assetId: 'HLCN', side: 'buy', type: 'market', qty: q });
    expect(r.order.rejectReason).toBeUndefined();
    const fill = clearOrders(r.state, false).fills.find((f) => f.playerId === 'fund-account')!;
    expect(fill.price).toBe(fund.price);
    expect(fill.fee).toBe(fund.fee);
  });
});
