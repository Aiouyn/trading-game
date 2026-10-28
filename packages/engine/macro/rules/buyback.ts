// T04-12 buybacks (04 §3.10.7): reverse auction for off-the-run lines on excess cash or off-the-run dysfunction.
import { divRoundHalfEven, fnv1a32, fromMoney, MICRO_N, TICKS_PER_GAME_DAY, toMoney, type Money, type PhaseCtx, type Price, type Qty, type Tick } from '@tycoon/engine-core';
import { govId, type FlowClass } from '@tycoon/engine-ledger';
import { blocOfEntity } from '../ids';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type Buyback, type BuybackOffer, type GlobalMacroState, type SovereignIssue } from '../schema';
import { auctionStress } from './auction';
import { tradingDaysOfPeriod } from './calendar';
import { linesOf } from './issuance';

const D = TICKS_PER_GAME_DAY, LOT: Qty = 1000n * MICRO_N, BUYBACK_TICK = 330, CAP_OVER_FAIR: Price = 1000n /* 0.10 per 100 face = 0.001 per unit */;
const BB = macroTables.buyback.name, BO = macroTables.buybackOffer.name;

export const MACRO_EXTENSION_CODES_PRIMARY: readonly { code: string; cls: FlowClass; template: string; desc: string }[] = Object.freeze([
  { code: 'GOV_SYNDICATION_FEE', cls: 'TRANSFER', template: 'PAY', desc: 'Syndication fee paid by gov_X to each lead manager (the NPC dealer pool for NPC leads)' },
  { code: 'GOV_BUYBACK', cls: 'TRANSFER', template: 'SWAP_ASSET', desc: 'Treasury buyback: gov_X pays the holder its offer price; the bond leg retires the face (accounts as SOV_REDEMPTION)' },
]);

/** (a) cash > 2·target and stress < 0.2 → cash − 2·target (EXCESS_CASH); else (b) off-the-run depth < 0.5 and FSI > 0.5 → max(0, cash − target) (DYSFUNCTION);
 *  maxFaceCash = min(excess, 0.02·debt); open only when maxFaceCash > 0. */
export function buybackTrigger(f: { cashBuffer: Money; cashTarget: Money; stress: number; offTheRunDepth: number; fsi: number; debt: Money }):
  { open: boolean; maxFaceCash: Money; reason: 'EXCESS_CASH' | 'DYSFUNCTION' | null } {
  let excess = 0n, reason: 'EXCESS_CASH' | 'DYSFUNCTION' | null = null;
  if (f.cashBuffer > 2n * f.cashTarget && f.stress < 0.2) { excess = f.cashBuffer - 2n * f.cashTarget; reason = 'EXCESS_CASH'; }
  else if (f.offTheRunDepth < 0.5 && f.fsi > 0.5) { excess = f.cashBuffer - f.cashTarget; /* ≤ 0 stays closed below */ reason = 'DYSFUNCTION'; }
  const lim = (f.debt * 2n) / 100n, m = excess < lim ? excess : lim;
  return m > 0n ? { open: true, maxFaceCash: m, reason } : { open: false, maxFaceCash: 0n, reason: null };
}
/** Caller: t = 420 of the month's first trading day. Off-the-run unmatured lines of the government; offers until t = 330 of the next trading day.
 *  Decision: missing depth (no 05 data) = no dysfunction; cash target = 28/364 × annual spending (as the GFN); maxFace = maxFaceCash at par. */
export function openBuyback(ctx: PhaseCtx, b: BlocId, ports: MacroPorts): Buyback | null {
  const s = ctx.store, bl = s.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!bl) return null;
  const gov = govId(b), f = bl.fiscal, day = Math.floor(ctx.tick / D);
  const tr = buybackTrigger({ cashBuffer: ctx.ledger.cash(gov, b), cashTarget: toMoney((28 / 364) * f.spendingGdp * fromMoney(bl.nominalGdp), b), stress: auctionStress(s, b, ctx.tick),
    offTheRunDepth: ports.markets.bondDepthIndex(s, b, true) ?? 1, fsi: s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.financialStressIndex ?? 0, debt: f.debt });
  const assetIds = linesOf(s, b, ports).filter((l) => !l.onTheRun && l.maturityTick > ctx.tick).map((l) => l.assetId);
  if (!tr.open || assetIds.length === 0) return null;
  const row: Buyback = { id: `bb_${b}_${day}`, govId: gov, assetIds, maxFace: tr.maxFaceCash, tick: tradingDaysOfPeriod(b, day + 1, 14)[0]! * D + BUYBACK_TICK, offers: [] };
  s.put<Buyback>(BB, row);
  return row;
}
/** At bb.tick: offers with a live hold and minPrice ≤ fair + 0.10 per 100 (no fair price → rejected), ascending minPrice then fnv1a32(offerId + buybackId), up to maxFace
 *  (partial last offer floored to 1,000); each paid its own price. Accepted offers are kept on the row; every hold released; offer rows deleted. */
export function settleBuyback(ctx: PhaseCtx, bb: Buyback, ports: MacroPorts): void {
  const s = ctx.store, b = (blocOfEntity(bb.govId) ?? 'FDL') as BlocId;
  const all = [...s.iter<BuybackOffer>(BO)].filter((o) => o.buybackId === bb.id).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const ok = all.filter((o) => { const fair = ports.markets.fairPriceOf(s, o.assetId); return ctx.holds.get(o.holdId)?.status === 'ACTIVE' && fair !== null && o.minPrice <= fair + CAP_OVER_FAIR; })
    .sort((x, y) => (x.minPrice < y.minPrice ? -1 : x.minPrice > y.minPrice ? 1 : fnv1a32(x.id + bb.id) - fnv1a32(y.id + bb.id)));
  let left = bb.maxFace, face = 0n, cash = 0n;
  const acc: Buyback['offers'] = [];
  for (const o of ok) {
    const f = o.face <= left ? o.face : (left / LOT) * LOT;
    if (f <= 0n) break;
    const issue = s.get<SovereignIssue & { id: string }>(macroTables.issue.name, o.assetId), c = divRoundHalfEven(f * o.minPrice, MICRO_N);
    ctx.ledger.swapAsset(bb.govId, o.holderId, o.assetId, f, c, issue?.ccy ?? b, 'GOV_BUYBACK');
    if (issue) s.put(macroTables.issue.name, { ...issue, faceOutstanding: issue.faceOutstanding - f });
    acc.push({ offerId: o.id, holderId: o.holderId, assetId: o.assetId, face: f, minPrice: o.minPrice });
    left -= f; face += f; cash += c;
  }
  for (const o of all) { ctx.holds.release(o.holdId); s.del(BO, o.id); }
  s.put<Buyback>(BB, { ...bb, offers: acc });
  ctx.emit('macro.sov.buyback.result', [bb.govId], { buybackId: bb.id, govId: bb.govId, acceptedFace: face.toString(), offers: acc.length,
    averagePrice: face > 0n ? divRoundHalfEven(cash * MICRO_N, face).toString() : null }, 'PUBLIC');
}
/** Window check shared by the intent: open from creation until bb.tick − 1. */
export const buybackOpen = (bb: Buyback | undefined, tick: Tick): boolean => !!bb && tick < bb.tick && bb.offers.length === 0;
