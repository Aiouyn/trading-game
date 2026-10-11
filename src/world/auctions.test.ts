import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { AUCTION, CONSIGNOR_ID, auctionTick, auctionsView, lotKeyOf, minimumBid, openTickOf, placeBid, priceLot, reserveFactor, weekLots } from './auctions';
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
  return { key: lotKeyOf(week, item.id), item, ...priceLot(g, item, week) };
}

/** The three sinks an auction books: the seller fee and the buyer premium (the consignor's share is a transfer). */
const sinkSum = (g: GameState) => ['auction seller fee', 'auction buyer premium'].reduce((s, k) => s + (g.economy.sinks[k] ?? 0), 0);

describe('auction lots', () => {
  it('offers 3 to 5 limited or unique collectibles, the same for the same seed and week', () => {
    const lots = weekLots('auction-test', WEEK);
    expect(lots.length).toBeGreaterThanOrEqual(AUCTION.lotsMin);
    expect(lots.length).toBeLessThanOrEqual(AUCTION.lotsMax);
    for (const l of lots) expect(['limited', 'unique']).toContain(l.cls);
    expect(weekLots('auction-test', WEEK).map((l) => l.id)).toEqual(lots.map((l) => l.id));
  });

  it('prices the opening bid from the collectibles index, and the reserve within a hidden band of it', () => {
    const { g } = world();
    const item = LIFE_BY_ID.get(weekLots(g.seed, WEEK)[0]!.id)!;
    g.collectibles = 2;
    const { reserve, start } = priceLot(g, item, WEEK);
    const value = item.price * 2;
    expect(start).toBe(cents(value * AUCTION.openShare));
    expect(reserve).toBeGreaterThanOrEqual(cents(value * AUCTION.reserveLow));
    expect(reserve).toBeLessThanOrEqual(cents(value * AUCTION.reserveHigh));
    const f = reserveFactor(g.seed, WEEK, item.id);
    expect(f).toBeGreaterThanOrEqual(AUCTION.reserveLow);
    expect(f).toBeLessThan(AUCTION.reserveHigh);
    expect(reserveFactor(g.seed, WEEK, item.id)).toBe(f);
  });

  it('refuses a bid before the week opens, and on a lot that is not on offer', () => {
    const { g, a } = world();
    const { item } = cheapestLot(g, 1);
    expect(placeBid(g, a, lotKeyOf(1, item.id), 1).ok).toBe(false);
    expect(placeBid(g, a, '0:not-a-lot', 1).ok).toBe(false);
  });
});

