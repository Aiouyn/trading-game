import { COMPANY, type CompanySector } from '@/content/company';
import { tenderOffer, type StepEvent, type WorldState } from '@/engine';
import { boardVote } from './governance';
import { privateValue } from './company';
import type { CompanyReject, CompanyWorld, Company } from './types';

/**
 * Takeovers (spec 9.2, X8, N13, DECISIONS C4). A bid is an all-holder tender at one price, settled by the engine
 * (companyAssets.tenderOffer). This file holds what the engine does not: the pre-attack start T0 and the floor that follows
 * from it, the antitrust refusal above 60% of the sector, the self-dealing guard, and the target board's vote (share-weighted;
 * NPC pools approve iff the price is at or above fair value per share). The founder's own vote is the target's standing
 * stance, which only the founder sets (`company.act` takeoverStance); a bidder cannot cast it. An accepted bid moves the
 * company to the bidder.
 *
 * The floor is 1.2 x the company's VWAP over the 30 closed game days ending on T0 - 1, read from the company's own daily
 * history (`CompanyWorld.tape`), not from the engine's bar buffer (which keeps 30 bars and would not reach T0 in play). The
 * engine checks its own floor on the current VWAP30 too, so the stricter of the two applies. T0 counts every account of the
 * bidder's owner set (spec 9.2).
 *
 * Gap (stated): NPC acquirers bid through this API only; no NPC acquirer makes a scheduled bid in v1.
 */

export interface Bidder {
  kind: 'npc' | 'player';
  /** the player who bids (a player bidder), or undefined for an NPC acquirer */
  playerId?: string;
  /** the bidder's own sector and market share, for the antitrust test (an NPC acquirer reports its own) */
  sector: CompanySector;
  share: number;
}

export interface BidArgs {
  companyId: string;
  /** the engine account that pays (a player's account, or an NPC acquirer's account) */
  bidderId: string;
  bidder: Bidder;
  price: number;
  /** every player id in the bidder's owner set (the bidder, its alts and alliance mates): the self-dealing guard and T0 */
  covered: string[];
}

export type BidResult =
  | { ok: true; world: CompanyWorld; engine: WorldState; events: StepEvent[]; floor: number; t0: number }
  | { ok: false; reject: CompanyReject };

/** A company's market share in its own market: the sum of its product shares (the logit with NPC rivals, spec 2). */
export function marketShareOf(c: Company): number {
  return c.products.reduce((s, p) => s + p.lastShare, 0);
}

/**
 * The daily watch of the stakes in a listed company (the inputs to T0): the first day an account is net short, and the first
 * day it reduces a position by more than 0.5% of float in one day. `qtyByAccount` is the engine's position of every account
 * in the asset today (zero for an account without one).
 */
export function observeStakes(w: CompanyWorld, c: Company, qtyByAccount: Record<string, number>, floatShares: number, day: number): void {
  w.watch ??= {};
  const per = (w.watch[c.id] ??= {});
  const ids = new Set([...Object.keys(per), ...Object.keys(qtyByAccount)]);
  for (const acct of [...ids].sort()) {
    const qty = qtyByAccount[acct] ?? 0;
    const rec = per[acct] ?? { lastQty: 0 };
    if (qty < 0 && rec.firstShort === undefined) rec.firstShort = day;
    if (rec.lastQty - qty > COMPANY.takeover.bigSellShare * floatShares && rec.bigSell === undefined) rec.bigSell = day;
    rec.lastQty = qty;
    per[acct] = rec;
  }
}

/**
 * Appends the company's close and volume of one game day to its history (the pre-attack floor reads it). Called once a day
 * for each listed company, with the day that just closed.
 */
export function recordTape(w: CompanyWorld, c: Company, day: number, close: number, units: number): void {
  w.tape ??= {};
  const h = (w.tape[c.id] ??= []);
  if (h.length > 0 && h[h.length - 1]!.day >= day) return;
  h.push({ day, c: close, u: units });
  if (h.length > 1000) h.splice(0, h.length - 1000);
}

/**
 * T0 (spec 9.2): the earliest of 63 gd before the announcement, and, over the accounts of the bidder's owner set, the first
 * day one is net short in the target and the first day one sells more than 0.5% of float in a day.
 */
export function t0Of(w: CompanyWorld, c: Company, accounts: string[], announceDay: number): number {
  const candidates = [announceDay - COMPANY.takeover.preAttackDays];
  for (const acct of accounts) {
    const rec = w.watch?.[c.id]?.[acct];
    if (rec?.firstShort !== undefined) candidates.push(rec.firstShort);
    if (rec?.bigSell !== undefined) candidates.push(rec.bigSell);
  }
  return Math.min(...candidates);
}

