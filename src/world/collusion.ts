import type { Fill, Side } from '@/engine';
import { sha256Hex } from './company/hash';
import { TPD } from './core';
import type { GameState } from './types';

/**
 * The collusion graph (lead-phase6.md 6C, Phase 4 O-5). Two human accounts are linked when any of these holds:
 *  - alliance: they are in the same alliance (the Phase 4 owner link, unchanged). Transitive: one owner group (R-9-3);
 *  - device: they registered from the same device, kept only as a salted hash (never sent to a client). Transitive (R-9-3);
 *  - funding: they completed at least FUNDING_MIN_GIFTS player-to-player gifts (a transfer deal between them). Direct only (R-9-3):
 *    the pair is linked and no third party is pooled through it;
 *  - mirror: their fills copy each other (direct only, R-9-3). A fill of the same asset, side and quantity within MIRROR_WINDOW_TICKS of another
 *    account's fill is a match. The pair is linked at MIRROR_MIN_MATCHES matches that cover at least MIRROR_MIN_SCORE of the
 *    smaller account's fills. The exact quantity and the short window keep ordinary busy-market coincidences out.
 *
 * The graph is never shown to a player. A refusal that uses it says "linked account" and names nobody. Worlds with no gifts, no
 * devices and no mirror matches keep every fingerprint: the state is written only when a fill or gift is recorded, and it reads
 * nothing else. Everything here is state-only (no draws), so replays agree.
 */

export const MIRROR_WINDOW_TICKS = 2;
export const MIRROR_MIN_MATCHES = 8;
export const MIRROR_MIN_SCORE = 0.6;
export const FUNDING_MIN_GIFTS = 2;
/** recent fills kept per asset for the mirror match */
const RECENT_KEEP = 120;

export interface CollusionState {
  /** hashed registration device per account (sha256 of a device token), never sent to a client */
  devices?: Record<string, string>;
  /** completed gifts per unordered pair, key `a|b` (a < b) */
  funding?: Record<string, number>;
  /** matched fills per unordered pair, key `a|b` (a < b) */
  mirror?: Record<string, number>;
  /** fills per human account, for the mirror score */
  fills?: Record<string, number>;
  /** recent fills per asset, newest last: the tick, account, side and quantity */
  recent?: Record<string, { tick: number; pid: string; side: Side; qty: number }[]>;
  /** the tick of each human account's latest fill (the mirror prune reads it) */
  last?: Record<string, number>;
}

/** A mirror pair that is not linked, between accounts that have not filled for this long, is dropped (the map stays small). */
export const MIRROR_PRUNE_TICKS = 10 * TPD;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isHuman(g: GameState, pid: string): boolean {
  const p = g.players[pid];
  return !!p && !p.npc;
}

/** Records a registration device for an account (a hash only; the first device wins). */
export function registerDevice(g: GameState, pid: string, device: string): void {
  if (!isHuman(g, pid) || !device) return;
  const c = (g.collusion ??= {});
  c.devices ??= {};
  if (c.devices[pid] !== undefined) return;
  c.devices[pid] = sha256Hex(`device:${device.slice(0, 256)}`);
  touchLinks(g);
}

/** Records one completed gift between two human accounts (called when a transfer deal is accepted). */
export function recordGift(g: GameState, a: string, b: string): void {
  if (a === b || !isHuman(g, a) || !isHuman(g, b)) return;
  const c = (g.collusion ??= {});
  c.funding ??= {};
  const k = pairKey(a, b);
  c.funding[k] = (c.funding[k] ?? 0) + 1;
  touchLinks(g);
}

/** Records this tick's fills for the mirror score. Fund and curve accounts are not players and are skipped. */
export function noteFills(g: GameState, fills: Fill[]): void {
  if (fills.length === 0) return;
  let c: CollusionState | undefined;
  let touched = false;
  for (const fl of fills) {
    if (!isHuman(g, fl.playerId)) continue;
    c ??= (g.collusion ??= {});
    touched = true;
    c.fills ??= {};
    c.recent ??= {};
    c.fills[fl.playerId] = (c.fills[fl.playerId] ?? 0) + 1;
    c.last ??= {};
    c.last[fl.playerId] = fl.tick;
    const list = (c.recent[fl.assetId] ??= []);
    for (const o of list) {
      if (o.pid === fl.playerId || o.side !== fl.side || o.qty !== fl.qty) continue;
      if (fl.tick - o.tick > MIRROR_WINDOW_TICKS || o.tick > fl.tick) continue;
      c.mirror ??= {};
      const k = pairKey(o.pid, fl.playerId);
      c.mirror[k] = (c.mirror[k] ?? 0) + 1;
    }
    list.push({ tick: fl.tick, pid: fl.playerId, side: fl.side, qty: fl.qty });
    if (list.length > RECENT_KEEP) list.splice(0, list.length - RECENT_KEEP);
    // drop fills that can no longer match anything
    const cut = fl.tick - MIRROR_WINDOW_TICKS;
    let k0 = 0;
    while (k0 < list.length && list[k0]!.tick < cut) k0++;
    if (k0 > 0) list.splice(0, k0);
  }
  // the fill counts and the mirror map feed the direct links (directPartners), so a recorded fill changes the links
  if (touched) touchLinks(g);
}

