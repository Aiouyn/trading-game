import {
  indexLevel, indexMembers, worldEventView, type Account, type AssetDef, type AssetState, type Order, type RatesState, type RegimeId,
  type WorldConfig, type WorldEventView, type WorldState, type DepthFrame, tradingConfig,
} from '@/engine';
import { RANKS, rankIndex } from '@/content/lifestyle';
import { contractProgress } from './players';
import { changeOf, ghostReport, type GhostReport } from './ghosts';
import { tradesOf } from './ledger';
import { deskFileSummaries, deskWindow } from './desk';
import { calendarFor, type CalendarItem } from './calendar';
import { goalsView } from './learn';
import { textProvider } from './text';
import type { DailyClose, LedgerFill, PlanState, RoundTrip } from './ledger-types';
import { TPD, netWorthBreakdown, ordersOf, playerBusinesses, playerProperties, propValue, today, type NetWorthBreakdown } from './core';
import { CITY_DEMAND, mortgageRate, noteCost } from './assets';
import { defenseOf, defensePoints, defenseTier, entriesOf } from './cyber';
import { algorithmA, dataPrice, ownedPflopPerDay, spotPflopPrice } from './lab';
import type {
  Alliance, BoardRow, Boards, Business, ChatMessage, ConnectionEntry, CourtCase, CyberOp, Deal, GameState, InboxItem,
  LabState, Player, Property, WireItem,
} from './types';

/**
 * What clients see. The market frame is public and carries no hidden state (no fundamental
 * values, no upcoming earnings surprises, no true inflation/growth before release). The player
 * view is private to its owner and strips server-only fields (hostile session details, which
 * clues were real).
 */

/** Per asset, in config order: [lnP, h, haltUntil, lnOpen, volume, dayVolume, cumVolume, nextEarnings, consensus, rumor] */
export type AssetFrame = [number, number, number, number, number, number, number, number, number, number];

/** A copy of an object without the named keys (the view never sends the hidden fields). */
function without<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Omit<T, K> {
  const out: Partial<T> = { ...o };
  for (const k of keys) delete out[k];
  return out as Omit<T, K>;
}

/**
 * The shared world event as the app may see it: worldEventView plus two market facts. `gxSince` is the GX
 * move since the event began (a level ratio, null before the GX index exists or while only announced).
 * `gxToday` is the GX move against today's open, the same members and weights. Neither reveals the end.
 */
export type WorldEventFrame = WorldEventView & { gxSince: number | null; gxToday: number | null };

/** The GX move since the event began and today. Reads the engine's own index level, so it matches the Wire. */
function worldEventFrame(m: WorldState): WorldEventFrame | null {
  const ev = worldEventView(m);
  if (!ev) return null;
  const idx = m.config.indices.find((x) => x.id === 'GX');
  if (!idx) return { ...ev, gxSince: null, gxToday: null };
  const active = m.worldEvents?.active;
  const gxSince = ev.phase === 'live' && active?.gxStart ? indexLevel(m, 'GX') / active.gxStart - 1 : null;
  let now = 0;
  let open = 0;
  for (const id of indexMembers(m, idx)) {
    const i = m.config.assets.findIndex((a) => a.id === id);
    const def = m.config.assets[i];
    const st = m.assets[i];
    if (!def || !st) continue;
    const sh = def.sharesOutstanding ?? 1;
    now += sh * Math.exp(st.lnP);
    open += sh * Math.exp(st.lnOpen);
  }
  const gxToday = open > 0 ? now / open - 1 : null;
  return { ...ev, gxSince, gxToday };
}

