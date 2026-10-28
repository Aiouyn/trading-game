// T04-11 primary auctions (04 §3.10.3–§3.10.4): NPC dealer ladder, owner-group cap, uniform-price clearing, settlement, failed and weak auctions,
// and the CB secondary-market backstop.
import { divRoundHalfEven, dmath, fnv1a32, MICRO_N, roundHalfEven, TICKS_PER_GAME_DAY, type PhaseCtx, type Qty, type StoreRead, type Tick } from '@tycoon/engine-core';
import { recordDealerAuction } from './dealers';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { blocOfEntity, CSF_ID, DEALER_POOL_ID } from '../ids';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type AuctionBid, type BlocId, type BlocMacroState, type CentralBank, type ConcordFacility, type GlobalMacroState, type HookCall,
  type NpcPoolOrder, type SovAuction, type SovereignIssue } from '../schema';
import { priceFromYieldLocal } from './bondMath';
import { tradingDaysOfPeriod } from './calendar';
import { isBill, linesOf, whenIssuedYield } from './issuance';
import { iocLimit } from './poolOrders';

const D = TICKS_PER_GAME_DAY, LOT: Qty = 1000n * MICRO_N, STRESS_DAYS = 21, BACKSTOP_DAYS = 5;
/** `macro_auction_noncomp_max_face` = 10,000,000 face (§3.10.3; registry row MISSING EXPORT T23). */
export const NONCOMP_MAX_FACE: Qty = 10_000_000n * MICRO_N;
const units = (q: Qty): number => Number(q / MICRO_N);
const floorLot = (q: Qty): Qty => (q / LOT) * LOT;
const hashOf = (x: AuctionBid): number => fnv1a32(x.bidId + x.auctionId);
const byHash = (x: AuctionBid, y: AuctionBid): number => hashOf(x) - hashOf(y) || (x.bidId < y.bidId ? -1 : x.bidId > y.bidId ? 1 : 0);
/** Yield ascending, then face descending, then fnv1a32(bidId + auctionId) ascending. */
const byYield = (x: AuctionBid, y: AuctionBid): number => (x.yieldBp ?? 0) - (y.yieldBp ?? 0) || (y.face > x.face ? 1 : y.face < x.face ? -1 : 0) || byHash(x, y);
const sum = (xs: readonly { face: Qty }[]): Qty => xs.reduce((s, x) => s + x.face, 0n);
const blocOf = (a: SovAuction): BlocId => blocOfEntity(a.govId) ?? 'FDL';

export interface LadderParams { btc: number; mu: number; s: number }
export function ladderParams(b: BlocId, stress: number, fear: number, size: Qty, avgSize: Qty): LadderParams {
  const ft = Math.max(0, (fear - 50) / 50), ratio = avgSize > 0n ? units(size) / units(avgSize) : 1;
  return { btc: 2.4 * (1 - 0.5 * stress) * (b === 'FDL' ? 1 + 0.2 * ft : 1 - 0.3 * ft), mu: 0.00005 + 0.001 * stress + 0.0003 * Math.max(0, ratio - 1), s: 0.00015 + 0.0008 * stress };
}

/** 41 levels y_k = y_WI − 3s + k(μ + 7s)/40; cumulative C_k = floor(offered·BTC·Φ((y_k − y_WI − μ)/s)/1000)·1000; level face C_k − C_{k−1}. */
export function npcLadder(auction: SovAuction, yWi: number, lp: LadderParams): AuctionBid[] {
  const off = units(auction.offeredFace), who = DEALER_POOL_ID(blocOf(auction)), out: AuctionBid[] = [];
  let prev = 0;
  for (let k = 0; k <= 40; k++) {
    const y = yWi - 3 * lp.s + (k * (lp.mu + 7 * lp.s)) / 40;
    const c = Math.floor((off * lp.btc * dmath.normCdf((y - yWi - lp.mu) / lp.s)) / 1000) * 1000;
    const face = c - prev;
    prev = c;
    if (face <= 0) continue;
    out.push({ bidId: `npc:${auction.id}:${k}`, auctionId: auction.id, bidderId: who, kind: 'COMPETITIVE', yieldBp: roundHalfEven(y * 1e6), face: BigInt(face) * MICRO_N,
      cashHoldId: '', submittedTick: auction.auctionTick, primaryDealer: true });
  }
  return out;
}

