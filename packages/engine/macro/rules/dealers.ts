// T04-12 primary dealers (04 §3.10.5): eligibility, obligations, quarter review, auction shares, league table.
import { MICRO_N, roundHalfEven, SortedMap, TICKS_PER_GAME_DAY, type Id, type Money, type PhaseCtx, type Qty, type StoreRead, type Tick } from '@tycoon/engine-core';
import { DEALER_POOL_ID } from '../ids';
import type { MacroPorts } from '../ports';
import { macroTables, type AuctionBid, type BlocId, type PrimaryDealerStatus } from '../schema';

export const NPC_DEALERS_PER_BLOC = 8 as const;
const D = TICKS_PER_GAME_DAY, QD = 91, LOT: Qty = 1000n * MICRO_N, T = macroTables.dealer.name;
const NOT_ELIGIBLE = 'CBK_NOT_ELIGIBLE';
/** Game-quarter index of a tick (quarters are 91-day blocks from genesis, as quarterStartDay). */
export const quarterOf = (tick: Tick): number => Math.floor(Math.floor(tick / D) / QD);
const qKey = (q: number): string => String(q).padStart(6, '0');
const byId = (x: PrimaryDealerStatus, y: PrimaryDealerStatus): number => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
const rowsOf = (s: StoreRead, b: BlocId): PrimaryDealerStatus[] => [...s.iter<PrimaryDealerStatus>(T)].filter((r) => r.bloc === b).sort(byId);
/** NPC dealer keys: the pool's awards split into 8 named dealers (MISSING EXPORT: T22 NPC dealer names; the key stands in for the name). */
export const npcDealerKey = (b: BlocId, i: number): string => `${DEALER_POOL_ID(b)}#${i}`;

/** null = eligible. Decision: `swfNetWorth` (bloc ccy) is the caller's ctx.ledger.netWorth at spot for an SWF entity (StoreRead has no ledger);
 *  a live non-REVOKED row (already applied/active/resigning) is also CBK_NOT_ELIGIBLE. */
export function dealerEligibility(store: StoreRead, ports: MacroPorts, b: BlocId, entityId: Id, debtStock: Money, swfNetWorth?: Money): string | null {
  const pl = ports.players, row = store.get<PrimaryDealerStatus>(T, `${b}:${entityId}`);
  if (row) return NOT_ELIGIBLE;
  const bank = pl.hasCharter(store, entityId, 'CH_BANK', b), swf = pl.swfPrivilege(store, entityId);
  const eq = (bank ? ports.credit?.bankEquity(store, entityId) : null) ?? (swf ? swfNetWorth ?? null : null);
  if (eq === null || eq * 10_000n < debtStock * 5n) return NOT_ELIGIBLE;
  if (pl.reputationLowestBand(store, entityId)) return NOT_ELIGIBLE;
  return null;
}
export function activeDealers(store: StoreRead, b: BlocId): PrimaryDealerStatus[] { return rowsOf(store, b).filter((r) => !r.npc && r.status === 'ACTIVE'); }
export function dealerCount(store: StoreRead, b: BlocId): number { return NPC_DEALERS_PER_BLOC + activeDealers(store, b).length; }
export function obligationMinFace(offered: Qty, dealers: number): Qty { return ((offered / (2n * BigInt(dealers))) / LOT) * LOT; }
/** Decision: only competitive bids qualify (a noncompetitive bid has no yield to test against y_WI + 5 bp). */
export function isQualifyingBid(bid: AuctionBid, offered: Qty, dealers: number, yWi: number): boolean {
  return bid.yieldBp !== undefined /* COMPETITIVE only: NC bids carry no yield */ && bid.face >= obligationMinFace(offered, dealers) && bid.yieldBp <= roundHalfEven(yWi * 1e6) + 500;
}
const addFace = (m: SortedMap<string, string>, q: number, f: Qty): SortedMap<string, string> => {
  const c = m.clone(); c.set(qKey(q), (BigInt(c.get(qKey(q)) ?? '0') + f).toString()); return c; };
const poolRow = (b: BlocId, q: number): PrimaryDealerStatus => ({ id: `${b}:${DEALER_POOL_ID(b)}`, bloc: b, entityId: DEALER_POOL_ID(b), npc: true, status: 'ACTIVE', fromQuarter: q,
  revokedUntilQuarter: null, auctionsThisQuarter: 0, auctionsBidThisQuarter: 0, missesThisQuarter: 0, awardedFaceQuarter: new SortedMap() });
/** Extra export (called by runAuction before settlement): per ACTIVE player dealer one obligation count (bid or miss) and the awarded face; the NPC pool row
 *  (`npc: true`) keeps the pool's awarded face for shares. Each dealer's best bid counts once. */
