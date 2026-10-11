import { rankIndex, LIFE_BY_ID, LIFE_ITEMS, type LifeItem } from '@/content/lifestyle';
import { TPD, debit, notify, spendableCash } from './core';
import { refreshPrestige } from './assets';
import { sha256Hex } from './company/hash';
import { TOURNAMENT_WEEK_TICKS } from './tournamentWeek';
import type { CommandResult, GameState, StepOutput } from './types';

/**
 * The weekly live auctions (lead-phase6.md 6D, bible 01 §6 and 04 §7.6): 3 to 5 rare fictional collectibles each real week,
 * one English ascending auction per lot, one real hour long (720 ticks, one game day).
 *
 * Money (every movement is booked, so the world money identity closes to the cent):
 *   the buyer pays the hammer H and a buyer premium of 15% of H. Both are sinks: the premium ("auction buyer premium") and
 *   the hammer, which leaves the player economy to the consignor. The consignor's share is H minus the 12% seller fee; the
 *   fee ("auction seller fee") is a sink too. Money is never escrowed: a bid needs spendable cash for H plus the premium at
 *   bid time, and the settlement re-checks it, so a bidder who spent the cash is passed over for the next valid bid.
 *
 * Anti-snipe: a bid that lands in the last 2 real minutes (24 ticks) extends the lot by 2 real minutes (24 ticks).
 * Visibility: during the auction the high bid and the bid count are public; bidder handles appear only at the end.
 * The reserve is set from the collectibles index at the lot's first bid and never shown; the view says only whether the
 * high bid meets it. The lots of a week are a pure function of the world seed and the week, so the schedule needs no storage
 * until someone bids.
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
  /** the reserve, as a share of the list price times the collectibles index */
  reserveShare: 0.9,
  premium: 0.15,
  sellerFee: 0.12,
} as const;

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
}

const ok = (data?: unknown): CommandResult => ({ ok: true, ...(data !== undefined ? { data } : {}) });
const fail = (error: string): CommandResult => ({ ok: false, error });

const cents = (x: number): number => Math.round(x * 100) / 100;

export function lotKeyOf(week: number, itemId: string): string {
  return `${week}:${itemId}`;
}

