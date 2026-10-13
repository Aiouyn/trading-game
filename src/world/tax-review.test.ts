import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD, bizDef, credit, transfer } from './core';
import { ledgerOf } from './ledger';
import { recordGift, linkedAccounts } from './collusion';
import { rankBasisOf, taxBasisOf } from './social';
import { stabilizerDay } from './boards';
import { managerPrepayCost } from './shopRules';
import { wellRunCommands } from './shops';
import { BUSINESSES } from '@/content/businesses';
import { DEFAULT_TAX_BRACKETS, TAX_SHIFT_MAX } from '@/content/tax';
import type { Deal, GameState } from './types';

// R-9-10 review fixes: the owner-group tax basis (a gift or a loan cannot move a shop to a lower bracket), the settlement of a
// business sold partway through a day, the manager prepay in the day's taxable net, and the stabilizer shift that never goes
// stale and is not written into a business-free save.

function world(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (const [pid, handle] of [['u1', 'taxa'], ['u2', 'taxb']] as const) {
    const r = applyCommand(g, pid, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
    g.players[pid]!.onboarding.skipped = true;
  }
  credit(g, 'u1', 400_000, 'calibration');
  for (let k = 0; k < 12; k++) stepGame(g);
  return g;
}

/** Buys a tier-1 food shop for `pid` at the well-run settings (a positive day net). */
function buyWellRun(g: GameState, pid: string): string {
  const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
  const r = applyCommand(g, pid, { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
  if (!r.ok) throw new Error(r.error);
  const id = (r.data as { id: string }).id;
  for (const c of wellRunCommands(id)) applyCommand(g, pid, c);
  return id;
}

function toNextClose(g: GameState): void {
  do stepGame(g); while (g.market.tick % TPD !== 0);
}

/** Steps to the first tick of a game day (tick % TPD === 1), so an action taken now belongs to the day whose close comes next. */
function toDayStart(g: GameState): void {
  do stepGame(g); while (g.market.tick % TPD !== 1);
}

function cardOf(g: GameState, pid: string) {
  const day = Math.floor((g.market.tick - 1) / TPD);
  return ledgerOf(g, pid)!.days[day]!;
}

describe('the owner-group tax basis', () => {
  it('a shop bought with a gift is taxed at the wealth it adds, not at the rank basis (which drops the gift)', () => {
    const g = world('tax-review-gift');
    transfer(g, 'u1', 'u2', 300_000);
    recordGift(g, 'u1', 'u2');
    g.players.u2!.giftsNet = 300_000;
    const id = buyWellRun(g, 'u2');
    for (let k = 0; k < 12; k++) stepGame(g);
    expect(rankBasisOf(g, g.players.u2!)).toBeLessThan(DEFAULT_TAX_BRACKETS[1]![0]);
    expect(taxBasisOf(g, 'u2')).toBeGreaterThanOrEqual(DEFAULT_TAX_BRACKETS[1]![0]);
    toNextClose(g);
    const card = cardOf(g, 'u2');
    expect(card.biz!.rate).toBe(0.1);
    expect(g.businesses[id]!.ownerId).toBe('u2');
  });

  it('linked accounts share one owner-group basis, and a gift between them moves no bracket', () => {
    const g = world('tax-review-group');
    recordGift(g, 'u1', 'u2');
    recordGift(g, 'u1', 'u2');
    expect(linkedAccounts(g, 'u1')).toEqual(['u1', 'u2']);
    g.players.u1!.markNetWorth = 400_000;
    g.players.u2!.markNetWorth = 0;
    const before = taxBasisOf(g, 'u1');
    expect(before).toBe(400_000);
    expect(taxBasisOf(g, 'u2')).toBe(before);
    transfer(g, 'u1', 'u2', 150_000);
    // the next mark holds the moved cash in each account
    g.players.u1!.markNetWorth = 250_000;
    g.players.u2!.markNetWorth = 150_000;
    expect(taxBasisOf(g, 'u1')).toBe(before);
    expect(taxBasisOf(g, 'u2')).toBe(before);
  });

  it('an unlinked account is alone in its basis (one gift does not link accounts; the residual is recorded in 9B.4c)', () => {
    const g = world('tax-review-unlinked');
    recordGift(g, 'u1', 'u2');
    expect(linkedAccounts(g, 'u1')).toEqual(['u1']);
    g.players.u1!.markNetWorth = 250_000;
    g.players.u2!.markNetWorth = 150_000;
    expect(taxBasisOf(g, 'u1')).toBe(250_000);
    expect(taxBasisOf(g, 'u2')).toBe(150_000);
  });

  it('a loan from outside the group is the lender receivable, and is not taken off the borrower', () => {
    const g = world('tax-review-loan');
    g.players.u1!.markNetWorth = 400_000;
    g.players.u2!.markNetWorth = 200_000;
    const loan = {
      id: 'd1', kind: 'loan', fromId: 'u1', toId: 'u2', amount: 200_000, rate: 0, termDays: 30, status: 'active',
      createdTick: g.market.tick, paid: 0, note: '', outstanding: 200_000,
    } as unknown as Deal;
    g.deals.d1 = loan;
    expect(taxBasisOf(g, 'u1')).toBe(600_000);
    expect(taxBasisOf(g, 'u2')).toBe(200_000);
  });
});

describe('a business sold partway through a game day', () => {
  it('settles and taxes the part of the day it ran, before the sale leaves the owner', () => {
    const g = world('tax-review-sale');
    const id = buyWellRun(g, 'u1');
    toNextClose(g);
    for (let k = 0; k < 100; k++) stepGame(g);
    const b = g.businesses[id]!;
    const earned = b.earned - b.shop.earnedMark;
    expect(earned).toBeGreaterThan(0);
    const before = g.economy.sinks.businessTax ?? 0;
    const r = applyCommand(g, 'u1', { type: 'biz.sell', bizId: id });
    expect(r.ok).toBe(true);
    const tax = (g.economy.sinks.businessTax ?? 0) - before;
    expect(tax).toBeGreaterThan(0);
    // the taxable part is at most its gross income (the costs of the part are charged on top), at the 10% bracket
    expect(tax / 0.1).toBeLessThanOrEqual(earned + 0.01);
  });
});

describe('the manager prepay on the day it is paid', () => {
  it('the day taxable net is after the prepay, and the card shows it', () => {
    const g = world('tax-review-prepay');
    const id = buyWellRun(g, 'u1');
    toDayStart(g);
    const r = applyCommand(g, 'u1', { type: 'biz.manager.hire', bizId: id, stars: 1 });
    expect(r.ok).toBe(true);
    toNextClose(g);
    const b = g.businesses[id]!;
    const prepay = managerPrepayCost(1, bizDef(b).income);
    const net = b.shop.net[b.shop.net.length - 1]!;
    expect(cardOf(g, 'u1').biz!.net).toBeCloseTo(net - prepay, 2);
  });
});

describe('the stabilizer tax shift', () => {
  it('a business-free save never gets a taxShift key', () => {
    const g = world('tax-review-free');
    for (const id of Object.keys(g.businesses)) delete g.businesses[id];
    g.economy.stabilizer.hist = [1, 1, 1, 1, 1, 1, 1];
    stabilizerDay(g);
    expect('taxShift' in g.economy.stabilizer).toBe(false);
  });

  it('with a business, the shift follows the error while engaged, is clamped to 5 points, and is never stale', () => {
    const g = world('tax-review-shift');
    buyWellRun(g, 'u1');
    g.economy.stabilizer.hist = [1, 1, 1, 1, 1, 1, 1];
    stabilizerDay(g);
    expect(g.economy.stabilizer.sinkMult).toBeGreaterThan(1);
    expect(g.economy.stabilizer.taxShift).toBe(TAX_SHIFT_MAX);
    // the window is not full again: the controller does not run, and the shift is zero, not the old value
    g.economy.stabilizer.hist = [];
    stabilizerDay(g);
    expect(g.economy.stabilizer.taxShift).toBe(0);
  });

  it('a save that has lost its last business clears the shift', () => {
    const g = world('tax-review-clear');
    buyWellRun(g, 'u1');
    g.economy.stabilizer.taxShift = 0.03;
    for (const id of Object.keys(g.businesses)) delete g.businesses[id];
    stabilizerDay(g);
    expect('taxShift' in g.economy.stabilizer).toBe(false);
  });
});
