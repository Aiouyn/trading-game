import { describe, expect, it } from 'vitest';
import { cancelOrderResult, commitPlan, type Order } from '@/engine';
import { applyCommand } from '../game';
import { today } from '../core';
import type { GameState } from '../types';
import { advanceTo, FOUNDER, founded, listedWorld } from './b1fixture';
import { applyProgramEvents } from './programs';
import { publicCompanyView } from './views';
import type { Company } from './types';

// Trading programs (sections 5.2, 6.1): sell-only plans with escrow, immutable once committed, and buybacks filed on F + 1.

const LOCK_END = 201 + 168; // listing day 201 plus the 168 game day lockup
const PLAN_DAYS = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

function plan(g: GameState, companyId: string, over: Partial<{ qtyPerDay: number; days: number[]; minSellPrice: number }> = {}) {
  return applyCommand(g, FOUNDER, {
    type: 'company.plan', companyId, qtyPerDay: 10_000, days: PLAN_DAYS(LOCK_END + 40, 10), minSellPrice: 0.01, ...over,
  });
}

describe('sell-only plans (section 6.1, Ledger v1.4)', () => {
  it('refuses a plan in a company that is not listed', () => {
    const { g, c } = founded('plan-private');
    const r = plan(g, c.id);
    expect(r.error).toBe('planNotListed');
  });

  it('refuses a plan that starts before 63 game days from commit', () => {
    const { g, c } = listedWorld('plan-soon');
    const r = plan(g, c.id, { days: PLAN_DAYS(today(g) + 10, 5) });
    expect(r.error).toBe('planTooSoon');
    expect((r.data as { earliestDay: number }).earliestDay).toBe(today(g) + 63);
  });

  it('refuses a plan with a sell day inside the lockup', () => {
    const { g, c } = listedWorld('plan-lock');
    expect(plan(g, c.id, { days: PLAN_DAYS(today(g) + 63, 5) }).error).toBe('planInLockup');
  });

  it('refuses a plan above 2% of the shares outstanding a day (the founder sell cap)', () => {
    const { g, c } = listedWorld('plan-cap');
    const cap = Math.floor(0.02 * c.listed!.sharesOut);
    expect(plan(g, c.id, { qtyPerDay: cap + 1 }).error).toBe('planOverCap');
  });

  it('refuses a plan that locks more shares than the founder holds unencumbered', () => {
    const { g, c } = listedWorld('plan-unfunded');
    const held = g.market.accounts[FOUNDER]!.positions[c.listed!.assetId]!.qty;
    // 25,000 a day over 41 days is 1,025,000 shares; the founder holds 1,000,000
    const r = plan(g, c.id, { qtyPerDay: 25_000, days: PLAN_DAYS(LOCK_END + 40, 41) });
    expect(r.error).toBe('planUnfunded');
    expect(held).toBeLessThan(1_025_000);
  });

  it('refuses a minimum sell price above 80% of the commit-day close', () => {
    const { g, c } = listedWorld('plan-floor');
    expect(plan(g, c.id, { minSellPrice: 1_000_000 }).error).toBe('planFloorTooHigh');
  });

  it('commits, locks the shares, and shows only that a plan exists with its start and end days', () => {
    const { g, c } = listedWorld('plan-public');
    const r = plan(g, c.id);
    expect(r.ok).toBe(true);
    const pub = publicCompanyView(c, today(g));
    expect(pub.plans).toEqual([{ fromDay: LOCK_END + 40, toDay: LOCK_END + 49 }]);
    expect(Object.keys(pub.plans[0]!).sort()).toEqual(['fromDay', 'toDay']);
    const json = JSON.stringify(pub);
    expect(json).not.toContain('minSellPrice');
    expect(json).not.toContain('qtyPerDay');
    expect(json).not.toContain('"0.01"');
  });

  it('allows two live plans and refuses a third', () => {
    const { g, c } = listedWorld('plan-limit');
    expect(plan(g, c.id).ok).toBe(true);
    expect(plan(g, c.id, { days: PLAN_DAYS(LOCK_END + 60, 5) }).ok).toBe(true);
    expect(plan(g, c.id, { days: PLAN_DAYS(LOCK_END + 80, 5) }).error).toBe('planLimit');
  });

  it('refuses a buy plan from the engine (the sell-only rule on every route)', () => {
    const { g, c } = listedWorld('plan-buy');
    const r = commitPlan(g.market, { id: 'x', playerId: FOUNDER, assetId: c.listed!.assetId, side: 'buy', qtyPerDay: 1, days: [LOCK_END + 40], minPrice: 1 });
    expect(r.reject?.code).toBe('planSellOnly');
  });
});

