// T04-10 test kit: a bloc row with a fiscal state on top of cbWorld (only the fields the fiscal rules read are meaningful).
import type { Tick } from '@tycoon/engine-core';
import { macroTables, type BlocId, type FiscalState, type Regime } from '../schema';
import { cbWorld, M, type CbWorld } from './cbWorld';

export function fiscalState(over: Partial<FiscalState> = {}): FiscalState {
  return { revenueGdp: 0, spendingGdp: 0, interestGdp: 0, primaryBalanceGdp: 0, deficitGdp: 0, debt: 0n, debtGdp: 0, fxDebt: 0n, averageCoupon: 0, averageMaturityYears: 5,
    cashBuffer: 0n, grossFinancingNeedQuarter: 0n, programs: [], austerityMode: false, swfAssets: 0n, ...over };
}
export interface BlocOpts { gdp?: number; u?: number; x?: number; regime?: Regime; s10?: number; fiscal?: Partial<FiscalState>; label?: Regime | 'UNDETERMINED'; labelSinceDay?: number }
export function putBloc(w: CbWorld, b: BlocId, o: BlocOpts = {}): void {
  w.put(macroTables.bloc.name, { id: b, bloc: b, nominalGdp: M(o.gdp ?? 32e12), unemployment: o.u ?? 0.045, outputGap: o.x ?? 0, regime: o.regime ?? 'EXPANSION',
    realGdpIndex: 100, potentialGdpIndex: 100, sovereign: { spread10y: o.s10 ?? 0 }, fiscal: fiscalState(o.fiscal) } as never);
  w.put(macroTables.publicView.name, { id: b, bloc: b, cycleLabel: o.label ?? 'EXPANSION', cycleLabelSinceDay: o.labelSinceDay ?? 0 } as never);
}
export const REV_BASE = { macro_rev_base_fdl: 0.30, macro_rev_base_eun: 0.42, macro_rev_base_pyn: 0.25, macro_rev_base_nkr: 0.40, macro_rev_base_srl: 0.27 };
export function fiscalWorld(tick: Tick): CbWorld { const w = cbWorld([], tick); w.nums(REV_BASE); return w; }
