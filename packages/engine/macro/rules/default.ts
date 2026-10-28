// T04-13 sovereign default (04 §3.12.1–2): triggers checked at day close, case, grace, selective default.
// Pure trigger rules first; the PhaseCtx steps (checkDefaultTriggers, openDefaultCase, stepDefaultCase) follow in this file.
import { dmath } from '@tycoon/engine-core';
import type { Money } from '@tycoon/engine-core';
import type { BlocId, SovereignDefaultCase } from '../schema';

export type DefaultTrigger = SovereignDefaultCase['trigger'];

/** FAILED_ROLLOVER: ≥ 2 failed auctions in 21 days, buffer below the next 21 days' maturities, and no backstop left. */
export function failedRolloverTrigger(x: { failed21d: number; cashBuffer: Money; maturities21d: Money; backstopAvailable: boolean; backstopExhausted: boolean }): boolean {
  return x.failed21d >= 2 && x.cashBuffer < x.maturities21d && (!x.backstopAvailable || x.backstopExhausted);
}

/** FX_SERVICE: FDL service due in 21 days above reserves less one month of imports, and no Concord program can be agreed. */
export function fxServiceTrigger(x: { fdlServiceDue21d: Money; reservesFdl: Money; importsMonthFdl: Money; concordAgreeable: boolean }): boolean {
  return x.fdlServiceDue21d > x.reservesFdl - x.importsMonthFdl && !x.concordAgreeable;
}

/** POLITICAL: a decision from 09 with debt/GDP > 1.5 and ≥ 63 consecutive trading days of s10 > 0.15; never FDL or NKR. */
export function politicalTrigger(b: BlocId, x: { politicalDecision: boolean; debtGdp: number; highSpreadTradingDays: number }): boolean {
  if (b === 'FDL' || b === 'NKR') return false;
  return x.politicalDecision && x.debtGdp > 1.5 && x.highSpreadTradingDays >= 63;
}

/** HAZARD: daily surprise probability 1 − e^(−0.25·λ/364) when λ > 0.10, else 0 (the draw is still consumed by the caller). */
export function hazardDrawProbability(lambda: number): number {
  return lambda > 0.10 ? -dmath.expm1(-0.25 * lambda / 364) : 0;
}