describe('a plan order on its day, and its immutability', () => {
  it('places the day\'s sell order from escrow, and a cancel is refused as planImmutable', () => {
    const { g, c } = listedWorld('plan-order');
    const r = plan(g, c.id, { days: PLAN_DAYS(LOCK_END + 40, 3) });
    const planId = (r.data as { planId: string }).planId;
    advanceTo(g, LOCK_END + 40);
    const order = g.market.orders.find((o: Order) => o.program === planId);
    expect(order).toBeDefined();
    expect(order!.side).toBe('sell');
    expect(order!.qty).toBe(10_000);
    const cancel = cancelOrderResult(g.market, FOUNDER, order!.id);
    expect(cancel.error).toBe('planImmutable');
    // through the world's route too
    const viaWorld = applyCommand(g, FOUNDER, { type: 'order.cancel', orderId: order!.id });
    expect(viaWorld.error).toBe('planImmutable');
  });

  it('records a price skip and an end on the public rows without the size', () => {
    const { g, c } = listedWorld('plan-events');
    plan(g, c.id, { days: PLAN_DAYS(LOCK_END + 40, 2) });
    const row = c.planRows[0]!;
    applyProgramEvents(g, [
      { type: 'planSkipped', assetId: c.listed!.assetId, reason: 'price', qty: 10_000, programId: row.id },
      { type: 'planEnded', assetId: c.listed!.assetId, reason: 'completed', programId: row.id },
    ]);
    expect(c.planSkips).toEqual([{ day: today(g), reason: 'price' }]);
    expect(c.planRows[0]!.ended).toEqual({ day: today(g), reason: 'completed' });
    const pub = publicCompanyView(c, today(g));
    expect(JSON.stringify(pub.planSkips)).not.toContain('qty');
  });
});

describe('buybacks (section 5.2): filed on F + 1 only, inside the window, from company cash', () => {
  /** A listed company on the filing day after its fourth filing (day 256 = 255 + 1), with cash and a clean filed record. */
  function buybackWorld(seed: string): { g: GameState; c: Company } {
    const { g, c } = listedWorld(seed);
    advanceTo(g, 255);
    c.cash = 5_000_000;
    const last = c.filings[c.filings.length - 1]!;
    last.balance.cash = 10_000_000;
    return { g, c };
  }
  const buy = (g: GameState, companyId: string, over: Partial<{ size: number; fromDay: number; toDay: number }> = {}) => applyCommand(g, FOUNDER, {
    type: 'company.buyback', companyId, size: 2_000, fromDay: 257, toDay: 266, ...over,
  });

  it('refuses a buyback on any day but F + 1', () => {
    const { g, c } = buybackWorld('bb-day');
    const r = buy(g, c.id);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('buybackNotFilingDay');
  });

  it('refuses a size that does not split into whole shares a day, and one above 1% of the float a day', () => {
    const { g, c } = buybackWorld('bb-bad');
    advanceTo(g, 256);
    expect(buy(g, c.id, { size: 2_001 }).error).toBe('buybackBadSpec');
    expect(buy(g, c.id, { size: 10 * 2_600 }).error).toBe('buybackTooLarge');
  });

  it('files the program, moves its reserve from company cash to the treasury, and shows the row publicly', () => {
    const { g, c } = buybackWorld('bb-file');
    advanceTo(g, 256);
    const before = c.cash;
    const treasuryBefore = g.market.accounts[c.treasuryId!]!.cash;
    const r = buy(g, c.id);
    expect(r.ok).toBe(true);
    const reserve = (r.data as { reserve: number }).reserve;
    expect(c.cash).toBeCloseTo(before - reserve, 6);
    expect(g.market.accounts[c.treasuryId!]!.cash).toBeCloseTo(treasuryBefore + reserve, 6);
    expect(publicCompanyView(c, 256).buybackPrograms).toEqual([{ size: 2_000, fromDay: 257, toDay: 266 }]);
  });

  it('places the treasury\'s daily buy inside the window, and refuses to cancel it as buybackImmutable', () => {
    const { g, c } = buybackWorld('bb-order');
    advanceTo(g, 256);
    buy(g, c.id);
    advanceTo(g, 257);
    const bb = g.market.orders.find((o: Order) => o.playerId === c.treasuryId && o.side === 'buy');
    expect(bb).toBeDefined();
    expect(bb!.qty).toBe(200);
    const cancel = cancelOrderResult(g.market, c.treasuryId!, bb!.id);
    expect(cancel.error).toBe('buybackImmutable');
  });

  it('returns the unspent reserve to company cash once the program has run its last day', () => {
    const { g, c } = buybackWorld('bb-sweep');
    advanceTo(g, 256);
    buy(g, c.id);
    expect(g.market.accounts[c.treasuryId!]!.cash).toBeGreaterThan(0);
    // the last program day is 266: from 267 the treasury holds no cash that a program needs
    advanceTo(g, 267);
    expect(g.market.accounts[c.treasuryId!]!.cash).toBeCloseTo(0, 6);
  });
});
