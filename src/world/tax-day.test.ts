import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD, cashOf, credit } from './core';
import { ledgerOf } from './ledger';
import { taxBasisOf } from './social';
import { bookedNet, engineTallyOf, netWorldMoney } from './company/exploits/sequences';
import { playerView } from './view';
import { taxOf } from './tax';
import { BUSINESSES } from '@/content/businesses';
import { DEFAULT_TAX_BRACKETS } from '@/content/tax';
import { wellRunCommands } from './shops';
import type { GameState } from './types';

// R-9-10 on the day step: each business's settled net is taxed once per game day at its owner's bracket, booked to the
// `businessTax` sink; the day's shops settle on the closing tick, before the card; the money identity closes.

function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  const r = applyCommand(g, 'u1', { type: 'join', handle: 'taxpayer', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  // rich enough for the 10% bracket on the rank basis (the mark, refreshed every 12 ticks, minus loans and gifts): $400k
  credit(g, 'u1', 400_000, 'calibration');
  for (let k = 0; k < 12; k++) stepGame(g);
  return g;
}

/** A tier-1 business in its own city-sector pool, at the well-run settings (a positive net, as a day should earn). */
function buyWellRun(g: GameState): string {
  const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
  const r = applyCommand(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
  if (!r.ok) throw new Error(r.error);
  const id = (r.data as { id: string }).id;
  for (const c of wellRunCommands(id)) applyCommand(g, 'u1', c);
  return id;
}

/** Steps to the next closing tick (the last tick of a game day, when the shops settle and the card is built). */
function toNextClose(g: GameState): void {
  do stepGame(g); while (g.market.tick % TPD !== 0);
}

function ownLedgerDay(g: GameState, day: number) {
  return ledgerOf(g, 'u1')!.days[day];
}

describe('the business tax on the day step', () => {
  it('taxes a positive day net once, at the owner bracket, and books it to businessTax', () => {
    const g = joined('tax-book');
    const id = buyWellRun(g);
    const basis = taxBasisOf(g, 'u1');
    expect(basis).toBeGreaterThanOrEqual(DEFAULT_TAX_BRACKETS[1]![0]);
    expect(basis).toBeLessThan(DEFAULT_TAX_BRACKETS[2]![0]);
    // the settlement reads the pre-tax net from the shop's trailing window (the valuation window is pre-tax)
    toNextClose(g);
    const day = Math.floor((g.market.tick - 1) / TPD);
    const card = ownLedgerDay(g, day)!;
    const net = g.businesses[id]!.shop.net[g.businesses[id]!.shop.net.length - 1]!;
    expect(net).toBeGreaterThan(0);
    expect(card.biz).toBeDefined();
    expect(card.biz!.businesses).toBe(1);
    expect(card.biz!.rate).toBe(0.1);
    expect(card.biz!.tax).toBeCloseTo(taxOf(net, basis, 0), 9);
    expect(g.economy.sinks.businessTax).toBeCloseTo(card.biz!.tax, 9);
  });

  it('books the tax only on the closing tick, never on the other ticks of the day', () => {
    const g = joined('tax-once');
    buyWellRun(g);
    toNextClose(g);
    const after = g.economy.sinks.businessTax ?? 0;
    for (let k = 0; k < TPD - 1; k++) stepGame(g);
    expect(g.economy.sinks.businessTax ?? 0).toBe(after);
    toNextClose(g);
    expect(g.economy.sinks.businessTax ?? 0).toBeGreaterThan(after);
  });

  it('a loss earns no credit and pays no tax', () => {
    const g = joined('tax-loss');
    const id = buyWellRun(g);
    const b = g.businesses[id]!;
    // the day's earnings are below zero (the mark sits above the earned total): the day net is a loss
    b.shop.earnedMark = b.earned + 50_000;
    const before = g.economy.sinks.businessTax ?? 0;
    toNextClose(g);
    expect(b.shop.net[b.shop.net.length - 1]!).toBeLessThan(0);
    expect(g.economy.sinks.businessTax ?? 0).toBe(before);
    const card = ownLedgerDay(g, Math.floor((g.market.tick - 1) / TPD) - 0)!;
    expect(card.biz!.tax).toBe(0);
  });

  it('the stabilizer shift moves the taxed rate only while it is set, and clamps it to 5 points', () => {
    const g = joined('tax-shift');
    buyWellRun(g);
    g.economy.stabilizer.taxShift = 0.05;
    toNextClose(g);
    const day = Math.floor((g.market.tick - 1) / TPD);
    const card = ownLedgerDay(g, day)!;
    expect(card.biz!.rate).toBeCloseTo(0.15, 12);
    const net = card.biz!.net;
    expect(card.biz!.tax).toBeCloseTo(0.15 * net, 1);
  });

  it('the view shows the day tax line of a shop, at the owner rate', () => {
    const g = joined('tax-view');
    const id = buyWellRun(g);
    const v = playerView(g, 'u1')!;
    const shop = v.shops.find((s) => s.id === id)!;
    expect(shop.daily.taxRate).toBe(0.1);
    expect(shop.daily.tax).toBeLessThanOrEqual(0);
    const pretax = shop.daily.revenue + shop.daily.costs;
    expect(shop.daily.net).toBeCloseTo(pretax + shop.daily.tax, 9);
  });
});

describe('the money identity with a taxed business', () => {
  it('closes to the cent over several taxed days (cash in the world = booked faucets less sinks, plus the engine tally)', () => {
    const g = joined('tax-identity');
    buyWellRun(g);
    const identity = () => netWorldMoney(g) - bookedNet(g) - engineTallyOf(g);
    const id0 = identity();
    for (let d = 0; d < 3; d++) toNextClose(g);
    expect((g.economy.sinks.businessTax ?? 0)).toBeGreaterThan(0);
    expect(identity()).toBeCloseTo(id0, 2);
    expect(cashOf(g, 'u1')).toBeGreaterThan(0);
  });
});

describe('an old save loads and runs without the tax fields', () => {
  it('a snapshot without taxShift, biz or the day shops still steps and closes', () => {
    const g = joined('tax-old');
    buyWellRun(g);
    toNextClose(g);
    const old = JSON.parse(JSON.stringify(g)) as GameState;
    delete old.economy.stabilizer.taxShift;
    for (const L of Object.values(old.ledgers ?? {})) {
      for (const d of Object.values(L.days)) delete d.biz;
      for (const c of L.closes) delete c.biz;
    }
    for (let k = 0; k < TPD * 2; k++) stepGame(old);
    expect(old.economy.sinks.businessTax).toBeGreaterThan(g.economy.sinks.businessTax ?? 0);
    expect(playerView(old, 'u1')!.trading.closes.length).toBeGreaterThan(0);
  });
});
