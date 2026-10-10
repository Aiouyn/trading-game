/**
 * Tape section 4, plans and their skips at the engine boundary (tape-company-building.md section 3.6, Quant v1.7 section
 * 6.1, unchanged in v1.7). Plans are sell-only, lock their shares at commit (no cash escrow), carry a minimum price set
 * at commit (at most 0.80 x the commit-day close), and a price skip holds its unsold shares to the plan end + 63 game days.
 * Test names carry the Tape id. Layer: U (engine boundary through commitPlan, lockedQty and the day step).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../game';
import { commitPlan, type PlanSpec } from '../../../engine/programs';
import { companyRulesOf, lockedQty, sessionDayAt } from '../../../engine/restrictions';
import { advanceTo, companyOf, FOUNDER, listedWorld } from '../b1fixture';
import { windowAt } from '../insiders';
import { publicCompanyView } from '../views';

const LISTED_DAY = 201;
const LOCKUP_END = LISTED_DAY + 168; // 369: the first day a founder plan or sale may sell

function planSpec(assetId: string, over: Partial<PlanSpec> = {}): PlanSpec {
  return { id: 'plan-x', playerId: FOUNDER, assetId, side: 'sell', qtyPerDay: 1, days: [LOCKUP_END], minPrice: 0.01, ...over };
}

/** The listed fixture at the listing day, with the founder's holding set by the test (the escrow tests need a known holding). */
function listedAt(seed: string, held?: number) {
  const { g, c, assetId } = listedWorld(seed);
  advanceTo(g, LISTED_DAY);
  if (held !== undefined) g.market.accounts[FOUNDER]!.positions[assetId] = { qty: held, avgCost: 1 } as never;
  return { g, c, assetId };
}

