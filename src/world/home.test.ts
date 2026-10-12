import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { HOME_SLOTS, collectionView, homeView, placeInSlot, setVisibility, visibilityOf } from './home';
import type { GameState, OwnedItem } from './types';

const owner = 'p-owner';
const viewer = 'p-viewer';

function world(): GameState {
  const g = createGame('home-test', { warmupDays: 1, npcs: false });
  applyCommand(g, owner, { type: 'join', handle: 'owner', country: 'XX' });
  applyCommand(g, viewer, { type: 'join', handle: 'viewer', country: 'XX' });
  const items: OwnedItem[] = [
    { uid: 'u-sneakers', itemId: 'sneakers', paid: 2400, boughtTick: 0 },
    { uid: 'u-watch', itemId: 'perpetual', paid: 140_000, boughtTick: 0 },
    { uid: 'u-tech', itemId: 'laptop-pro', paid: 3500, boughtTick: 0 },
    { uid: 'u-festival', itemId: 'festival-vip', paid: 3000, boughtTick: 0 },
  ];
  g.players[owner]!.lifestyle = items;
  g.players[owner]!.streak = { count: 7, lastDay: 6, restWeek: -1, actedDay: 6, badges: ['streak3', 'streak7'], titles: ['regular'] };
  return g;
}

describe('visibility', () => {
  it('is off by default: another viewer sees neither the room nor the collection', () => {
    const g = world();
    expect(visibilityOf(g, owner)).toEqual({ home: false, collection: false });
    expect(homeView(g, viewer, owner)).toBeNull();
    expect(collectionView(g, viewer, owner)).toBeNull();
  });

  it('shows each surface only after its owner switches it on, and hides it again when switched off', () => {
    const g = world();
    expect(setVisibility(g, owner, 'home', true).ok).toBe(true);
    expect(homeView(g, viewer, owner)).not.toBeNull();
    expect(collectionView(g, viewer, owner)).toBeNull();
    expect(setVisibility(g, owner, 'home', false).ok).toBe(true);
    expect(homeView(g, viewer, owner)).toBeNull();
  });

  it('always shows the owner their own room and collection', () => {
    const g = world();
    expect(homeView(g, owner, owner)!.mine).toBe(true);
    expect(collectionView(g, owner, owner)!.mine).toBe(true);
  });
});

describe('the home room', () => {
  it('places owned goods in the six slots, moves an item between slots, and clears a slot', () => {
    const g = world();
    expect(placeInSlot(g, owner, 0, 'u-sneakers').ok).toBe(true);
    expect(placeInSlot(g, owner, 1, 'u-sneakers').ok).toBe(true);
    expect(g.players[owner]!.homeSlots![0]).toBeNull();
    expect(g.players[owner]!.homeSlots![1]).toBe('u-sneakers');
    expect(placeInSlot(g, owner, 1, null).ok).toBe(true);
    expect(g.players[owner]!.homeSlots![1]).toBeNull();
    expect(placeInSlot(g, owner, HOME_SLOTS, 'u-tech').ok).toBe(false);
  });

  it('refuses an item the player does not own, and refuses an experience (it does not stay)', () => {
    const g = world();
    expect(placeInSlot(g, owner, 0, 'u-nothing').ok).toBe(false);
    const r = placeInSlot(g, owner, 0, 'u-festival');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('homeConsumed');
  });

  it('gives a viewer the placed items, and the owner their unplaced items too', () => {
    const g = world();
    placeInSlot(g, owner, 0, 'u-watch');
    const forViewer = homeView(g, viewer, owner);
    setVisibility(g, owner, 'home', true);
    const shown = homeView(g, viewer, owner)!;
    expect(shown.slots[0]!.name).toMatch(/calendar/i);
    expect(shown.unplaced).toEqual([]);
    expect(forViewer).toBeNull();
    const own = homeView(g, owner, owner)!;
    expect(own.unplaced.map((x) => x.uid).sort()).toEqual(['u-sneakers', 'u-tech']);
  });
});

describe('the collection', () => {
  it('lists owned collectibles (limited and unique goods) and the streak badges and titles, and no mass goods', () => {
    const g = world();
    setVisibility(g, owner, 'collection', true);
    const c = collectionView(g, viewer, owner)!;
    expect(c.collectibles.map((x) => x.itemId).sort()).toEqual(['perpetual', 'sneakers'].sort());
    expect(c.badges).toEqual(['streak3', 'streak7']);
    expect(c.titles).toEqual(['regular']);
  });
});