/** The mirror score of a pair: matched fills over the smaller account's fills (0 when there are no fills). */
export function mirrorScore(g: GameState, a: string, b: string): number {
  const c = g.collusion;
  const n = c?.mirror?.[pairKey(a, b)] ?? 0;
  const fa = c?.fills?.[a] ?? 0;
  const fb = c?.fills?.[b] ?? 0;
  const m = Math.min(fa, fb);
  return m > 0 ? n / m : 0;
}

/**
 * The daily prune (game.ts, the day close). A mirror pair below the link line whose two accounts have not filled for
 * MIRROR_PRUNE_TICKS is dropped, so the map holds the live coincidences only. A linked pair stays: it is part of an owner group.
 * Deterministic: the keys are read in sorted order and nothing is drawn.
 */
export function collusionDay(g: GameState): void {
  const c = g.collusion;
  if (!c?.mirror || !c.last) return;
  const now = g.market.tick;
  let dropped = false;
  for (const k of Object.keys(c.mirror).sort()) {
    const [a, b] = k.split('|') as [string, string];
    const quiet = (c.last[a] ?? 0) < now - MIRROR_PRUNE_TICKS && (c.last[b] ?? 0) < now - MIRROR_PRUNE_TICKS;
    if (!quiet) continue;
    const linked = (c.mirror[k] ?? 0) >= MIRROR_MIN_MATCHES && mirrorScore(g, a, b) >= MIRROR_MIN_SCORE;
    if (!linked) { delete c.mirror[k]; dropped = true; }
  }
  if (dropped) touchLinks(g);
}

/**
 * The union-find root of every human account over the OWNER links only (R-9-3, Phase 9 rulings): an alliance and a shared
 * registration device are transitive, so a chain of them is one owner group. Sorted input, so the roots are deterministic.
 */
function ownerRoots(g: GameState): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let y = x;
    while (parent.get(y) !== r) { const nx = parent.get(y)!; parent.set(y, r); y = nx; }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb);
  };
  const humans = Object.keys(g.players).filter((pid) => isHuman(g, pid)).sort();
  for (const pid of humans) parent.set(pid, pid);
  // alliances: the members of one alliance form one group
  const firstOf = new Map<string, string>();
  for (const pid of humans) {
    const a = g.players[pid]!.allianceId;
    if (!a) continue;
    const f = firstOf.get(a);
    if (f === undefined) firstOf.set(a, pid); else union(f, pid);
  }
  // devices: one hash, one group
  const c = g.collusion;
  const byDevice = new Map<string, string>();
  for (const pid of humans) {
    const h = c?.devices?.[pid];
    if (!h) continue;
    const f = byDevice.get(h);
    if (f === undefined) byDevice.set(h, pid); else union(f, pid);
  }
  const roots = new Map<string, string>();
  for (const pid of humans) roots.set(pid, find(pid));
  return roots;
}

/**
 * The accounts one account is linked to by a DIRECT funding link (two completed gifts or accepted loans) or a DIRECT mirror link
 * (the match minimum and score). R-9-3: such a link joins the two accounts it names and nobody else. A third party is not pooled
 * through it, so a gifted pair does not pull in the gifter's other accounts.
 */
function directPartners(g: GameState, pid: string): string[] {
  const c = g.collusion;
  const out: string[] = [];
  const other = (k: string): string | null => {
    const [a, b] = k.split('|') as [string, string];
    if (a === pid) return b;
    if (b === pid) return a;
    return null;
  };
  for (const k of Object.keys(c?.funding ?? {}).sort()) {
    if ((c!.funding![k] ?? 0) < FUNDING_MIN_GIFTS) continue;
    const o = other(k);
    if (o !== null && isHuman(g, o)) out.push(o);
  }
  for (const k of Object.keys(c?.mirror ?? {}).sort()) {
    const o = other(k);
    if (o === null || !isHuman(g, o)) continue;
    if ((c!.mirror![k] ?? 0) < MIRROR_MIN_MATCHES) continue;
    if (mirrorScore(g, pid, o) < MIRROR_MIN_SCORE) continue;
    out.push(o);
  }
  return out;
}

/**
 * Every human account linked to `pid`, `pid` included, sorted (R-9-3). The owner group of `pid` (alliance and device, transitive)
 * plus the accounts `pid` is linked to by a direct funding or mirror link. Funding and mirror links do not chain: a link between
 * two other accounts does not link `pid` to either of them. An unlinked account is alone.
 */
