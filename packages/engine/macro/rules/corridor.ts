// T04-08 corridor (04 §3.8.1). `corridorOf` was added by the T04-06 PR (E-100 (j)); T04-08 owns it.
import { EngineFault, roundHalfEven, type PhaseCtx } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from '../blocs';
import { macroTables, type BlocId, type CentralBank } from '../schema';
import { putFact } from './t03Stubs';

/** lendingRate = i + w, depositRate = i − w; without negative rates the deposit rate is floored at 0. */
export function corridorOf(i: number, negativeRatesAllowed: boolean, w: number): { lendingRate: number; depositRate: number } {
  const dep = i - w;
  return { lendingRate: i + w, depositRate: !negativeRatesAllowed && dep < 0 ? 0 : dep };
}

/** Genesis and after every decision: cb.facilities rates, ELA spread 0.015, max term 7, and the FACILITY_RATE_E6 fact for 03. */
export function setCorridor(ctx: PhaseCtx, b: BlocId): void {
  const cb = ctx.store.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (!cb) throw new EngineFault('I0.macro_missing', `setCorridor: no cb row for ${b}`);
  const c = corridorOf(cb.policyRate, BLOC_DEFAULTS[b].negativeRatesAllowed, ctx.params.num('macro_corridor_halfwidth'));
  ctx.store.put<CentralBank>(macroTables.cb.name, { ...cb, facilities: { ...cb.facilities, lendingRate: c.lendingRate, depositRate: c.depositRate,
    elaPenaltySpread: 0.015, maxTermDays: 7 } });
  putFact(ctx, 'FACILITY_RATE_E6', b, roundHalfEven(c.lendingRate * 1e6));
}