/** Keep each listed bid in order until `cap`; the bid that crosses it keeps the whole lots that fit. */
function keepUpTo(bids: AuctionBid[], cap: Qty): AuctionBid[] {
  const out: AuctionBid[] = [];
  let cum = 0n;
  for (const x of bids) {
    const face = x.face <= cap - cum ? x.face : floorLot(cap - cum);
    if (face <= 0n) break;
    out.push(face === x.face ? x : { ...x, face });
    cum += face;
  }
  return out;
}
const groupsOf = (bids: AuctionBid[], groupOf: (id: string) => string): string[] => bids.map((x) => groupOf(x.bidderId)).filter((g, i, a) => a.indexOf(g) === i).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

/** 35% of offered per owner group: noncompetitive counted first (hash order), then competitive by yield, so the highest-yield face is cut first. */
export function applyGroupCap(bids: AuctionBid[], offered: Qty, groupOf: (bidderId: string) => string): AuctionBid[] {
  const cap = floorLot((offered * 35n) / 100n), kept: AuctionBid[] = [];
  for (const g of groupsOf(bids, groupOf)) {
    const mine = bids.filter((x) => groupOf(x.bidderId) === g);
    kept.push(...keepUpTo([...mine.filter((x) => x.kind === 'NONCOMPETITIVE').sort(byHash), ...mine.filter((x) => x.kind === 'COMPETITIVE').sort(byYield)], cap));
  }
  return bids.flatMap((x) => kept.filter((k) => k.bidId === x.bidId));
}

/** Pro rata to face of `total`, floored to 1,000; remaining lots one at a time in hash order (never above a bid's face). */
type Awards = Record<string, Qty>;
function proRataLots(bids: AuctionBid[], total: Qty, out: Awards): void {
  const all = sum(bids), order = [...bids].sort(byHash);
  let left = total;
  for (const x of bids) { const f = floorLot((x.face * total) / all); out[x.bidId] = f; left -= f; }
  for (let i = 0; left >= LOT && order.some((x) => out[x.bidId]! < x.face); i = (i + 1) % order.length) {
    const x = order[i]!, f = out[x.bidId]!;
    if (f < x.face) { out[x.bidId] = f + LOT; left -= LOT; }
  }
}

export interface ClearingResult { awards: { bidId: string; bidderId: string; face: Qty }[]; stopYield: number; allotmentAtStopPct: number; bidToCover: number; tailBp: number;
  awardedFace: Qty; npcShare: number; playerShare: number; failed: boolean; weak: boolean }

export function clearAuction(auction: SovAuction, bids: AuctionBid[], yWi: number, groupOf: (id: string) => string, isNpc: (id: string) => boolean, noncompMaxFace: Qty): ClearingResult {
  const offered = auction.offeredFace, bidToCover = Number(sum(bids)) / Number(offered);
  const players = bids.filter((x) => !isNpc(x.bidderId)), ncKept: AuctionBid[] = [];
  for (const g of groupsOf(players, groupOf)) ncKept.push(...keepUpTo(players.filter((x) => x.kind === 'NONCOMPETITIVE' && groupOf(x.bidderId) === g).sort(byHash), noncompMaxFace));
  const capped = [...applyGroupCap([...players.filter((x) => x.kind === 'COMPETITIVE'), ...ncKept], offered, groupOf), ...bids.filter((x) => isNpc(x.bidderId))];
  const nc = capped.filter((x) => x.kind === 'NONCOMPETITIVE'), comp = capped.filter((x) => x.kind === 'COMPETITIVE').sort(byYield);
  const ncCap = floorLot((offered * 20n) / 100n), ncTotal = sum(nc);
  const award: Awards = {};
  if (ncTotal > ncCap) proRataLots(nc, ncCap, award); else for (const x of nc) award[x.bidId] = x.face;
  const qc = offered - nc.reduce((s, x) => s + award[x.bidId]!, 0n);
  const failed = sum(comp) < qc;
  let stopBp = comp.length ? comp[comp.length - 1]!.yieldBp! : roundHalfEven(yWi * 1e6), allot = 100;
  if (failed) for (const x of comp) award[x.bidId] = x.face;
  else {
    let cum = 0n;
    for (const x of comp) { cum += x.face; if (cum >= qc) { stopBp = x.yieldBp!; break; } }
    const below = comp.filter((x) => x.yieldBp! < stopBp), at = comp.filter((x) => x.yieldBp === stopBp), r = qc - sum(below);
    for (const x of below) award[x.bidId] = x.face;
    proRataLots(at, r, award);
    allot = (Number(r) / Number(sum(at))) * 100;
  }
  const awards = capped.filter((x) => (award[x.bidId] ?? 0n) > 0n).sort((x, y) => (x.bidId < y.bidId ? -1 : 1))
    .map((x) => ({ bidId: x.bidId, bidderId: x.bidderId, face: award[x.bidId]! }));
  const awardedFace = sum(awards), npcFace = sum(awards.filter((x) => isNpc(x.bidderId)));
  const npcShare = awardedFace > 0n ? Number(npcFace) / Number(awardedFace) : 0, tailBp = stopBp / 100 - yWi * 1e4;
  return { awards, stopYield: stopBp / 1e6, allotmentAtStopPct: allot, bidToCover, tailBp, awardedFace, npcShare, playerShare: awardedFace > 0n ? 1 - npcShare : 0,
    failed, weak: !failed && (tailBp > 3 || bidToCover < 1.5) };
}

