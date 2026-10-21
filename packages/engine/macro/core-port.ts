// TODO: DELETE when core exports TableDef/IndexDef, StoreRead, PhaseCtx — remove these copies in that same PR
// Types-only stand-ins for upstream names this card imports but that are not built yet in this repo (private helper of T04-01).
// Each is the binding signature from the pack, verbatim; no behaviour. Replace with the real exports when they land:
//   G6 / T02-09: TableDef, IndexDef, StoreRead (not yet exported by @tycoon/engine-core)
//   G6 / T02-xx: PhaseCtx (only newId is used by 04's id helpers)
//   T22A-??:     ContentView readers used by 04 (blocs, cities, blocEquityIndex, primaryDealers); field names are 04's (card Imports)
import type { Id } from '@tycoon/engine-core';
import type { BlocId } from './schema';

export interface IndexDef<T> { name: string; key(e: T): string | null }    // T02-09: null = not indexed
export interface TableDef<T> { name: string; module: string; idOf(e: T): Id; schema?: unknown; indexes?: IndexDef<T>[] }  // G6 + T02-09 indexes
export interface StoreRead {                                                 // G6
  get<T>(table: string, id: Id): T | undefined;
  iter<T>(table: string): Iterable<T>;
  range<T>(table: string, fromId: Id, toId: Id): Iterable<T>;
  index<T>(table: string, indexName: string, key: string): Iterable<T>;
  count(table: string): number;
}
/** The part of G6 PhaseCtx that 04's id helpers use. */
export interface PhaseCtx { newId(kind: string): Id }

/** T22A ContentView readers 04 references (TYPES only). */
export interface ContentBloc { id: BlocId; name: string; cityIds: [string, string, string]; statisticsOfficeNameKey: string; cycleCommitteeNameKey: string; sectorWeights: number[] }
export interface ContentCity { id: string; cityGdpShare: number; cycleBeta: number }
export interface ContentView {
  blocs(): readonly ContentBloc[];
  cities(): readonly ContentCity[];
  blocEquityIndex(bloc: BlocId): { peNorm0: number };
  primaryDealers(bloc: BlocId): readonly string[];   // 8 names
}
