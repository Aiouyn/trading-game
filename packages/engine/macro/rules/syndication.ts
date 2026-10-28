// T04-12 syndications (04 §3.10.6): one-day book with guidance, tightening on demand, lead tranches, pro rata allocation, lead fees.
import { divRoundHalfEven, fnv1a32, MICRO_N, roundHalfEven, TICKS_PER_GAME_DAY, type Money, type PhaseCtx, type Qty, type StoreRead, type Tick } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { blocOfEntity, DEALER_POOL_ID } from '../ids';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type CurveState, type GlobalMacroState, type SovereignIssue, type Syndication, type SyndicationOrder } from '../schema';
import { auctionStress, cashFor, ladderParams } from './auction';
import { priceFromYieldLocal } from './bondMath';
import { tradingDaysOfPeriod } from './calendar';
import { activeDealers, dealerShares, npcDealerKey, quarterOf } from './dealers';
import { newLineCoupon, sovereignAssetId, tenorDays } from './issuance';
import { nsZero } from './nelsonSiegel';

const D = TICKS_PER_GAME_DAY, QD = 91, LOT: Qty = 1000n * MICRO_N, SIZE_STEP: Qty = 1_000_000n * MICRO_N, BOOK_TICK = 420, GUIDANCE_BP = 5, FEE_RATE = 0.0015;
const LEAD_SHARE_BP = 1500n, SY = macroTables.syndication.name, SO = macroTables.syndicationOrder.name;
const floorLot = (q: Qty): Qty => (q / LOT) * LOT;
const blocOf = (s: Syndication): BlocId => (blocOfEntity(s.govId) ?? 'FDL') as BlocId;
const isFdl = (s: Syndication): boolean => s.tenor === 'N10Y_FDL';
/** Decision: an FDL-denominated line prices off the FDL curve (04 gives no SRL-in-FDL spread). */
const curveBloc = (b: BlocId, tenor: 'N30Y' | 'N10Y_FDL'): BlocId => (tenor === 'N10Y_FDL' ? 'FDL' : b);
function curveYield(store: StoreRead, b: BlocId, years: number): number {
  const c = store.get<CurveState>(macroTables.curve.name, b);
  return c ? nsZero(c.ns, years) : BLOC_DEFAULTS[b].initialPolicyRate;
}
const byId = <X extends { id: string }>(x: X, y: X): number => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/** Extra export. N30Y: 0.08 × 4 × GFN_q − reopenings planned this year; N10Y_FDL: 0.20 × GFN_q; floored to 1,000,000 face, never negative. GFN is read at par (cash = face). */
export function syndicationSize(tenor: 'N30Y' | 'N10Y_FDL', gfnQuarter: Money, reopeningsFace: Qty): Qty {
  const raw = tenor === 'N30Y' ? (gfnQuarter * 32n) / 100n - reopeningsFace : (gfnQuarter * 20n) / 100n;
  return raw > 0n ? (raw / SIZE_STEP) * SIZE_STEP : 0n;
}
/** Top 3 entity keys by dealerShares over the two game quarters before the current one; ACTIVE players qualify; NPC dealer keys fill the rest. */
export function leadManagers(store: StoreRead, b: BlocId, tick: Tick): string[] {
  const q = quarterOf(tick), act = activeDealers(store, b).map((r) => r.entityId), npc = (k: string): boolean => k.startsWith(`${DEALER_POOL_ID(b)}#`);
  const out = dealerShares(store, b, (q - 2) * QD * D, q * QD * D).filter((x) => x.share > 0 && (npc(x.entityKey) || act.includes(x.entityKey))).slice(0, 3).map((x) => x.entityKey);
  for (let i = 0; out.length < 3; i++) if (!out.includes(npcDealerKey(b, i))) out.push(npcDealerKey(b, i));
  return out;
}
/** At t = 420: book open now, pricing at t = 420 of the next trading day; guidance = curve zero at the maturity + 5 bp; leads; fee 0.0015. */
export function openSyndication(ctx: PhaseCtx, b: BlocId, tenor: 'N30Y' | 'N10Y_FDL', size: Qty): Syndication {
  const day = Math.floor(ctx.tick / D), pDay = tradingDaysOfPeriod(b, day + 1, 14)[0]!, mDay = pDay + tenorDays(tenor);
  const cy = curveYield(ctx.store, curveBloc(b, tenor), tenorDays(tenor) / 364), gov = govId(b);
  const row: Syndication = { id: `syn_${b}_${tenor}_${day}`, govId: gov, assetId: sovereignAssetId(b, tenor, mDay), size, leadManagers: leadManagers(ctx.store, b, ctx.tick),
    bookOpenTick: ctx.tick, pricingTick: pDay * D + BOOK_TICK, guidanceSpreadBp: GUIDANCE_BP, feeRate: FEE_RATE, tenor, curveYield: cy };
  ctx.store.put<Syndication>(SY, row);
  ctx.emit('macro.sov.auction.announced', [gov], { auctionId: row.id, govId: gov, assetId: row.assetId, tenor: tenor === 'N10Y_FDL' ? 'N10Y' : 'N30Y', reopening: false,
    announceTick: ctx.tick, bidOpenTick: ctx.tick, auctionTick: row.pricingTick, offeredFace: size.toString(), whenIssuedYield: cy + GUIDANCE_BP / 1e4, syndication: true }, 'PUBLIC');
  return row;
}
/** guidance − min(5, floor(max(0, book/size − 2) / 0.5)), exact in bigint. */
export function finalSpreadBp(guidanceBp: number, bookFace: Qty, size: Qty): number {
  if (size <= 0n) return guidanceBp;
  const halves = 2n * bookFace - 4n * size, cut = halves > 0n ? halves / size : 0n;
  return guidanceBp - Number(cut < 5n ? cut : 5n);
}
type Alloc = { orderId: string; bidderId: string; face: Qty };
type Ask = { orderId: string; bidderId: string; face: Qty; key: number };
/** total split pro rata over asks (all filled when demand ≤ total), lots floored, remainder lots in fnv1a32(orderId + syndicationId) order. */
function proRata(asks: Ask[], total: Qty): Qty[] {
  const dem = asks.reduce((t, x) => t + x.face, 0n);
  if (dem <= total) return asks.map((x) => x.face);
  const out = asks.map((x) => floorLot((x.face * total) / dem)), order = asks.map((_, i) => i).sort((i, j) => asks[i]!.key - asks[j]!.key || i - j);
  let left = total - out.reduce((t, x) => t + x, 0n);
  for (let k = 0; left >= LOT && order.some((i) => out[i]! < asks[i]!.face); k = (k + 1) % order.length) {
    const i = order[k]!;
    if (out[i]! < asks[i]!.face) { out[i] = out[i]! + LOT; left -= LOT; }
  }
  return out;
}
/** Eligible: no limit or limitSpreadBp ≥ final. Each lead takes up to 15% of size first (pro rata within its own orders); the rest pro rata over the other eligible
 *  orders plus the NPC book (bidder DEALER_POOL_ID). Σ ≤ size; zero awards omitted; output in input order, NPC last. */
