// T04-13 restructuring (04 §3.12.2 steps 3–6): exchange-offer terms, NPC votes, CAC close, MOVE_QTY-only exchange.
// Pure term rules first; the PhaseCtx steps (openOffer, tallyOffer, closeOffer, executeExchange) follow in this file.
import { dmath, EngineFault, MICRO_N, roundHalfEven, TICKS_PER_GAME_DAY, type Id, type PhaseCtx, type Qty, type StoreRead, type Tick } from '@tycoon/engine-core';
import { govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type CurveState, type DailyHistoryRow, type ExchangeOffer, type SovereignDefaultCase, type SovereignIssue, type SovExchangeVote } from '../schema';
import { blocOfEntity } from '../ids';
import { S } from '../streams';
import { priceFromYieldLocal } from './bondMath';
import { tradingDaysOfPeriod } from './calendar';
import { nsZero } from './nelsonSiegel';
import { blocRow, govLines, latestCase, saveCase } from './sovCase';
import { concordActive, openConcord } from './concord';
import { writeHook } from './hooks';

/** h = clamp(1 − (d* + 0.20)/debtGdp, 0.20, 0.60). */
export function haircut(debtGdp: number, dStar: number): number {
  return dmath.clamp(1 - (dStar + 0.20) / debtGdp, 0.20, 0.60);
}

/** New-bond coupon max(0.02, 0.6 × y10 before the crisis). */
export function newBondCoupon(preCrisis10y: number): number {
  return Math.max(0.02, 0.6 * preCrisis10y);
}

/** Face per 100 old face such that 50% 8y + 50% 15y new bonds (semiannual, priced at y_exit) are worth 100(1 − h). */
export function facePer100(h: number, coupon: number, yExit: number): number {
  const avg = 0.5 * priceFromYieldLocal(coupon, 8, yExit, 2) + 0.5 * priceFromYieldLocal(coupon, 15, yExit, 2);
  return 100 * (100 * (1 - h)) / avg;
}

/** NPC block acceptance σ((recovery − preOfferPrice/100 + 0.05)/0.05). */
export function npcAcceptProbability(recoveryNpv: number, preOfferPrice: number): number {
  return dmath.sigmoid((recoveryNpv - preOfferPrice / 100 + 0.05) / 0.05);
}

const D = TICKS_PER_GAME_DAY, OPEN_DAYS = 14, LOT: Qty = 1000n * MICRO_N, NPC_BLOCKS = 20, CODE = 'SOV_RESTRUCTURING_EXCHANGE';
/** `macro_cac_threshold` = 0.75 aggregated (§3.12.2; registry row MISSING EXPORT T23). */
export const CAC_THRESHOLD = 0.75;
const floorLot = (q: Qty): Qty => (q / LOT) * LOT;
const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
const isNpcSector = (e: Id): boolean => { const k = e.slice(0, e.indexOf('_')); return k === 'hh' || k === 'frm' || k === 'row'; };
type Holding = { holderId: Id; assetId: string; face: Qty };

function openCase(s: StoreRead, b: BlocId): SovereignDefaultCase {
  const c = blocRow(s, b).sovereign.defaultCase;
  if (!c) throw new EngineFault('MAC_STATE_MISSING', `no default case for ${b}`, [b]);
  return c;
}
/** Holders of record (committed qty, so a lender of a lent bond has no vote, edge 14) of each line, the issuer excluded; sorted by holder then asset. */
function holdings(ctx: PhaseCtx, assetIds: readonly string[], gov: Id): Holding[] {
  const out: Holding[] = [];
  for (const asset of assetIds) for (const a of ctx.ledger.accountsOfAsset(asset)) {
    const q = ctx.ledger.committedQty(a.key);
    if (a.entityId === gov || q <= 0n) continue;
    const h = out.find((x) => x.holderId === a.entityId && x.assetId === asset);
    if (h) h.face += q; else out.push({ holderId: a.entityId, assetId: asset, face: q });
  }
  return out.sort((x, y) => cmp(x.holderId, y.holderId) || cmp(x.assetId, y.assetId));
}
/** y10 of the history row 63 trading days before the trigger day; the current 10y zero when that row is missing. */
function preCrisis10y(s: StoreRead, b: BlocId, triggerTick: Tick): number {
  const day = Math.floor(triggerTick / D), days = tradingDaysOfPeriod(b, day - 126, 126), d = days[days.length - 63];
  const row = d === undefined ? undefined : s.get<DailyHistoryRow>(macroTables.history.name, `${b}:${d}`);
  return row ? row.y10 : nsZero(curveOf(s, b).ns, 10);
}
function curveOf(s: StoreRead, b: BlocId): CurveState {
  const c = s.get<CurveState>(macroTables.curve.name, b);
  if (!c) throw new EngineFault('MAC_STATE_MISSING', `curve ${b}`, [b]);
  return c;
}

