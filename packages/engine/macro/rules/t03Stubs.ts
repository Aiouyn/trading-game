// TEMPORARY FILE: typed stubs for the T03-08 / T03-13 exports T04-08 imports, which the ledger does not export yet
// (MISSING EXPORT: T03-08 putFact, accountsOfEntity, committedBalance; T03-13 effectiveMark). Signatures from the T04-08 card's
// Imports. Each throws until the export lands; tests vi.mock this module. Delete it when the ledger exports them.
import { EngineFault, type Ccy, type Id, type Money, type PhaseCtx, type Price, type StoreRead, type Tick } from '@tycoon/engine-core';

/** MISSING EXPORT: T03-08 putFact. */
export function putFact(_ctx: PhaseCtx, _kind: 'FACILITY_RATE_E6', _ccy: Ccy, _value: number): void {
  throw new EngineFault('I0.macro_stub', 'putFact: T03-08 export missing');
}
/** MISSING EXPORT: T03-08 accountsOfEntity (open accounts of one entity, sorted by key). */
export function accountsOfEntity(_read: StoreRead, _id: Id): readonly { key: string; code: number; ccy: Ccy; sub: string }[] {
  throw new EngineFault('I0.macro_stub', 'accountsOfEntity: T03-08 export missing');
}
/** MISSING EXPORT: T03-08 committedBalance (committed balance of one account key, 0n if absent). */
export function committedBalance(_read: StoreRead, _key: string): Money {
  throw new EngineFault('I0.macro_stub', 'committedBalance: T03-08 export missing');
}
/** MISSING EXPORT: T03-13 effectiveMark (null = no mark). */
export function effectiveMark(_read: StoreRead, _assetId: string, _tick: Tick): Price | null {
  throw new EngineFault('I0.macro_stub', 'effectiveMark: T03-13 export missing');
}
