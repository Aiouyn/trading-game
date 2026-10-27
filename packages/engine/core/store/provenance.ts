// T02-09 step 6 / E-70 (2): Money provenance hook for 03's INV-LED-012. The engine sets the active log per tick (single-threaded
// partition); notifyMoney is a no-op when none is active. T02-04's constructors are not edited: the wrappers below are the list.
import { toMoney as baseToMoney, toPrice as baseToPrice, toQty as baseToQty } from '../fixed';
import type { Ccy, Money, Price, Qty } from '../types';

export class MoneyProvenance {
  private log: { v: bigint; source: string }[] = [];
  begin(): void { this.log = []; }
  note(v: bigint, source: string): void { this.log.push({ v, source }); }
  has(v: bigint): boolean { return this.log.some((r) => r.v === v); }
  rows(): { v: bigint; source: string }[] { return this.log.map((r) => ({ ...r })); }
}
let active: MoneyProvenance | null = null;
export function setActiveProvenance(p: MoneyProvenance | null): void { active = p; }
export function notifyMoney(v: bigint, source: string): bigint { if (active) active.note(v, source); return v; }

/** E-70 (2) wrapper list, exactly these three: same result and faults as the T02-04 constructor, one notifyMoney per call. */
export const provenanceWrappers = {
  toMoney: (x: number, ccy: Ccy): Money => notifyMoney(baseToMoney(x, ccy), 'toMoney'),
  toQty: (x: number, lotScale: bigint, mode?: 'HALF_EVEN' | 'LOT_FLOOR'): Qty => notifyMoney(baseToQty(x, lotScale, mode), 'toQty'),
  toPrice: (x: number): Price => notifyMoney(baseToPrice(x), 'toPrice'),
} as const;
