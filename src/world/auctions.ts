import { rankIndex, LIFE_BY_ID, LIFE_ITEMS, type LifeItem } from '@/content/lifestyle';
import { openAccount } from '@/engine';
import { TPD, assetFlow, debit, notify, spendableCash, transfer } from './core';
import { refreshPrestige } from './assets';
import { sha256Hex } from './company/hash';
import { pureMemo } from './pure-memo';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import type { CommandResult, GameState, StepOutput } from './types';

/**
 * The weekly live auctions (lead-phase6.md 6D, bible 01 §6 and 04 §7.6): 3 to 5 rare fictional collectibles each real week,
 * one English ascending auction per lot, one real hour long (720 ticks, one game day).
 *
 * Money (every movement is booked, so the world money identity closes to the cent):
 *   the buyer pays the hammer H and a buyer premium of 15% of H. The premium ("auction buyer premium") and the 12% seller fee
 *   ("auction seller fee") are sinks. The consignor's share, H minus the fee, is a transfer to the fictional consignor
 *   account (npc:consignor), so it stays in the world and no value is destroyed. Money is never escrowed: a bid needs spendable cash for H plus the premium at
 *   bid time, and the settlement re-checks it, so a bidder who spent the cash is passed over for the next valid bid.
 *
 * Anti-snipe: a bid that lands in the last 2 real minutes (24 ticks) extends the lot by 2 real minutes (24 ticks).
 * Visibility: during the auction the high bid and the bid count are public; bidder handles appear only at the end.
 * The reserve is set from the collectibles index at the lot's first bid and never shown. Nothing about it is shown during the
 * auction, not even whether the high bid meets it: a bidder who raised in 2% steps could otherwise find the reserve. After the
 * settlement the view says whether the winning bid met it. The lots of a week are a pure function of the world seed and the
 * week, so the schedule needs no storage until someone bids.
 */

export const AUCTION = {
  lotsMin: 3,
  lotsMax: 5,
  /** one real hour, one game day */
  hourTicks: TPD,
  /** the last 2 real minutes (24 ticks of 5 s) */
  snipeWindowTicks: 24,
  /** the extension a snipe buys: 2 real minutes */
  snipeExtendTicks: 24,
  /** the minimum raise over the high bid: 2% */
  minRaise: 0.02,
  /** the opening bid, as a share of the reserve */
  openShare: 0.5,
  /**
   * The reserve, as a share of the list price times the collectibles index. Each lot draws its own factor in this band from
   * the world seed, so the public opening bid does not give the reserve away.
   */
  reserveLow: 0.8,
  reserveHigh: 1.1,
  premium: 0.15,
  sellerFee: 0.12,
} as const;

/** The fictional consignor's account: it takes the hammer less the seller fee (a transfer, so no value is destroyed). */
export const CONSIGNOR_ID = 'npc:consignor';

export type AuctionStatus = 'open' | 'sold' | 'unsold';

export interface AuctionBidRecord {
  playerId: string;
  amount: number;
  tick: number;
}

export interface AuctionLotRecord {
  key: string;
  week: number;
  itemId: string;
  openTick: number;
  endTick: number;
  reserve: number;
  start: number;
  bids: AuctionBidRecord[];
  status: AuctionStatus;
  winnerId?: string;
  hammer?: number;
  premium?: number;
  fee?: number;
  settledTick?: number;
}

export interface AuctionState {
  lots: Record<string, AuctionLotRecord>;
  /**
   * The e2e seam (`admin.auctionOpen`): a week whose lots were opened early, by its open tick. Absent in a live world, where a
   * week opens at its first tick. Only the admin command writes it.
   */
  openedAt?: Record<string, number>;
}

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string, data?: Record<string, number | string>): CommandResult => ({ ok: false, error, ...(data ? { data } : {}) });

const cents = (x: number): number => Math.round(x * 100) / 100;

export function lotKeyOf(week: number, itemId: string): string {
  return `${week}:${itemId}`;
}

/** The tick a week's lots open: its first tick, unless the admin seam opened them early. */
export function openTickOf(g: GameState, week: number): number {
  return g.auctions?.openedAt?.[String(week)] ?? week * TOURNAMENT_WEEK_TICKS;
}

/**
 * The admin seam (`admin.auctionOpen`, e2e only): opens a week's lots at once, with `ticksLeft` ticks to run (default: the
 * full hour). From then on the lots follow the live rules: bids, the anti-snipe extension and the settlement.
 */
