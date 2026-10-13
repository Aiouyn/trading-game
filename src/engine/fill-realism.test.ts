import { describe, expect, it } from 'vitest';
import { createWorld, step, stepMany } from './sim';
import { defaultConfig, FRACTIONAL_SHARE, spreadForCap } from './config';
import { universeConfig } from './universe';
import {
  clearOrders, commission, estimateFill, halfSpread, IMPACT_HALF_LIFE, openAccount, ownDecayed, ownImpactAdd, placeOrder, qtyStep, roundQty,
} from './trading';
import type { AssetDef, WorldState } from './types';

/**
 * Phase 10 fills (R-10-1, R-10-2, R-10-4). A market order pays the quote (mid ± half spread) plus ITS OWN temporary impact on the
 * account's own same-direction tally, decaying with a 360-tick half-life. Other accounts' flow moves the mid, never this fill.
 * The ticket's estimate is the same arithmetic on the same state.
 */
const cfg = defaultConfig();
const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);
const uni = universeConfig();
const def = (id: string): AssetDef => uni.assets.find((a) => a.id === id)!;

/** a world with two game days of its own flow (the pools trade, nobody else does): the busy book the probes read */
function busy(seed = 'p10-busy'): WorldState {
  return stepMany(openAccount(createWorld(seed, cfg), 'buyer', 1e6), cfg.ticksPerDay * 2).state;
}

describe('R-10-2 fee schedule: stocks $0.005 a share, $1 minimum, 1% maximum; crypto 0.10%; FX $2 per $100k; bonds and commodities 2 bps', () => {
  const s = createWorld('fees', uni);
  it('stocks and ETFs pay per share, with the minimum and the 1% cap', () => {
    const stock = def('HLCN');
    expect(commission(s, stock, 10_000, 100)).toBeCloseTo(1, 9); // 100 x $0.005 = $0.50, lifted to the $1 minimum
    expect(commission(s, stock, 10_000, 2000)).toBeCloseTo(10, 9); // 2,000 x $0.005 = $10 (0.1% of $10k)
    expect(commission(s, stock, 1000, 1e6)).toBeCloseTo(10, 9); // 5,000 raw, capped at 1% of $1,000
  });
  it('crypto 0.10% of notional, FX $2 per $100k, bonds and commodities 2 bps (their minimum holds)', () => {
    expect(commission(s, def('AUC'), 100_000, 2.5)).toBeCloseTo(100, 9);
    expect(commission(s, def('MRE'), 100_000, 90_000)).toBeCloseTo(2, 9);
    expect(commission(s, def('AV10'), 50_000, 5000)).toBeCloseTo(10, 9);
    expect(commission(s, def('AV10'), 1000, 100)).toBeCloseTo(1, 9); // 2 bps is $0.20, the $1 minimum applies
  });
});

describe('R-10-2 spreads by class (full spread at normal volatility, the regime widens it)', () => {
  it('stock bands: large caps 2 bps, mid caps 7, small caps 20, micro caps 35', () => {
    expect(spreadForCap(420e9)).toBe(2);
    expect(spreadForCap(20e9)).toBe(7);
    expect(spreadForCap(8e9)).toBe(20);
    expect(spreadForCap(1e9)).toBe(35);
  });
  it('the configured classes sit in the real-world bands', () => {
    expect(def('HLCN').spreadBps).toBe(2); // large cap, 1 to 3
    expect(def('AUC').spreadBps).toBe(5); // crypto major, 2 to 5
    expect(def('ZEN').spreadBps).toBeGreaterThanOrEqual(10); // alt, 10 to 20
    expect(def('WOOF').spreadBps).toBeGreaterThanOrEqual(50); // memecoin, 50 to 150
    expect(def('MRE').spreadBps).toBeLessThanOrEqual(1); // FX major, 0.5 to 1
    expect(def('AV10').spreadBps).toBeGreaterThanOrEqual(1); // bond fund, 1 to 3
    expect(def('GOLD').spreadBps).toBeGreaterThanOrEqual(2); // commodity, 2 to 5
  });
});

describe('R-10-4 fractional shares: stocks and ETFs in 0.0001 steps, the rest unchanged', () => {
  it('the step is 0.0001 for stocks and 0 (any fraction) for the other classes', () => {
    expect(FRACTIONAL_SHARE).toBe(0.0001);
    expect(qtyStep(def('HLCN'))).toBe(0.0001);
    expect(qtyStep(def('AUC'))).toBe(0);
    expect(roundQty(def('HLCN'), 1.23456)).toBe(1.2345);
    expect(roundQty(def('AUC'), 1.23456)).toBe(1.23456);
  });
  it('a fractional stock buy fills at its size, and a size off the grid is refused by the step', () => {
    let s = openAccount(createWorld('frac', cfg), 'f', 5000);
    const r = placeOrder(s, { playerId: 'f', assetId: 'HLCN', side: 'buy', type: 'market', qty: 0.25 });
    expect(r.order.rejectReason).toBeUndefined();
    s = clearOrders(r.state, false).state;
    expect(s.accounts.f!.positions.HLCN!.qty).toBeCloseTo(0.25, 9);
    expect(placeOrder(s, { playerId: 'f', assetId: 'HLCN', side: 'buy', type: 'market', qty: 0.00005 }).order.rejectReason).toBe('quantity step');
  });
});

