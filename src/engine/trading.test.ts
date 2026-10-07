import { describe, expect, it } from 'vitest';
import { createWorld, step, stepMany } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import {
  cancelOrder, commission, estimateFill, halfSpread, openAccount, openOrders, orderHistory, placeOrder, portfolio,
} from './trading';
import type { AssetDef, OrderRequest, RegimeDef, RegimeId, WorldState } from './types';

function calmRegimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, volMult: 1, jumpMult: 1, jumpUpShift: 0, marketLoadMult: 1, idioMult: 1, meanDays: 1e12 };
  }
  return out;
}

/** a nearly frozen asset, so tests control the price by editing state */
function flat(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 'x', initialPrice: 100, sharesOutstanding: 1e6,
    vol: 1e-7, drift: 0, cycleBeta: 0, wMarket: 0.5, wSector: 0.5, wCrypto: 0,
    halfLifeDays: 1e9, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 1e9, qtyStep: 1, ...extra,
  });
}

function world(assets: AssetDef[] = [flat('STK'), flat('COIN', { assetClass: 'crypto', qtyStep: 0, wCrypto: 0.5, wSector: 0 })]): WorldState {
  return openAccount(createWorld('t', defaultConfig({ ticksPerDay: 10, regimes: calmRegimes(), assets, indices: [] })), 'p1');
}

function setPrice(s: WorldState, id: string, price: number): WorldState {
  return { ...s, assets: s.assets.map((a) => (a.id === id ? { ...a, lnP: Math.log(price), lnV: Math.log(price) } : a)) };
}

const px = (s: WorldState, id: string) => Math.exp(s.assets.find((a) => a.id === id)!.lnP);

function place(s: WorldState, req: Partial<OrderRequest>) {
  return placeOrder(s, { playerId: 'p1', assetId: 'STK', side: 'buy', type: 'market', qty: 1, ...req });
}

describe('accounts', () => {
  it('opens with $5,000 by default and refuses duplicates', () => {
    const s = world();
    expect(portfolio(s, 'p1')).toMatchObject({ cash: 5000, equity: 5000, totalPnl: 0, drawdown: 0, positions: [] });
    expect(() => openAccount(s, 'p1')).toThrow();
    expect(portfolio(openAccount(s, 'p2', 250), 'p2').cash).toBe(250);
  });
});