export function adminOpenLots(g: GameState, week: number, ticksLeft: number = AUCTION.hourTicks): CommandResult {
  if (!Number.isInteger(week) || week < 0) return fail('auctionNoLot');
  if (!Number.isInteger(ticksLeft) || ticksLeft <= 0 || ticksLeft > AUCTION.hourTicks) return fail('auctionOpenLeft');
  g.auctions ??= { lots: {} };
  const openTick = g.market.tick + ticksLeft - AUCTION.hourTicks;
  g.auctions.openedAt = { ...(g.auctions.openedAt ?? {}), [String(week)]: openTick };
  return ok({ week, openTick, endTick: openTick + AUCTION.hourTicks });
}

/**
 * The auction lots of a week: 3 to 5 limited or unique collectibles, chosen by a hash of the world seed and the week. The answer
 * is a pure function of (seed, week), so it is memoized (V1-PHASE9 9C.1: every view of every socket read it, with about thirty
 * hashes a call). The copy keeps a caller from changing the memo.
 */
const lotMemo = pureMemo<LifeItem[]>(64);

export function weekLots(seed: string, week: number, bands: boolean = true): LifeItem[] {
  return lotMemo(JSON.stringify([seed, week, bands]), () => computeWeekLots(seed, week, bands)).slice();
}

/**
 * The draw a week uses (R-10-7): the rank-band draw from `g.auctionBandsFrom` on, and the draw of the earlier builds before it
 * (an older save's open lots, see GameState.auctionBandsFrom). Every game-side read goes through here.
 */
export function lotsOf(g: GameState, week: number): LifeItem[] {
  return weekLots(g.seed, week, g.auctionBandsFrom !== undefined && week >= g.auctionBandsFrom);
}

/**
 * The rank bands the week's lots are drawn from (R-10-7): an item belongs to the band of its own minimum rank, so a lot's
 * price sits in the range of the players who can bid on it. Each band is drawn in turn, one lot each, so every week offers
 * a lot in each band that has items, and the rest of the count goes round the bands again.
 */
export const AUCTION_BANDS: readonly (readonly string[])[] = [['R0', 'R1'], ['R2', 'R3'], ['R4', 'R5', 'R6']];

/**
 * The uncached lot choice (weekLots is this, memoized). `bands` false is the draw before R-10-7: the count's n lowest hashes
 * of the whole pool. It is kept for the weeks an older save had open, so their lots do not change at the deploy.
 */
