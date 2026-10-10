import { describe, expect, it, vi } from 'vitest';
import { applyCommand, createGame } from '../game';
import { credit, netWorthBreakdown, TPD } from '../core';
import { refreshNetWorth } from '../assets';
import { playerView } from '../view';
import type { GameState } from '../types';
import { BUYER_A, BUYER_B, FOUNDER, YOUNG, advanceTo, founded, listedWorld, companyOf, THREE_FILINGS_DAY } from '../company/b1fixture';
import { COMPANY } from '@/content/company';
import { dayOfTick, exchangeView, feeFractionOf, feePercentOf, fundRules, holdingsOf, ipoBlock, listedStocks, managedView, openIpos, openingRefusal } from './view';
import { fundsOf } from '../funds/state';
import type { FundMandate } from '../funds/types';

// The Exchange view is built from the world: these tests check what a player may see (the public views only), the IPO book's
// exclusions, the holdings' money, and the manager console. Each case warms a world, so the default timeout is too short.
vi.setConfig({ testTimeout: 60_000 });

const MANDATE: FundMandate = { classes: ['stock', 'crypto', 'commodity', 'forex', 'bond'], maxLeverage: 1, maxPositionPct: 0.2 };
const MGR = 'm';
const INV = 'i';

/** A world with a manager at R3 (old enough), an old investor and a young account. Tick 1 is day 0. */
function fundWorld(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const [id, handle] of [[MGR, 'mgr_view'], [INV, 'inv_view'], [YOUNG, 'young_view']] as const) {
    const r = applyCommand(g, id, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  }
  g.market = { ...g.market, tick: 1 };
  g.players[MGR]!.joinedTick = -1000 * TPD;
  g.players[INV]!.joinedTick = -1000 * TPD;
  g.players[YOUNG]!.joinedTick = 1;
  g.players[MGR]!.rankId = 'R3';
  credit(g, MGR, 3_000_000, 'test');
  credit(g, INV, 900_000, 'test');
  credit(g, YOUNG, 900_000, 'test');
  refreshNetWorth(g, g.players[MGR]!);
  refreshNetWorth(g, g.players[INV]!);
  return g;
}

/** Ages every account past the fund rules' waits (14 game days for a manager, 7 real days for an investor). */
function ageAll(g: GameState): void {
  g.market = { ...g.market, tick: 30 * 24 * TPD };
  for (const p of Object.values(g.players)) p.joinedTick = 1;
}

describe('listed stocks', () => {
  it('lists the listed player companies with the public view only (no founder fields)', () => {
    const { g, assetId } = listedWorld('exchange-listed-1');
    const rows = listedStocks(g, THREE_FILINGS_DAY + 60);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ticker).toBe(assetId);
    const json = JSON.stringify(rows[0]!.view);
    // the live cash is private (the filed cash sits in cashDebt, dated); no founder-only field is on the public view
    expect((rows[0]!.view as unknown as Record<string, unknown>).cash).toBeUndefined();
    for (const secret of ['productsPrivate', 'staff', 'capTable', 'ledger', 'plantLevel', 'minSellPrice', 'qtyPerDay']) {
      expect(json.includes(secret), secret).toBe(false);
    }
    expect(rows[0]!.view.window).toBeDefined();
    expect(rows[0]!.price).toBeGreaterThan(0);
  });

  it('a private company is not listed', () => {
    const { g } = founded('exchange-private-1');
    expect(listedStocks(g, 10)).toHaveLength(0);
  });
});

describe('IPO books', () => {
  it('the founder and a young account are refused with a reason; an old buyer can subscribe', () => {
    const { g, c } = founded('exchange-ipo-2');
    advanceTo(g, THREE_FILINGS_DAY);
    companyOf(g).filedV = 100_000_000;
    g.players[FOUNDER]!.rankId = 'R3';
    g.players[BUYER_A]!.rankId = 'R3';
    // the young account joins on the request day, so it is under the 7-game-day wait when the book opens
    g.players[YOUNG]!.joinedTick = g.market.tick;
    expect(applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 }).ok).toBe(true);
    const day = Math.floor((g.market.tick - 1) / TPD);
    const rowsFounder = openIpos(g, FOUNDER, day);
    expect(rowsFounder).toHaveLength(1);
    expect(rowsFounder[0]!.blocked?.code).toBe('ipoOwnerSet');
    expect(openIpos(g, YOUNG, day)[0]!.blocked?.code).toBe('ipoAccountTooYoung');
    const row = openIpos(g, BUYER_A, day)[0]!;
    expect(row.blocked).toBeNull();
    expect(row.capShares).toBe(Math.floor(COMPANY.ipo.allocCapOfFloat * row.ipoShares));
    expect(row.myShares).toBe(0);
    expect(ipoBlock(g, companyOf(g).ownerId, BUYER_B)).toBeNull();
    // the book's other orders are never listed: only the viewer's own
    expect(JSON.stringify(row)).not.toContain('orders');
  });

  it('the room left under the cap is the cap less the viewer\'s own subscription, never below zero', () => {
    const { g, c } = founded('exchange-ipo-room');
    advanceTo(g, THREE_FILINGS_DAY);
    companyOf(g).filedV = 100_000_000;
    g.players[FOUNDER]!.rankId = 'R3';
    g.players[BUYER_A]!.rankId = 'R3';
    expect(applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 }).ok).toBe(true);
    const day = Math.floor((g.market.tick - 1) / TPD);
    const before = openIpos(g, BUYER_A, day)[0]!;
    expect(before.roomShares).toBe(before.capShares);
    expect(applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 100 }).ok).toBe(true);
    const after = openIpos(g, BUYER_A, day)[0]!;
    expect(after.myShares).toBe(100);
    expect(after.roomShares).toBe(before.capShares - 100);
    // a buyer with no order yet has the whole cap as room
    const huge = openIpos(g, BUYER_B, day)[0]!;
    expect(huge.roomShares).toBe(huge.capShares);
  });

  it('an IPO row is gone once the company lists', () => {
    const { g, c } = listedWorld('exchange-ipo-3');
    const day = Math.floor((g.market.tick - 1) / TPD);
    expect(openIpos(g, BUYER_A, day).find((r) => r.companyId === c.id)).toBeUndefined();
  });
});