describe('market orders', () => {
  it('queue on placement and fill on the next tick at mid + half spread + impact, with commission', () => {
    let s = world();
    const est = estimateFill(s, { assetId: 'STK', side: 'buy', qty: 5 });
    const r = place(s, { qty: 5 });
    expect(r.order).toMatchObject({ id: 'p1-1', status: 'open', filledQty: 0 });
    expect(portfolio(r.state, 'p1').cash).toBe(5000);
    const out = step(r.state);
    s = out.state;
    expect(out.fills).toHaveLength(1);
    const f = out.fills[0]!;
    expect(f).toMatchObject({ orderId: 'p1-1', qty: 5, side: 'buy', tick: 1 });
    expect(f.price).toBeCloseTo(est.price, 4);
    expect(f.price).toBeGreaterThan(100 * (1 + 4.9e-4)); // ≥ half of a 10 bps spread
    expect(f.fee).toBe(1); // 0.10% of ~$500 is $0.50, min $1
    expect(s.orders[0]).toMatchObject({ status: 'filled', filledQty: 5, closedTick: 1 });
    const p = portfolio(s, 'p1');
    expect(p.cash).toBeCloseTo(5000 - 5 * f.price - f.fee, 9);
    expect(p.positions[0]).toMatchObject({ assetId: 'STK', qty: 5 });
    expect(p.positions[0]!.avgCost).toBeCloseTo(f.price + f.fee / 5, 9);
    expect(p.feesPaid).toBe(f.fee);
  });

  it('sells below mid, and a round trip costs exactly spread + impact + fees', () => {
    let s = step(place(world(), { qty: 9 }).state).state;
    s = step(place(s, { side: 'sell', qty: 9 }).state).state;
    const p = portfolio(s, 'p1');
    expect(p.positions).toHaveLength(0);
    expect(p.totalPnl).toBeLessThan(0);
    expect(p.realizedPnl).toBeCloseTo(p.totalPnl, 6);
    expect(p.feesPaid).toBe(2);
    expect(p.equity).toBeCloseTo(p.cash, 9);
  });

  it('realized + unrealized always equals equity − starting cash', () => {
    let s = world([flat('STK', { vol: 0.4 })]);
    s = step(place(s, { qty: 30 }).state).state;
    s = stepMany(s, 50).state;
    s = step(place(s, { side: 'sell', qty: 12 }).state).state;
    s = stepMany(s, 50).state;
    const p = portfolio(s, 'p1');
    expect(p.realizedPnl + p.unrealizedPnl).toBeCloseTo(p.totalPnl, 6);
    expect(p.positions[0]!.qty).toBe(18);
  });

  it('commission follows the asset class: stocks 0.10% min $1, crypto 0.20%', () => {
    const s = world();
    expect(commission(s, s.config.assets[0]!, 500)).toBe(1);
    expect(commission(s, s.config.assets[0]!, 50_000)).toBeCloseTo(50, 9);
    expect(commission(s, s.config.assets[1]!, 500)).toBeCloseTo(1, 9);
    expect(commission(s, s.config.assets[1]!, 10)).toBeCloseTo(0.02, 9);
  });

  it('impact grows with the square root of size', () => {
    const s = world();
    const hs = halfSpread(s, 0) * 1e4;
    const small = estimateFill(s, { assetId: 'STK', side: 'buy', qty: 1e5 }).slippageBps - hs;
    const big = estimateFill(s, { assetId: 'STK', side: 'buy', qty: 4e5 }).slippageBps - hs;
    expect(big / small).toBeCloseTo(2, 6);
  });

  it('large orders move the price (permanent share of impact)', () => {
    const s0 = openAccount(world([flat('STK', { vol: 0.3, advNotional: 1e5 })]), 'whale', 1e7);
    const r = placeOrder(s0, { playerId: 'whale', assetId: 'STK', side: 'buy', type: 'market', qty: 1000 });
    const imp = estimateFill(s0, { assetId: 'STK', side: 'buy', qty: 1000 }).slippageBps / 1e4 - halfSpread(s0, 0);
    const moved = px(step(r.state).state, 'STK');
    const untouched = px(step(s0).state, 'STK'); // same seed, no order
    expect(moved / untouched - 1).toBeGreaterThan(0.4 * imp);
    expect(moved / untouched - 1).toBeLessThan(0.6 * imp);
  });

  it('caps a fill at 3× daily volume per tick and keeps the rest open', () => {
    const s0 = openAccount(world([flat('STK', { advNotional: 10_000 })]), 'whale', 1e7);
    const r = placeOrder(s0, { playerId: 'whale', assetId: 'STK', side: 'buy', type: 'market', qty: 700 });
    let s = step(r.state).state;
    expect(s.orders[0]!.status).toBe('open');
    expect([299, 300]).toContain(s.orders[0]!.filledQty); // 3 × $10k / ~$100, whole shares
    s = stepMany(s, 3).state;
    expect(s.orders[0]!.status).toBe('filled');
    expect(s.orders[0]!.filledQty).toBe(700);
  });
});

