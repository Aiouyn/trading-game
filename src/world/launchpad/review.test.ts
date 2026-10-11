import { describe, expect, it } from 'vitest';
import { placeOrder } from '@/engine';
import { applyCommand, stepGame } from '../game';
import { TPD, cashOf } from '../core';
import { bookAccountId, curveAccountId } from './constants';
import { quoteSell, spotAt } from './curve';
import { npcLaunchDraw, PREFIX, SUFFIX } from './launch';
import { lockedEngineSell, openSellQty, vestingSweep } from './graduate';
import { LOTS_KEPT, ensureLaunchpad, pushLot } from './state';
import { lpTick } from './flow';
import { moderateName } from './moderate';
import { curveHoldingsValue } from './value';
import type { LpLot, LpToken } from './types';
import { CREATOR, TRADER, jumpDays, launch, lpWorld, run } from './fixture';

/**
 * Regression tests for the reviewer's findings on Stage A (the p5a review): the ticker reuse, the vesting bypass through open
 * orders, the book's cash, the post-graduation sweep, the cash-death start, the name space, the lot basis, the liquidation value.
 */

const grad = (g: ReturnType<typeof lpWorld>, ticker: string) => applyCommand(g, 'admin', { type: 'admin.lpFill', ticker });
const FAR = 1_000_000; // a limit sell this far above the market never fills
const refusalOf = (r: { data?: unknown }) => (r.data as { refusal?: string } | undefined)?.refusal;

describe('world launches never replace a token (review 1)', () => {
  it('300 world draws give 300 distinct tickers and names, and no ticker is in the order twice', () => {
    const g = lpWorld('npc-unique');
    let made = 0;
    for (let k = 0; k < 300; k++) if (npcLaunchDraw(g, null)) made++;
    expect(made).toBe(300);
    const s = g.launchpad!;
    expect(new Set(s.order).size).toBe(s.order.length);
    expect(new Set(Object.values(s.tokens).map((t) => t.name)).size).toBe(300);
  });
});

describe('the name space (review 5 and 14)', () => {
  it('the word lists give 1,728 names, and every one passes the moderator', () => {
    const pairs: string[] = [];
    for (const p of PREFIX) for (const x of SUFFIX) pairs.push(`${p} ${x}`);
    expect(pairs.length).toBe(1728);
    expect(pairs.every((n) => !moderateName(n).reason)).toBe(true);
  });

  it('with every pair taken a world draw returns false and changes no token; a freed pair is drawn again', () => {
    const g = lpWorld('name-space');
    const s = ensureLaunchpad(g);
    const pairs: string[] = [];
    for (const p of PREFIX) for (const x of SUFFIX) pairs.push(`${p} ${x}`);
    pairs.forEach((name, i) => { s.tokens[`F${i}`] = { name } as unknown as LpToken; });
    const before = Object.keys(s.tokens).length;
    expect(npcLaunchDraw(g, null)).toBe(false);
    expect(Object.keys(s.tokens).length).toBe(before);
    delete s.tokens['F1000'];
    expect(npcLaunchDraw(g, null)).toBe(true);
    const last = s.tokens[s.order[s.order.length - 1]!]!;
    expect(last.name).toBe(pairs[1000]);
  });
});

