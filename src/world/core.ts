import { equityOf, indexLevel, Rng, seedStream, type RngState } from '@/engine';
import { BIZ_BY_ID } from '@/content/businesses';
import { LIFE_BY_ID, PROPERTY_TYPE_BY_ID, resaleValue } from '@/content/lifestyle';
import { CITIES, districtAssetId } from '@/engine';
import { shopValue, valuedIncome } from './shopRules';
import type { Business, GameState, InboxItem, Player, Property, StepOutput, WireItem } from './types';
import { companyNetWorth } from './company/networth';
import { fundClaimsOf } from './funds/state';
import { curveHoldingsValue } from './launchpad/value';

/** Timing (ticks; 720 ticks = one game day = one real hour). */
export const TPD = 720;
export const CREDIT_EVERY = 12;
export const SHARE_EVERY = 60;
export const BOARD_EVERY = 60;
export const NW_EVERY = 12;
/**
 * The public short interest is computed and sent at this cadence, and only when the figure changed (never per tick for
 * every stock). 12 ticks is one real minute.
 */
export const SHORT_INTEREST_EVERY = 12;
/** full offline earnings for this long after leaving (12 real hours), then the offline rate */
export const OFFLINE_GRACE = 12 * 720;
export const WIRE_KEEP = 400;
export const INBOX_KEEP = 150;
export const CHAT_KEEP = 200;
/** the bible's retail-broker onboarding grant (Decision 9) */
export const ONBOARDING_GRANT = 250;
/** chapters: 8 real weeks */
export const CHAPTER_TICKS = 56 * 24 * TPD;

export function today(g: GameState): number {
  const t = g.market.tick;
  return t <= 0 ? 0 : Math.floor((t - 1) / TPD);
}

/** The real day (24 game hours) a tick falls in: the window of the sponsor cap and of the ad offer's day-start snapshot. */
export function realDayOf(g: GameState): number {
  const t = g.market.tick;
  return t <= 0 ? 0 : Math.floor((t - 1) / (24 * TPD));
}

export function newOutput(): StepOutput {
  return { wire: [], inbox: {}, fills: [], closed: [], chat: [], rankUps: [] };
}

export function pushWire(g: GameState, out: StepOutput | null, item: Omit<WireItem, 'id' | 'tick'>): WireItem {
  g.wireSeq++;
  const w: WireItem = { id: `w${g.wireSeq}`, tick: g.market.tick, ...item };
  g.wire.unshift(w);
  if (g.wire.length > WIRE_KEEP) g.wire.length = WIRE_KEEP;
  out?.wire.push(w);
  return w;
}

export function notify(g: GameState, out: StepOutput | null, playerId: string, item: Omit<InboxItem, 'id' | 'tick'>): void {
  const p = g.players[playerId];
  if (!p || p.npc) return;
  p.inboxSeq++;
  const n: InboxItem = { id: `n${p.inboxSeq}`, tick: g.market.tick, ...item };
  p.inbox.unshift(n);
  if (p.inbox.length > INBOX_KEEP) p.inbox.length = INBOX_KEEP;
  if (out) (out.inbox[playerId] ??= []).push(n);
}

export function cashOf(g: GameState, playerId: string): number {
  return g.market.accounts[playerId]?.cash ?? 0;
}

/**
 * Move non-trading cash in or out of a player's account, booked as a faucet (money created
 * by the world) or a sink (money destroyed). Transfers between players use `transfer` instead.
 */
/**
 * In-place cash move (the world owns its market copy). Like the engine's adjustCash, it shifts the trading baseline
 * (startingCash), and with it the ledger's start cash and the benchmark ghosts' cash. Ruling (Phase 3 D-4, recorded in the
 * A2 commit): every non-trading cash move shifts the ghosts too, so the benchmark measures trading only. That covers
 * grants, business income and purchases, property, rent, analyst salary and desk upkeep. Trading moves nothing here.
 */
export function bump(g: GameState, playerId: string, delta: number): void {
  const a = g.market.accounts[playerId];
  if (!a) return;
  g.market.accounts[playerId] = {
    ...a, cash: a.cash + delta, startingCash: a.startingCash + delta,
    peakEquity: Math.max(0, a.peakEquity + delta), dayStartEquity: a.dayStartEquity + delta,
  };
  const L = g.ledgers?.[playerId];
  if (!L) return;
  L.startCash += delta;
  for (const gp of [L.ghosts?.basket, L.ghosts?.random, L.ghosts?.momentum]) if (gp) gp.cash += delta;
}