describe('validation', () => {
  it('rejects bad requests with a reason and keeps them in history', () => {
    const s = world();
    expect(place(s, { qty: 0 }).order).toMatchObject({ status: 'rejected', rejectReason: 'qty must be > 0' });
    expect(place(s, { qty: 1.5 }).order.rejectReason).toBe('whole units only');
    expect(place(s, { assetId: 'COIN', qty: 1.5 }).order.status).toBe('open');
    expect(place(s, { assetId: 'NOPE' }).order.rejectReason).toBe('unknown asset');
    expect(place(s, { playerId: 'ghost' }).order.rejectReason).toBe('no account');
    expect(place(s, { type: 'limit' }).order.rejectReason).toBe('limit price required');
    expect(place(s, { type: 'stop' }).order.rejectReason).toBe('stop price required');
    expect(place(s, { qty: 60 }).order.rejectReason).toBe('insufficient cash');
    const r = place(s, { qty: 0 });
    expect(orderHistory(r.state, 'p1')).toHaveLength(1);
    expect(openOrders(r.state, 'p1')).toHaveLength(0);
  });

  it('is long only: no selling what you do not hold, and open sells reserve shares', () => {
    let s = world();
    expect(place(s, { side: 'sell' }).order.rejectReason).toBe('insufficient position');
    s = step(place(s, { qty: 5 }).state).state;
    s = place(s, { side: 'sell', type: 'limit', limitPrice: 500, qty: 4 }).state;
    expect(place(s, { side: 'sell', qty: 2 }).order.rejectReason).toBe('insufficient position');
    expect(place(s, { side: 'sell', qty: 1 }).order.status).toBe('open');
  });

  it('open buys reserve cash', () => {
    let s = world();
    s = place(s, { type: 'limit', limitPrice: 99, qty: 30 }).state; // reserves ~$2,970
    expect(place(s, { qty: 25 }).order.rejectReason).toBe('insufficient cash');
    expect(place(s, { qty: 19 }).order.status).toBe('open');
  });
});

describe('limit and stop orders', () => {
  it('a limit buy waits until the execution price is at or below the limit', () => {
    let s = place(world(), { type: 'limit', limitPrice: 95, qty: 10 }).state;
    s = stepMany(s, 5).state;
    expect(s.orders[0]!.status).toBe('open');
    s = setPrice(s, 'STK', 94);
    const out = step(s);
    expect(out.fills).toHaveLength(1);
    expect(out.fills[0]!.price).toBeLessThanOrEqual(95);
  });

  it('a limit sell waits for price at or above the limit', () => {
    let s = step(place(world(), { qty: 10 }).state).state;
    s = place(s, { side: 'sell', type: 'limit', limitPrice: 110, qty: 10 }).state;
    s = stepMany(s, 3).state;
    expect(openOrders(s, 'p1')).toHaveLength(1);
    s = step(setPrice(s, 'STK', 111)).state;
    expect(openOrders(s, 'p1')).toHaveLength(0);
    expect(s.orders[1]!.avgFillPrice).toBeGreaterThanOrEqual(110);
  });

  it('a stop-loss triggers once price crosses it and then fills like a market order', () => {
    let s = step(place(world(), { qty: 10 }).state).state;
    s = place(s, { side: 'sell', type: 'stop', stopPrice: 90, qty: 10 }).state;
    s = stepMany(s, 5).state;
    expect(s.orders[1]).toMatchObject({ status: 'open', triggered: false });
    s = setPrice(s, 'STK', 85);
    const out = step(s);
    expect(out.state.orders[1]).toMatchObject({ status: 'filled', triggered: true });
    expect(out.fills[0]!.price).toBeLessThan(85); // gap through the stop: filled at the market, not at 90
  });

  it('a buy stop triggers on the way up', () => {
    let s = place(world(), { type: 'stop', stopPrice: 105, qty: 3 }).state;
    s = stepMany(s, 3).state;
    expect(openOrders(s, 'p1')).toHaveLength(1);
    s = step(setPrice(s, 'STK', 106)).state;
    expect(openOrders(s, 'p1')).toHaveLength(0);
  });
});