/**
 * Opens round `round`: h (round 1 from debt/GDP, later rounds h − 0.05 floored at 0), coupon from the y10 63 trading days before the trigger,
 * y_exit = OIS(10) + 0.06, two new bonds (8y, 15y) each worth half the new face; snapshot of holders of record; NPC sectors (hh, frm, row) vote in
 * 20 blocks per holding, one draw each on S.sov(b), in line, sector, block order.
 */
export function openOffer(ctx: PhaseCtx, b: BlocId, round: 1 | 2 | 3, ports: MacroPorts): ExchangeOffer {
  const s = ctx.store, c = openCase(s, b), bloc = blocRow(s, b), tick = ctx.tick, gov = govId(b);
  const prev = c.offers[c.offers.length - 1];
  const h = round === 1 || !prev ? haircut(bloc.fiscal.debtGdp, BLOC_DEFAULTS[b].debtReference) : Math.max(0, prev.haircutNpv - 0.05);
  const cpn = newBondCoupon(preCrisis10y(s, b, c.triggerTick)), fp = facePer100(h, cpn, nsZero(curveOf(s, b).nsOis, 10) + 0.06);
  const offer: ExchangeOffer = { id: ctx.newId('sxo'), round, openTick: tick, closeTick: tick + OPEN_DAYS * D, haircutNpv: h,
    newBonds: [8, 15].map((y) => ({ tenor: 'N10Y' as const, couponRate: cpn, maturityYears: y, facePer100: fp / 2 })), consentSoFar: 0, status: 'OPEN' };
  const lines = govLines(s, b, ports).filter((l) => l.faceOutstanding > 0n), held = holdings(ctx, lines.map((l) => l.assetId), gov);
  for (const x of held) s.put(macroTables.voteSnapshot.name, { id: `${offer.id}:${x.holderId}:${x.assetId}`, offerId: offer.id, ...x });
  const rng = ctx.rng(S.sov(b));
  for (const l of lines) {
    const fair = ports.markets.fairPriceOf(s, l.assetId), pre = fair === null ? 100 /* 03 mark: MISSING EXPORT T03-13 effectiveMark */ : Number(fair) / 1e4;
    const p = npcAcceptProbability(1 - h, pre);
    for (const x of held) if (x.assetId === l.assetId && isNpcSector(x.holderId)) {
      const block = floorLot(x.face / BigInt(NPC_BLOCKS));
      let accept = 0n;
      for (let i = 0; i < NPC_BLOCKS; i++) if (rng.uOpen() < p) accept += i === NPC_BLOCKS - 1 ? x.face - block * BigInt(NPC_BLOCKS - 1) : block;
      s.put<SovExchangeVote>(macroTables.vote.name, { id: `${offer.id}:${x.holderId}:${x.assetId}`, offerId: offer.id, holderId: x.holderId, assetId: x.assetId,
        face: accept > 0n ? accept : x.face, vote: accept > 0n ? 'ACCEPT' : 'REJECT' });
    }
  }
  saveCase(ctx, b, { ...c, offers: [...c.offers, offer] }, 'RESTRUCTURING');
  ctx.emit('macro.sov.exchange.open', [gov], { govId: gov, caseId: c.id, offerId: offer.id, round, openTick: offer.openTick, closeTick: offer.closeTick, haircutNpv: h, newBonds: offer.newBonds }, 'PUBLIC');
  return offer;
}