/** The auction lots of a week: 3 to 5 limited or unique collectibles, chosen by a hash of the world seed and the week. */
export function weekLots(seed: string, week: number): LifeItem[] {
  const pool = LIFE_ITEMS.filter((i) => i.cls === 'limited' || i.cls === 'unique');
  const h = sha256Hex(`auction-count|${seed}|${week}`);
  const n = AUCTION.lotsMin + (parseInt(h.slice(0, 8), 16) % (AUCTION.lotsMax - AUCTION.lotsMin + 1));
  const keyed = pool.map((item) => ({ item, k: sha256Hex(`auction-pick|${seed}|${week}|${item.id}`) }));
  keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return keyed.slice(0, n).map((x) => x.item);
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

/** The reserve and opening bid at which a lot is first priced: the collectibles index, set once at the first bid. */
export function priceLot(g: GameState, item: LifeItem): { reserve: number; start: number } {
  const reserve = cents(item.price * g.collectibles * AUCTION.reserveShare);
  return { reserve, start: cents(reserve * AUCTION.openShare) };
}

/**
 * Bid on a lot. The bid must be at least the minimum, the bidder must hold the spendable cash for it plus the buyer premium,
 * and the bidder must have the rank for the item (as for a purchase). A bid in the last 2 real minutes extends the lot.
 */
export function placeBid(g: GameState, pid: string, key: string, amount: number): CommandResult {
  const p = g.players[pid];
  if (!p || p.npc) return fail('No player account to bid with. Join the world first.');
  const [weekStr, ...rest] = key.split(':');
  const week = Number(weekStr);
  const itemId = rest.join(':');
  const item = LIFE_BY_ID.get(itemId);
  if (!item || !Number.isInteger(week) || !weekLots(g.seed, week).some((x) => x.id === itemId)) return fail('No such lot this week.');
  const open = week * TOURNAMENT_WEEK_TICKS;
  const tick = g.market.tick;
  if (tick < open) return fail(`The lot opens at tick ${open}. Bids open with the week; wait for it.`);
  g.auctions ??= { lots: {} };
  let lot = g.auctions.lots[key];
  if (lot && (lot.status !== 'open' || tick >= lot.endTick)) return fail('This auction has closed. Its result is on the lot.');
  if (!lot && tick >= open + AUCTION.hourTicks) return fail('This auction has closed. It ran one real hour.');
  if (rankIndex(p.rankId) < rankIndex(item.rank)) return fail(`${item.name} unlocks at a higher rank. Reach ${item.rank} to bid.`);
  if (item.cls === 'unique' && ownedByAnyone(g, itemId)) return fail(`${item.name} is already owned. Unique lots are withdrawn.`);
  if (!Number.isFinite(amount) || amount <= 0) return fail('Enter a bid amount. It must be a positive number.');
  if (!lot) {
    const { reserve, start } = priceLot(g, item);
    lot = { key, week, itemId, openTick: open, endTick: open + AUCTION.hourTicks, reserve, start, bids: [], status: 'open' };
    g.auctions.lots[key] = lot;
  }
  const amt = cents(amount);
  const min = minimumBid(lot);
  if (amt < min) return fail(`Your bid is too low. The next bid must be at least $${min.toLocaleString('en-US')}.`);
  const need = cents(amt * (1 + AUCTION.premium));
  if (spendableCash(g, pid) < need) return fail(`Not enough cash for that bid. A bid of $${amt.toLocaleString('en-US')} needs $${need.toLocaleString('en-US')} with the buyer premium.`);
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
  debit(g, winner.playerId, hammer - fee, 'auction consignor');
  debit(g, winner.playerId, fee, 'auction seller fee');
  debit(g, winner.playerId, premium, 'auction buyer premium');
  const w = g.players[winner.playerId]!;
  w.lifestyle.push({ uid: `${winner.playerId}-auction-${lot.key}`, itemId: lot.itemId, paid: hammer, boughtTick: tick });
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
    msg: { key: 'auction.won', vars: { item: item.name, amount: pay.toFixed(2) } },
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
  cls: string;
  rarity: number;
  blurb: string;
  status: AuctionStatus | 'withdrawn' | 'upcoming';
  openTick: number;
  endTick: number;
  bidCount: number;
  high: number | null;
  /** whether the high bid meets the reserve; the reserve itself is never shown */
  reserveMet: boolean | null;
  minimum: number | null;
  /** during the auction: nothing about who bid. At the end: the winner and the bidder handles */
  mine: boolean;
  winner: string | null;
  hammer: number | null;
  bidders: string[] | null;
}

/**
 * The public view of a week's lots. Before the end, only the high bid, the count, and whether the reserve is met. After the
 * end, the winner and the bidders by handle. Nothing about a bidder's cash or strategy appears.
 */
export function auctionsView(g: GameState, pid: string | null, week: number): AuctionLotView[] {
  return weekLots(g.seed, week).map((item) => {
    const key = lotKeyOf(week, item.id);
    const lot = g.auctions?.lots[key];
    const ended = lot ? lot.status !== 'open' : g.market.tick >= week * TOURNAMENT_WEEK_TICKS + AUCTION.hourTicks;
    let status: AuctionLotView['status'] = lot ? lot.status : (ended ? 'unsold' : 'upcoming');
    if (item.cls === 'unique' && ownedByAnyone(g, item.id) && !(lot?.winnerId)) status = 'withdrawn';
    const hi = lot ? highBid(lot) : null;
    const bidders = lot && lot.status !== 'open' ? [...new Set(lot.bids.map((b) => g.players[b.playerId]?.handle ?? '?'))] : null;
    return {
      key, itemId: item.id, name: item.name, category: item.category, cls: item.cls, rarity: item.rarity, blurb: item.blurb, status,
      openTick: week * TOURNAMENT_WEEK_TICKS, endTick: lot?.endTick ?? week * TOURNAMENT_WEEK_TICKS + AUCTION.hourTicks,
      bidCount: lot?.bids.length ?? 0,
      high: hi ? hi.amount : null,
      reserveMet: lot && hi ? hi.amount >= lot.reserve : null,
      minimum: lot && lot.status === 'open' ? minimumBid(lot) : null,
      mine: !!pid && !!lot && lot.bids.some((b) => b.playerId === pid),
      winner: lot?.winnerId ? g.players[lot.winnerId]?.handle ?? null : null,
      hammer: lot?.hammer ?? null,
      bidders,
    };
  });
}