describe('order lifecycle', () => {
  it('cancels open orders only for their owner', () => {
    const r = place(world(), { type: 'limit', limitPrice: 50 });
    const s = cancelOrder(r.state, 'p1', r.order.id);
    expect(s.orders[0]!.status).toBe('cancelled');
    expect(step(s).fills).toHaveLength(0);
    expect(() => cancelOrder(r.state, 'p2', r.order.id)).toThrow();
    expect(cancelOrder(s, 'p1', r.order.id)).toBe(s); // already closed: no-op
  });

  it('day orders expire at the next day boundary; gtc orders stay', () => {
    let s = place(world(), { type: 'limit', limitPrice: 50, tif: 'day' }).state;
    s = place(s, { type: 'limit', limitPrice: 50 }).state;
    s = stepMany(s, 10).state; // through the end of day 0
    expect(openOrders(s, 'p1')).toHaveLength(2);
    s = step(s).state; // first tick of day 1
    expect(s.orders.map((o) => o.status)).toEqual(['expired', 'open']);
  });

  it('orders on a halted asset wait for the reopen', () => {
    let s = place(world(), { qty: 2 }).state;
    s = { ...s, assets: s.assets.map((a) => (a.id === 'STK' ? { ...a, haltUntil: 3 } : a)) };
    s = stepMany(s, 2).state;
    expect(s.orders[0]!.status).toBe('open');
    s = step(s).state;
    expect(s.orders[0]!.status).toBe('filled');
  });

  it('a buy that outgrew the cash after a price move is shrunk to what the cash covers', () => {
    let s = place(world(), { type: 'stop', stopPrice: 101, qty: 45 }).state; // ~$4,545 at the stop
    s = step(setPrice(s, 'STK', 150)).state;
    const o = s.orders[0]!;
    expect(o).toMatchObject({ status: 'cancelled', rejectReason: 'insufficient cash', filledQty: 33 }); // $5,000 / ~$150
    expect(portfolio(s, 'p1').cash).toBeGreaterThanOrEqual(0);
  });
});

describe('portfolio math', () => {
  it('tracks peak equity, drawdown and max drawdown', () => {
    let s = step(place(world(), { qty: 40 }).state).state; // ~$4,000 in STK
    s = step(setPrice(s, 'STK', 120)).state;
    const peak = portfolio(s, 'p1').equity;
    s = step(setPrice(s, 'STK', 60)).state;
    let p = portfolio(s, 'p1');
    expect(p.peakEquity).toBeCloseTo(peak, 6);
    expect(p.drawdown).toBeCloseTo(p.equity / peak - 1, 9);
    expect(p.drawdown).toBeLessThan(-0.3);
    s = step(setPrice(s, 'STK', 100)).state;
    p = portfolio(s, 'p1');
    expect(p.maxDrawdown).toBeLessThan(p.drawdown);
    expect(p.positions[0]!.weight).toBeCloseTo(p.positions[0]!.marketValue / p.equity, 9);
  });

  it('dayPnl resets at the day boundary', () => {
    let s = step(place(world(), { qty: 40 }).state).state;
    s = step(setPrice(s, 'STK', 110)).state;
    expect(portfolio(s, 'p1').dayPnl).toBeGreaterThan(300);
    s = stepMany(s, 9).state; // tick 11 = first tick of day 1
    expect(portfolio(s, 'p1').dayPnl).toBeCloseTo(0, 3);
  });
});

describe('determinism with orders', () => {
  const script = (s: WorldState) => {
    s = openAccount(s, 'p1');
    s = placeOrder(s, { playerId: 'p1', assetId: 'HLCN', side: 'buy', type: 'market', qty: 5 }).state;
    s = placeOrder(s, { playerId: 'p1', assetId: 'AUC', side: 'buy', type: 'market', qty: 0.03 }).state;
    s = placeOrder(s, { playerId: 'p1', assetId: 'HLCN', side: 'sell', type: 'stop', stopPrice: 1, qty: 5 }).state;
    return stepMany(s, 2000);
  };

  it('same seed and same orders give the same world, and survive a JSON round trip', () => {
    const a = script(createWorld('d'));
    const b = script(createWorld('d'));
    expect(a.state).toEqual(b.state);
    expect(a.fills).toEqual(b.fills);
    const reloaded = JSON.parse(JSON.stringify(a.state)) as WorldState;
    expect(stepMany(reloaded, 300).state).toEqual(stepMany(a.state, 300).state);
  });

  it('a world with no accounts prices exactly like before', () => {
    const plain = stepMany(createWorld('d'), 1000).state;
    const withIdle = stepMany(openAccount(createWorld('d'), 'p1'), 1000).state;
    expect(withIdle.assets).toEqual(plain.assets);
  });
});
