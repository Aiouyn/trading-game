import { describe, expect, it } from 'vitest';
import { applyCommand } from '../game';
import { today } from '../core';
import { capitalViewOf } from './capital';
import { BUYER_A, FOUNDER, founded, listedWorld } from './b1fixture';
import type { IpoBook } from './types';

// The founder's capital view (B3): the numbers the Capital tab shows, built from the world and the engine. Owner only.

const PLAN_DAYS = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

describe('capital view of a private company', () => {
  it('is null for a player with no company', () => {
    const { g } = founded('cap-none');
    expect(capitalViewOf(g, BUYER_A)).toBeNull();
  });

  it('shows the cap table, an open round and the IPO refusal', () => {
    const { g, c } = founded('cap-private');
    const v = capitalViewOf(g, FOUNDER)!;
    expect(v.companyId).toBe(c.id);
    expect(v.listed).toBe(false);
    expect(v.capTable.some((r) => r.kind === 'founder')).toBe(true);
    expect(v.rounds.open).toBe(true);
    expect(v.rounds.pricePerShare).toBeGreaterThan(0);
    expect(v.rounds.maxAmount).toBeGreaterThan(0);
    expect(v.ipo.phase).toBe('blocked');
    expect(v.ipo.refusal?.code).toBe('ipoFilings');
    expect(v.plans.commitRefusal?.code).toBe('planNotListed');
    expect(v.window.hasWindow).toBe(false);
    expect(v.debt.refusal?.code).toBe('loanTier');
  });

  it('prices every float step from the IPO formula, 15% to 49%', () => {
    const { g } = founded('cap-previews');
    const v = capitalViewOf(g, FOUNDER)!;
    expect(v.ipo.previews[0]!.floatPct).toBeCloseTo(0.15, 6);
    expect(v.ipo.previews[v.ipo.previews.length - 1]!.floatPct).toBeCloseTo(0.49, 6);
    expect(v.ipo.previews.length).toBe(35);
  });

  it('refuses a private round once the IPO book is open', () => {
    const { g, c } = founded('cap-round');
    c.ipo = { requestDay: today(g), listDay: today(g) + 1, floatPct: 0.2, price: 1, ipoShares: 1, sharesPost: 2, orders: {} };
    const v = capitalViewOf(g, FOUNDER)!;
    expect(v.rounds.open).toBe(false);
    expect(v.rounds.refusal?.code).toBe('roundDuringIpo');
  });
});

describe('capital view of a listed company', () => {
  it('shows the lockup, the window and the plan rows; the public rows carry no price or size', () => {
    const { g, c } = listedWorld('cap-listed');
    const v = capitalViewOf(g, FOUNDER)!;
    expect(v.listed).toBe(true);
    expect(v.ipo.phase).toBe('listed');
    expect(v.ipo.lockupUntil).toBe(c.listed!.ipoDay + 168);
    expect(v.ipo.founderShares).toBeGreaterThan(0);
    expect(v.plans.floorMax).toBeGreaterThan(0);
    expect(v.plans.rows.length).toBe(0);
    expect(v.plans.inLockup).toBe(true);
    expect(v.plans.sellable).toBe(0);
    expect(v.rounds.refusal?.code).toBe('roundAfterListing');

    const from = v.plans.lockUntil!;
    const days = PLAN_DAYS(from, 5);
    const r = applyCommand(g, FOUNDER, { type: 'company.plan', companyId: c.id, qtyPerDay: 1_000, days, minSellPrice: 0.01 });
    expect(r.ok).toBe(true);
    const after = capitalViewOf(g, FOUNDER)!;
    expect(after.plans.rows.length).toBe(1);
    expect(after.plans.rows[0]!.qtyPerDay).toBe(1_000);
    expect(after.plans.rows[0]!.minSellPrice).toBeCloseTo(0.01, 6);
    expect(after.plans.live).toBe(1);
    expect(Object.keys(after.plans.publicRows[0]!)).not.toContain('minSellPrice');
    expect(JSON.stringify(after.plans.publicRows)).not.toContain('1000');
  });

  it('reports an open IPO book: the founder has no order of their own, and the allocation cap', () => {
    const { g, c } = founded('cap-book');
    const book: IpoBook = { requestDay: today(g), listDay: today(g) + 1, floatPct: 0.2, price: 1, ipoShares: 10_000, sharesPost: 50_000, orders: { [BUYER_A]: 700 } };
    c.ipo = book;
    const v = capitalViewOf(g, FOUNDER)!;
    expect(v.ipo.phase).toBe('requested');
    expect(v.ipo.book?.myOrder).toBe(0);
    expect(v.ipo.book?.cap).toBe(500);
  });

  it('keeps every number JSON-safe (no Infinity or NaN)', () => {
    const { g } = listedWorld('cap-json');
    const v = capitalViewOf(g, FOUNDER)!;
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });
});
