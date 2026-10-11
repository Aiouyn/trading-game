import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { AUCTION, auctionTick, auctionsView, lotKeyOf, minimumBid, placeBid, priceLot, weekLots } from './auctions';
import { creditExternal, debit } from './core';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import { LIFE_BY_ID } from '@/content/lifestyle';
import type { GameState } from './types';

const WEEK = 0;
const HOUR = AUCTION.hourTicks;
const OPEN = WEEK * TOURNAMENT_WEEK_TICKS;
const cents = (x: number) => Math.round(x * 100) / 100;

/** A world with three players at the top rank and ample cash to bid. */
function world(): { g: GameState; a: string; b: string; c: string } {
  const g = createGame('auction-test', { warmupDays: 1, npcs: false });
  const ids = ['p-a', 'p-b', 'p-c'];
  for (const id of ids) {
    applyCommand(g, id, { type: 'join', handle: id.replace('p-', 'bidder_'), country: 'XX' });
    g.players[id]!.rankId = 'R5';
    creditExternal(g, id, 5_000_000_000, 'test grant');
  }
  g.market = { ...g.market, tick: 100 };
  return { g, a: ids[0]!, b: ids[1]!, c: ids[2]! };
}

/** The cheapest lot of the week: its reserve and opening bid are the test's terms. */
function cheapestLot(g: GameState, week = WEEK) {
  const item = [...weekLots(g.seed, week)].sort((x, y) => x.price - y.price)[0]!;
  return { key: lotKeyOf(week, item.id), item, ...priceLot(g, item) };
}

const sinkSum = (g: GameState) => ['auction consignor', 'auction seller fee', 'auction buyer premium'].reduce((s, k) => s + (g.economy.sinks[k] ?? 0), 0);

describe('auction lots', () => {
  it('offers 3 to 5 limited or unique collectibles, the same for the same seed and week', () => {
    const lots = weekLots('auction-test', WEEK);
    expect(lots.length).toBeGreaterThanOrEqual(AUCTION.lotsMin);
    expect(lots.length).toBeLessThanOrEqual(AUCTION.lotsMax);
    for (const l of lots) expect(['limited', 'unique']).toContain(l.cls);
    expect(weekLots('auction-test', WEEK).map((l) => l.id)).toEqual(lots.map((l) => l.id));
  });

  it('prices the reserve from the collectibles index and opens at half of it', () => {
    const { g } = world();
    const item = LIFE_BY_ID.get(weekLots(g.seed, WEEK)[0]!.id)!;
    g.collectibles = 2;
    const { reserve, start } = priceLot(g, item);
    expect(reserve).toBe(cents(item.price * 2 * AUCTION.reserveShare));
    expect(start).toBe(cents(reserve * AUCTION.openShare));
  });

  it('refuses a bid before the week opens, and on a lot that is not on offer', () => {
    const { g, a } = world();
    const { item } = cheapestLot(g, 1);
    expect(placeBid(g, a, lotKeyOf(1, item.id), 1).ok).toBe(false);
    expect(placeBid(g, a, '0:not-a-lot', 1).ok).toBe(false);
  });
});

describe('auction bids', () => {
  it('opens at the opening bid, then raises by at least 2% over the high bid', () => {
    const { g, a, b } = world();
    const { key, start } = cheapestLot(g);
    expect(placeBid(g, a, key, start / 2).ok).toBe(false);
    expect(placeBid(g, a, key, start).ok).toBe(true);
    expect(placeBid(g, b, key, start).ok).toBe(false);
    expect(minimumBid(g.auctions!.lots[key]!)).toBe(cents(start * (1 + AUCTION.minRaise)));
    expect(placeBid(g, b, key, cents(start * (1 + AUCTION.minRaise))).ok).toBe(true);
  });

  it('needs the spendable cash for the bid plus the buyer premium', () => {
    const { g, a } = world();
    const { key, start } = cheapestLot(g);
    g.market.accounts[a] = { ...g.market.accounts[a]!, cash: start * 0.5 };
    expect(placeBid(g, a, key, start).ok).toBe(false);
  });

  it('extends the lot by 2 real minutes when a bid lands in its last 2 real minutes, and not otherwise', () => {
    const { g, a, b } = world();
    const { key, start } = cheapestLot(g);
    g.market = { ...g.market, tick: OPEN + 10 };
    placeBid(g, a, key, start);
    expect(g.auctions!.lots[key]!.endTick).toBe(OPEN + HOUR);
    // 30 ticks before the end is outside the snipe window: no extension
    g.market = { ...g.market, tick: OPEN + HOUR - 30 };
    placeBid(g, b, key, minimumBid(g.auctions!.lots[key]!));
    expect(g.auctions!.lots[key]!.endTick).toBe(OPEN + HOUR);
    // 10 ticks before the end is inside it: the lot runs 24 ticks longer
    g.market = { ...g.market, tick: OPEN + HOUR - 10 };
    expect(placeBid(g, a, key, minimumBid(g.auctions!.lots[key]!)).ok).toBe(true);
    expect(g.auctions!.lots[key]!.endTick).toBe(OPEN + HOUR + AUCTION.snipeExtendTicks);
  });

  it('refuses a bid after the lot has ended', () => {
    const { g, a } = world();
    const { key, start } = cheapestLot(g);
    placeBid(g, a, key, start);
    g.market = { ...g.market, tick: g.auctions!.lots[key]!.endTick };
    expect(placeBid(g, a, key, start * 4).ok).toBe(false);
  });
});

