import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { defaultConfig } from './config';
import { halfSpread, impact, IMPACT_HALF_LIFE, marginalImpact, openAccount, placeOrder } from './trading';
import type { WorldState } from './types';

/**
 * R-9-1c (Phase 9 rulings, lead-phase9.md; amends R-9-1b): temporary impact runs on the asset's SHARED impact tally, a
 * same-direction notional per asset over all flow at each fill's pre-trade mid, decayed by half every IMPACT_HALF_LIFE (360) ticks. There is
 * no calendar-day reset: the tally is a rolling window, so a fill pays the marginal of C(n) = n · impact(n) on what the
 * account's earlier fills still hold. These pin the rule on OSTV with 24 ticks a game day.
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

describe('R-9-1c: temporary impact is charged on the asset\'s shared rolling tally', () => {
  it('a second fill pays the marginal curve on its earlier fill, decayed to the second fill\'s tick', () => {
    const s = openAccount(createWorld('own-two', cfg), 'A', 1e7);
    const i = idx(s, 'OSTV');
    // A at tick 1, again at tick 5 (same game day: ticks 1..24)
    const r = run(s, 6, { 0: { playerId: 'A', qty: 3000 }, 4: { playerId: 'A', qty: 3000 } });
    const [a, b] = r.fills as [typeof r.fills[number], typeof r.fills[number]];
    expect(b.tick - a.tick).toBe(4);
    const decay = Math.pow(0.5, (b.tick - a.tick) / IMPACT_HALF_LIFE);
    const before = a.qty * a.mid * decay;
    const x = b.qty * b.mid;
    const st = b.state;
    const expectImp = marginalImpact(st, i, before, x);
    expect(b.price / b.mid).toBeCloseTo(1 + halfSpread(st, i) + expectImp, 10);
    // the marginal is larger than the lone-order impact of this notional (C(n) = n · impact(n) is convex)
    expect(expectImp).toBeGreaterThan(impact(st, i, x));
  });

  it('another account pays on the first account\'s flow: the tally is shared per asset, not per account', () => {
    const s = openAccount(openAccount(createWorld('own-b', cfg), 'A', 1e7), 'B', 1e7);
    const i = idx(s, 'OSTV');
    const r = run(s, 6, { 0: { playerId: 'A', qty: 3000 }, 4: { playerId: 'B', qty: 3000 } });
    const a = r.fills[0]!;
    const b = r.fills.find((f) => f.playerId === 'B')!;
    expect(b.tick).toBeGreaterThan(a.tick);
    const before = a.qty * a.mid * Math.pow(0.5, (b.tick - a.tick) / IMPACT_HALF_LIFE);
    expect(b.price / b.mid).toBeCloseTo(1 + halfSpread(b.state, i) + marginalImpact(b.state, i, before, b.qty * b.mid), 10);
    expect(b.price / b.mid).toBeGreaterThan(1 + halfSpread(b.state, i) + impact(b.state, i, b.qty * b.mid));
  });

  it('no calendar-day reset: the second fill one tick into the next game day still pays on the decayed first fill', () => {
    const s = openAccount(createWorld('own-roll', cfg), 'A', 1e7);
    const i = idx(s, 'OSTV');
    // A buys on day 0 (tick 24, the last tick of day 0) and on day 1 (tick 25, the first tick of day 1)
    const r = run(s, TPD + 2, { [TPD - 1]: { playerId: 'A', qty: 3000 }, [TPD]: { playerId: 'A', qty: 3000 } });
    const [first, second] = r.fills.slice(-2) as [typeof r.fills[number], typeof r.fills[number]];
    expect(second.tick - first.tick).toBe(1);
    const before = first.qty * first.mid * Math.pow(0.5, 1 / IMPACT_HALF_LIFE);
    expect(second.price / second.mid).toBeCloseTo(1 + halfSpread(second.state, i) + marginalImpact(second.state, i, before, second.qty * second.mid), 10);
    // and it is not the lone-order price: the earlier fill still counts
    expect(second.price / second.mid).toBeGreaterThan(1 + halfSpread(second.state, i) + impact(second.state, i, second.qty * second.mid));
  });

  it('the tally halves every IMPACT_HALF_LIFE ticks: a fill that many ticks later pays on half of the first', () => {
    const s = openAccount(createWorld('own-half', cfg), 'A', 1e7);
    const i = idx(s, 'OSTV');
    const r = run(s, IMPACT_HALF_LIFE + 3, { 0: { playerId: 'A', qty: 3000 }, [IMPACT_HALF_LIFE]: { playerId: 'A', qty: 3000 } });
    const [first, second] = r.fills as [typeof r.fills[number], typeof r.fills[number]];
    expect(second.tick - first.tick).toBe(IMPACT_HALF_LIFE);
    const before = first.qty * first.mid * 0.5;
    expect(second.price / second.mid).toBeCloseTo(1 + halfSpread(second.state, i) + marginalImpact(second.state, i, before, second.qty * second.mid), 10);
  });

  it('a world with no player orders writes no impact tally (the fingerprint of an order-free world is unchanged)', () => {
    let s = createWorld('day-none', cfg);
    for (let t = 0; t < TPD * 5; t++) s = step(s).state;
    for (const a of s.assets) expect(a.dayTraded).toBeUndefined();
    for (const a of s.assets) expect(a.impactTally).toBeUndefined();
  });
});