export function computeWeekLots(seed: string, week: number, bands: boolean = true): LifeItem[] {
  const pool = LIFE_ITEMS.filter((i) => i.cls === 'limited' || i.cls === 'unique');
  const h = sha256Hex(`auction-count|${seed}|${week}`);
  const n = AUCTION.lotsMin + (parseInt(h.slice(0, 8), 16) % (AUCTION.lotsMax - AUCTION.lotsMin + 1));
  if (!bands) {
    const keyed = pool.map((item) => ({ item, k: sha256Hex(`auction-pick|${seed}|${week}|${item.id}`) }));
    keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    return keyed.slice(0, n).map((x) => x.item);
  }
  const bandPools = AUCTION_BANDS.map((ranks) => pool
    .filter((item) => ranks.includes(item.rank))
    .map((item) => ({ item, k: sha256Hex(`auction-pick|${seed}|${week}|${item.id}`) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)));
  const picks: LifeItem[] = [];
  for (let round = 0; picks.length < n; round++) {
    let drew = false;
    for (const band of bandPools) {
      if (picks.length >= n) break;
      const x = band[round];
      if (x) { picks.push(x.item); drew = true; }
    }
    if (!drew) break;
  }
  return picks;
}

function ownedByAnyone(g: GameState, itemId: string): boolean {
  return Object.values(g.players).some((p) => p.lifestyle.some((o) => o.itemId === itemId));
}

/** The high bid of a lot, or null before the first bid. */
export function highBid(lot: AuctionLotRecord): AuctionBidRecord | null {
  let best: AuctionBidRecord | null = null;
  for (const b of lot.bids) if (!best || b.amount > best.amount) best = b;
  return best;
}

/** The lowest amount a next bid may name: the opening bid, or the high bid plus the minimum raise. */
export function minimumBid(lot: AuctionLotRecord): number {
  const hi = highBid(lot);
  return hi ? cents(hi.amount * (1 + AUCTION.minRaise)) : lot.start;
}

/** The hidden reserve factor of a lot, in [reserveLow, reserveHigh): a hash of the world seed, the week and the item. */
const reserveMemo = pureMemo<number>(4096);

export function reserveFactor(seed: string, week: number, itemId: string): number {
  return reserveMemo(JSON.stringify([seed, week, itemId]), () => computeReserveFactor(seed, week, itemId));
}

/** The uncached reserve factor (reserveFactor is this, memoized). */
export function computeReserveFactor(seed: string, week: number, itemId: string): number {
  const h = sha256Hex(`auction-reserve|${seed}|${week}|${itemId}`);
  return AUCTION.reserveLow + (AUCTION.reserveHigh - AUCTION.reserveLow) * (parseInt(h.slice(0, 8), 16) / 0x100000000);
}

/**
 * The reserve and the public opening bid of a lot, both from the collectibles index and the list price. The opening bid is
 * 50% of the index value; the reserve is the index value times the lot's hidden factor. Computed when a bid arrives, and
 * stored with the lot only once that bid is accepted.
 */
export function priceLot(g: GameState, item: LifeItem, week: number): { reserve: number; start: number } {
  const value = item.price * g.collectibles;
  return { reserve: cents(value * reserveFactor(g.seed, week, item.id)), start: cents(value * AUCTION.openShare) };
}

/**
 * Bid on a lot. The bid must be at least the minimum, the bidder must hold the spendable cash for it plus the buyer premium,
 * and the bidder must have the rank for the item (as for a purchase). A bid in the last 2 real minutes extends the lot.
 */
export function placeBid(g: GameState, pid: string, key: string, amount: number): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('noPlayer');
  const [weekStr, ...rest] = key.split(':');
  const week = Number(weekStr);
  const itemId = rest.join(':');
  const item = LIFE_BY_ID.get(itemId);
  if (!item || !Number.isInteger(week) || !lotsOf(g, week).some((x) => x.id === itemId)) return fail('auctionNoLot');
  const open = openTickOf(g, week);
  const tick = g.market.tick;
  if (tick < open) return fail('auctionNotYet', { hours: Math.ceil((open - tick) / TPD) });
  const existing = g.auctions?.lots[key];
  if (existing && (existing.status !== 'open' || tick >= existing.endTick)) return fail('auctionClosed');
  if (!existing && tick >= open + AUCTION.hourTicks) return fail('auctionClosed');
  if (rankIndex(p.rankId) < rankIndex(item.rank)) return fail('auctionRank', { rank: item.rank });
  if (!Number.isFinite(amount) || amount <= 0) return fail('auctionAmount');
  const amt = cents(amount);
  const min = existing ? minimumBid(existing) : priceLot(g, item, week).start;
  if (amt < min) return fail('bidLow', { min: cents(min) });
  const need = cents(amt * (1 + AUCTION.premium));
  if (spendableCash(g, pid) < need) return fail('bidCash', { amount: amt, need });
  g.auctions ??= { lots: {} };
  let lot = existing;
  if (!lot) {
    const { reserve, start } = priceLot(g, item, week);
    lot = { key, week, itemId, openTick: open, endTick: open + AUCTION.hourTicks, reserve, start, bids: [], status: 'open' };
    g.auctions.lots[key] = lot;
  }
  lot.bids.push({ playerId: pid, amount: amt, tick });
  // a snipe in the last 2 real minutes extends the lot by 2 real minutes
  if (lot.endTick - tick <= AUCTION.snipeWindowTicks) lot.endTick += AUCTION.snipeExtendTicks;
  return ok({ amount: amt, endTick: lot.endTick });
}

/**
 * Settle every lot whose end has passed (stepGame, once per tick, cheap when no lot is open). The highest bid that still
 * holds its cash and meets the reserve wins; the winner pays the hammer and the premium, and the seller fee comes out of the
 * hammer. Nothing moves for losing bidders.
 */
export function auctionTick(g: GameState, out: StepOutput | null): void {
  const lots = g.auctions?.lots;
  if (!lots) return;
  const tick = g.market.tick;
  for (const lot of Object.values(lots)) {
    if (lot.status !== 'open' || tick < lot.endTick) continue;
    settleLot(g, lot, out);
  }
}

