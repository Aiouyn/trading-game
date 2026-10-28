// T04-09 yield curve control (04 §3.8.6): PYN defends a 10y cap with a real resting bid; it breaks visibly when capacity runs out (edge 20).
import { MICRO_N, mulRate, roundHalfEven, type PhaseCtx, type Qty, type StoreRead } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type CentralBank, type HookCall, type NpcPoolOrder, type YieldCurveControl } from '../schema';
import { credibilityOneOff } from './credibility';
import { holdingsOf, HOLDINGS_CAP_GDP, lineCapRoom, type PositionOf } from './qe';

/** `macro_ycc_bloc` is not in the params registry (MISSING param); the card default PYN holds. */
export const YCC_BLOC: BlocId = 'PYN';
const EPS = 1e-12, START_DAYS = 10, HIGH_INFL_DAYS = 63, RAISE = 0.0025, MAX_RAISES = 2;

/** Day close of a trading day: streak of days with i = elb and y10 − i > 0.01; the 10th starts YCC at i + 0.005 (already active → no start). */
export function yccStartCheck(cb: CentralBank, i: number, elb: number, y10: number, streak: number): { start: boolean; streak: number } {
  const s = Math.abs(i - elb) < EPS && y10 - i > 0.01 + EPS ? streak + 1 : 0;
  return { start: s >= START_DAYS && !(cb.ycc?.active ?? false), streak: s };
}

/** At a meeting: once π_core > π* + 0.005 has held 63 trading days, raise the cap 0.0025; after two raises the next step removes it. */
export function yccExitStep(cb: CentralBank, piCore: number, target: number, highInflDays: number): { action: 'NONE' | 'RAISE' | 'REMOVE'; ycc: YieldCurveControl | null } {
  const y = cb.ycc;
  if (!y || !y.active || highInflDays < HIGH_INFL_DAYS || !(piCore > target + 0.005 + EPS)) return { action: 'NONE', ycc: y };
  if (cb.yccRaises >= MAX_RAISES) return { action: 'REMOVE', ycc: null };
  return { action: 'RAISE', ycc: { ...y, capYield: roundHalfEven((y.capYield + RAISE) * 1e6) / 1e6 } };
}

const tenYear = (store: StoreRead, b: BlocId, ports: MacroPorts) => ports.assets.sovereignLines(store, govId(b)).find((l) => l.onTheRun && l.tenor === 'N10Y') ?? null;

/** min(total-cap room in face at the line price, line-cap room). */
export function yccCapacity(store: StoreRead, b: BlocId, ports: MacroPorts, position: PositionOf, tick: number): Qty {
  const line = tenYear(store, b, ports), cb = store.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (!line || !cb) return 0n;
  const h = holdingsOf(store, b, ports, position, tick), gdp = store.get<{ nominalGdp: bigint }>(macroTables.bloc.name, b)?.nominalGdp ?? 0n;
  const totalRoom = mulRate(gdp, BigInt(roundHalfEven((cb.qe.holdingsCapGdp || HOLDINGS_CAP_GDP) * 1e6))) - h.total;
  const px = ports.markets.fairPriceOf(store, line.assetId) ?? MICRO_N;
  const tf = totalRoom > 0n ? (totalRoom * MICRO_N) / px : 0n, lf = lineCapRoom(position(line.assetId), line.faceOutstanding);
  return tf < lf ? tf : lf;
}

/** Resting BUY on the on-the-run 10y at priceFromYield(capYield), size 2 × ADV bounded by capacity; zero capacity or no line → null. */
export function yccBid(store: StoreRead, b: BlocId, ports: MacroPorts, capacityFace: Qty, tick = 0): NpcPoolOrder | null {
  const cb = store.get<CentralBank>(macroTables.cb.name, cbkId(b)), line = tenYear(store, b, ports);
  if (!cb?.ycc?.active || !line || capacityFace <= 0n) return null;
  const adv = ports.markets.lineAdv(store, line.assetId) ?? 0;
  const want = BigInt(roundHalfEven(2 * adv)), qty = want < capacityFace ? want : capacityFace;
  if (qty <= 0n) return null;
  const per100 = ports.assets.priceFromYield(store, line.assetId, cb.ycc.capYield, tick);
  if (!Number.isFinite(per100)) return null;
  return { id: `ycc_${b}_${tick}`, poolId: `CB:${b}`, assetId: line.assetId, side: 'BUY', qty, limitPrice: BigInt(roundHalfEven((per100 / 100) * 1e6)), tif: 'RESTING', tick, purpose: 'YCC' };
}