/** Consent = ACCEPT face / snapshot face (aggregated over all lines). */
export function tallyOffer(store: StoreRead, offer: ExchangeOffer): { acceptFace: Qty; eligibleFace: Qty; consent: number } {
  let acceptFace = 0n, eligibleFace = 0n;
  for (const r of store.iter<{ offerId: string; face: Qty }>(macroTables.voteSnapshot.name)) if (r.offerId === offer.id) eligibleFace += r.face;
  for (const v of store.iter<SovExchangeVote>(macroTables.vote.name)) if (v.offerId === offer.id && v.vote === 'ACCEPT') acceptFace += v.face;
  return { acceptFace, eligibleFace, consent: eligibleFace > 0n ? Number((acceptFace * 1_000_000n) / eligibleFace) / 1e6 : 0 };
}

/** At closeTick: consent ≥ 0.75 → ACCEPTED and exchanged; else FAILED (next round 28 days later); a failed round 3 → unilateral exchange. */
export function closeOffer(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): void {
  void ports;
  const c = openCase(ctx.store, b), offer = c.offers[c.offers.length - 1];
  if (!offer || offer.status !== 'OPEN') return;
  const t = tallyOffer(ctx.store, offer), ok = t.consent >= CAC_THRESHOLD, done: ExchangeOffer = { ...offer, consentSoFar: t.consent, status: ok ? 'ACCEPTED' : 'FAILED' };
  saveCase(ctx, b, { ...c, offers: c.offers.map((o) => (o.id === offer.id ? done : o)) });
  ctx.emit('macro.sov.exchange.result', [c.govId], { offerId: offer.id, status: done.status, consent: t.consent }, 'PUBLIC');
  if (ok || offer.round === 3) executeExchange(ctx, b, done, !ok);
}

/**
 * MOVE_QTY only (SOV_RESTRUCTURING_EXCHANGE): every current holder of record hands the old face to the issuer and receives each new bond's
 * old × facePer100/100 floored to lots, the line's lot remainder to its largest holder. Then POST_RESTRUCTURING, Concord if none active,
 * debt −= old − new face, contagion z5_fear_add 10 (DECAY 7 days, 21 days) on the other blocs; unilateral → HOLDOUT_CLAIM hooks to 13.
 */
