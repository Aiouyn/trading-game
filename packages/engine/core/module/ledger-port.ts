// T02-11: G7 LedgerApi / HoldApi verbatim (types only; unit 03 implements them) and the LedgerProvider port through which 03 supplies
// ctx.ledger / ctx.holds. Without a provider the engine makes ctx.ledger / ctx.holds throw EngineFault('I0.no_ledger').
import type { Ccy, Id, Money, PhaseId, Tick } from '../types';
import type { StoreRead } from '../store';
import type { HoldApi, LedgerApi, Posting } from '@tycoon/engine-ledger';

// E-79 (AC-03-MAP-NO-DUP (a)): LedgerApi, HoldApi (src/world.ts), Hold, Posting (src/types.ts) and PostOpts (src/templates.ts) have one
// definition, in the ledger; T02-11 re-exports them and defines none of its own. `@tycoon/engine-ledger` is the E-81 package name
// (tsconfig path to ../ledger/src/index.ts); type-only, so nothing is imported at runtime.
export type { HoldApi, Hold, LedgerApi, Posting, PostOpts } from '@tycoon/engine-ledger';
export interface SuspenseReport { pairs: { from: string; to: string; ccy: Ccy; balance: Money }[] }   // sys:9900 balances (02 §3.14.2)
export interface PostingLeg { entryId: Id; legId: string; fromPartition: string; toPartition: string; body: unknown }   // body owned by 03
export interface LedgerPartition {                               // one per partition, created by the provider
  apiFor(module: string, phase: PhaseId, tick: Tick): { ledger: LedgerApi; holds: HoldApi };
  outgoingLegs(): PostingLeg[];                                  // produced in R3, exchanged at B3
  acceptLegs(legs: readonly PostingLeg[]): void;
  prepare(tick: Tick): { ok: boolean; failures: { invariantId: string; entityIds: Id[]; observed: string; expected: string }[]; suspense: SuspenseReport; postings: readonly Posting[] };
  commit(tick: Tick): void; rollback(tick: Tick): void;
  queryPostings(filter: { reason?: string; entityId?: Id; since?: Tick }): Posting[];
  balance(entityId: Id, code: number, ccy: Ccy, sub?: string): Money;
  snapshotRows(): { name: string; rows: unknown[] }[];          // included in snapshots
}
export interface LedgerProvider { createPartition(partitionId: string, store: unknown /* PartitionStore */): LedgerPartition;
  globalCheck(reports: readonly { partitionId: string; suspense: SuspenseReport }[]): { ok: boolean; failures: { invariantId: string; observed: string; expected: string }[] };  // COORD (I13, I3, I4, I8)
  testHooks?: { balance(read: StoreRead, entityId: Id, code: number, ccy: Ccy, sub?: string): Money;   // used by TestWorld.balance / .postings (T02-21)
    postings(read: StoreRead, filter?: { reason?: string; entityId?: Id; since?: Tick }): Posting[] } }
