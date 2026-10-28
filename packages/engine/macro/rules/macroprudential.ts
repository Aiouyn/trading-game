// T04-09 macroprudential settings (04 §3.8.8) and the LTRO window. 07 and 10 read them through T04-20 (ccyb, macroprudential).
import { roundHalfEven, TICKS_PER_GAME_DAY, type PhaseCtx, type Tick } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { macroTables, type BlocId, type BlocMacroState, type CentralBank, type GlobalMacroState } from '../schema';

const r6 = (x: number): number => roundHalfEven(x * 1e6) / 1e6;
export const CCYB_DELAY_TICKS = 91 * TICKS_PER_GAME_DAY;

/** clamp(0.005·floor(max(0, gap − 0.02)/0.02), 0, 0.025). */
export function ccybTarget(creditGap: number): number {
  return r6(Math.min(0.025, Math.max(0, 0.005 * Math.floor(r6(Math.max(0, creditGap - 0.02) / 0.02)))));
}
export function ltvCaps(housePriceGap: number, creditGap: number): { residential: number; commercial: number; dti: number } {
  return { residential: housePriceGap > 0.3 ? 0.7 : housePriceGap > 0.15 ? 0.75 : 0.8, commercial: creditGap > 0.06 ? 0.6 : 0.65, dti: 0.4 };
}

const T = macroTables.cb.name;
const tool = (ctx: PhaseCtx, b: BlocId, t: 'CCYB_CHANGE' | 'LTV_CHANGE' | 'LTRO_OPEN', params: Record<string, number | string | boolean>): void =>
  ctx.emit('macro.cb.tool', [cbkId(b)], { bloc: b, tool: t, params }, 'PUBLIC');

/** Applies a pending increase whose effectiveTick has come (call each tick or at day close before the meeting step). */
export function applyPendingCcyb(ctx: PhaseCtx, b: BlocId): void {
  const cb = ctx.store.get<CentralBank>(T, cbkId(b));
  if (!cb?.ccybPending || cb.ccybPending.effectiveTick > ctx.tick) return;
  ctx.store.put<CentralBank>(T, { ...cb, macroprudential: { ...cb.macroprudential, ccyb: cb.ccybPending.value }, ccybPending: null });
  tool(ctx, b, 'CCYB_CHANGE', { ccyb: cb.ccybPending.value, effective: true });
}

/** Scheduled meeting: an increase is stored pending for 91 game days; a decrease applies now (and drops a pending increase). LTV/DTI apply now. */
export function macroprudentialAtMeeting(ctx: PhaseCtx, b: BlocId): void {
  const cb = ctx.store.get<CentralBank>(T, cbkId(b)), bloc = ctx.store.get<BlocMacroState>(macroTables.bloc.name, b);
  if (!cb || !bloc) return;
  const target = ccybTarget(bloc.creditGap), cur = cb.macroprudential.ccyb, caps = ltvCaps(bloc.housePriceGap, bloc.creditGap);
  let mp = cb.macroprudential, pending = cb.ccybPending;
  if (target > cur && pending?.value !== target) { pending = { value: target, effectiveTick: ctx.tick + CCYB_DELAY_TICKS }; tool(ctx, b, 'CCYB_CHANGE', { ccyb: target, effectiveTick: pending.effectiveTick }); }
  else if (target < cur) { mp = { ...mp, ccyb: target }; pending = null; tool(ctx, b, 'CCYB_CHANGE', { ccyb: target, effective: true }); }
  else if (target === cur) pending = null;
  if (caps.residential !== mp.ltvCapResidential || caps.commercial !== mp.ltvCapCommercial || caps.dti !== mp.dtiCap) {
    mp = { ...mp, ltvCapResidential: caps.residential, ltvCapCommercial: caps.commercial, dtiCap: caps.dti };
    tool(ctx, b, 'LTV_CHANGE', { residential: caps.residential, commercial: caps.commercial, dti: caps.dti });
  }
  ctx.store.put<CentralBank>(T, { ...cb, macroprudential: mp, ccybPending: pending });
}

/** Day close: CONTRACTION or FSI > 0.5 releases the buffer to 0 at once and cancels a pending increase. */
export function macroprudentialRelease(ctx: PhaseCtx, b: BlocId): void {
  const cb = ctx.store.get<CentralBank>(T, cbkId(b)), bloc = ctx.store.get<BlocMacroState>(macroTables.bloc.name, b);
  const fsi = ctx.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')?.financialStressIndex ?? 0;
  if (!cb || !bloc || !(bloc.regime === 'CONTRACTION' || fsi > 0.5)) return;
  if (cb.macroprudential.ccyb === 0 && cb.ccybPending === null) return;
  ctx.store.put<CentralBank>(T, { ...cb, macroprudential: { ...cb.macroprudential, ccyb: 0 }, ccybPending: null });
  tool(ctx, b, 'CCYB_CHANGE', { ccyb: 0, effective: true, release: true });
}

/** Opens (or extends) the 91-day LTRO window until `untilTick`; LTRO_OPEN. */
export function openLtro(ctx: PhaseCtx, b: BlocId, untilTick: Tick, cause: 'EMERGENCY' | 'CRISIS_POLICY'): void {
  const cb = ctx.store.get<CentralBank>(T, cbkId(b));
  if (!cb) return;
  const until = cb.ltroOpenUntilTick !== null && cb.ltroOpenUntilTick > untilTick ? cb.ltroOpenUntilTick : untilTick;
  ctx.store.put<CentralBank>(T, { ...cb, ltroOpenUntilTick: until });
  tool(ctx, b, 'LTRO_OPEN', { untilTick: until, cause });
}