export function linkedAccounts(g: GameState, pid: string): string[] {
  if (!g.players[pid]) return [pid];
  const ix = linkIndex(g);
  const out = new Set<string>([pid]);
  const r = ix.root.get(pid);
  if (r !== undefined) for (const id of ix.members.get(r)!) out.add(id);
  for (const o of ix.partners.get(pid) ?? []) out.add(o);
  return [...out].sort();
}

/**
 * The uncached answer of linkedAccounts, computed from the links on every call (ownerRoots and directPartners, the R-9-3 rules
 * as written). It is the reference the link index is checked against (collusion-cache.test.ts). Not used by the game.
 */
export function linkedAccountsUncached(g: GameState, pid: string): string[] {
  if (!g.players[pid]) return [pid];
  const out = new Set<string>([pid]);
  const roots = ownerRoots(g);
  const r = roots.get(pid);
  if (r !== undefined) for (const [id, root] of roots) if (root === r) out.add(id);
  for (const o of directPartners(g, pid)) out.add(o);
  return [...out].sort();
}

// ================================================================ the link index (V1-PHASE9 9C.1)

/**
 * The link version of a game state. Every write to a link source calls touchLinks: an alliance join, leave or kick (the
 * allianceId of a player), a registration device, a completed gift or loan, a recorded fill (the mirror counts), the mirror
 * prune, a new account. A test that writes a link field directly must call touchLinks too.
 */
const linkVersion = new WeakMap<object, number>();

export function touchLinks(g: GameState): void {
  linkVersion.set(g, (linkVersion.get(g) ?? 0) + 1);
}

/**
 * Every link answer for one link version, built once: the owner group of each human account (root and members) and the direct
 * partners of each account. linkedAccounts reads it, so a view costs a set and a sort of one group, not a scan of every account
 * and every link (the 4,000-player view was about 13 ms a view before this index).
 */
interface LinkIndex {
  /** the owner-group root of each human account */
  root: Map<string, string>;
  /** the members of each owner group, by root, in sorted order */
  members: Map<string, string[]>;
  /** the accounts each account is directly linked to (funding or mirror); may repeat, linkedAccounts takes a set */
  partners: Map<string, string[]>;
}

/** the index of each game state, kept with the versions and the collections it was built from (a replaced map rebuilds it) */
const linkCache = new WeakMap<object, { ver: number; players: object; collusion: object | undefined; ix: LinkIndex }>();

function linkIndex(g: GameState): LinkIndex {
  const ver = linkVersion.get(g) ?? 0;
  const hit = linkCache.get(g);
  if (hit && hit.ver === ver && hit.players === g.players && hit.collusion === g.collusion) return hit.ix;
  const ix = buildLinkIndex(g);
  linkCache.set(g, { ver, players: g.players, collusion: g.collusion, ix });
  return ix;
}

function buildLinkIndex(g: GameState): LinkIndex {
  const root = ownerRoots(g);
  const members = new Map<string, string[]>();
  // ownerRoots inserts the humans in sorted order, so each group's list is sorted too
  for (const [pid, r] of root) {
    const list = members.get(r);
    if (list) list.push(pid); else members.set(r, [pid]);
  }
  const partners = new Map<string, string[]>();
  const edge = (x: string, y: string) => {
    if (!isHuman(g, y)) return;
    const list = partners.get(x);
    if (list) list.push(y); else partners.set(x, [y]);
  };
  const c = g.collusion;
  for (const k of Object.keys(c?.funding ?? {})) {
    if ((c!.funding![k] ?? 0) < FUNDING_MIN_GIFTS) continue;
    const [a, b] = k.split('|') as [string, string];
    edge(a, b);
    edge(b, a);
  }
  for (const k of Object.keys(c?.mirror ?? {})) {
    if ((c!.mirror![k] ?? 0) < MIRROR_MIN_MATCHES) continue;
    const [a, b] = k.split('|') as [string, string];
    if (mirrorScore(g, a, b) < MIRROR_MIN_SCORE) continue;
    edge(a, b);
    edge(b, a);
  }
  return { root, members, partners };
}

/** True when `b` is `a` or linked to it (linkedAccounts). Symmetric. The link is never named to a player. */
export function isLinkedAccount(g: GameState, a: string, b: string): boolean {
  if (a === b) return true;
  return linkedAccounts(g, a).includes(b);
}

/**
 * The founder sell cap on the whole owner group (closes Phase 4 O-7a). The engine caps each account on its own, so each member
 * of the group gets floor(perDay / group size): the members sell at most perDay together. A group of one keeps the full cap.
 * Accounts that left the group lose the cap. Run once a game day for every listed company.
 */
export function syncGroupSellCap(g: GameState, assetId: string, founderId: string, perDay: number, restrictions: { sellCaps?: Record<string, Record<string, number>> }): Record<string, Record<string, number>> {
  const members = linkedAccounts(g, founderId);
  const each = Math.max(0, Math.floor(perDay / members.length));
  const row: Record<string, number> = {};
  for (const pid of members) row[pid] = each;
  const caps = { ...(restrictions.sellCaps ?? {}) };
  caps[assetId] = row;
  return caps;
}
