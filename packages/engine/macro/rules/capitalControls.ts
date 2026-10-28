// T04-14 capital controls, SRL and PYN only (04 §3.13.7).
import { TICKS_PER_GAME_DAY, type Ccy, type PhaseCtx, type Tick } from '@tycoon/engine-core';
import type { FlowClass } from '@tycoon/engine-ledger';
import { macroTables, type BlocId, type BlocMacroState, type FxState } from '../schema';

const D = TICKS_PER_GAME_DAY, LEVY = 0.01;
/** Default days per level at a step-down; level 1's 28 days are the break rule's (unit decision). */
export const CAPCON_DAYS: Readonly<Record<1 | 2 | 3, number>> = Object.freeze({ 1: 28, 2: 3, 3: 72 });
export type CapconLevel = 0 | 1 | 2 | 3;

export const MACRO_EXTENSION_CODES_FX: readonly { code: string; cls: FlowClass; template: string; desc: string }[] = Object.freeze([
  { code: 'CAPCON_LEVY', cls: 'SINK', template: 'BURN', desc: 'capital-controls conversion levy (posted by 05)' },
  { code: 'CSF_DISBURSE', cls: 'TRANSFER', template: 'PAY', desc: 'Concord tranche, npc_CSF to the treasury' },
  { code: 'CSF_REPAY', cls: 'TRANSFER', template: 'PAY', desc: 'Concord principal installment, treasury to npc_CSF' },
  { code: 'CSF_INTEREST', cls: 'TRANSFER', template: 'PAY', desc: 'Concord quarterly interest, treasury to npc_CSF' },
  { code: 'MAC_FX_CA_ABSORB', cls: 'TRANSFER', template: 'FX', desc: 'current account absorbed by a managed-regime cb' },
]);

const blocOf = (ctx: PhaseCtx, b: BlocId) => ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
function putFx(ctx: PhaseCtx, b: BlocId, fx: FxState): void { const st = blocOf(ctx, b); if (st) ctx.store.put(macroTables.bloc.name, { ...st, fx }); }

/** Schedules `level` for `days` game days from the next tick (exploit 14); level 0 lifts the controls. */
export function setCapitalControls(ctx: PhaseCtx, b: 'SRL' | 'PYN', level: CapconLevel, days: number, reason: string): void {
  const st = blocOf(ctx, b);
  if (!st) return;
  const start: Tick = ctx.tick + 1;
  putFx(ctx, b, { ...st.fx, capconSchedule: { level, startTick: start, untilTick: level === 0 ? null : start + days * D, reason } });
}
/** Per tick: applies a due schedule (event at start); at expiry steps down one level for its default days (event). */
export function stepCapitalControls(ctx: PhaseCtx): void {
  for (const b of ['PYN', 'SRL'] as const) {
    const st = blocOf(ctx, b);
    if (!st) continue;
    const fx = st.fx, sc = fx.capconSchedule;
    if (sc && ctx.tick >= sc.startTick) {
      const { capconSchedule: _done, ...rest } = fx;
      putFx(ctx, b, { ...rest, capitalControls: sc.level, ...(sc.untilTick === null ? { capitalControlsUntilTick: undefined } : { capitalControlsUntilTick: sc.untilTick }) });
      ctx.emit('macro.fx.capcontrols', [], { bloc: b, level: sc.level, untilTick: sc.untilTick }, 'PUBLIC');
      continue;
    }
    if (fx.capitalControls > 0 && fx.capitalControlsUntilTick !== undefined && ctx.tick >= fx.capitalControlsUntilTick) {
      const level = (fx.capitalControls - 1) as CapconLevel, until = level === 0 ? null : ctx.tick + CAPCON_DAYS[level as 1 | 2] * D;
      putFx(ctx, b, { ...fx, capitalControls: level, capitalControlsUntilTick: until ?? undefined });
      ctx.emit('macro.fx.capcontrols', [], { bloc: b, level, untilTick: until }, 'PUBLIC');
    }
  }
}
/** The P1 rule 05 applies: conversions of the controlled currency into another pay the levy at level ≥ 1 and are held at level ≥ 2,
 *  except reduce-only closes of existing FX derivative positions; trading inside the currency is untouched. */
export function capconDecision(level: CapconLevel, o: { sellCcy: Ccy; buyCcy: Ccy; controlled: Ccy; reduceOnlyFxDerivativeClose: boolean }): { allowed: boolean; levyRate: number; reject?: 'CAPCON_BLOCKED' } {
  const conversion = o.sellCcy === o.controlled && o.buyCcy !== o.controlled;
  if (level === 0 || !conversion) return { allowed: true, levyRate: 0 };
  if (level >= 2 && !o.reduceOnlyFxDerivativeClose) return { allowed: false, levyRate: 0, reject: 'CAPCON_BLOCKED' };
  return { allowed: true, levyRate: LEVY };
}
