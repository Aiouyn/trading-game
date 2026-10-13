import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { dayClose, recordDayClose } from './close';
import { GPU_TIERS, TPD, bump, netWorthBreakdown, today } from './core';
import { valuationAndIncome } from './ledger';
import { textProvider } from './text';
import { PROPERTY_FEE, propertyPrice } from './assets';
import { BUSINESSES } from '@/content/businesses';
import { LIFE_ITEMS, PROPERTY_TYPES, RANKS, resaleValue, rankIndex } from '@/content/lifestyle';
import { CITIES } from '@/engine';
import type { GameState } from './types';
import type { DailyClose, DayRecord } from './ledger-types';

/** A joined player, run past a few closes, with cash to spend. */
function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = applyCommand(g, 'u1', { type: 'join', handle: 'buyer', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  while (g.market.tick < 3 * TPD) stepGame(g);
  bump(g, 'u1', 500_000);
  return g;
}

/** The stored facts of one close for the player, as the close writes them (the market record is taken alongside). */
function recordOf(g: GameState, day: number): DayRecord {
  const p = g.players.u1!;
  const v = valuationAndIncome(g, 'u1');
  return {
    day, nw: netWorthBreakdown(g, 'u1').total, equity: 0, qty: {}, ghosts: { basket: 0, random: 0, momentum: 0 },
    ext: p.externalCash ?? 0, val: v.val, inc: v.inc, flow: p.assetFlow ?? 0,
  };
}

/** Closes day 1, runs `act` during day 2, closes day 2, and returns day 2's card. */
function cardAround(g: GameState, act: () => void): DailyClose {
  const L = g.ledgers!.u1!;
  recordDayClose(g, 1, g.market.tick);
  L.days[1] = recordOf(g, 1);
  act();
  recordDayClose(g, 2, g.market.tick);
  L.days[2] = recordOf(g, 2);
  const card = dayClose(g, 'u1', 2);
  if (!card) throw new Error('no card');
  return card;
}

function expectSplitSums(card: DailyClose): void {
  expect(card.trading + card.valuation + card.income + card.tax).toBeCloseTo(card.nwChange, 6);
}

describe('the first close after joining: the join record is the open of the day, so it carries the assetFlow baseline', () => {
  it('a shop bought on the day the player joins reads as trading 0 and valuation 0 at that day close', () => {
    const g = createGame('conv-first-day', { warmupDays: 1, npcs: false });
    for (let k = 0; k < 10; k++) stepGame(g);
    const r = applyCommand(g, 'u1', { type: 'join', handle: 'buyer', country: 'AV' });
    if (!r.ok) throw new Error(r.error);
    g.players.u1!.onboarding.skipped = true;
    const day = today(g);
    const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
    const buy = applyCommand(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
    expect(buy.ok).toBe(true);
    // the join wrote the open record of this day (day - 1); the day's own close writes the day, and the card reads both
    while (!g.ledgers!.u1!.days[day]) stepGame(g);
    const card = dayClose(g, 'u1', day);
    if (!card) throw new Error('no card');
    expect(card.valuation).toBeCloseTo(0, 6);
    expect(card.trading).toBeCloseTo(0, 6);
    expectSplitSums(card);
  });
});

describe('a purchase is a conversion of cash into holdings: it is neither trading nor valuation', () => {
  it('a shop bought at cost reads as trading 0 and valuation 0, and the split still sums to the change', () => {
    const g = joined('conv-shop');
    const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
    const card = cardAround(g, () => {
      const r = applyCommand(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
      expect(r.ok).toBe(true);
    });
    expect(card.nwChange).toBeCloseTo(0, 6);
    expect(card.valuation).toBeCloseTo(0, 6);
    expect(card.trading).toBeCloseTo(0, 6);
    expectSplitSums(card);
    // the headline reads trading, which is flat: the purchase is not a rough day
    expect(textProvider.dailyClose(card).find((m) => m.key.startsWith('txt.narr.head.'))?.key).toMatch(/^txt\.narr\.head\.flat\.\d+$/);
  });

  it('a property bought pays only its fee in trading: the price it bought is not a loss and not a gain', () => {
    const g = joined('conv-property');
    g.players.u1!.rankId = RANKS[RANKS.length - 1]!.id;
    const city = CITIES.find((c) => c.id === 'avalon')!;
    const dist = city.districts[0]!;
    const type = PROPERTY_TYPES.find((t) => t.tiers.includes(dist.tier))!;
    const price = propertyPrice(g, 'avalon', dist.id, type.id);
    const card = cardAround(g, () => {
      const r = applyCommand(g, 'u1', { type: 'prop.buy', cityId: 'avalon', districtId: dist.id, typeId: type.id, ltv: 0 });
      expect(r.ok).toBe(true);
    });
    expect(card.valuation).toBeCloseTo(0, 6);
    expect(card.trading).toBeCloseTo(-price * PROPERTY_FEE, 6);
    expect(card.nwChange).toBeCloseTo(card.trading, 6);
    expectSplitSums(card);
  });

  it('a lifestyle item bought is trading 0: its drop from the price to its resale value the moment it is bought is a re-mark', () => {
    const g = joined('conv-life');
    g.players.u1!.rankId = RANKS[RANKS.length - 1]!.id;
    const item = LIFE_ITEMS.find((i) => i.cls === 'mass' && rankIndex(i.rank) <= rankIndex(g.players.u1!.rankId))!;
    const resale = resaleValue(item, item.price, 0, g.collectibles);
    const card = cardAround(g, () => {
      const r = applyCommand(g, 'u1', { type: 'life.buy', itemId: item.id });
      expect(r.ok).toBe(true);
    });
    expect(card.trading).toBeCloseTo(0, 6);
    expect(card.valuation).toBeCloseTo(resale - item.price, 6);
    expect(card.nwChange).toBeCloseTo(resale - item.price, 6);
    expectSplitSums(card);
  });

  it('a GPU bought is trading 0: its drop from the price to its 60% resale value is a re-mark', () => {
    const g = joined('conv-gpu');
    g.players.u1!.rankId = RANKS[RANKS.length - 1]!.id;
    const tier = GPU_TIERS[0]!;
    const card = cardAround(g, () => {
      const r = applyCommand(g, 'u1', { type: 'lab.gpu', tier: tier.id, qty: 1 });
      expect(r.ok).toBe(true);
    });
    expect(card.trading).toBeCloseTo(0, 6);
    expect(card.valuation).toBeCloseTo(-tier.price * 0.4, 6);
    expect(card.nwChange).toBeCloseTo(-tier.price * 0.4, 6);
    expectSplitSums(card);
  });

  it('an experience used up is a cost in income and costs, never trading or valuation', () => {
    const g = joined('conv-experience');
    g.players.u1!.rankId = RANKS[RANKS.length - 1]!.id;
    const item = LIFE_ITEMS.find((i) => i.cls === 'consumed' && i.category !== 'philanthropy' && rankIndex(i.rank) <= rankIndex(g.players.u1!.rankId))!;
    const card = cardAround(g, () => {
      const r = applyCommand(g, 'u1', { type: 'life.buy', itemId: item.id });
      expect(r.ok).toBe(true);
    });
    expect(card.trading).toBeCloseTo(0, 6);
    expect(card.valuation).toBeCloseTo(0, 6);
    expect(card.income).toBeCloseTo(-item.price, 6);
    expectSplitSums(card);
  });

  it('selling a shop takes its book value out of valuation: the sale is not a gain of its whole price', () => {
    const g = joined('conv-sell');
    const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
    const r = applyCommand(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' });
    expect(r.ok).toBe(true);
    const bizId = (r.data as { id: string }).id;
    const card = cardAround(g, () => {
      const s = applyCommand(g, 'u1', { type: 'biz.sell', bizId });
      expect(s.ok).toBe(true);
    });
    expect(card.valuation).toBeCloseTo(0, 6);
    // the sale price is 70% of the cost: the 30% haircut is the day's trading result, never the price itself
    expect(card.trading).toBeLessThan(0);
    expect(card.trading).toBeGreaterThan(-def.cost);
    expectSplitSums(card);
  });
});
