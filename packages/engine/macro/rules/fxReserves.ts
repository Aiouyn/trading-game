// T04-14 reserves in FDL and import cover (04 §3.13.4).
import { BLOC_DEFAULTS } from '../blocs';
import { EngineFault, MICRO_N, divRoundHalfEven, roundHalfEven, type Ccy, type Money, type StoreRead } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type BlocMacroState, type CentralBank, type PublicMacroView } from '../schema';

const E12 = 10n ** 12n, e12 = (x: number): bigint => BigInt(roundHalfEven(x * 1e12));
/** FDL per unit at the last day close (public view); FDL is 1. */
export function spotOfStore(s: StoreRead, b: BlocId): number {
  if (b === 'FDL') return 1;
  return s.get<PublicMacroView & { id: BlocId }>(macroTables.publicView.name, b)?.fx?.spotVsFdl ?? BLOC_DEFAULTS[b].fx0;
}
/** nominalGdp_b × spot, in FDL micro (half-even). */
export function nominalGdpFdl(s: StoreRead, b: BlocId): Money {
  const st = s.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, b);
  if (!st) throw new EngineFault('MAC_STATE_MISSING', `no bloc row ${b}`);
  return b === 'FDL' ? st.nominalGdp : divRoundHalfEven(st.nominalGdp * e12(spotOfStore(s, b)), E12);
}
/** openness × nominalGdp_FDL / 13. */
export function importsMonthFdl(store: StoreRead, b: BlocId): Money {
  return divRoundHalfEven(nominalGdpFdl(store, b) * e12(BLOC_DEFAULTS[b].openness), 13n * E12);
}
/** FDL cash and bonds + gold at 06 spot + other FX at spot (05 last print, else genesis fx0). */
export function fxReservesFdl(store: StoreRead, b: BlocId, ports: MacroPorts): Money {
  const cb = store.get<CentralBank>(macroTables.cb.name, cbkId(b));
  if (!cb) throw new EngineFault('MAC_STATE_MISSING', `no cb row ${b}`);
  const gold = ports.assets.commodityClose(store, 'GOLD') ?? 0;
  let r = cb.reserves.fdl + divRoundHalfEven(cb.reserves.gold * e12(gold), E12);
  for (const c of ['EUN', 'PYN', 'NKR', 'SRL'] as const) {
    const m = cb.reserves.otherFx[c as Ccy];
    if (m) r += divRoundHalfEven(m * e12(ports.markets.fxSpot(store, c) ?? BLOC_DEFAULTS[c].fx0), E12);
  }
  return r;
}
/** Months of imports; imports 0 → +∞ cover is reported as a large finite number. */
export function reserveCover(reservesFdl: Money, importsMonth: Money): number {
  return importsMonth > 0n ? Number(divRoundHalfEven(reservesFdl * MICRO_N, importsMonth)) / 1e6 : 1e9;
}