/** A tagged lot of ad or fresh-start cash is restricted for 72 real hours (ROADMAP C5): 72 game days at one game day an hour. */
export const RESTRICT_TICKS = 72 * TPD;
/** a real day (24 game hours), and a real week (7 game days), in ticks */
export const REAL_DAY = 24 * TPD;
export const REAL_WEEK = 7 * REAL_DAY;

/**
 * The restricted cash of a player at this tick: the unexpired ad and fresh-start lots, plus any older flat restriction
 * (`restrictedCash`, kept for saves that carry it). A lot releases on its untilTick; no money moves when it does.
 */
export function restrictedOf(p: { adLots?: { amount: number; untilTick: number }[]; restrictedCash?: number } | undefined, tick: number): number {
  if (!p) return 0;
  let r = p.restrictedCash ?? 0;
  for (const l of p.adLots ?? []) if (l.untilTick > tick) r += l.amount;
  return r;
}

/**
 * The restricted cash a player holds now (see restrictedOf), never more than the cash in the account: a lot spent on a trade
 * takes its restriction with it, so the restricted amount is min(lots, cash), never negative.
 */
export function restrictedNow(g: GameState, playerId: string): number {
  return Math.max(0, Math.min(restrictedOf(g.players[playerId], g.market.tick), cashOf(g, playerId)));
}

/** Cash a player can spend on analysts, desk upkeep, plans, funds and transfers: cash less restricted cash (ad and fresh-start cash). */
export function spendableCash(g: GameState, playerId: string): number {
  return cashOf(g, playerId) - restrictedNow(g, playerId);
}

export function credit(g: GameState, playerId: string, amount: number, source: string): void {
  if (!(amount > 0)) return;
  bump(g, playerId, amount);
  g.economy.faucets[source] = (g.economy.faucets[source] ?? 0) + amount;
}

export function debit(g: GameState, playerId: string, amount: number, sink: string): void {
  if (!(amount > 0)) return;
  bump(g, playerId, -amount);
  g.economy.sinks[sink] = (g.economy.sinks[sink] ?? 0) + amount;
}

/**
 * A conversion between cash and the valuation holdings, at book: `delta` is what the holdings gained (a purchase, an upgrade,
 * a deposit, a repaid mortgage: positive) or lost (a sale: the book value it carried, negative). The cash side is booked by the
 * caller as usual. The close takes it out of valuation (close.ts), so a purchase is neither trading nor a re-mark: only what
 * the holding is marked below its price the moment it is bought, or after a sale, reads as a fee or a re-mark.
 */
export function assetFlow(g: GameState, playerId: string, delta: number): void {
  const p = g.players[playerId];
  if (!p || !Number.isFinite(delta) || delta === 0) return;
  p.assetFlow = (p.assetFlow ?? 0) + delta;
}

/** A cost of owning (upkeep, salaries, desk fees): a debit that also counts toward the player's overheads, so the day's
 * trading figure leaves it out. Trading fees are not overheads; they stay in the trade's realized P&L. */
export function overhead(g: GameState, playerId: string, amount: number, sink: string): void {
  if (!(amount > 0)) return;
  debit(g, playerId, amount, sink);
  const p = g.players[playerId];
  if (p) p.stats.overheads = (p.stats.overheads ?? 0) + amount;
}

/**
 * Moves the day, digest and arrival baselines by a cash move from outside trading and income (a grant, a transfer, a loan or
 * its tax). The day change (dayStart.netWorth), the "while you were away" change (digestNetWorth) and "since you arrived"
 * (startingCash + externalCash) then read trading and income only.
 */
export function shiftBaselines(g: GameState, playerId: string, delta: number): void {
  const p = g.players[playerId];
  if (!p || !Number.isFinite(delta) || delta === 0) return;
  p.dayStart = { ...p.dayStart, netWorth: p.dayStart.netWorth + delta };
  p.digestNetWorth += delta;
  p.externalCash = (p.externalCash ?? 0) + delta;
}

/** A grant from outside trading (sign-up or admin): credited, and the baselines follow it. */
export function creditExternal(g: GameState, playerId: string, amount: number, source: string): void {
  if (!(amount > 0)) return;
  credit(g, playerId, amount, source);
  shiftBaselines(g, playerId, amount);
}