/** Edge 20: one WIRE_ITEM hook per under-pressure episode (capacity 0 while active); the flag clears when capacity returns. */
export function yccPressure(ctx: PhaseCtx, b: BlocId, capacityFace: Qty): void {
  const T = macroTables.cb.name, cb = ctx.store.get<CentralBank>(T, cbkId(b));
  if (!cb?.ycc?.active) return;
  if (capacityFace > 0n) { if (cb.yccPressureWired) ctx.store.put<CentralBank>(T, { ...cb, yccPressureWired: false }); return; }
  if (cb.yccPressureWired) return;
  const id = ctx.newId('hook');
  ctx.store.put<HookCall>(macroTables.hookCall.name, { id, owner: '16', hook: 'WIRE_ITEM', args: { key: 'ycc_under_pressure', bloc: b }, worldEventId: '', createdTick: ctx.tick, startTick: ctx.tick + 1 });
  ctx.store.put<CentralBank>(T, { ...cb, yccPressureWired: true });
}

/** Day close of a trading day in YCC_BLOC: streak update and start (YCC_START). */
export function yccDayClose(ctx: PhaseCtx, b: BlocId, elb: number, y10: number, piCore: number, target: number): void {
  const T = macroTables.cb.name, cb = ctx.store.get<CentralBank>(T, cbkId(b));
  if (!cb || b !== YCC_BLOC) return;
  const i = cb.policyRate, r = yccStartCheck(cb, i, elb, y10, cb.ycc10Streak);
  const hi = cb.ycc?.active && piCore > target + 0.005 + EPS ? cb.yccHighInflDays + 1 : 0;
  if (r.start) {
    const cap = roundHalfEven((i + 0.005) * 1e6) / 1e6;
    ctx.store.put<CentralBank>(T, { ...cb, ycc10Streak: r.streak, yccHighInflDays: hi, yccRaises: 0, ycc: { tenorYears: 10, capYield: cap, active: true, startedTick: ctx.tick } });
    ctx.emit('macro.cb.tool', [cbkId(b)], { bloc: b, tool: 'YCC_START', params: { capYield: cap } }, 'PUBLIC');
  } else ctx.store.put<CentralBank>(T, { ...cb, ycc10Streak: r.streak, yccHighInflDays: hi });
}

/** Meeting step: RAISE (YCC_RAISE) or REMOVE (YCC_END); removal while holdings sit at a cap costs YCC_ABANDON credibility. */
export function yccAtMeeting(ctx: PhaseCtx, b: BlocId, piCore: number, target: number, atCap: boolean): 'NONE' | 'RAISE' | 'REMOVE' {
  const T = macroTables.cb.name, cb = ctx.store.get<CentralBank>(T, cbkId(b));
  if (!cb) return 'NONE';
  const s = yccExitStep(cb, piCore, target, cb.yccHighInflDays);
  if (s.action === 'RAISE') {
    ctx.store.put<CentralBank>(T, { ...cb, ycc: s.ycc, yccRaises: cb.yccRaises + 1 });
    ctx.emit('macro.cb.tool', [cbkId(b)], { bloc: b, tool: 'YCC_RAISE', params: { capYield: s.ycc!.capYield } }, 'PUBLIC');
  } else if (s.action === 'REMOVE') {
    ctx.store.put<CentralBank>(T, { ...cb, ycc: null, yccRaises: 0, yccHighInflDays: 0, credibility: atCap ? credibilityOneOff(cb.credibility, 'YCC_ABANDON') : cb.credibility });
    ctx.emit('macro.cb.tool', [cbkId(b)], { bloc: b, tool: 'YCC_END', params: { atCap } }, 'PUBLIC');
  }
  return s.action;
}
