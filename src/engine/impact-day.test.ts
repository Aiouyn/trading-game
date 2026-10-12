import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { defaultConfig } from './config';
import { halfSpread, impact, marginalImpact, openAccount, placeOrder } from './trading';
import type { WorldState } from './types';

/**
 * R-9-1 (Phase 9 rulings, lead-phase9.md): temporary impact is path-independent over the game day. A fill's impact is the marginal
 * of C(n) = n · impact(n) at the notional the player fills have already taken today on that side (dayMidTraded, at each fill's
 * pre-trade mid), so the day's total cost is C(day total) whatever the tick or account that took it. These pin the rule on
 * OSTV with 24 ticks a game day.
 */
const cfg = defaultConfig({ ticksPerDay: 24 });
const idx = (s: WorldState, id: string) => s.config.assets.findIndex((a) => a.id === id);
const TPD = 24;

/** runs `n` ticks; each fill carries the state of its own tick (the impact reads that state's volatility) */
function run(s: WorldState, n: number, orders: Record<number, { playerId: string; qty: number }>) {
  const fills: { tick: number; playerId: string; qty: number; price: number; mid: number; state: WorldState }[] = [];
  let cur = s;
  for (let t = 0; t < n; t++) {
    const o = orders[t];
    if (o) cur = placeOrder(cur, { playerId: o.playerId, assetId: 'OSTV', side: 'buy', type: 'market', qty: o.qty }).state;
    const r = step(cur);
    cur = r.state;
    for (const f of r.fills) fills.push({ tick: f.tick, playerId: f.playerId, qty: f.qty, price: f.price, mid: f.mid, state: r.state });
  }
  return { state: cur, fills };
}

describe('R-9-1: temporary impact is charged on the day total, not the tick total', () => {
  it('a second account later the same day pays the marginal curve on the first account\'s day total', () => {
    const s = openAccount(openAccount(createWorld('day-two', cfg), 'A', 1e7), 'B', 1e7);
    const i = idx(s, 'OSTV');
    const qA = 3000, qB = 3000;
    // A at tick 1, B at tick 5 (same game day: ticks 1..24)
    const r = run(s, 6, { 0: { playerId: 'A', qty: qA }, 4: { playerId: 'B', qty: qB } });
    const a = r.fills.find((f) => f.playerId === 'A')!;
    const b = r.fills.find((f) => f.playerId === 'B')!;
    expect(b.tick).toBeGreaterThan(a.tick);
    // A's notional at its mid (the day tally holds the notional of A's fill at its pre-trade mid)
    const beforeB = a.qty * a.mid;
    const x = b.qty * b.mid;
    // B's fill price is its mid times (1 + half spread + the marginal impact on A's day total)
    const st = b.state;
    const expectImp = marginalImpact(st, i, beforeB, x);
    expect(b.price / b.mid).toBeCloseTo(1 + halfSpread(st, i) + expectImp, 10);
    // the marginal is larger than the lone-order impact of B's notional (C(n) = n · impact(n) is convex)
    expect(expectImp).toBeGreaterThan(impact(st, i, x));
  });

  it('the day tally resets at the next game day: the first fill of day 2 pays the lone-order impact again', () => {
    const s = openAccount(createWorld('day-reset', cfg), 'A', 1e7);
    const i = idx(s, 'OSTV');
    // A buys on day 0 (tick 1), then again on day 1 (tick 25, the first tick of day 1)
    const r = run(s, TPD + 2, { 0: { playerId: 'A', qty: 3000 }, [TPD]: { playerId: 'A', qty: 3000 } });
    const second = r.fills.find((f) => f.tick === TPD + 1)!;
    expect(second).toBeDefined();
    expect(second.price / second.mid).toBeCloseTo(1 + halfSpread(second.state, i) + impact(second.state, i, second.qty * second.mid), 10);
  });

  it('a world with no player orders writes no day tally (the fingerprint of an order-free world is unchanged)', () => {
    let s = createWorld('day-none', cfg);
    for (let t = 0; t < TPD * 2; t++) s = step(s).state;
    for (const a of s.assets) expect(a.dayMidTraded).toBeUndefined();
  });
});