export function transfer(g: GameState, fromId: string, toId: string, amount: number): void {
  if (!(amount > 0)) return;
  bump(g, fromId, -amount);
  bump(g, toId, amount);
  shiftBaselines(g, fromId, -amount);
  shiftBaselines(g, toId, amount);
}

/** A stream for one-off deterministic draws keyed by context (does not advance shared streams). */
export function keyedRng(g: GameState, key: string): Rng {
  return new Rng(seedStream(g.seed, key));
}

export function drawFrom(g: GameState, stream: keyof GameState['rng']): { rng: Rng; save: () => void } {
  const rng = new Rng(g.rng[stream] as RngState);
  return { rng, save: () => { g.rng[stream] = rng.state(); } };
}

export function priceOf(g: GameState, assetId: string): number {
  const i = g.market.config.assets.findIndex((a) => a.id === assetId);
  return i < 0 ? NaN : Math.exp(g.market.assets[i]!.lnP);
}

export function gx(g: GameState): number {
  return indexLevel(g.market, 'GX');
}

// ---------------------------------------------------------------- valuation

/**
 * Net worth value of a shop: cash put in plus a multiple of its trailing 7-day net income, capped at the
 * fair multiple of the well-run target (S5). A price or incident spike cannot lift net worth for good.
 */
export function bizValue(b: Business): number {
  return shopValue(b.invested, b.shop.net, bizDef(b).income);
}

/** The income a shop is valued on (trailing and capped): what the Tycoon board ranks by. */
export function bizValuedIncome(b: Business): number {
  return valuedIncome(b.shop.net, bizDef(b).income);
}

export function districtTier(cityId: string, districtId: string): 'working' | 'mid' | 'prime' | 'trophy' {
  return CITIES.find((c) => c.id === cityId)?.districts.find((d) => d.id === districtId)?.tier ?? 'mid';
}

export function districtIndex(g: GameState, cityId: string, districtId: string): number {
  return priceOf(g, districtAssetId(cityId, districtId));
}

export function propValue(g: GameState, p: Property): number {
  return p.baseValue * (districtIndex(g, p.cityId, p.districtId) / p.baseIndex) * p.improvement;
}

export function propType(p: Property) {
  return PROPERTY_TYPE_BY_ID.get(p.typeId)!;
}

export function lifestyleValue(g: GameState, pl: Player): number {
  let v = 0;
  for (const o of pl.lifestyle) {
    const item = LIFE_BY_ID.get(o.itemId);
    if (item) v += resaleValue(item, o.paid, (g.market.tick - o.boughtTick) / TPD, g.collectibles);
  }
  return v;
}

export interface NetWorthBreakdown {
  cash: number;
  markets: number;
  businesses: number;
  property: number;
  mortgages: number;
  lifestyle: number;
  lab: number;
  /** private companies the player founded, at 0.85 x V x ownership (spec 5.1) */
  companies: number;
  /** what the player holds in player-run funds (units at NAV, deposits and payouts owed, a manager's fees) */
  funds: number;
  /** the player's holdings of Launchpad tokens still on their curve, at the curve's spot price (graduated ones are in the markets) */
  tokens: number;
  total: number;
}

export function netWorthBreakdown(g: GameState, playerId: string): NetWorthBreakdown {
  const acct = g.market.accounts[playerId];
  const pl = g.players[playerId];
  const cash = acct?.cash ?? 0;
  const equity = acct ? equityOf(g.market, acct) : 0;
  let businesses = 0;
  for (const b of playerBusinesses(g, playerId)) businesses += bizValue(b);
  let property = 0;
  let mortgages = 0;
  for (const p of playerProperties(g, playerId)) {
    property += propValue(g, p);
    mortgages += p.mortgage;
  }
  const lifestyle = pl ? lifestyleValue(g, pl) : 0;
  const lab = labValue(g, playerId);
  const companies = companyNetWorth(g.companies, playerId, today(g));
  const funds = fundClaimsOf(g, playerId);
  const tokens = curveHoldingsValue(g, playerId);
  const total = equity + businesses + property - mortgages + lifestyle + lab + companies + funds + tokens;
  return { cash, markets: equity - cash, businesses, property, mortgages, lifestyle, lab, companies, funds, tokens, total };
}

