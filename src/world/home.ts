import { LIFE_BY_ID, type LifeItem } from '@/content/lifestyle';
import type { CommandResult, GameState, OwnedItem } from './types';

/**
 * The home room and the collection (lead-phase6.md 6D, bible 04 §10.3). The rank shell's home shows the owner's lifestyle
 * items in six slots. Two surfaces can be made public by their owner, each separately, and both are off by default:
 *  - the home room, the slots and their items;
 *  - the collection, the owned collectibles (limited and unique items) and the streak badges and titles.
 * Nothing here shows cash, positions, or a strategy. A viewer who is not the owner sees a surface only when the owner has
 * switched it on, and otherwise gets null, never a refusal that names what is hidden.
 */

export const HOME_SLOTS = 6;

export type VisibilitySurface = 'home' | 'collection';

export interface Visibility {
  home: boolean;
  collection: boolean;
}

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, data?: Record<string, number | string>): CommandResult => ({ ok: false, error, ...(data ? { data } : {}) });

function ownedItem(g: GameState, pid: string, uid: string): OwnedItem | undefined {
  return g.players[pid]?.lifestyle.find((o) => o.uid === uid);
}

/** A slot's item, placed by the owner. Consumed experiences cannot go in a slot: they do not stay. */
export function placeInSlot(g: GameState, pid: string, slot: number, uid: string | null): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('noPlayer');
  if (!Number.isInteger(slot) || slot < 0 || slot >= HOME_SLOTS) return fail('homeSlot', { max: HOME_SLOTS });
  const slots: (string | null)[] = [...(p.homeSlots ?? Array<string | null>(HOME_SLOTS).fill(null))];
  if (uid === null) {
    slots[slot] = null;
  } else {
    const o = ownedItem(g, pid, uid);
    if (!o) return fail('homeNotOwned');
    const item = LIFE_BY_ID.get(o.itemId);
    if (item?.cls === 'consumed') return fail('homeConsumed');
    for (let k = 0; k < slots.length; k++) if (slots[k] === uid) slots[k] = null;
    slots[slot] = uid;
  }
  p.homeSlots = slots;
  return ok({ slots });
}

/** The visibility switch of one surface. Off by default; a player may switch it off at any time. */
export function setVisibility(g: GameState, pid: string, surface: VisibilitySurface, on: boolean): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('noPlayer');
  p.visibility ={ home: false, collection: false, ...(p.visibility ?? {}), [surface]: on };
  return ok({ visibility: p.visibility });
}

export function visibilityOf(g: GameState, pid: string): Visibility {
  const v = g.players[pid]?.visibility;
  return { home: v?.home === true, collection: v?.collection === true };
}

export interface HomeItemView {
  uid: string;
  itemId: string;
  name: string;
  category: string;
  cls: string;
  rarity: number;
  blurb: string;
  perk: string | null;
}

export interface HomeView {
  owner: string;
  mine: boolean;
  /** the six slots: the placed item, or null for an empty slot */
  slots: (HomeItemView | null)[];
  /** the items not placed in a slot, for the owner's own room */
  unplaced: HomeItemView[];
}

function homeItem(o: OwnedItem, item: LifeItem): HomeItemView {
  return {
    uid: o.uid, itemId: item.id, name: item.name, category: item.category, cls: item.cls, rarity: item.rarity,
    blurb: item.blurb, perk: item.perk ?? null,
  };
}

/**
 * The home room of a player as a viewer may see it: null when the viewer is someone else and the owner has not opened the
 * room. The owner always sees their own room.
 */
export function homeView(g: GameState, viewerId: string | null, ownerId: string): HomeView | null {
  const p = g.players[ownerId];
  if (!p || p.npc) return null;
  const mine = viewerId === ownerId;
  if (!mine && !visibilityOf(g, ownerId).home) return null;
  const placed = p.homeSlots ?? Array<string | null>(HOME_SLOTS).fill(null);
  const byUid = new Map(p.lifestyle.map((o) => [o.uid, o] as const));
  const slots = placed.map((uid) => {
    if (!uid) return null;
    const o = byUid.get(uid);
    const item = o ? LIFE_BY_ID.get(o.itemId) : undefined;
    return o && item ? homeItem(o, item) : null;
  });
  const inSlots = new Set(placed.filter((x): x is string => !!x));
  const unplaced = p.lifestyle
    .filter((o) => !inSlots.has(o.uid) && LIFE_BY_ID.get(o.itemId)?.cls !== 'consumed')
    .flatMap((o) => { const item = LIFE_BY_ID.get(o.itemId); return item ? [homeItem(o, item)] : []; });
  return { owner: p.handle, mine, slots, unplaced: mine ? unplaced : [] };
}

export interface CollectionView {
  owner: string;
  mine: boolean;
  collectibles: HomeItemView[];
  badges: string[];
  titles: string[];
}

/**
 * The collection of a player: owned collectibles (limited and unique goods) and streak badges and titles. Null when the
 * viewer is someone else and the owner has not opened the collection.
 */
export function collectionView(g: GameState, viewerId: string | null, ownerId: string): CollectionView | null {
  const p = g.players[ownerId];
  if (!p || p.npc) return null;
  const mine = viewerId === ownerId;
  if (!mine && !visibilityOf(g, ownerId).collection) return null;
  const collectibles = p.lifestyle.flatMap((o) => {
    const item = LIFE_BY_ID.get(o.itemId);
    return item && (item.cls === 'limited' || item.cls === 'unique') ? [homeItem(o, item)] : [];
  });
  return { owner: p.handle, mine, collectibles, badges: [...(p.streak?.badges ?? [])], titles: [...(p.streak?.titles ?? [])] };
}