export function allocateSyndication(s: Syndication, orders: SyndicationOrder[], npcFace: Qty, finalBp: number): Alloc[] {
  const ask = (o: { id: string; bidderId: string; face: Qty }): Ask => ({ orderId: o.id, bidderId: o.bidderId, face: o.face, key: fnv1a32(o.id + s.id) });
  const el = orders.filter((o) => o.limitSpreadBp === null || o.limitSpreadBp >= finalBp), award: Record<string, Qty> = {};
  const cap = floorLot((s.size * LEAD_SHARE_BP) / 10_000n);
  let used = 0n;
  for (const lead of s.leadManagers) {
    const own = el.filter((o) => o.bidderId === lead).map(ask), got = proRata(own, cap);
    own.forEach((x, i) => { award[x.orderId] = got[i]!; used += got[i]!; });
  }
  const npcId = `${s.id}:npc`, rest = [...el.filter((o) => !s.leadManagers.includes(o.bidderId)).map(ask), ...(npcFace > 0n ? [ask({ id: npcId, bidderId: DEALER_POOL_ID(blocOf(s)), face: npcFace })] : [])];
  const got = proRata(rest, s.size - used > 0n ? s.size - used : 0n);
  rest.forEach((x, i) => { award[x.orderId] = got[i]!; });
  return [...orders.map((o) => ({ orderId: o.id, bidderId: o.bidderId, face: award[o.id] ?? 0n })), { orderId: npcId, bidderId: DEALER_POOL_ID(blocOf(s)), face: award[npcId] ?? 0n }]
    .filter((x) => x.face > 0n);
}
/** Price per 100 at yield y: 06 port, else local (semiannual). */
export function syndicationPrice(store: StoreRead, ports: MacroPorts, s: Syndication, couponRate: number, y: number, tick: Tick): number {
  const p = ports.assets.priceFromYield(store, s.assetId, y, tick);
  return Number.isFinite(p) ? p : priceFromYieldLocal(couponRate, tenorDays(s.tenor ?? 'N30Y') / 364, y, 2);
}
/** At the pricing tick: orders whose hold is no longer ACTIVE drop out; allocation; issue row; postings; fees; holds released; orders deleted; priced event. */
export function priceSyndication(ctx: PhaseCtx, s: Syndication, ports: MacroPorts): void {
  const st = ctx.store, b = blocOf(s), fdl = isFdl(s), ccy = fdl ? 'FDL' : b, gov = s.govId, tick = ctx.tick;
  const all = [...st.iter<SyndicationOrder>(SO)].filter((o) => o.syndicationId === s.id).sort(byId), live = all.filter((o) => ctx.holds.get(o.holdId)?.status === 'ACTIVE');
  const fear = st.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.fearIndex ?? 50;
  const btc = ladderParams(b, auctionStress(st, b, tick), fear, s.size, s.size).btc, npcFace = floorLot((s.size * BigInt(roundHalfEven(btc * 1e6))) / 1_000_000n);
  const book = live.reduce((t, o) => t + o.face, 0n) + npcFace, fin = finalSpreadBp(s.guidanceSpreadBp, book, s.size);
  const cy = s.curveYield ?? curveYield(st, curveBloc(b, s.tenor ?? 'N30Y'), tenorDays(s.tenor ?? 'N30Y') / 364), y = cy + fin / 1e4, coupon = newLineCoupon(y);
  const P = syndicationPrice(st, ports, s, coupon, y, tick), awards = allocateSyndication(s, live, npcFace, fin), npc = DEALER_POOL_ID(b);
  const awarded = awards.reduce((t, a) => t + a.face, 0n), tenor = fdl ? 'N10Y' : 'N30Y';
  for (const o of [...st.iter<SovereignIssue & { id: string }>(macroTables.issue.name)])
    if (o.govId === gov && o.tenor === tenor && o.fxDenominated === fdl && o.onTheRun && o.id !== s.assetId) st.put(macroTables.issue.name, { ...o, onTheRun: false });
  st.put<SovereignIssue & { id: string }>(macroTables.issue.name, { id: s.assetId, assetId: s.assetId, govId: gov, tenor, ccy, couponRate: coupon, issueTick: tick,
    maturityTick: tick + tenorDays(s.tenor ?? 'N30Y') * D, faceOutstanding: awarded, inflationLinked: false, fxDenominated: fdl, cac: { threshold: 0.75, aggregated: true }, onTheRun: true });
  let raised = 0n;
  for (const a of awards) {
    const c = cashFor(a.face, P);
    raised += c;
    if (a.bidderId === npc) ctx.ledger.elasticIn('row', gov, c, ccy, 'SOV_DEBT_ELASTIC_PLACEMENT', { refs: [s.assetId] });
    else ctx.ledger.swapAsset(a.bidderId, gov, s.assetId, a.face, c, ccy, 'SOV_BOND_ISSUE');
  }
  if (fdl) {
    const bl = st.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
    if (bl) st.put(macroTables.bloc.name, { ...bl, fiscal: { ...bl.fiscal, fxDebt: bl.fiscal.fxDebt + raised } });
  }
  const fee = divRoundHalfEven(cashFor(s.size, P) * BigInt(roundHalfEven(s.feeRate * 1e6)), 1_000_000n), n = BigInt(s.leadManagers.length);
  if (fee > 0n && n > 0n) s.leadManagers.forEach((lead, i) => {
    const amt = fee / n + (i === 0 ? fee % n : 0n);
    ctx.ledger.pay(gov, lead.startsWith(`${npc}#`) ? npc : lead, amt, ccy, 'GOV_SYNDICATION_FEE');
  });
  for (const o of all) { ctx.holds.release(o.holdId); st.del(SO, o.id); }
  st.put<Syndication>(SY, { ...s, pricedTick: tick });
  ctx.emit('macro.sov.syndication.priced', [gov], { syndicationId: s.id, govId: gov, assetId: s.assetId, size: s.size.toString(), spreadBp: fin, orders: live.length,
    coverRatio: Number(book) / Number(s.size) }, 'PUBLIC');
}