export interface MarketFrame {
  tick: number;
  regime: RegimeId;
  /** the asset list's version (see configSeq): the client's universe must match it before it can read `assets` */
  cfgSeq: number;
  /** the full asset list, sent only on the tick the list changed (a listing or delisting); absent otherwise */
  defs?: AssetDef[];
  /** in the same order as the config's assets (the list grows at runtime; delisted names keep their slot) */
  assets: AssetFrame[];
  /** last earnings per stock (public), only when changed: assetId → { day, surprise, move } */
  lastEarnings?: Record<string, { day: number; surprise: number; move: number }>;
  rates: Pick<RatesState, 'policy' | 'y2' | 'y10' | 'y30' | 'expectedMove' | 'nextMeeting' | 'nextRelease' | 'releaseKind'> | null;
  /** the shared world event now (announced or live), as the app may see it: never its end tick or planned moves */
  worldEvent: WorldEventFrame | null;
  /**
   * public short interest per stock (engine publicShortInterest, computed on the server): sent in every welcome and on the
   * slow-cadence ticks where it changed (server/wire.ts ShortInterestWire). Absent on other ticks.
   */
  shortInterest?: Record<string, number | null>;
  /**
   * the latest closed day's order depth per asset, by pool type (engine depthFrame, computed on the server): sent in every
   * welcome and on the tick that closed a new day (server/wire.ts DepthWire). Absent on other ticks and before the first close.
   */
  depth?: DepthFrame;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r7 = (x: number) => Math.round(x * 1e7) / 1e7;

/**
 * The version of the asset list. The engine bumps its listings sequence on every IPO, bankruptcy, merger or spin-off,
 * which are the only places the list grows or a name is delisted. 0 until the first listing.
 */
export function configSeq(g: GameState): number {
  return g.market.listings?.seq ?? 0;
}

export function marketFrame(g: GameState, withEarnings = false, withDefs = false): MarketFrame {
  const m = g.market;
  const frame: MarketFrame = {
    tick: m.tick,
    regime: m.regime,
    cfgSeq: configSeq(g),
    ...(withDefs ? { defs: m.config.assets } : {}),
    // rounded to what the client needs: prices to 1e-7 in log space (≈ 0.00001%), volumes to units
    assets: m.assets.map((a) => [
      r7(a.lnP), r4(a.h), a.haltUntil, r7(a.lnOpen), r2(a.volume ?? 0), r2(a.dayVolume ?? 0), r2(a.cumVolume ?? 0),
      a.nextEarnings ?? -1, r4(a.consensus ?? 0), a.rumor ?? 0,
    ]),
    rates: m.rates ? {
      policy: m.rates.policy, y2: m.rates.y2, y10: m.rates.y10, y30: m.rates.y30, expectedMove: m.rates.expectedMove,
      nextMeeting: m.rates.nextMeeting, nextRelease: m.rates.nextRelease, releaseKind: m.rates.releaseKind,
    } : null,
    worldEvent: worldEventFrame(m),
  };
  if (withEarnings) {
    frame.lastEarnings = {};
    m.assets.forEach((a, i) => { if (a.lastEarnings) frame.lastEarnings![m.config.assets[i]!.id] = a.lastEarnings; });
  }
  return frame;
}

/**
 * Build a client-side WorldState mirror from the public frame plus the player's own account and
 * orders, so the engine's read-only functions (estimateFill, buyingPower, portfolio, optionChain)
 * work in the browser. The mirror's fundamental value equals its price: the client never knows V.
 */
export function mirrorWorld(config: WorldConfig, frame: MarketFrame, me: { id: string; account: Account | null; orders: Order[] }, prev?: WorldState): WorldState {
  // a frame can run one listing ahead of the client's config for a tick: entries past the config are ignored
  const n = Math.min(frame.assets.length, config.assets.length);
  const assets: AssetState[] = frame.assets.slice(0, n).map((f, i) => {
    const old = prev?.assets[i];
    const zero = [0, 0, 0, 0] as [number, number, number, number];
    return {
      id: config.assets[i]!.id, lnP: f[0], lnV: f[0], h: f[1], lnOpen: f[3], haltUntil: f[2], haltedToday: false, dayJump: 0, pending: 0,
      rng: zero, vrng: zero, volume: f[4], notional: f[4] * Math.exp(f[0]), dayVolume: f[5], dayNotional: f[5] * Math.exp(f[0]),
      cumVolume: f[6], heat: 0,
      ...(f[7] >= 0 ? { nextEarnings: f[7], consensus: f[8] || null, rumor: (f[9] || null) as 1 | -1 | null } : {}),
      lastEarnings: frame.lastEarnings?.[config.assets[i]!.id] ?? old?.lastEarnings ?? null,
    };
  });
  return {
    version: 1, seed: 'mirror', tick: frame.tick, regime: frame.regime, regimeLog: [], macroRng: [0, 0, 0, 1], sectorRng: {},
    assets, accounts: me.account ? { [me.id]: me.account } : {}, orders: me.orders, orderSeq: 0, config,
    ...(frame.rates ? { rates: { ...frame.rates, inflation: 0, growth: 0, rng: [0, 0, 0, 1] } } : {}),
  };
}

// ---------------------------------------------------------------- the private player view

export interface ContractView { id: string; defId: string; text: string; done: boolean; claimed: boolean; reward: number; progress: number; target: number }

export interface PlayerView {
  player: Omit<Player, 'inbox'> & { inboxUnread: number };
  account: Account | null;
  orders: Order[];
  netWorth: NetWorthBreakdown;
  /**
   * The cash the player arrived with (the engine's starting cash), the change since then (trading and income only), and the
   * cumulative external cash the change leaves out (grants, transfers, loans, court payments to the victim fund).
   */
  arrival: { cash: number; change: number; changePct: number; external: number };
  rank: { id: string; name: string; next: { id: string; name: string; threshold: number } | null; progress: number };
  businesses: Business[];
  properties: (Property & { value: number })[];
  contracts: ContractView[];
  inbox: InboxItem[];
  lab: (LabState & { a: number; pflopPerDay: number; spotPrice: number; dataPrice: number }) | null;
  security: {
    tier: number; dp: number; budget: number; lastScanTick: number; lockdownUntil: number; shieldUntil: number;
    entries: Omit<ConnectionEntry, 'hostile'>[];
    clues: { id: string; tick: number; kind: string; entryId?: string }[];
    myOps: CyberOp[];
    evidence: { against: string; points: number }[];
    liveSessions: { entryId: string; victimId: string; strength: string; progress: number; codename: string }[];
  };
  cases: CourtCase[];
  deals: Deal[];
  alliance: Alliance | null;
  noteCost: number;
  mortgageRate: number;
  digest: { since: number; items: InboxItem[]; netWorthThen: number } | null;
  /** the owner's own trading record: fills, round trips, the benchmark, the closes, the plans, the calendar (private) */
  trading: {
    fills: LedgerFill[];
    trips: RoundTrip[];
    benchmark: GhostReport | null;
    closes: DailyClose[];
    /** the latest closed day whose card the player dismissed (null before the first dismissal) */
    closeSeenDay: number | null;
    plans: PlanState | null;
    calendar: CalendarItem[];
    goals: ReturnType<typeof goalsView>;
    /** the Research Desk's window (the first archived day, the last closed day, today) and the saved files' summaries */
    desk: { firstDay: number; lastClosed: number | null; today: number; files: { no: number; assetId: string; from: number; to: number; move: number }[] };
    /** ISO weeks this player has used their weekly challenge attempt (durable) */
    challengeWeeks: string[];
  };
}

export function playerView(g: GameState, pid: string): PlayerView | null {
  const p = g.players[pid];
  if (!p) return null;
  const { inbox, ...rest } = p;
  const rIdx = rankIndex(p.rankId);
  const next = RANKS[rIdx + 1] ?? null;
  const floor = rIdx === 0 ? 5000 : RANKS[rIdx]!.threshold;
  const lab = g.lab[pid];
  const d = defenseOf(g, pid);
  const away = g.market.tick - p.digestSeenTick > TPD / 2 ? inbox.filter((n) => n.tick > p.digestSeenTick).slice(0, 40) : [];
  return {
    player: { ...rest, inboxUnread: inbox.filter((n) => !n.read).length },
    account: g.market.accounts[pid] ?? null,
    orders: ordersOf(g, pid),
    netWorth: netWorthBreakdown(g, pid),
    arrival: arrivalView(g, pid),
    rank: {
      id: p.rankId, name: RANKS[rIdx]!.name,
      next: next ? { id: next.id, name: next.name, threshold: next.threshold } : null,
      progress: next ? Math.min(1, Math.max(0, (p.netWorth - floor) / (next.threshold - floor))) : 1,
    },
    businesses: playerBusinesses(g, pid),
    properties: playerProperties(g, pid).map((x) => ({ ...x, value: propValue(g, x) })),
    contracts: p.contracts.map((c) => ({ ...c, ...(() => { const pr = contractProgress(g, p, c.defId); return { progress: pr.value, target: pr.target }; })() })),
    inbox: inbox.slice(0, 60),
    lab: lab ? { ...lab, a: algorithmA(lab), pflopPerDay: ownedPflopPerDay(lab), spotPrice: spotPflopPrice(g), dataPrice: dataPrice(g) } : null,
    security: {
      tier: defenseTier(g, pid), dp: defensePoints(g, pid), budget: d.budget, lastScanTick: d.lastScanTick, lockdownUntil: d.lockdownUntil, shieldUntil: d.shieldUntil,
      entries: entriesOf(g, pid).map((e) => without(e, ['hostile'])),
      clues: g.cyber.clues.filter((c) => c.ownerId === pid).slice(-40).map((c) => without(c, ['real', 'ownerId'])),
      myOps: g.cyber.ops.filter((o) => o.attackerId === pid).slice(0, 30),
      evidence: Object.entries(g.cyber.evidence).filter(([k]) => k.endsWith(`>${pid}`)).map(([k, v]) => ({ against: k.split('>')[0]!, points: v })),
      liveSessions: Object.values(g.cyber.entries).filter((e) => e.hostile?.attackerId === pid).map((e) => ({
        entryId: e.id, victimId: e.ownerId, strength: e.hostile!.strength, progress: e.hostile!.progress, codename: e.codename,
      })),
    },
    cases: Object.values(g.court.cases).filter((c) => c.plaintiffId === pid || c.defendantId === pid),
    deals: Object.values(g.deals).filter((x) => x.fromId === pid || x.toId === pid).slice(-50),
    alliance: p.allianceId ? g.alliances[p.allianceId] ?? null : null,
    noteCost: noteCost(g, pid),
    mortgageRate: mortgageRate(g),
    digest: away.length ? { since: p.digestSeenTick, items: away, netWorthThen: p.digestNetWorth } : null,
    trading: tradingView(g, pid),
  };
}

/** The owner's trading record is sent with every tick, so the view carries recent slices only (the full ledger stays on the server). */
const VIEW_FILLS = 50;
const VIEW_CLOSES = 10;

/**
 * The arrival comparison: the cash the player arrived with (the engine's starting cash) against the net worth less the
 * grants, transfers and loans received since (externalCash), so the change is trading and income only. The percentage
 * comes from here.
 */
function arrivalView(g: GameState, pid: string): PlayerView['arrival'] {
  const cash = tradingConfig(g.market).startingCash;
  const external = g.players[pid]?.externalCash ?? 0;
  const total = netWorthBreakdown(g, pid).total - external;
  return { cash, change: total - cash, changePct: changeOf(total, cash), external };
}

/** The owner's trading record, sliced for the view. */
function tradingView(g: GameState, pid: string): PlayerView['trading'] {
  const { fills, trips } = tradesOf(g, pid);
  const L = g.ledgers?.[pid];
  return {
    fills: fills.slice(-VIEW_FILLS), trips: trips.slice(-VIEW_FILLS), benchmark: ghostReport(g, pid),
    closes: (L?.closes ?? []).slice(0, VIEW_CLOSES).map((c) => ({ ...c, lines: textProvider.dailyClose(c) })), closeSeenDay: L?.closeSeenDay ?? null,
    plans: L?.plans ?? null,
    calendar: calendarFor(g, pid), goals: goalsView(g, g.players[pid]!), challengeWeeks: g.players[pid]!.challengeWeeks ?? [],
    desk: { ...deskWindow(g), today: today(g), files: deskFileSummaries(g, pid).slice(0, 40) },
  };
}

// ---------------------------------------------------------------- public directory and social

export interface DirectoryRow {
  id: string;
  handle: string;
  country: string;
  rankId: string;
  netWorth: number;
  prestige: number;
  reputation: number;
  notoriety: number;
  title: string;
  allianceTag: string | null;
  npc: boolean;
  online: boolean;
  bio: string;
  businesses: number;
  properties: number;
  lifestyle: string[];
  joinedTick: number;
}

/**
 * The directory a client gets: the top `limit` players by net worth plus everyone relevant to
 * this player (rival, alliance, deals, cases, DM partners). Keeps big worlds cheap to sync.
 */
export function directoryFor(g: GameState, all: DirectoryRow[], top: DirectoryRow[], pid: string): DirectoryRow[] {
  const p = g.players[pid];
  if (!p || all.length <= top.length) return all;
  const want = new Set<string>([pid]);
  if (p.rivalId) want.add(p.rivalId);
  if (p.allianceId) for (const m of Object.keys(g.alliances[p.allianceId]?.members ?? {})) want.add(m);
  for (const d of Object.values(g.deals)) if (d.fromId === pid || d.toId === pid) { want.add(d.fromId); want.add(d.toId); }
  for (const c of Object.values(g.court.cases)) if (c.plaintiffId === pid || c.defendantId === pid) { want.add(c.plaintiffId); want.add(c.defendantId); }
  for (const ch of Object.keys(g.chat)) if (ch.startsWith('dm:') && ch.includes(pid)) for (const x of ch.split(':').slice(1)) want.add(x);
  const inTop = new Set(top.map((r) => r.id));
  const extra = all.filter((r) => want.has(r.id) && !inTop.has(r.id));
  return extra.length ? [...top, ...extra] : top;
}

export function topDirectory(all: DirectoryRow[], limit = 500): DirectoryRow[] {
  return all.length <= limit ? all : all.slice().sort((a, b) => b.netWorth - a.netWorth).slice(0, limit);
}

export function directory(g: GameState): DirectoryRow[] {
  const bizCount = new Map<string, number>();
  for (const b of Object.values(g.businesses)) bizCount.set(b.ownerId, (bizCount.get(b.ownerId) ?? 0) + 1);
  const propCount = new Map<string, number>();
  for (const x of Object.values(g.properties)) propCount.set(x.ownerId, (propCount.get(x.ownerId) ?? 0) + 1);
  return Object.values(g.players).map((p) => ({
    id: p.id, handle: p.handle, country: p.country, rankId: p.rankId, netWorth: p.netWorth, prestige: p.prestige,
    reputation: p.reputation, notoriety: p.mostWantedOptIn ? p.notoriety : 0, title: p.title,
    allianceTag: p.allianceId ? g.alliances[p.allianceId]?.tag ?? null : null, npc: !!p.npc, online: p.online || !!p.npc,
    bio: p.bio, businesses: bizCount.get(p.id) ?? 0, properties: propCount.get(p.id) ?? 0,
    lifestyle: p.lifestyle.map((o) => o.itemId), joinedTick: p.joinedTick,
  }));
}

export interface PublicState {
  boards: Boards;
  wire: WireItem[];
  alliances: Alliance[];
  economy: GameState['economy'];
  chapter: GameState['chapter'];
  hallOfFame: GameState['hallOfFame'];
  collectibles: number;
  cityDemand: Record<string, number>;
  players: number;
  online: number;
}

export function publicState(g: GameState): PublicState {
  const ps = Object.values(g.players);
  return {
    boards: g.boards, wire: g.wire.slice(0, 120), alliances: Object.values(g.alliances), economy: g.economy, chapter: g.chapter,
    hallOfFame: g.hallOfFame.slice(0, 10), collectibles: g.collectibles, cityDemand: CITY_DEMAND,
    players: ps.length, online: ps.filter((p) => p.online || p.npc).length,
  };
}

export function chatFor(g: GameState, pid: string): Record<string, ChatMessage[]> {
  const p = g.players[pid];
  const out: Record<string, ChatMessage[]> = {};
  for (const [ch, msgs] of Object.entries(g.chat)) {
    const visible = ch === 'world' || (p && (ch === `country:${p.country}` || ch === `alliance:${p.allianceId}` || (ch.startsWith('dm:') && ch.split(':').includes(pid))));
    if (visible) out[ch] = msgs.slice(-60);
  }
  return out;
}

export type { BoardRow };