describe('vesting counts resting orders (review 2)', () => {
  it('a second sell into the locked shares is refused while the first resting sell is open', () => {
    const g = lpWorld('vest-open');
    launch(g, CREATOR, 'VEST', { allocation: 10_000_000 });
    expect(grad(g, 'VEST').ok).toBe(true);
    jumpDays(g, 8); // half vested: 5M of the 10M unlocked, 5M locked
    const r1 = applyCommand(g, CREATOR, { type: 'order.place', order: { assetId: 'VEST', side: 'sell', type: 'limit', qty: 5_000_000, limitPrice: FAR } });
    expect(r1.ok).toBe(true);
    expect(openSellQty(g, CREATOR, 'VEST')).toBe(5_000_000);
    const r2 = applyCommand(g, CREATOR, { type: 'order.place', order: { assetId: 'VEST', side: 'sell', type: 'limit', qty: 5_000_000, limitPrice: FAR } });
    expect(r2.ok).toBe(false);
    expect(refusalOf(r2)).toBe('lockedEngine');
    expect(lockedEngineSell(g, CREATOR, 'VEST', 1)).toBe(true);
    // the unlocked part is still sellable on its own
    expect(lockedEngineSell(g, CREATOR, 'VEST', 0)).toBe(false);
  });

  it('the pre-step sweep cuts a resting creator sell that reaches into the locked shares, placed past the check', () => {
    const g = lpWorld('vest-sweep');
    launch(g, CREATOR, 'VSWP', { allocation: 10_000_000 });
    expect(grad(g, 'VSWP').ok).toBe(true);
    jumpDays(g, 8);
    // a bracket child or any order placed on the engine directly: the world's check never sees it
    const r = placeOrder(g.market, { playerId: CREATOR, assetId: 'VSWP', side: 'sell', type: 'limit', qty: 8_000_000, limitPrice: FAR });
    g.market = r.state;
    expect(vestingSweep(g, null)).toEqual([r.order.id]);
    expect(g.market.orders.some((o) => o.id === r.order.id && o.status === 'open')).toBe(false);
    // a sell inside the unlocked part is left alone
    const r2 = placeOrder(g.market, { playerId: CREATOR, assetId: 'VSWP', side: 'sell', type: 'limit', qty: 5_000_000, limitPrice: FAR });
    g.market = r2.state;
    expect(vestingSweep(g, null)).toEqual([]);
    // and a step with the sweep in place never fills the locked part
    stepGame(g);
    expect(g.market.accounts[CREATOR]!.positions.VSWP!.qty).toBeGreaterThanOrEqual(5_000_000);
  });
});

describe('the launchpad book pays from its cash (review 3)', () => {
  it('a market sell past the book cash is partial: the book is never overdrawn and the seller is paid no more than the book held', () => {
    const g = lpWorld('book-cash');
    launch(g, CREATOR, 'BCSH');
    expect(grad(g, 'BCSH').ok).toBe(true);
    const book = bookAccountId('BCSH');
    const cash0 = g.market.accounts[book]!.cash;
    expect(cash0).toBeGreaterThan(40_000);
    // the seller holds 500M tokens (set on the engine's position: the test is of the book's cash, not of the holding)
    const acct = g.market.accounts[TRADER]!;
    g.market = { ...g.market, accounts: { ...g.market.accounts, [TRADER]: { ...acct, positions: { ...acct.positions, BCSH: { qty: 500_000_000, avgCost: 0, realizedPnl: 0 } } } } };
    const trader0 = cashOf(g, TRADER);
    const r = applyCommand(g, TRADER, { type: 'order.place', order: { assetId: 'BCSH', side: 'sell', type: 'market', qty: 500_000_000 } });
    expect(r.ok).toBe(true);
    stepGame(g);
    expect(g.market.accounts[book]!.cash).toBeGreaterThanOrEqual(-1e-6);
    expect(cashOf(g, TRADER) - trader0).toBeLessThanOrEqual(cash0 + 1e-6);
    expect(g.market.accounts[TRADER]!.positions.BCSH!.qty).toBeGreaterThan(0);
  });
});

describe('the post-graduation sweep reads the engine price (review 4)', () => {
  it('after graduation a creator who sells 3% of supply in a day while the price falls 40% is flagged for a sweep', () => {
    const g = lpWorld('sweep-post');
    launch(g, CREATOR, 'SWPT', { allocation: 40_000_000 });
    expect(grad(g, 'SWPT').ok).toBe(true);
    jumpDays(g, 14); // fully vested
    lpTick(g, null); // the new day opens at the engine's price (the graduated token's day starts here)
    expect(g.launchpad!.tokens.SWPT!.flag).toBeUndefined();
    // the price falls by half (pct is a fraction): the day's sale is the sweep, paced or not (the rule reads the day's supply)
    applyCommand(g, 'admin', { type: 'admin.shock', assetId: 'SWPT', pct: -0.5 });
    const r = applyCommand(g, CREATOR, { type: 'order.place', order: { assetId: 'SWPT', side: 'sell', type: 'market', qty: 31_000_000 } });
    expect(r.ok).toBe(true);
    stepGame(g);
    const t = g.launchpad!.tokens.SWPT!;
    expect(t.flag?.reason).toBe('sweep');
    // the sale followed the vesting pace, so the dump rule never counted it: the sweep is the rule that caught it
    expect(t.creatorSoldSinceGrad).toBe(0);
  });
});

