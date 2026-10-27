// T02-11: the LedgerProvider port through which 03 supplies ctx.ledger / ctx.holds (the G7 LedgerApi / HoldApi, typed by 03; see below)
// Without a provider the engine makes ctx.ledger / ctx.holds throw EngineFault('I0.no_ledger').
import type { Ccy, Id, Money, PhaseId, Tick } from '../types';
import type { StoreRead } from '../store';

// E-79 (AC-03-MAP-NO-DUP (a)): LedgerApi, HoldApi (src/world.ts), Hold, Posting (src/types.ts) and PostOpts (src/templates.ts) have one
// definition, in the ledger. E-81 (i): the dependency is one-way (the ledger may import core; core never imports the ledger, not even
// a type), so core does not name them. The ledger plugs them in by augmenting LedgerPortTypes (ledger/src/port.ts); core reads them
// as LedgerPort<'ledger' | 'holds' | 'posting'>. In a program without the ledger (core's own CI job) they are `unknown`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging from the ledger
export interface LedgerPortTypes {}
export type LedgerPort<K extends 'ledger' | 'holds' | 'posting'> = K extends keyof LedgerPortTypes ? LedgerPortTypes[K] : unknown;
export interface SuspenseReport { pairs: { from: string; to: string; ccy: Ccy; balance: Money }[] }   // sys:9900 balances (02 §3.14.2)
export interface PostingLeg { entryId: Id; legId: string; fromPartition: string; toPartition: string; body: unknown }   // body owned by 03
export interface LedgerPartition {                               // one per partition, created by the provider
  apiFor(module: string, phase: PhaseId, tick: Tick): { ledger: LedgerPort<'ledger'>; holds: LedgerPort<'holds'> };
  outgoingLegs(): PostingLeg[];                                  // produced in R3, exchanged at B3
  acceptLegs(legs: readonly PostingLeg[]): void;
  prepare(tick: Tick): { ok: boolean; failures: { invariantId: string; entityIds: Id[]; observed: string; expected: string }[]; suspense: SuspenseReport; postings: readonly LedgerPort<'posting'>[] };
  commit(tick: Tick): void; rollback(tick: Tick): void;
  queryPostings(filter: { reason?: string; entityId?: Id; since?: Tick }): LedgerPort<'posting'>[];
  balance(entityId: Id, code: number, ccy: Ccy, sub?: string): Money;
  snapshotRows(): { name: string; rows: unknown[] }[];          // included in snapshots
}
export interface LedgerProvider { createPartition(partitionId: string, store: unknown /* PartitionStore */): LedgerPartition;
  globalCheck(reports: readonly { partitionId: string; suspense: SuspenseReport }[]): { ok: boolean; failures: { invariantId: string; observed: string; expected: string }[] };  // COORD (I13, I3, I4, I8)
  testHooks?: { balance(read: StoreRead, entityId: Id, code: number, ccy: Ccy, sub?: string): Money;   // used by TestWorld.balance / .postings (T02-21)
    postings(read: StoreRead, filter?: { reason?: string; entityId?: Id; since?: Tick }): LedgerPort<'posting'>[] } }