/** 06 price at y (clean per 100), else the local formula: semiannual coupons for notes, zero coupon for bills. */
export function auctionPrice(store: StoreRead, ports: MacroPorts, auction: SovAuction, y: number, tick: Tick): number {
  const p = ports.assets.priceFromYield(store, auction.assetId, y, tick);
  if (Number.isFinite(p)) return p;
  const line = linesOf(store, blocOf(auction), ports).find((l) => l.assetId === auction.assetId);
  return priceFromYieldLocal(line?.couponRate ?? 0, ((line?.maturityTick ?? tick) - tick) / D / 364, y, isBill(auction.tenor) ? 0 : 2);
}
/** face × P/100 in money micro-units (half-even). */
export const cashFor = (face: Qty, per100: number): bigint => divRoundHalfEven(face * BigInt(roundHalfEven(per100 * 1e6)), 100n * MICRO_N);

/** At the auction tick: postings (committed in P13), every hold of the auction released, bid rows deleted, line face, result row and events. */
export function settleAuction(ctx: PhaseCtx, auction: SovAuction, r: ClearingResult, ports: MacroPorts): void {
  const s = ctx.store, b = blocOf(auction), gov = auction.govId, npc = DEALER_POOL_ID(b), tick = ctx.tick;
  const issue = s.get<SovereignIssue & { id: string }>(macroTables.issue.name, auction.assetId), ccy = issue?.ccy ?? b;
  const P = auctionPrice(s, ports, auction, r.stopYield, tick);
  const npcFace = sum(r.awards.filter((x) => x.bidderId === npc));
  if (npcFace > 0n) ctx.ledger.elasticIn('row', gov, cashFor(npcFace, P), ccy, 'SOV_DEBT_ELASTIC_PLACEMENT', { refs: [auction.assetId] });
  for (const a of r.awards) if (a.bidderId !== npc) ctx.ledger.swapAsset(a.bidderId, gov, auction.assetId, a.face, cashFor(a.face, P), ccy, 'SOV_BOND_ISSUE');
  for (const x of [...s.index<AuctionBid & { id: string }>(macroTables.bid.name, 'auctionId', auction.id)].sort((p, q) => (p.id < q.id ? -1 : 1))) {
    if (x.cashHoldId) ctx.holds.release(x.cashHoldId);
    const face = r.awards.find((a) => a.bidId === x.bidId)?.face ?? 0n;
    ctx.emit('macro.sov.bid.result', [x.bidderId], { auctionId: auction.id, bidId: x.bidId, awardedFace: face.toString(), price: cashFor(MICRO_N, P).toString() /* Price per unit face */ }, 'PARTIES', [x.bidderId]);
    s.del(macroTables.bid.name, x.id);
  }
  if (issue) {
    if (!auction.reopening) for (const o of s.iter<SovereignIssue & { id: string }>(macroTables.issue.name))
      if (o.govId === gov && o.tenor === issue.tenor && o.onTheRun && o.id !== issue.id) s.put(macroTables.issue.name, { ...o, onTheRun: false });
    s.put(macroTables.issue.name, { ...issue, faceOutstanding: issue.faceOutstanding + r.awardedFace, onTheRun: true });
  }
  const result = { stopYield: r.stopYield, allotmentAtStopPct: r.allotmentAtStopPct, bidToCover: r.bidToCover, tailBp: r.tailBp, awardedFace: r.awardedFace,
    npcShare: r.npcShare, playerShare: r.playerShare, failed: r.failed };
  s.put<SovAuction>(macroTables.auction.name, { ...auction, bids: [], result });
  ctx.emit('macro.sov.auction.result', [gov], { auctionId: auction.id, govId: gov, stopYield: r.stopYield, bidToCover: r.bidToCover, tailBp: r.tailBp, allotmentAtStopPct: r.allotmentAtStopPct,
    awardedFace: r.awardedFace.toString(), npcShare: r.npcShare, playerShare: r.playerShare, failed: r.failed, weak: r.weak }, 'PUBLIC');
}