/** Owned GPUs keep 60% of their price as resale value. */
export const GPU_TIERS: { id: string; name: string; price: number; pflopPerDay: number; powerMwhPerDay: number; rank: string }[] = [
  { id: 'g1', name: 'Gaming card (T1)', price: 2_000, pflopPerDay: 0.2, powerMwhPerDay: 0.01, rank: 'R2' },
  { id: 'g2', name: 'Workstation accelerator (T2)', price: 25_000, pflopPerDay: 3, powerMwhPerDay: 0.1, rank: 'R2' },
  { id: 'g3', name: 'DX-100 server (T3)', price: 300_000, pflopPerDay: 40, powerMwhPerDay: 1.2, rank: 'R3' },
  { id: 'g4', name: 'DX-100 pod (T4)', price: 4_000_000, pflopPerDay: 600, powerMwhPerDay: 15, rank: 'R3' },
  { id: 'g5', name: 'Superpod hall (T5)', price: 60_000_000, pflopPerDay: 10_000, powerMwhPerDay: 220, rank: 'R4' },
];

export function labValue(g: GameState, playerId: string): number {
  const lab = g.lab[playerId];
  if (!lab) return 0;
  let v = 0;
  for (const t of GPU_TIERS) v += (lab.gpus[t.id] ?? 0) * t.price * 0.6;
  return v;
}

export function bizDef(b: Business) {
  return BIZ_BY_ID.get(b.defId)!;
}

// ---------------------------------------------------------------- owner indexes

/**
 * Owner indexes for businesses, properties and security connections, rebuilt only when one of
 * those collections changes (every mutation calls touch). Keeps per-player lookups O(1) at
 * thousands of players. The cache lives outside the state, so snapshots never carry it.
 */
const versions = new WeakMap<object, number>();
interface OwnerIndex { ver: number; biz: Map<string, Business[]>; props: Map<string, Property[]>; entries: Map<string, import('./types').ConnectionEntry[]> }
const indexes = new WeakMap<object, OwnerIndex>();

export function touch(g: GameState): void {
  versions.set(g, (versions.get(g) ?? 0) + 1);
}

function group<T extends { ownerId: string }>(xs: Iterable<T>): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const arr = m.get(x.ownerId);
    if (arr) arr.push(x); else m.set(x.ownerId, [x]);
  }
  return m;
}

export function ownerIndex(g: GameState): OwnerIndex {
  const ver = versions.get(g) ?? 0;
  let ix = indexes.get(g);
  if (!ix || ix.ver !== ver) {
    ix = { ver, biz: group(Object.values(g.businesses)), props: group(Object.values(g.properties)), entries: group(Object.values(g.cyber.entries)) };
    indexes.set(g, ix);
  }
  return ix;
}

const EMPTY: never[] = [];

/** Open orders grouped by player, cached per market state (the market object changes every tick). */
const openIdx = new WeakMap<object, Map<string, import('@/engine').Order[]>>();
export function openOrdersOf(g: GameState, playerId: string): import('@/engine').Order[] {
  let m = openIdx.get(g.market);
  if (!m) {
    m = new Map();
    for (const o of g.market.orders) {
      if (o.status !== 'open') continue;
      const arr = m.get(o.playerId);
      if (arr) arr.push(o); else m.set(o.playerId, [o]);
    }
    openIdx.set(g.market, m);
  }
  return m.get(playerId) ?? EMPTY;
}

/** A player's orders: recent history (closed) then open, oldest first. */
export function ordersOf(g: GameState, playerId: string, limit = 120): import('@/engine').Order[] {
  const closed = g.market.closedOrders?.[playerId] ?? g.market.orders.filter((o) => o.playerId === playerId && o.status !== 'open');
  return [...closed.slice(-limit), ...openOrdersOf(g, playerId)];
}

export function findOrder(g: GameState, playerId: string, orderId: string): import('@/engine').Order | undefined {
  const hist = g.market.closedOrders?.[playerId];
  if (hist) for (let k = hist.length - 1; k >= 0 && k >= hist.length - 50; k--) if (hist[k]!.id === orderId) return hist[k];
  return g.market.orders.find((o) => o.id === orderId);
}

export function playerBusinesses(g: GameState, playerId: string): Business[] {
  return ownerIndex(g).biz.get(playerId) ?? EMPTY;
}

export function playerProperties(g: GameState, playerId: string): Property[] {
  return ownerIndex(g).props.get(playerId) ?? EMPTY;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function sanitize(text: string, max: number): string {
  // strip control characters and collapse whitespace; the UI renders as text, never HTML
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
