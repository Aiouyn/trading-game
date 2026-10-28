// T04-19 typed stubs for the 03 Stabilizer and money sources it reads. MISSING EXPORT: T03-24 `led.stab`, `led.msi`, `msiValue`, `leverValue`,
// `LEVER_SPEC`; T03-11 `flowDayTable`. Shapes are the T03-24 / T03-11 card exports; the readers read those tables and nothing else.
// Delete this file when T03-11 and T03-24 land; callers then import from @tycoon/engine-ledger.
import { EngineFault, type StoreRead } from '@tycoon/engine-core';
import type { Levers } from '@tycoon/engine-ledger';

export type { Levers };   // AC-03-MAP-NO-DUP: the one definition is ledger/src/events.ts (E-81 (ii))
/** LEVER_SPEC key order (T03-24); the spec values themselves are 03's and are not read by 04. */
export const LEVER_KEYS: readonly (keyof Levers)[] = Object.freeze(['L1_demand', 'L2_lifestyle_price', 'L3_levy_bp', 'L4_upkeep']);
export interface LedStabilizerState { id: 'world'; mode: 'OBSERVE' | 'ACTIVE'; integral: number; lastError: number; levers: Levers;
  history: { dayIndex: number; e: number; u: number; levers: Levers }[]; absEOver05Days: number; rhoOutOfBandDays: number; launchDay: number }
export interface MsiState { id: 'world'; dayIndex: number; raw: number; ema: number; emaBaseSum: number; emaBaseN: number; emaBase?: number; msi: number }
export interface FlowDay { id: string /* `${ccy}:${dayIndex}` */; ccy: string; dayIndex: number; byClass: Record<string, string>; M0: string; M2: string }
export const LED_STAB = 'led.stab', LED_MSI = 'led.msi', LED_FLOWDAY = 'led.flowday';

export function ledStab(read: StoreRead): LedStabilizerState | null { return read.get<LedStabilizerState>(LED_STAB, 'world') ?? null; }
/** T03-24 msiValue stub: the published MSI of `led.msi`. Throws when 03 has written no MSI row. */
export function msiValue(read: StoreRead): number {
  const m = read.get<MsiState>(LED_MSI, 'world');
  if (!m) throw new EngineFault('I0.macro_stub', 'msiValue: led.msi missing (T03-24 not merged)');
  return m.msi;
}
/** T03-24 leverValue stub: the lever as 03 holds it on `led.stab`. Throws when 03 has written no Stabilizer row. */
export function leverValue(read: StoreRead, lever: keyof Levers): number {
  const s = ledStab(read);
  if (!s) throw new EngineFault('I0.macro_stub', 'leverValue: led.stab missing (T03-24 not merged)');
  return s.levers[lever];
}
export function flowDay(read: StoreRead, ccy: string, dayIndex: number): FlowDay | null { return read.get<FlowDay>(LED_FLOWDAY, `${ccy}:${dayIndex}`) ?? null; }