export function recordDealerAuction(ctx: PhaseCtx, b: BlocId, offered: Qty, yWi: number, bids: AuctionBid[], awards: { bidderId: string; face: Qty }[]): void {
  const s = ctx.store, q = quarterOf(ctx.tick), n = dealerCount(s, b);
  const won = (id: string): Qty => awards.filter((a) => a.bidderId === id).reduce((t, a) => t + a.face, 0n);
  for (const r of activeDealers(s, b)) {
    const ok = bids.some((x) => x.bidderId === r.entityId && isQualifyingBid(x, offered, n, yWi));
    s.put<PrimaryDealerStatus>(T, { ...r, auctionsThisQuarter: r.auctionsThisQuarter + 1, auctionsBidThisQuarter: r.auctionsBidThisQuarter + (ok ? 1 : 0),
      missesThisQuarter: r.missesThisQuarter + (ok ? 0 : 1), awardedFaceQuarter: addFace(r.awardedFaceQuarter, q, won(r.entityId)) });
  }
  const pool = s.get<PrimaryDealerStatus>(T, `${b}:${DEALER_POOL_ID(b)}`) ?? poolRow(b, q);
  s.put<PrimaryDealerStatus>(T, { ...pool, awardedFaceQuarter: addFace(pool.awardedFaceQuarter, q, won(DEALER_POOL_ID(b))) });
}
/** Decision: runs at the first tick of the new game quarter, reviewing the quarter just ended (q = quarterOf(tick) − 1), so APPLIED is ACTIVE exactly at the quarter start.
 *  ACTIVE with ≥ 3 misses → REVOKED until quarter q + 2 (the start of the quarter after next); RESIGNING → removed; REVOKED whose ban ended → removed (may apply again);
 *  APPLIED → ACTIVE once fromQuarter ≤ current (fromQuarter = q + 1); quarter counters reset. */
export function quarterEndDealerReview(ctx: PhaseCtx, b: BlocId): void {
  const s = ctx.store, cur = quarterOf(ctx.tick), q = cur - 1;
  for (const r of rowsOf(s, b)) {
    const reset = { auctionsThisQuarter: 0, auctionsBidThisQuarter: 0, missesThisQuarter: 0 };
    if (r.status === 'RESIGNING' || (r.status === 'REVOKED' && (r.revokedUntilQuarter ?? 0) <= cur)) s.del(T, r.id);
    else if (r.status === 'ACTIVE' && r.missesThisQuarter >= 3) s.put<PrimaryDealerStatus>(T, { ...r, ...reset, status: 'REVOKED', revokedUntilQuarter: q + 2 });
    else if (r.status === 'APPLIED' && r.fromQuarter <= cur) s.put<PrimaryDealerStatus>(T, { ...r, ...reset, status: 'ACTIVE', fromQuarter: q + 1 });
    else if (r.status === 'ACTIVE' && !r.npc) s.put<PrimaryDealerStatus>(T, { ...r, ...reset });
  }
}
/** Shares of dealer-awarded face over the quarters starting in [fromTick, toTick); NPC pool split equally into the 8 NPC dealer keys. Sorted by share desc, key asc. */
export function dealerShares(store: StoreRead, b: BlocId, fromTick: Tick, toTick: Tick): { entityKey: string; share: number }[] {
  const q0 = Math.ceil(fromTick / (QD * D)), q1 = Math.ceil(toTick / (QD * D)), faces: { entityKey: string; face: Qty }[] = [];
  for (const r of rowsOf(store, b)) {
    let f = 0n;
    for (const [, v] of r.awardedFaceQuarter.range(qKey(q0), qKey(q1))) f += BigInt(v);
    if (r.npc) for (let i = 0; i < NPC_DEALERS_PER_BLOC; i++) faces.push({ entityKey: npcDealerKey(b, i), face: f / BigInt(NPC_DEALERS_PER_BLOC) });
    else faces.push({ entityKey: r.entityId, face: f });
  }
  const tot = faces.reduce((t, x) => t + x.face, 0n);
  return faces.map((x) => ({ entityKey: x.entityKey, share: tot > 0n ? Number(x.face) / Number(tot) : 0 }))
    .sort((x, y) => y.share - x.share || (x.entityKey < y.entityKey ? -1 : x.entityKey > y.entityKey ? 1 : 0));
}
/** Public quarterly table (ranks only): NPC dealers by key (T22 names missing), players by entity id only with nameInLeague, else null. */
export function leagueTable(store: StoreRead, b: BlocId, quarter: number): { rank: number; share: number; name: string | null }[] {
  const rows = rowsOf(store, b);
  return dealerShares(store, b, quarter * QD * D, (quarter + 1) * QD * D).map((x, i) => {
    const r = rows.find((y) => !y.npc && y.entityId === x.entityKey);
    return { rank: i + 1, share: x.share, name: r ? (r.nameInLeague === true ? r.entityId : null) : x.entityKey };
  });
}