export function failedAuctions21d(store: StoreRead, b: BlocId, tick: Tick): number {
  return [...store.index<SovAuction>(macroTables.auction.name, 'govId', govId(b))].filter((a) => a.result?.failed === true && a.auctionTick <= tick && a.auctionTick > tick - STRESS_DAYS * D).length;
}
/** §3.10.4 stress = T04-07 stressIndex + active `auction_stress` shocks (STEP), clamped to [0, 1]. */
export function auctionStress(store: StoreRead, b: BlocId, tick: Tick): number {
  const bloc = store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!bloc) return 0;
  const sh = bloc.shocks.filter((x) => x.target === 'auction_stress' && x.startTick <= tick && tick < x.endTick).reduce((t, x) => t + x.value, 0);
  return Math.min(1, Math.max(0, bloc.sovereign.stressIndex + sh));
}
const BACKSTOP_SHARE: Readonly<Record<BlocId, number>> = { FDL: 1, PYN: 1, NKR: 1, SRL: 0.5, EUN: 1 };
const concordActive = (store: StoreRead, b: BlocId, tick: Tick): boolean =>
  (store.get<ConcordFacility>(macroTables.csf.name, CSF_ID)?.programs ?? []).some((p) => p.bloc === b && p.startTick <= tick && tick < p.endTick);

/** Call after settleAuction. Failed: +0.15 stress 21 d, counter, shortfall to the next B3M (else carried), backstop plan. Weak: +0.05 stress 21 d, WIRE_ITEM hook. */
export function afterFailedOrWeak(ctx: PhaseCtx, b: BlocId, auction: SovAuction, r: ClearingResult): void {
  if (!r.failed && !r.weak) return;
  const s = ctx.store, tick = ctx.tick, bloc = s.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!bloc) return;
  const shocks = [...bloc.shocks, { id: `shk_auc_${auction.id}`, target: 'auction_stress', value: r.failed ? 0.15 : 0.05, startTick: tick, endTick: tick + STRESS_DAYS * D, shape: 'STEP' as const }];
  if (!r.failed) {
    s.put(macroTables.bloc.name, { ...bloc, shocks });
    s.put<HookCall>(macroTables.hookCall.name, { id: ctx.newId('hook'), owner: '16', hook: 'WIRE_ITEM', args: { key: 'weak_auction', auctionId: auction.id }, worldEventId: '', createdTick: tick, startTick: tick + 1 });
    return;
  }
  const shortfall = auction.offeredFace - r.awardedFace;
  const next = [...s.index<SovAuction>(macroTables.auction.name, 'govId', govId(b))].filter((a) => a.tenor === 'B3M' && a.auctionTick > tick && !a.result)
    .sort((x, y) => x.auctionTick - y.auctionTick)[0];
  if (next) s.put<SovAuction>(macroTables.auction.name, { ...next, offeredFace: next.offeredFace + shortfall });
  const fiscal = next ? bloc.fiscal : { ...bloc.fiscal, shortfallCarry: (bloc.fiscal.shortfallCarry ?? 0n) + shortfall };
  s.put(macroTables.bloc.name, { ...bloc, shocks, fiscal, sovereign: { ...bloc.sovereign, failedAuctions21d: failedAuctions21d(s, b, tick) } });
  let due = 0n;
  for (const i of s.iter<SovereignIssue & { id: string }>(macroTables.issue.name)) if (i.govId === govId(b) && i.maturityTick > tick && i.maturityTick <= tick + STRESS_DAYS * D) due += i.faceOutstanding;
  const share = b === 'EUN' && !concordActive(s, b, tick) ? 0 : BACKSTOP_SHARE[b], cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b));
  const face = floorLot((shortfall * BigInt(roundHalfEven(share * 100))) / 100n);
  if (!cb || face <= 0n || ctx.ledger.cash(govId(b), b) >= due) return;   // Qty and Money are both micro: face at par
  const day = Math.floor(tick / D), days = tradingDaysOfPeriod(b, day + 1, 21).slice(0, BACKSTOP_DAYS);
  s.put<CentralBank>(macroTables.cb.name, { ...cb, backstop: { assetId: auction.assetId, face, days, done: [] } });
}