export function settleLot(g: GameState, lot: AuctionLotRecord, out: StepOutput | null): void {
  const item = LIFE_BY_ID.get(lot.itemId);
  const tick = g.market.tick;
  lot.settledTick = tick;
  const ranked = [...lot.bids].sort((a, b) => b.amount - a.amount || a.tick - b.tick);
  let winner: AuctionBidRecord | null = null;
  for (const b of ranked) {
    if (b.amount < lot.reserve) break;
    const p = g.players[b.playerId];
    if (!p || p.npc) continue;
    // a unique lot that someone already holds does not sell: the bidder sees only "did not sell", as for an unmet reserve
    if (item?.cls === 'unique' && ownedByAnyone(g, lot.itemId)) break;
    if (spendableCash(g, b.playerId) < cents(b.amount * (1 + AUCTION.premium))) continue;
    winner = b;
    break;
  }
  if (!item || !winner) {
    lot.status = 'unsold';
    for (const b of lot.bids) notify(g, out, b.playerId, { kind: 'auction', tone: 'info', text: `${item?.name ?? 'A lot'} did not sell.`, msg: { key: 'auction.unsold', vars: { item: item?.name ?? '' } } });
    return;
  }
  const hammer = winner.amount;
  const premium = cents(hammer * AUCTION.premium);
  const fee = cents(hammer * AUCTION.sellerFee);
  g.market = openAccount(g.market, CONSIGNOR_ID, 0);
  transfer(g, winner.playerId, CONSIGNOR_ID, cents(hammer - fee));
  debit(g, winner.playerId, fee, 'auction seller fee');
  debit(g, winner.playerId, premium, 'auction buyer premium');
  const w = g.players[winner.playerId]!;
  w.lifestyle.push({ uid: `${winner.playerId}-auction-${lot.key}`, itemId: lot.itemId, paid: hammer, boughtTick: tick });
  // the cash the buyer paid for the lot (hammer and premium; the seller fee is taken out of the hammer) converts into the lot:
  // a purchase is trading 0, and the drop to its resale value is a re-mark
  if (item) assetFlow(g, winner.playerId, hammer + premium);
  w.stats.lifeBought++;
  refreshPrestige(g, w);
  lot.status = 'sold';
  lot.winnerId = winner.playerId;
  lot.hammer = hammer;
  lot.premium = premium;
  lot.fee = fee;
  const pay = cents(hammer + premium);
  notify(g, out, winner.playerId, {
    kind: 'auction', tone: 'gain', text: `You won ${item.name} for $${pay.toFixed(2)}, buyer premium included.`,
    msg: { key: 'auction.won', vars: { item: item.name, amount: `#n:${pay},2,2` } },
  });
  const seen = new Set<string>([winner.playerId]);
  for (const b of lot.bids) {
    if (seen.has(b.playerId)) continue;
    seen.add(b.playerId);
    notify(g, out, b.playerId, { kind: 'auction', tone: 'info', text: `${item.name} sold to another bidder.`, msg: { key: 'auction.lost', vars: { item: item.name } } });
  }
}

export interface AuctionLotView {
  key: string;
  itemId: string;
  name: string;
  category: string;
  /** the lowest rank that may bid on the lot (the item's rank; the bid refuses below it) */
  minRank: string;
  cls: string;
  rarity: number;
  blurb: string;
  status: AuctionStatus | 'upcoming';
  openTick: number;
  endTick: number;
  bidCount: number;
  high: number | null;
  /**
   * Whether the high bid met the reserve: null until the lot has settled (and when no one bid). The reserve itself is never
   * shown, and no field during the auction depends on it.
   */
  reserveMet: boolean | null;
  minimum: number | null;
  /** during the auction: nothing about who bid. At the end: the winner and the bidder handles */
  mine: boolean;
  winner: string | null;
  hammer: number | null;
  bidders: string[] | null;
}

/**
 * The public view of a week's lots. Before the end, only the high bid, the count and the minimum: nothing that depends on the
 * hidden reserve. After the end, whether the reserve was met, the winner and the bidders by handle. Nothing about a bidder's
 * cash or strategy appears.
 */
export function auctionsView(g: GameState, pid: string | null, week: number): AuctionLotView[] {
  return lotsOf(g, week).map((item) => {
    const key = lotKeyOf(week, item.id);
    const lot = g.auctions?.lots[key];
    const open = openTickOf(g, week);
    // a lot with no bid yet has no record: it is open from the open tick until the hour ends, and unsold after that
    const live = g.market.tick >= open && g.market.tick < open + AUCTION.hourTicks;
    const status: AuctionLotView['status'] = lot ? lot.status : (g.market.tick < open ? 'upcoming' : live ? 'open' : 'unsold');
    const hi = lot ? highBid(lot) : null;
    const bidders = lot && lot.status !== 'open' ? [...new Set(lot.bids.map((b) => g.players[b.playerId]?.handle ?? '?'))] : null;
    return {
      key, itemId: item.id, name: item.name, category: item.category, minRank: item.rank, cls: item.cls, rarity: item.rarity, blurb: item.blurb, status,
      openTick: open, endTick: lot?.endTick ?? open + AUCTION.hourTicks,
      bidCount: lot?.bids.length ?? 0,
      high: hi ? hi.amount : null,
      // no reserve-derived field until the settlement (a probe ladder of 2% raises would otherwise find the reserve)
      reserveMet: lot && hi && lot.status !== 'open' ? hi.amount >= lot.reserve : null,
      minimum: status === 'open' ? (lot ? minimumBid(lot) : priceLot(g, item, week).start) : null,
      mine: !!pid && !!lot && lot.bids.some((b) => b.playerId === pid),
      winner: lot?.winnerId ? g.players[lot.winnerId]?.handle ?? null : null,
      hammer: lot?.hammer ?? null,
      bidders,
    };
  });
}