describe('funds: opening, holdings, and the manager console', () => {
  it('a player below Operator is refused with the rank rule; an R3 account with the stake is cleared', () => {
    const g = fundWorld('exchange-open-1');
    ageAll(g);
    expect(openingRefusal(g, MGR)).toBeNull();
    expect(openingRefusal(g, INV)).toBe('fundRank');
  });

  it('the holdings show the viewer\'s own money, and the investor limit is 25% of net worth', () => {
    const g = fundWorld('exchange-hold-1');
    ageAll(g);
    expect(applyCommand(g, MGR, { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000 }).ok).toBe(true);
    const fundId = Object.keys(g.funds!.funds)[0]!;
    expect(applyCommand(g, INV, { type: 'fund.deposit', fundId, amount: 50_000 }).ok).toBe(true);
    const rows = holdingsOf(g, INV);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pendingDeposit).toBe(50_000);
    expect(rows[0]!.units).toBe(0);
    expect(rows[0]!.investorLimit).toBeCloseTo(0.25 * netWorthBreakdown(g, INV).total, 6);
    // the manager's console is his own, and nobody else's
    expect(managedView(g, MGR)?.name).toBe('Harbour Fund');
    expect(managedView(g, INV)).toBeNull();
  });

  it('the public funds carry no investor list and no holder units', () => {
    const g = fundWorld('exchange-public-1');
    ageAll(g);
    applyCommand(g, MGR, { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000 });
    const fundId = Object.keys(g.funds!.funds)[0]!;
    applyCommand(g, INV, { type: 'fund.deposit', fundId, amount: 50_000 });
    const json = JSON.stringify(exchangeView(g, INV).funds);
    expect(json).not.toContain('holders');
    expect(json).not.toContain('reserved');
    expect(json).not.toContain('inv_view');
    expect(json).toContain('navHistory');
  });

  it('a player who manages no fund sees no console, and the manager sees the stake and the floor', () => {
    const g = fundWorld('exchange-console-1');
    ageAll(g);
    applyCommand(g, MGR, { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000 });
    const m = managedView(g, MGR)!;
    expect(m.stake).toBeCloseTo(300_000, 0);
    expect(m.stakeFloor).toBeGreaterThanOrEqual(250_000);
    expect(m.frozen).toBe(false);
    expect(m.breakerRemainingTicks).toBe(0);
    expect(m.windDownRemainingTicks).toBeNull();
    expect(m.pendingMandate).toBeNull();
  });

  it('a mandate change shows its notice in ticks left', () => {
    const g = fundWorld('exchange-mandate-1');
    ageAll(g);
    applyCommand(g, MGR, { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000 });
    const fundId = Object.keys(g.funds!.funds)[0]!;
    expect(applyCommand(g, MGR, { type: 'fund.mandate', fundId, mandate: { ...MANDATE, classes: ['stock'] } }).ok).toBe(true);
    const m = managedView(g, MGR)!;
    expect(m.pendingMandate?.mandate.classes).toEqual(['stock']);
    expect(m.pendingMandate!.remainingTicks).toBe(24 * 720);
  });

  it('the manager console dates each filing in game days, not ticks', () => {
    const g = fundWorld('exchange-console-day');
    ageAll(g);
    applyCommand(g, MGR, { type: 'fund.create', name: 'Harbour Fund', mandate: MANDATE, fees: { mgmt: 0.02, perf: 0.2 }, stake: 300_000 });
    const f = Object.values(fundsOf(g).funds)[0]!;
    f.filings.push({ assetId: 'AAA', tick: 3 * TPD + 5, pct: 0.1 });
    const m = managedView(g, MGR)!;
    expect(m.filings).toHaveLength(1);
    expect(m.filings[0]!.day).toBe(3);
    expect(m.filings[0]!.tick).toBe(3 * TPD + 5);
  });

  it('the day of a tick, and the fee form\'s percent and fraction, convert one way each', () => {
    expect(dayOfTick(1)).toBe(0);
    expect(dayOfTick(TPD)).toBe(0);
    expect(dayOfTick(TPD + 1)).toBe(1);
    expect(dayOfTick(0)).toBe(0);
    expect(feeFractionOf(2)).toBeCloseTo(0.02, 12);
    expect(feePercentOf(0.2)).toBeCloseTo(20, 9);
    const r = fundRules();
    expect(r.mgmtFeeMaxPct).toBeCloseTo(r.mgmtFeeMax * 100, 9);
    expect(r.perfFeeMaxPct).toBeCloseTo(r.perfFeeMax * 100, 9);
  });

  it('the Exchange view rides on the player view', () => {
    const g = fundWorld('exchange-pv-1');
    ageAll(g);
    const v = playerView(g, MGR)!;
    expect(v.exchange.rules.minDeposit).toBeGreaterThan(0);
    expect(v.exchange.opening.refusal).toBeNull();
  });
});