/**
 * The pre-attack VWAP: sum(close x units) / sum(units) over the closed game days in [T0 - 30, T0 - 1], from the company's
 * history. Null when the company traded in none of those days (no pre-attack price to set a floor from).
 */
export function preAttackVwap(w: CompanyWorld, c: Company, t0: number): number | null {
  const lo = t0 - COMPANY.takeover.vwapDays;
  let num = 0;
  let units = 0;
  for (const b of w.tape?.[c.id] ?? []) {
    if (b.day < lo || b.day >= t0) continue;
    num += b.c * b.u;
    units += b.u;
  }
  return units > 0 ? num / units : null;
}

/** The floor of a bid from T0 (spec 9.2): 1.2 x the pre-attack VWAP, or null when there is no pre-attack trading. */
export function preAttackFloor(w: CompanyWorld, c: Company, t0: number): number | null {
  const vw = preAttackVwap(w, c, t0);
  return vw === null ? null : COMPANY.takeover.floorRatio * vw;
}

/**
 * Bids for a listed company. Refusals, in order: not a listed company, a bankrupt one, a self-dealing bidder, no bidder
 * account, antitrust (the combined share of the sector above 60% when the bidder is in the same sector), no pre-attack
 * trading, the floor, the board's vote, and the engine's settlement (unfunded). Accepted, the company moves to the bidder:
 * the stock is delisted and the company's capital belongs to the bidder (a player) or to the NPC acquirer's account.
 */
export function bid(w: CompanyWorld, eng: WorldState, day: number, a: BidArgs): BidResult {
  const c = w.companies[a.companyId];
  if (!c) return { ok: false, reject: { code: 'unknownCompany' } };
  if (c.bankrupt) return { ok: false, reject: { code: 'companyBankrupt' } };
  if (!c.listed || !eng.config.assets.some((x) => x.id === c.listed!.assetId)) return { ok: false, reject: { code: 'takeoverNotListed' } };
  if (a.bidder.kind === 'player' && a.covered.includes(c.ownerId)) return { ok: false, reject: { code: 'takeoverSelfDeal' } };
  if (!eng.accounts[a.bidderId]) return { ok: false, reject: { code: 'takeoverNoBidder' } };

  const targetShare = marketShareOf(c);
  const combined = a.bidder.sector === c.sector ? a.bidder.share + targetShare : 0;
  if (combined > COMPANY.npc.antitrustShare) return { ok: false, reject: { code: 'antitrustBlock', share: Math.round(combined * 100) } };

  const t0 = t0Of(w, c, [a.bidderId, ...a.covered], day);
  const floor = preAttackFloor(w, c, t0);
  if (floor === null) return { ok: false, reject: { code: 'takeoverNoFloor' } };
  if (!(a.price >= floor)) return { ok: false, reject: { code: 'takeoverBelowFloor', floor } };

  const fairPerShare = privateValue(c, day) / c.shares;
  const vote = boardVote(c, { founderVote: c.founderStance ?? 'no', price: a.price, fairPerShare, npcRule: 'price' });
  if (!vote.passed) return { ok: false, reject: { code: 'boardRejected', yes: vote.yes, no: vote.no } };

  const r = tenderOffer(eng, c.listed.assetId, a.price, a.bidderId);
  if (r.reject) {
    const rj = r.reject;
    if (rj.code === 'tenderNotCompany') return { ok: false, reject: { code: 'takeoverNotListed' } };
    if (rj.code === 'tenderNoBidder') return { ok: false, reject: { code: 'takeoverNoBidder' } };
    if (rj.code === 'tenderBelowFloor') return { ok: false, reject: { code: 'takeoverBelowFloor', floor: rj.floor } };
    return { ok: false, reject: { code: 'takeoverUnfunded', shortfall: rj.shortfall } };
  }

  const holder = a.bidder.kind === 'player' ? `founder:${a.bidder.playerId}` : `npc:acq:${a.bidderId}`;
  c.ownerId = a.bidder.kind === 'player' ? (a.bidder.playerId ?? a.bidderId) : `npc:acq:${a.bidderId}`;
  c.capTable = { [holder]: c.shares };
  c.listed = null;
  c.founderStance = undefined;
  if (w.watch) delete w.watch[c.id];
  return { ok: true, world: w, engine: r.state, events: r.events, floor, t0 };
}
