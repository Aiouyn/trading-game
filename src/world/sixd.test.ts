import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { visitView, homeView, setVisibility, placeInSlot } from './home';
import { sixdView } from './sixd';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import type { GameState, OwnedItem, TournamentState, TradeLogRecord } from './types';

const owner = 'p-owner';
const viewer = 'p-viewer';

/** Two joined players; the owner holds a limited pair, a mass good and a consumed experience, and a streak with two badges. */
function world(): GameState {
  const g = createGame('sixd-test', { warmupDays: 1, npcs: false });
  applyCommand(g, owner, { type: 'join', handle: 'owner', country: 'XX' });
  applyCommand(g, viewer, { type: 'join', handle: 'viewer', country: 'XX' });
  const items: OwnedItem[] = [
    { uid: 'u-sneakers', itemId: 'sneakers', paid: 2400, boughtTick: 0 },
    { uid: 'u-watch', itemId: 'perpetual', paid: 140_000, boughtTick: 0 },
    { uid: 'u-tech', itemId: 'laptop-pro', paid: 3500, boughtTick: 0 },
    { uid: 'u-festival', itemId: 'festival-vip', paid: 3000, boughtTick: 0 },
  ];
  g.players[owner]!.lifestyle = items;
  g.players[owner]!.streak = { count: 7, lastDay: 6, restWeek: -1, actedDay: 6, badges: ['streak3', 'streak7'], titles: ['regular'], accents: ['phosphor'] };
  return g;
}

describe('the 6D player view carries the switches and the owner\'s own surfaces', () => {
  it('shows both switches off by default, and the owner\'s home room and collection to the owner', () => {
    const g = world();
    const v = sixdView(g, owner)!;
    expect(v.visibility).toEqual({ home: false, collection: false });
    expect(v.home!.mine).toBe(true);
    expect(v.collection!.mine).toBe(true);
    expect(v.collection!.collectibles.map((c) => c.itemId).sort()).toEqual(['perpetual', 'sneakers']);
    expect(v.collection!.badges).toEqual(['streak3', 'streak7']);
    expect(v.streak!.accents).toEqual(['phosphor']);
  });

  it('gives an NPC or an unknown player no 6D view', () => {
    const g = world();
    expect(sixdView(g, 'nobody')).toBeNull();
  });
});

describe('visitors see another player only when the owner has opened the surface', () => {
  it('shows neither surface to a visitor while both switches are off', () => {
    const g = world();
    expect(visitView(g, viewer, owner)).toEqual({ home: null, collection: null });
  });

  it('shows the home room, and not the collection, when only the home is opened', () => {
    const g = world();
    expect(placeInSlot(g, owner, 0, 'u-watch').ok).toBe(true);
    expect(setVisibility(g, owner, 'home', true).ok).toBe(true);
    const v = visitView(g, viewer, owner);
    expect(v.home!.mine).toBe(false);
    expect(v.home!.slots[0]!.name).toBe('Perpetual calendar');
    expect(v.home!.unplaced).toEqual([]);
    expect(v.collection).toBeNull();
  });

  it('shows the collection, with its badges and titles, only once the collection is opened', () => {
    const g = world();
    expect(setVisibility(g, owner, 'collection', true).ok).toBe(true);
    const v = visitView(g, viewer, owner);
    expect(v.home).toBeNull();
    expect(v.collection!.collectibles.map((c) => c.itemId).sort()).toEqual(['perpetual', 'sneakers']);
    expect(v.collection!.titles).toEqual(['regular']);
  });

  it('hides a surface again when its owner switches it off, and keeps the other one as it was', () => {
    const g = world();
    setVisibility(g, owner, 'home', true);
    setVisibility(g, owner, 'collection', true);
    setVisibility(g, owner, 'home', false);
    const v = visitView(g, viewer, owner);
    expect(v.home).toBeNull();
    expect(v.collection).not.toBeNull();
    expect(homeView(g, viewer, owner)).toBeNull();
  });

  it('does not show a stranger the cash, the positions or the streak count', () => {
    const g = world();
    setVisibility(g, owner, 'collection', true);
    setVisibility(g, owner, 'home', true);
    const json = JSON.stringify(visitView(g, viewer, owner));
    expect(json).not.toContain('cash');
    expect(json).not.toContain('"count"');
    expect(json).not.toContain('netWorth');
  });
});

describe('the published trade logs (N8) reach the 6D view after the settlement', () => {
  it('lists the logs of a settled week, and none before it settles', () => {
    const g = world();
    const trades: TradeLogRecord[] = [{ tick: 10, assetId: 'HLCN', side: 'buy', qty: 3, price: 12.5 }];
    expect(sixdView(g, viewer)!.tournament.latest).toBeNull();
    const weeks: TournamentState['weeks'] = {
      '0': {
        week: 0,
        entries: [],
        settled: {
          seeds: ['aa11', 'bb22', 'cc33'],
          settledTick: TOURNAMENT_WEEK_TICKS,
          rows: [
            { id: 'e1', kind: 'entry', handle: 'owner', mcs: 1, sharpe: 1.2, totalReturn: 0.1, qualified: true, log: { seed: 'aa11', trades } },
            { id: 'h1', kind: 'house', handle: 'house', mcs: 1, sharpe: 0.5, totalReturn: 0.02, qualified: true },
          ],
        },
      } as unknown as TournamentState['weeks'][string],
    };
    g.tournament = { weeks } as TournamentState;
    const latest = sixdView(g, viewer)!.tournament.latest!;
    expect(latest.logCount).toBe(1);
    expect(latest.logs).toEqual([{ handle: 'owner', seed: 'aa11', trades }]);
    expect(latest.seeds).toHaveLength(3);
  });
});