/** BACKSTOP pool orders for today (T04-14 passes them to writePoolOrders): the plan's face in equal whole-lot slices over its trading days, the last day
 *  taking the remainder; one IOC BUY at the §6.3 limit on the first call of each listed day; the plan is dropped after its last day. */
export function backstopOrders(ctx: PhaseCtx, ports: MacroPorts): NpcPoolOrder[] {
  const s = ctx.store, day = Math.floor(ctx.tick / D), out: NpcPoolOrder[] = [];
  for (const b of BLOC_ORDER) {
    const cb = s.get<CentralBank>(macroTables.cb.name, cbkId(b)), p = cb?.backstop;
    if (!cb || !p || !p.days.includes(day) || p.done.includes(day)) continue;
    const n = BigInt(p.days.length), per = floorLot(p.face / n), last = p.days.indexOf(day) === p.days.length - 1;
    const qty = last ? p.face - per * (n - 1n) : per;
    const fair = ports.markets.fairPriceOf(s, p.assetId) ?? MICRO_N, h = ports.markets.makerHalfSpread(s, p.assetId) ?? 0;
    if (qty > 0n) out.push({ id: ctx.newId('pool'), poolId: `CB:${b}`, assetId: p.assetId, side: 'BUY', qty, limitPrice: iocLimit(fair, h, 'BUY'), tif: 'TICK', tick: ctx.tick, purpose: 'BACKSTOP' });
    const { backstop: _p, ...rest } = cb;
    s.put<CentralBank>(macroTables.cb.name, last ? rest : { ...cb, backstop: { ...p, done: [...p.done, day] } });
  }
  return out;
}

/** P6 of the auction tick (after cancelHeldBidders in P1): NPC ladder, clearing, settlement, failed/weak follow-up. */
export function runAuction(ctx: PhaseCtx, auction: SovAuction, ports: MacroPorts): ClearingResult {
  const s = ctx.store, b = blocOf(auction), npc = DEALER_POOL_ID(b);
  const fear = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.fearIndex ?? 50;
  const last = [...s.index<SovAuction>(macroTables.auction.name, 'govId', auction.govId)].filter((a) => a.tenor === auction.tenor && a.result && a.id !== auction.id)
    .sort((x, y) => y.auctionTick - x.auctionTick).slice(0, 4);
  const avg = last.length ? sum(last.map((a) => ({ face: a.offeredFace }))) / BigInt(last.length) : auction.offeredFace;
  const line = linesOf(s, b, ports).find((l) => l.assetId === auction.assetId);
  const yWi = auction.whenIssuedYield ?? whenIssuedYield(s, b, auction.reopening ? auction.assetId : null, ((line?.maturityTick ?? ctx.tick) - ctx.tick) / D / 364, ports);
  const ladder = npcLadder(auction, yWi, ladderParams(b, auctionStress(s, b, ctx.tick), fear, auction.offeredFace, avg));
  const bids = [...s.index<AuctionBid & { id: string }>(macroTables.bid.name, 'auctionId', auction.id)];
  const r = clearAuction(auction, [...bids, ...ladder], yWi, (id) => ports.players.ownerGroupOf(s, id), (id) => id === npc, NONCOMP_MAX_FACE);
  recordDealerAuction(ctx, b, auction.offeredFace, yWi, bids, r.awards);
  settleAuction(ctx, auction, r, ports);
  afterFailedOrWeak(ctx, b, auction, r);
  return r;
}