describe('Tape s4: plans at the engine boundary', () => {
  it('plan_sell_only: every side other than sell is refused (planSellOnly) and a sell plan is accepted (the commit-time rule)', () => {
    const { g, assetId } = listedAt('ps-side');
    for (const side of ['buy', 'short', 'cover', '', 'SELL'] as const) {
      const r = commitPlan(g.market, planSpec(assetId, { side: side as PlanSpec['side'] }));
      expect(r.reject, `side ${JSON.stringify(side)}`).toEqual({ code: 'planSellOnly' });
      expect(r.state).toBe(g.market); // refused: nothing changed
    }
    expect(commitPlan(g.market, planSpec(assetId)).reject).toBeUndefined();
  });

  it('plan_floor_cap: a minimum of 0.80 x the commit-day close is accepted; one cent above it is refused with maxFloor', () => {
    const { g, assetId } = listedAt('pfc');
    const rules = companyRulesOf(g.market);
    const a = g.market.assets.find((x) => x.id === assetId)!;
    // the commit is intraday (tick is not a close tick), so the reference is the previous close, the open
    expect(g.market.tick % g.market.config.ticksPerDay).not.toBe(0);
    a.lnOpen = Math.log(20);
    const close = Math.exp(a.lnOpen); // the engine's own reference, not a rounded 20
    const cap = rules.planFloorMaxRatio * close;
    expect(commitPlan(g.market, planSpec(assetId, { minPrice: cap })).reject).toBeUndefined();
    const over = commitPlan(g.market, planSpec(assetId, { id: 'pfc-over', minPrice: cap + 0.01 }));
    expect(over.reject).toEqual({ code: 'planFloorTooHigh', maxFloor: expect.any(Number) });
    if (over.reject && 'maxFloor' in over.reject) expect(over.reject.maxFloor).toBeCloseTo(cap, 9);
  });

  it('plan_unfunded_shares: with 10 shares held, 10 shares over the plan days is accepted and 11 is refused with shortfall 1', () => {
    const { g, assetId } = listedAt('puf', 10);
    const ten = Array.from({ length: 10 }, (_, i) => LOCKUP_END + i);
    expect(commitPlan(g.market, planSpec(assetId, { days: ten })).reject).toBeUndefined();
    const eleven = Array.from({ length: 11 }, (_, i) => LOCKUP_END + i);
    expect(commitPlan(g.market, planSpec(assetId, { id: 'puf-11', days: eleven })).reject).toEqual({ code: 'planUnfunded', shortfall: 1 });
  });

  it('plan_unfunded_shares (excluded holdings): a second plan cannot use shares a live plan already locks', () => {
    const { g, assetId } = listedAt('puf2', 10);
    const first = commitPlan(g.market, planSpec(assetId, { days: Array.from({ length: 6 }, (_, i) => LOCKUP_END + i) }));
    expect(first.reject).toBeUndefined();
    g.market = first.state;
    const second = commitPlan(g.market, planSpec(assetId, { id: 'puf2-b', days: [LOCKUP_END + 10, LOCKUP_END + 11, LOCKUP_END + 12, LOCKUP_END + 13, LOCKUP_END + 14] }));
    expect(second.reject).toEqual({ code: 'planUnfunded', shortfall: 1 });
  });

  it('plan_locked_shares: the locked quantity is the sum of qtyPerDay over the plan days, and a sell beyond the sellable shares is refused', () => {
    const { g, assetId } = listedAt('pls');
    const held = g.market.accounts[FOUNDER]!.positions[assetId]!.qty;
    const plan = commitPlan(g.market, planSpec(assetId, { qtyPerDay: 100, days: [LOCKUP_END, LOCKUP_END + 1] }));
    expect(plan.reject).toBeUndefined();
    g.market = plan.state;
    const day = sessionDayAt(g.market.tick, g.market.config.ticksPerDay);
    expect(lockedQty(g.market.restrictions!, FOUNDER, assetId, day)).toBe(200);
    // sellable = held - locked; a sell of one share more than that is refused on an open-window day after the lockup. The
    // filing that opens the window at 383 (F = 381) is known only once it is filed, so the day is reached by stepping
    advanceTo(g, 383);
    expect(windowAt(companyOf(g), 383).open).toBe(true);
    const sellable = held - 200;
    const over = applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'sell', type: 'limit', limitPrice: 1e6, qty: sellable + 1, tif: 'gtc' } });
    expect(over.ok).toBe(false);
    const within = applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'sell', type: 'limit', limitPrice: 1e6, qty: sellable, tif: 'gtc' } });
    expect(within.ok).toBe(true);
  });

  it('plan_skip_price and plan_price_skip_hold: a price below the minimum on the plan day skips it (reason price), and the unsold shares stay locked to end + 63, released at end + 64', () => {
    const { g, c, assetId } = listedAt('psk', 1_000);
    const plan = applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay: 100, days: [LOCKUP_END + 1], minSellPrice: 0.01 });
    expect(plan.ok).toBe(true);
    const end = LOCKUP_END + 1;
    const a = g.market.assets.find((x) => x.id === assetId)!;
    a.lnP = Math.log(0.001); // far below the 0.01 minimum at the plan day's open
    advanceTo(g, end);
    expect(publicCompanyView(c, end).planSkips).toContainEqual({ day: end, reason: 'price' });
    expect(lockedQty(g.market.restrictions!, FOUNDER, assetId, end)).toBe(100); // held, not sold, still locked
    expect(lockedQty(g.market.restrictions!, FOUNDER, assetId, end + 63)).toBe(100);
    advanceTo(g, end + 64);
    expect(lockedQty(g.market.restrictions!, FOUNDER, assetId, end + 64)).toBe(0);
  });

  it('plan_skip_halt: a plan day inside a halt skips with reason halt and holds nothing (the shares are released at once)', () => {
    const { g, c, assetId } = listedAt('phalt', 1_000);
    const plan = applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay: 100, days: [LOCKUP_END + 2], minSellPrice: 0.01 });
    expect(plan.ok).toBe(true);
    const end = LOCKUP_END + 2;
    const a = g.market.assets.find((x) => x.id === assetId)!;
    a.haltUntil = end * g.market.config.ticksPerDay + 1; // halted all the plan day
    advanceTo(g, end);
    expect(publicCompanyView(c, end).planSkips).toContainEqual({ day: end, reason: 'halt' });
    expect(lockedQty(g.market.restrictions!, FOUNDER, assetId, end)).toBe(0);
  });
});