describe('auction settlement and money', () => {
  it('books the buyer premium, the seller fee and the consignor share to the cent, and moves the item', () => {
    const { g, a, b } = world();
    const { key, reserve } = cheapestLot(g);
    placeBid(g, a, key, reserve);
    placeBid(g, b, key, cents(reserve * 1.1));
    const hammer = cents(reserve * 1.1);
    const premium = cents(hammer * AUCTION.premium);
    const fee = cents(hammer * AUCTION.sellerFee);
    const cashBefore = g.market.accounts[b]!.cash;
    const faucetsBefore = JSON.stringify(g.economy.faucets);
    const sinksBefore = sinkSum(g);
    g.market = { ...g.market, tick: g.auctions!.lots[key]!.endTick };
    auctionTick(g, null);
    const lot = g.auctions!.lots[key]!;
    expect(lot.status).toBe('sold');
    expect(lot.winnerId).toBe(b);
    expect(lot.hammer).toBe(hammer);
    expect(lot.premium).toBe(premium);
    expect(lot.fee).toBe(fee);
    const pay = cents(hammer + premium);
    expect(cents(cashBefore - g.market.accounts[b]!.cash)).toBe(pay);
    // every movement is a sink: the three sinks grew by exactly what the winner paid
    expect(cents(sinkSum(g) - sinksBefore)).toBe(pay);
    expect(JSON.stringify(g.economy.faucets)).toBe(faucetsBefore);
    expect(g.players[b]!.lifestyle.some((o) => o.itemId === lot.itemId && o.paid === hammer)).toBe(true);
  });

  it('leaves the losing bidder\'s cash untouched', () => {
    const { g, a, b } = world();
    const { key, reserve } = cheapestLot(g);
    placeBid(g, a, key, reserve);
    placeBid(g, b, key, cents(reserve * 1.1));
    const cashA = g.market.accounts[a]!.cash;
    g.market = { ...g.market, tick: g.auctions!.lots[key]!.endTick };
    auctionTick(g, null);
    expect(g.market.accounts[a]!.cash).toBe(cashA);
  });

  it('sells nothing and moves no money when no bid meets the reserve', () => {
    const { g, a } = world();
    const { key, start } = cheapestLot(g);
    placeBid(g, a, key, start);
    const sinks = sinkSum(g);
    const cash = g.market.accounts[a]!.cash;
    g.market = { ...g.market, tick: g.auctions!.lots[key]!.endTick };
    auctionTick(g, null);
    expect(g.auctions!.lots[key]!.status).toBe('unsold');
    expect(sinkSum(g)).toBe(sinks);
    expect(g.market.accounts[a]!.cash).toBe(cash);
  });

  it('passes over a high bidder who spent the cash before the close, to the next valid bid', () => {
    const { g, a, b } = world();
    const { key, reserve } = cheapestLot(g);
    placeBid(g, b, key, reserve);
    placeBid(g, a, key, cents(reserve * 1.1));
    // the high bidder spends everything before the lot ends
    debit(g, a, g.market.accounts[a]!.cash - 1, 'test spend');
    g.market = { ...g.market, tick: g.auctions!.lots[key]!.endTick };
    auctionTick(g, null);
    expect(g.auctions!.lots[key]!.winnerId).toBe(b);
    expect(g.auctions!.lots[key]!.hammer).toBe(reserve);
  });
});

describe('auction view', () => {
  it('shows the high bid and the count during the auction, and the bidders only at the end', () => {
    const { g, a, b } = world();
    const { key, reserve } = cheapestLot(g);
    placeBid(g, a, key, reserve);
    placeBid(g, b, key, cents(reserve * 1.1));
    const during = auctionsView(g, a, WEEK).find((x) => x.key === key)!;
    expect(during.status).toBe('open');
    expect(during.high).toBe(cents(reserve * 1.1));
    expect(during.bidCount).toBe(2);
    expect(during.reserveMet).toBe(true);
    expect(during.bidders).toBeNull();
    expect(during.mine).toBe(true);
    expect(JSON.stringify(during)).not.toContain('bidder_');
    g.market = { ...g.market, tick: g.auctions!.lots[key]!.endTick };
    auctionTick(g, null);
    const after = auctionsView(g, a, WEEK).find((x) => x.key === key)!;
    expect(after.status).toBe('sold');
    expect(after.winner).toBe('bidder_b');
    expect([...after.bidders!].sort()).toEqual(['bidder_a', 'bidder_b']);
  });
});