describe('the cost basis is kept past the lot cap (review 10)', () => {
  it('a holder past 300 lots keeps the total quantity and cost: the two oldest merge at their weighted cost', () => {
    const lots: LpLot[] = [];
    let qty = 0;
    let cost = 0;
    for (let k = 0; k < 450; k++) {
      const l = { qty: 10 + k, cost: 1 + (k % 7) * 0.1, tick: k };
      pushLot(lots, l);
      qty += l.qty;
      cost += l.qty * l.cost;
    }
    expect(lots.length).toBeLessThanOrEqual(LOTS_KEPT);
    expect(lots.reduce((s, l) => s + l.qty, 0)).toBeCloseTo(qty, 6);
    expect(lots.reduce((s, l) => s + l.qty * l.cost, 0)).toBeCloseTo(cost, 6);
  });
});

describe('the cash death starts on day 3 (review 6)', () => {
  it('a token launched on day 2 with no funding is alive on day 9 and dead on day 10', () => {
    const g = lpWorld('death-start');
    launch(g, CREATOR, 'DAYT');
    const t = g.launchpad!.tokens.DAYT!;
    t.buzz.base = 0;
    t.sniperDone = true;
    // L3.1 (v1.3): the closes of day 3 to day 8 leave it alive (six closes); the close of day 9 is the seventh
    for (let d = 3; d <= 8; d++) {
      g.market = { ...g.market, tick: (d + 1) * TPD };
      lpTick(g, null);
    }
    expect(t.status).toBe('live');
    g.market = { ...g.market, tick: 10 * TPD };
    lpTick(g, null);
    expect(t.status).toBe('dead');
    expect(t.deadTick! / TPD).toBeCloseTo(10, 0);
  });
});

describe('a refused dev buy leaves nothing behind (review 13)', () => {
  it('a launch whose dev buy the curve refuses (over the creator cap) creates no token, no curve account and takes no fee', () => {
    const g = lpWorld('dev-atomic');
    const cash0 = cashOf(g, CREATOR);
    const r = run(g, CREATOR, { type: 'lp.launch', name: 'Dev Buy', ticker: 'DEVB', tagline: 'tg1', allocation: 50_000_000, devBuyCents: 100_000 });
    expect(r.ok).toBe(false);
    expect(g.launchpad?.tokens.DEVB).toBeUndefined();
    expect(g.market.accounts[curveAccountId('DEVB')]).toBeUndefined();
    expect(cashOf(g, CREATOR)).toBe(cash0);
    expect(g.launchpad?.order.includes('DEVB') ?? false).toBe(false);
  });
});

describe('the curve holding is valued at its liquidation proceeds (review 11)', () => {
  it('a curve holding is worth the curve\'s net proceeds for selling it all, which is below its spot value', () => {
    const g = lpWorld('value-liq');
    launch(g, CREATOR, 'VALU');
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'VALU', spendCents: 10_000 }).ok).toBe(true);
    const t = g.launchpad!.tokens.VALU!;
    const q = t.bal[TRADER]!;
    const liq = quoteSell(t.y, q);
    if (!liq.ok) throw new Error('quote');
    expect(curveHoldingsValue(g, TRADER)).toBeCloseTo(liq.netCents / 100, 6);
    expect(curveHoldingsValue(g, TRADER)).toBeLessThan(q * spotAt(t.y));
  });
});
