// T02-11: the G6 module contract, verbatim (PhaseCtx, ValidateCtx, IntentHandler, events, messages).
import type { ZodType } from 'zod';
import type { ParamsView } from '@tycoon/params';
import type { ContentView } from '@tycoon/content';
import type { CalendarInfo } from '../calendar';
import type { G6SealedIntent } from '../intake/types';
import type { Rng } from '../rng';
import type { Store } from '../store';
import type { Id, PhaseId, Tick, Visibility } from '../types';
import type { HoldApi, LedgerApi } from './ledger-port';

export interface Reject { code: string; params?: Record<string, string> }
export type SealedIntent<P = unknown> = G6SealedIntent<P>;
export interface EngineEvent { tick: Tick; seq: number; kind: string; subjectIds: Id[]; payload: unknown; visibility: Visibility; partyIds?: Id[] }
export interface PhaseMessage { fromEntity: Id; toEntity: Id; phase: PhaseId; tick: Tick; kind: string; body: unknown; canonicalKey: string }
export interface TickHeaderView { worldId: string; tick: Tick; engineVersion: string; paramsVersion: number; contentVersion: number; sealUtcMs: bigint; epoch: number; quarantine: readonly unknown[] }
/**
 * G6 PhaseCtx. 02 §3.6.2 obligations (enforced by T02-01's lint and the store, recorded here):
 * - a phase reads committed state and earlier phases' outputs of this tick only, and writes only its module's tables (OwnershipViolation);
 * - randomness only via ctx.rng(key) on the module's own registered streams; ids only via ctx.newId(kind);
 * - no clocks, Math.random, Date, I/O, async, Map/Set iteration order, locale formatting or float→money conversion outside toMoney/toQty/toPrice;
 * - money moves only through ctx.ledger templates, queued for P13; consequences for other modules land next tick (send 'NEXT' or events);
 * - never throw for control flow: report with ctx.fail.
 */
export interface PhaseCtx { readonly tick: Tick; readonly phase: PhaseId; readonly cal: CalendarInfo; readonly header: TickHeaderView; readonly module: string; readonly safeMode: boolean;
  readonly store: Store; rng(key: string): Rng; newId(kind: string): Id; readonly params: ParamsView; readonly content: ContentView;
  readonly ledger: LedgerApi; readonly holds: HoldApi;
  emit(kind: string, subjectIds: Id[], payload: unknown, visibility: Visibility, partyIds?: Id[]): void;
  send(toEntity: Id, kind: string, body: unknown, when: 'B1'|'B2'|'B3'|'NEXT'): void;
  inbox(kind?: string): readonly PhaseMessage[];
  delta(recipient: Id | `pub:${string}`, channel: string, ops: unknown[]): void;
  fail(invariantId: string, entityIds: Id[], observed: string, expected: string): void }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- G6 verbatim
export interface ValidateCtx extends Omit<PhaseCtx, 'emit'|'send'|'delta'> {}
export interface IntentHandler<P = unknown> { kind: string; schema: ZodType<P>; applyPhase: PhaseId; validate(ctx: ValidateCtx, i: SealedIntent<P>): Reject | null; apply(ctx: PhaseCtx, i: SealedIntent<P>): Reject | null }
export type { InvariantImpl, InvariantDef, InvariantCtx } from '../invariants';

/** Step 5 decision (02 §6, §3.5.1): NPC intents are sent as ctx.send(<handler module entity>, NPC_INTENT_KIND, {kind, payload, actorId}, 'B1');
 *  the pipeline (T02-12) runs them through the owning handler's validate + apply inline at P4, channel 'NPC',
 *  orderKey = orderKeyOf(entropy, intentId) with intentId = ctx.newId('int'). There is no private NPC API. */
export const NPC_INTENT_KIND = 'npc.intent';