describe('auction no-reveal', () => {
  it('a first bid below the opening bid is refused with the public minimum only, and writes no lot', () => {
    const { g, a } = world();
    const { key, start, reserve } = cheapestLot(g);
    const r = placeBid(g, a, key, start / 2);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bidLow');
    expect(r.data).toEqual({ min: start });
    expect(JSON.stringify(r)).not.toContain(String(reserve));
    expect(g.auctions?.lots[key]).toBeUndefined();
  });

  it('a refused bid of any kind leaves the auction exactly as it was', () => {
    const { g, a } = world();
    const { key, start } = cheapestLot(g);
    const before = JSON.stringify(g.auctions ?? null);
    g.market.accounts[a] = { ...g.market.accounts[a]!, cash: start * 0.5 };
    expect(placeBid(g, a, key, start).error).toBe('bidCash');
    expect(JSON.stringify(g.auctions ?? null)).toBe(before);
  });

  it('a unique lot that someone already holds is not refused or marked to the bidder', () => {
    const { g, a, b } = world();
    const item = [...weekLots(g.seed, WEEK)].find((x) => x.cls === 'unique');
    if (!item) return;
    g.players[b]!.lifestyle.push({ uid: 'held', itemId: item.id, paid: 1, boughtTick: 0 });
    const key = lotKeyOf(WEEK, item.id);
    const { start } = priceLot(g, item, WEEK);
    expect(placeBid(g, a, key, start).ok).toBe(true);
    const view = auctionsView(g, a, WEEK).find((x) => x.key === key)!;
    expect(view.status).toBe('open');
    expect(JSON.stringify(view)).not.toContain('withdrawn');
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
    const consignorBefore = g.market.accounts[CONSIGNOR_ID]?.cash ?? 0;
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
    // the fee and the premium are sinks; the consignor's share (hammer less the fee) is a transfer, not a sink
    expect(cents(sinkSum(g) - sinksBefore)).toBe(cents(fee + premium));
    expect(cents(g.market.accounts[CONSIGNOR_ID]!.cash - consignorBefore)).toBe(cents(hammer - fee));
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
    // only after the settlement does the view say the reserve was not met
    expect(auctionsView(g, a, WEEK).find((x) => x.key === key)!.reserveMet).toBe(false);
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
    expect(during.reserveMet).toBeNull();
    expect(during.bidders).toBeNull();
    expect(during.mine).toBe(true);
    expect(JSON.stringify(during)).not.toContain('bidder_');
    g.market = { ...g.market, tick: g.auctions!.lots[key]!.endTick };
    auctionTick(g, null);
    const after = auctionsView(g, a, WEEK).find((x) => x.key === key)!;
    expect(after.status).toBe('sold');
    expect(after.reserveMet).toBe(true);
    expect(after.winner).toBe('bidder_b');
    expect([...after.bidders!].sort()).toEqual(['bidder_a', 'bidder_b']);
  });

  it('a probe ladder of 2% raises cannot recover the reserve: the open view is the same whatever the reserve', () => {
    // two copies of one auction, the same bids, each with another hidden reserve (the lot's reserve is set at the first bid)
    const run = (scale: number) => {
      const { g, a, b } = world();
      const { key, reserve, start } = cheapestLot(g);
      placeBid(g, a, key, start);
      g.auctions!.lots[key]!.reserve = cents(reserve * scale);
      const views: unknown[] = [];
      for (let step = 0; step < 60; step++) {
        const bidder = step % 2 === 0 ? b : a;
        const min = minimumBid(g.auctions!.lots[key]!);
        // a bid the probe may take: the minimum is always 2% over the last high bid, so the ladder climbs by the minimum raise
        expect(placeBid(g, bidder, key, min).ok).toBe(true);
        const v = auctionsView(g, a, WEEK).find((x) => x.key === key)!;
        expect(v.status).toBe('open');
        expect(v.reserveMet).toBeNull();
        views.push(v);
      }
      // the ladder crosses the reserve in both copies: the high bid is above it, which only the settlement may say
      expect(g.auctions!.lots[key]!.bids.at(-1)!.amount).toBeGreaterThan(cents(reserve * scale));
      return views;
    };
    const low = run(0.8);
    const high = run(1.1);
    expect(high).toEqual(low);
  });
});

describe('auction admin seam (admin.auctionOpen, e2e only)', () => {
  it('opens a later week at once with the ticks left, and the lots then take a snipe under the live rules', () => {
    const { g, a } = world();
    const W = 1;
    g.market = { ...g.market, tick: TOURNAMENT_WEEK_TICKS - 100 };
    const { key, start } = cheapestLot(g, W);
    // before the seam, week 1 has not opened
    expect(placeBid(g, a, key, start)).toEqual({ ok: false, error: 'auctionNotYet', data: { hours: 1 } });
    const opened = applyCommand(g, 'admin', { type: 'admin.auctionOpen', week: W, ticksLeft: 20 });
    expect(opened.ok).toBe(true);
    expect(auctionsView(g, a, W).find((x) => x.key === key)!.status).toBe('open');
    // a bid 20 ticks before the end is inside the snipe window: the lot runs 24 ticks longer
    const r = placeBid(g, a, key, start);
    expect(r.ok).toBe(true);
    expect(g.auctions!.lots[key]!.endTick).toBe(g.market.tick + 20 + AUCTION.snipeExtendTicks);
    // the seam only moves its own week: week 0 keeps its first tick
    expect(openTickOf(g, 0)).toBe(0);
  });

  it('opens with the full hour by default, and refuses a window of no ticks or more than an hour', () => {
    const { g } = world();
    g.market = { ...g.market, tick: TOURNAMENT_WEEK_TICKS * 2 + 50 };
    expect(applyCommand(g, 'admin', { type: 'admin.auctionOpen', week: 2 }).ok).toBe(true);
    expect(g.auctions!.openedAt!['2']).toBe(g.market.tick);
    expect(applyCommand(g, 'admin', { type: 'admin.auctionOpen', week: 3, ticksLeft: 0 })).toEqual({ ok: false, error: 'auctionOpenLeft' });
    expect(applyCommand(g, 'admin', { type: 'admin.auctionOpen', week: 3, ticksLeft: HOUR + 1 })).toEqual({ ok: false, error: 'auctionOpenLeft' });
  });
});