describe('R-10-1 own impact: the quote plus the order\'s own tally, decaying over 360 ticks', () => {
  it('an account\'s own tally halves every 360 ticks, and no other account\'s flow is on it', () => {
    const t0 = ownImpactAdd(undefined, 0, 'buy', 1000);
    expect(ownDecayed({ ownImpact: { X: t0 } } as never, 'X', IMPACT_HALF_LIFE).buy).toBeCloseTo(500, 9);
    expect(ownDecayed({ ownImpact: { X: t0 } } as never, 'X', 2 * IMPACT_HALF_LIFE).buy).toBeCloseTo(250, 9);
    expect(ownDecayed({} as never, 'X', 5).buy).toBe(0);
  });

  it('a second account pays nothing for the first account\'s flow: its fill is priced as if the first never traded', () => {
    const base = busy('p10-own');
    const i = idx(base, 'HLCN');
    const q = roundQty(def('HLCN'), 1000 / Math.exp(base.assets[i]!.lnP));
    const alone = placeOrder(openAccount(base, 'B', 1e6), { playerId: 'B', assetId: 'HLCN', side: 'buy', type: 'market', qty: q }).state;
    const beside = placeOrder(
      placeOrder(openAccount(openAccount(base, 'A', 1e8), 'B', 1e6), { playerId: 'A', assetId: 'HLCN', side: 'buy', type: 'market', qty: q * 5000 }).state,
      { playerId: 'B', assetId: 'HLCN', side: 'buy', type: 'market', qty: q },
    ).state;
    const fB = (st: WorldState) => clearOrders(st, false).fills.find((f) => f.playerId === 'B')!;
    const a = fB(alone);
    const b = fB(beside);
    expect(b.price / b.mid).toBeCloseTo(a.price / a.mid, 12);
  });

  it('the ticket estimate equals the fill on a still mid (the same arithmetic on the same state)', () => {
    const s = busy('p10-est');
    const qty = roundQty(def('OSTV'), 5000 / Math.exp(s.assets[idx(s, 'OSTV')]!.lnP));
    const est = estimateFill(s, { assetId: 'OSTV', side: 'buy', qty, playerId: 'buyer' });
    const placed = placeOrder(s, { playerId: 'buyer', assetId: 'OSTV', side: 'buy', type: 'market', qty }).state;
    const fill = clearOrders(placed, false).fills.find((f) => f.playerId === 'buyer')!;
    expect(fill.price).toBeCloseTo(est.price, 10);
    expect(est.halfSpreadBps).toBeGreaterThan(0);
    expect(est.impactBps).toBeGreaterThanOrEqual(0);
  });

  it('probe: a $1k large-cap market buy fills within 3 bps of the quote on a busy world', () => {
    const s = busy('p10-probe');
    const id = 'HLCN';
    const i = idx(s, id);
    const q = roundQty(def(id), 1000 / Math.exp(s.assets[i]!.lnP));
    const placed = placeOrder(s, { playerId: 'buyer', assetId: id, side: 'buy', type: 'market', qty: q }).state;
    const r = step(placed);
    const fill = r.fills.find((f) => f.playerId === 'buyer')!;
    expect(fill).toBeDefined();
    const quote = fill.mid * (1 + halfSpread(r.state, i));
    const bps = Math.abs(fill.price / quote - 1) * 1e4;
    console.log(`probe_1k_large_cap ${id}: fill ${bps.toFixed(3)} bps above the quote on a busy world`);
    expect(bps).toBeLessThanOrEqual(3);
  });
});

describe('old snapshots load (the new fields are optional)', () => {
  it('a save with no account ownImpact and no asset impactTally steps, fills and prices like a fresh world', () => {
    const s = busy('p10-old');
    const old = JSON.parse(JSON.stringify(s)) as WorldState;
    for (const a of Object.values(old.accounts)) delete (a as { ownImpact?: unknown }).ownImpact;
    for (const a of old.assets) delete (a as { impactTally?: unknown }).impactTally;
    const i = idx(old, 'HLCN');
    const q = roundQty(def('HLCN'), 500 / Math.exp(old.assets[i]!.lnP));
    const placed = placeOrder(old, { playerId: 'buyer', assetId: 'HLCN', side: 'buy', type: 'market', qty: q }).state;
    const r = step(placed);
    const fill = r.fills.find((f) => f.playerId === 'buyer');
    expect(fill).toBeDefined();
    expect(fill!.price).toBeGreaterThan(fill!.mid);
    expect(r.state.accounts.buyer!.ownImpact!.HLCN!.buy).toBeGreaterThan(0);
  });
});
