// T04-04 typed stubs for the two 03 exports it imports (E-88 (5)). T03-11 and T03-24 are not merged on main, so T04-04 takes them through
// these stubs with E-88's signatures and does not re-implement them. Delete this file when ledger exports `computeNa` (T03-11,
// ledger/money/aggregates.ts) and `buildDailyReport` (T03-24, ledger/stabilizer/report.ts); callers then import from @tycoon/engine-ledger.
import { EngineFault, type Money, type StoreRead, type Tick } from '@tycoon/engine-core';
import type { MoneySupplyReport } from '@tycoon/engine-ledger';

/** MISSING EXPORT: T03-24 ControllerStep. Opaque until T03-24 lands; nothing in 04 reads its fields. */
export interface ControllerStep { readonly __missingExport: 'T03-24 ControllerStep' }
/** MISSING EXPORT: T03-24 StabSampleMsg. Opaque until T03-24 lands; nothing in 04 reads its fields. */
export interface StabSampleMsg { readonly __missingExport: 'T03-24 StabSampleMsg' }

/** E-88 (5) signature of T03-11 `computeNa` (03 §3.5.3 N_a, a dimensionless weighted count). Throws until T03-11 is merged. */
export function computeNa(_read: StoreRead, _tick: Tick): number {
  throw new EngineFault('I0.macro_stub', 'computeNa: T03-11 is not merged');
}

/** E-88 (5) signature of T03-24 `buildDailyReport`. Throws until T03-24 is merged. */
export function buildDailyReport(_read: StoreRead, _step: ControllerStep | undefined, _samples: readonly StabSampleMsg[]): MoneySupplyReport {
  throw new EngineFault('I0.macro_stub', 'buildDailyReport: T03-24 is not merged');
}

const MONEY_STRING = /^-?[0-9]+$/;   // the ledger money schema (events.ts)
/** E-88 (5), AC-04-04-PEW-BIGINT: report.pew (decimal string, micro-units) → Money with BigInt, never through Number. */
export function pewFromReport(report: Pick<MoneySupplyReport, 'pew'>): Money {
  if (!MONEY_STRING.test(report.pew)) throw new EngineFault('I0.macro_pew', `pew is not a decimal integer string: ${report.pew}`);
  return BigInt(report.pew);
}
