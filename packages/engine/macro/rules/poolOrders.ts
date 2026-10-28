// T04-09 CB pool orders (04 §6.3): P4 writes this tick's mac.pool_order rows (QE/QT slices, YCC bid, orders T04-14 hands in); P2 next tick
// reads the fills (ports.markets.poolFills), advances the program and deletes the rows. 05 posts the trades as MKT_TRADE; 04 posts nothing.
import { MICRO_N, mulRate, roundHalfEven, sessionState, TICKS_PER_GAME_DAY, type PhaseCtx, type Price, type Qty } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type AssetPurchaseProgram, type BlocId, type CentralBank, type NpcPoolOrder } from '../schema';
import { monthStartDay } from './calendar';
import { dailyProgram, runoffOfDay, type PositionOf } from './qe';
import { yccBid, yccCapacity, yccPressure } from './ycc';

/** Lot = one face unit (unit decision: 04 names no bond lot). */
export const LOT: Qty = MICRO_N;
const CONT_LAST = 539, ADV_SHARE = 0.1;
const T = macroTables.cb.name, PO = macroTables.poolOrder.name;
const tickKey = (t: number): string => String(t).padStart(12, '0');

/** remaining ÷ ticks left, floored to lots; the last tick takes all that is left. */
export function sliceOfDay(dailyFace: Qty, sessionTicksLeft: number): Qty {
  if (dailyFace <= 0n) return 0n;
  if (sessionTicksLeft <= 1) return dailyFace;
  return ((dailyFace / BigInt(sessionTicksLeft)) / LOT) * LOT;
}
/** fair × (1 ± 2·halfSpread), half-even to the micro unit. */
export function iocLimit(fair: Price, halfSpread: number, side: 'BUY' | 'SELL'): Price {
  return mulRate(fair, BigInt(roundHalfEven((1 + (side === 'BUY' ? 2 : -2) * halfSpread) * 1e6)));
}

const positionOf = (ctx: PhaseCtx, b: BlocId): PositionOf => (assetId) => ctx.ledger.position(cbkId(b), assetId);
const continuous = (b: BlocId, tick: number): boolean => sessionState('BLOC_LISTED', tick, { bloc: b, holidayFxDepthMult: 1 }).state === 'CONTINUOUS';

/** The day's plan, made on the first continuous tick of the day; also rolls the month totals and books the QT runoff of the day. */
function planOfDay(ctx: PhaseCtx, ports: MacroPorts, cb: CentralBank, gameDay: number): AssetPurchaseProgram {
  const q = cb.qe;
  if (q.day?.gameDay === gameDay) return q;
  const start = monthStartDay(gameDay), pos = positionOf(ctx, cb.bloc);
  const month = q.month?.start === start ? q.month : { start, bought: 0n, sold: 0n, runoff: 0n };
  const rows = dailyProgram(ctx.store, cb.bloc, gameDay, ports, pos);
  const next = { ...q, month: { ...month, runoff: month.runoff + runoffOfDay(ctx.store, cb.bloc, gameDay, ports, pos) }, day: { gameDay, rows } };
  ctx.store.put<CentralBank>(T, { ...cb, qe: next });
  return next;
}

/** P4 each tick, blocs in BLOC_ORDER. `extra` = orders T04-14 passes in (FX, CSF backstop, reserve rebalancing), written as given. */
export function writePoolOrders(ctx: PhaseCtx, ports: MacroPorts, extra: readonly NpcPoolOrder[] = []): NpcPoolOrder[] {
  const out: NpcPoolOrder[] = [], t = ctx.tick % TICKS_PER_GAME_DAY, gameDay = Math.floor(ctx.tick / TICKS_PER_GAME_DAY);
  for (const b of BLOC_ORDER) {
    const cb = ctx.store.get<CentralBank>(T, cbkId(b));
    if (!cb || !continuous(b, ctx.tick)) continue;
    if (cb.qe.state !== 'NONE') {
      const q = planOfDay(ctx, ports, cb, gameDay);
      for (const r of q.day?.rows ?? []) {
        let qty = sliceOfDay(r.face, CONT_LAST - t + 1);
        const adv = ports.markets.lineAdv(ctx.store, r.assetId);
        if (adv !== null) { const cap = BigInt(roundHalfEven(adv * ADV_SHARE)); if (qty > cap) qty = cap; }
        if (qty <= 0n) continue;
        const fair = ports.markets.fairPriceOf(ctx.store, r.assetId) ?? MICRO_N, h = ports.markets.makerHalfSpread(ctx.store, r.assetId) ?? 0;
        out.push({ id: ctx.newId('pool'), poolId: `CB:${b}`, assetId: r.assetId, side: r.side, qty, limitPrice: iocLimit(fair, h, r.side), tif: 'TICK', tick: ctx.tick,
          purpose: q.state === 'QT' ? 'QT' : 'QE' });
      }
    }
    if (cb.ycc?.active) {
      const cap = yccCapacity(ctx.store, b, ports, positionOf(ctx, b), ctx.tick);
      const bid = yccBid(ctx.store, b, ports, cap, ctx.tick);
      if (bid) out.push({ ...bid, id: ctx.newId('pool') });
      yccPressure(ctx, b, cap);
    }
  }
  for (const o of extra) out.push({ ...o, tick: ctx.tick });
  for (const o of out) ctx.store.put<NpcPoolOrder>(PO, o);
  return out;
}

/** P2: fills of last tick's CB rows reduce the day's remaining face and add to the month totals (BUY → bought, SELL → sold, notional) and
 *  the balance-sheet bucket (06 assetInfo class); then last tick's rows are deleted. Unfilled face stays in the day plan (rolls forward). */
export function applyPoolFills(ctx: PhaseCtx, ports: MacroPorts): void {
  const prev = ctx.tick - 1;
  if (prev < 0) return;
  for (const b of BLOC_ORDER) {
    const cb = ctx.store.get<CentralBank>(T, cbkId(b));
    if (!cb) continue;
    const fills = ports.markets.poolFills(ctx.store, prev, `CB:${b}`);
    if (!fills.length) continue;
    const q = cb.qe, rows = (q.day?.rows ?? []).map((r) => ({ ...r }));
    let month = q.month ?? { start: monthStartDay(Math.floor(prev / TICKS_PER_GAME_DAY)), bought: 0n, sold: 0n, runoff: 0n };
    const bs = { ...cb.balanceSheet };
    for (const f of fills) {
      const r = rows.find((x) => x.assetId === f.assetId && x.side === f.side);
      if (r) { r.face = r.face > f.qty ? r.face - f.qty : 0n; month = f.side === 'BUY' ? { ...month, bought: month.bought + f.notional } : { ...month, sold: month.sold + f.notional }; }
      const cls = ports.assets.assetInfo(ctx.store, f.assetId)?.cls, sgn = f.side === 'BUY' ? f.notional : -f.notional;
      if (cls === 'GOV') bs.govBonds += sgn; else if (cls === 'CORP') bs.corpBonds += sgn; else if (cls === 'ABS_SENIOR') bs.abs += sgn;
    }
    ctx.store.put<CentralBank>(T, { ...cb, balanceSheet: bs, qe: { ...q, month, ...(q.day ? { day: { ...q.day, rows } } : {}) } });
  }
  for (const o of [...ctx.store.index<NpcPoolOrder>(PO, 'tick', tickKey(prev))]) ctx.store.del(PO, o.id);
}
