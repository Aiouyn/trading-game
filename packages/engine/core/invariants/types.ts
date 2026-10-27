// T02-09 / E-70 (1): the T20A-01 invariant contract types, verbatim from the T20A-01 card (packages/engine/core/truth/types.ts in
// that card). Only the types are built here (InvariantImpl, TruthStoreRead, TruthWrite and the declarations they reference); the
// T20A-01 runtime (catalogue, registry, runner) is not. Replaces the deleted invariant-port.ts (E-70 option (b), no adapter).
export type InvariantScope = 'TICK' | 'PHASE' | 'DAY_CLOSE' | 'SNAPSHOT' | 'OFFLINE' | 'STATIC';
export type InvariantSeverity = 'FATAL' | 'QUARANTINE' | 'ALERT';
export type InvariantCostClass = 'O1' | 'O_TOUCHED' | 'O_ENTITIES' | 'O_LOG';
export interface InvariantDef {
  id: string; module: string; scope: InvariantScope; severity: InvariantSeverity;
  phase?: string; description: string; costClass: InvariantCostClass; sampling: 'NEVER'; sinceEngineVersion: string;
}
/** Structural read view; the engine's StoreRead (02) satisfies it. */
export interface TruthStoreRead {
  get<T>(table: string, id: string): T | undefined;
  iter<T>(table: string): Iterable<T>;
  count(table: string): number;
}
export interface TruthWrite { table: string; id: string; module: string; phase: string; kind: 'PUT' | 'DEL' }
export interface TruthEvent { tick: number; seq: number; kind: string; subjectIds: string[]; payload: unknown; visibility: 'PUBLIC'|'PARTIES'|'PRIVATE'|'SEALED' }
/** Engine-supplied named facts (rng ledger, id log, read stamps, deltas, telemetry, ledger suspense ...). Keys are owned by the supplier. */
export interface TruthFacts { get<T>(key: string): T | undefined }
export interface InvariantCtx<P = unknown> {
  readonly tick: number; readonly phase: string; readonly scope: InvariantScope;
  readonly partitionId: string; readonly safeMode: boolean;
  readonly pre: TruthStoreRead;              // committed state of tick - 1
  readonly post: TruthStoreRead;             // state with this tick's writes applied (not yet committed)
  readonly writeSet: readonly TruthWrite[];  // in write order
  readonly postings: readonly P[];           // postings queued for P13 (typed by 03 as its Posting)
  readonly events: readonly TruthEvent[];    // events of this tick so far
  readonly facts: TruthFacts;
  num(paramKey: string): number;             // parameter read (wired to ctx.params.num by the engine)
}
export type InvariantOutcome = { ok: true } | { ok: false; entityIds: string[]; observed: string; expected: string };
export interface InvariantImpl<P = unknown> { def: InvariantDef; check(ctx: InvariantCtx<P>): InvariantOutcome }
