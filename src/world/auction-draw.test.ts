import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { auctionTick, auctionsView, computeWeekLots, lotKeyOf, lotsOf, minimumBid, placeBid, priceLot, weekLots } from './auctions';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import { creditExternal } from './core';

// R-10-7 (review 4): the lots of an open week are not stored, so the draw must not change under a save that is already open.
// A new world draws per band from its first week. An older save (no auctionBandsFrom) keeps the draw it had for its current
// week, and the bands start the week after the first step.

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('the auction draw is pinned per save', () => {
  it('a new world draws per rank band from its first week', () => {
    const g = createGame('draw-new', { warmupDays: 1, npcs: false });
    expect(g.auctionBandsFrom).toBe(0);
    const week = Math.floor(g.market.tick / TOURNAMENT_WEEK_TICKS);
    expect(ids(lotsOf(g, week))).toEqual(ids(weekLots(g.seed, week, true)));
  });

  it('an older save keeps the open week on the old draw, and draws per band from the next week', () => {
    const g = createGame('draw-old', { warmupDays: 1, npcs: false });
    const week = Math.floor(g.market.tick / TOURNAMENT_WEEK_TICKS);
    delete g.auctionBandsFrom;
    const pinned = ids(lotsOf(g, week));
    expect(pinned).toEqual(ids(computeWeekLots(g.seed, week, false)));
    stepGame(g);
    expect(g.auctionBandsFrom).toBe(week + 1);
    expect(ids(lotsOf(g, week))).toEqual(pinned);
    expect(ids(lotsOf(g, week + 1))).toEqual(ids(weekLots(g.seed, week + 1, true)));
  });

  it('the band draw and the old draw differ for some week, so the pin is needed', () => {
    let differs = false;
    for (let w = 0; w < 20 && !differs; w++) {
      differs = ids(weekLots('draw-old', w, true)).join() !== ids(weekLots('draw-old', w, false)).join();
    }
    expect(differs).toBe(true);
  });

  it('migration at the last tick starts bands in the week about to open and survives a save round trip', () => {
    const g = createGame('draw-boundary', { warmupDays: 0, npcs: false });
    g.market.tick = TOURNAMENT_WEEK_TICKS - 1;
    delete g.auctionBandsFrom;
    const old = ids(lotsOf(g, 0));
    stepGame(g);
    expect(g.auctionBandsFrom).toBe(1);
    expect(ids(lotsOf(g, 0))).toEqual(old);
    expect(ids(lotsOf(g, 1))).toEqual(ids(weekLots(g.seed, 1, true)));
    const restored = JSON.parse(JSON.stringify(g));
    stepGame(restored);
    expect(restored.auctionBandsFrom).toBe(1);
    expect(ids(lotsOf(restored, 1))).toEqual(ids(lotsOf(g, 1)));
  });

  it('an old-only lot stays visible, accepts a raise after migration and settles normally', () => {
    const g = createGame('draw-old', { warmupDays: 0, npcs: false });
    expect(applyCommand(g, 'bidder', { type: 'join', handle: 'bidder_0', country: 'AV' }).ok).toBe(true);
    creditExternal(g, 'bidder', 5_000_000_000, 'test grant');
    g.players.bidder!.rankId = 'R6';
    delete g.auctionBandsFrom;
    const bandIds = ids(weekLots(g.seed, 0, true));
    const item = lotsOf(g, 0).find((x) => !bandIds.includes(x.id));
    expect(item, 'fixture must exercise a lot absent from the new draw').toBeDefined();
    const key = lotKeyOf(0, item!.id);
    expect(placeBid(g, 'bidder', key, priceLot(g, item!, 0).reserve).ok).toBe(true);
    stepGame(g);
    expect(auctionsView(g, 'bidder', 0).find((x) => x.key === key)?.bidCount).toBe(1);
    const lot = g.auctions!.lots[key]!;
    expect(placeBid(g, 'bidder', key, minimumBid(lot)).ok).toBe(true);
    g.market.tick = lot.endTick;
    auctionTick(g, null);
    expect(auctionsView(g, 'bidder', 0).find((x) => x.key === key)?.status).toBe('sold');
    expect(g.players.bidder!.lifestyle.some((x) => x.itemId === item!.id)).toBe(true);
  });
});