export function executeExchange(ctx: PhaseCtx, b: BlocId, offer: ExchangeOffer, unilateral: boolean): void {
  const s = ctx.store, c = openCase(s, b), tick = ctx.tick, day = Math.floor(tick / D), gov = govId(b);
  const assets: string[] = [];
  for (const r of s.iter<{ offerId: string; assetId: string }>(macroTables.voteSnapshot.name)) if (r.offerId === offer.id && !assets.includes(r.assetId)) assets.push(r.assetId);
  const lines = assets.sort(cmp).map((a) => ({ assetId: a, ccy: s.get<SovereignIssue & { id: string }>(macroTables.issue.name, a)?.ccy ?? b }));
  const nb = offer.newBonds.map((x) => ({ ...x, assetId: `ast_SOV_${b}_N${x.maturityYears}Y_RS_${day + x.maturityYears * 364}`, fpE6: BigInt(roundHalfEven(x.facePer100 * 1e6)), total: 0n }));
  let oldFace = 0n;
  for (const l of lines) {
    const hs = holdings(ctx, [l.assetId], gov);
    if (hs.length === 0) continue;
    let lineFace = 0n, top = hs[0]!;
    for (const x of hs) { ctx.ledger.moveQty(x.holderId, gov, l.assetId, x.face, 0n, l.ccy, CODE); lineFace += x.face; if (x.face > top.face) top = x; }
    oldFace += lineFace;
    for (const n of nb) {
      const total = floorLot((lineFace * n.fpE6) / 100_000_000n);
      let given = 0n;
      const qs = hs.map((x) => { const q = floorLot((x.face * n.fpE6) / 100_000_000n); given += q; return q; });
      hs.forEach((x, i) => { const q = qs[i]! + (x === top ? total - given : 0n); if (q > 0n) ctx.ledger.moveQty(gov, x.holderId, n.assetId, q, 0n, b, CODE); });
      n.total += total;
    }
    const row = s.get<SovereignIssue & { id: string }>(macroTables.issue.name, l.assetId);
    if (row) s.put(macroTables.issue.name, { ...row, faceOutstanding: 0n });
  }
  let newFace = 0n;
  for (const n of nb) {
    newFace += n.total;
    s.put<SovereignIssue & { id: string }>(macroTables.issue.name, { id: n.assetId, assetId: n.assetId, govId: gov, tenor: n.tenor, ccy: b, couponRate: n.couponRate, issueTick: tick,
      maturityTick: tick + n.maturityYears * 364 * D, faceOutstanding: n.total, inflationLinked: false, fxDenominated: false, cac: { threshold: CAC_THRESHOLD, aggregated: true }, onTheRun: false });
  }
  if (unilateral) {
    const rej: { holderId: Id; face: Qty }[] = [];
    for (const v of s.iter<SovExchangeVote>(macroTables.vote.name)) if (v.offerId === offer.id && v.vote === 'REJECT' && !isNpcSector(v.holderId)) {
      const r = rej.find((x) => x.holderId === v.holderId);
      if (r) r.face += v.face; else rej.push({ holderId: v.holderId, face: v.face });
    }
    rej.sort((x, y) => cmp(x.holderId, y.holderId));
    for (const r of rej) {
      const claimFace = Number(r.face) / 1e6;
      writeHook(ctx, '13', 'HOLDOUT_CLAIM', { holderId: r.holderId, govId: gov, offerId: offer.id, claimFace, parDifference: claimFace * offer.haircutNpv }, c.id);
    }
  }
  const bloc = blocRow(s, b), debt = bloc.fiscal.debt - (oldFace - newFace);
  s.put(macroTables.bloc.name, { ...bloc, fiscal: { ...bloc.fiscal, debt } });
  saveCase(ctx, b, { ...c, offers: c.offers.map((o) => (o.id === offer.id ? offer : o)), resolvedTick: tick, recoveryNpv: 1 - offer.haircutNpv }, 'POST_RESTRUCTURING');
  ctx.emit('macro.sov.status', [gov], { govId: gov, status: 'POST_RESTRUCTURING', trigger: null }, 'PUBLIC');
  if (!concordActive(s, b)) openConcord(ctx, b, 'RESTRUCTURING');
  for (const o of BLOC_ORDER) if (o !== b) {
    const r = blocRow(s, o);
    s.put(macroTables.bloc.name, { ...r, shocks: [...r.shocks, { id: `shk_sovx_${c.id}_${o}`, target: 'z5_fear_add', value: 10, startTick: tick, endTick: tick + 21 * D, shape: 'DECAY' as const, halfLifeDays: 7, sourceCrisisId: c.id }] });
  }
}

/** The latest offer opened at or before `tick` of the government's latest case (06, 08 read it), else null. */
export function restructuringTerms(store: StoreRead, gov: string, tick: Tick): ExchangeOffer | null {
  const c = latestCase(store, gov);
  if (!c) return null;
  let o: ExchangeOffer | null = null;
  for (const x of c.offers) if (x.openTick <= tick) o = x;
  return o;
}

/** Recovery NPV per unit of old face: 1 − h of the executed offer, else of the latest offer, else null (no restructuring). */
export function sovereignRecovery(store: StoreRead, gov: string): number | null {
  if (!blocOfEntity(gov)) return null;
  const c = latestCase(store, gov), last = c?.offers[c.offers.length - 1];
  return c?.recoveryNpv ?? (last ? 1 - last.haircutNpv : null);
}
