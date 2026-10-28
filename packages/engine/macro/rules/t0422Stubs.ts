// MISSING EXPORTs from T04-22 (#95, not merged; T04-21 must not depend on it). No-ops until #95 lands, then genesis.ts imports ../institutions.
import type { ParamsView, PhaseCtx } from '@tycoon/engine-core';

/** MISSING EXPORT: T04-22 registerMacroInstitutions (institutions.ts). */
export function registerMacroInstitutions(_ctx: PhaseCtx): void { /* T04-22 */ }
/** MISSING EXPORT: T04-22 postOpeningBalanceSheets(ctx, p, S0) (institutions.ts). */
export function postOpeningBalanceSheets(_ctx: PhaseCtx, _p: ParamsView, _S0: number): void { /* T04-22 */ }
