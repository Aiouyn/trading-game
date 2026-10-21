import type { Ccy, Id, Money, Qty, Tick } from './money';
import type { TemplateId } from './catalog';

export type PhaseId = `P${number}`;
export type EntityKind =
  | 'sys' | 'cbk' | 'gov' | 'reg' | 'crt' | 'exc' | 'ccp' | 'rat' | 'bnk' | 'ins' | 'fnd' | 'spv' | 'cmp' | 'biz' | 'prop'
  | 'ali' | 'npc' | 'hh' | 'frm' | 'row' | 'chr';
export const ENTITY_KINDS: readonly EntityKind[] = [
  'sys', 'cbk', 'gov', 'reg', 'crt', 'exc', 'ccp', 'rat', 'bnk', 'ins', 'fnd', 'spv', 'cmp', 'biz', 'prop', 'ali', 'npc', 'hh', 'frm', 'row', 'chr',
];
export type Perimeter = 'PLAYER' | 'NPC' | 'ELASTIC' | 'SYSTEM';
export type PayAccountChoice = { kind: 'CASH' } | { kind: 'BANK'; bankId: Id };

export interface LedgerEntity {
  id: Id; kind: EntityKind; ownerId: Id | null; reportingCcy: Ccy;
  payFrom: PayAccountChoice; receiveInto: PayAccountChoice;
  status?: 'ACTIVE' | 'DISSOLVED';   // E-15.2: DISSOLVED entities take no posting except LED_DISSOLUTION
}

/** Spec §2.2 (T03-01) + Δ5 flowLeg. */
export interface Posting {
  tick: Tick; entryId: Id; postingSeq: number;
  debitAccount: string; creditAccount: string;
  amount: Money; ccy: Ccy; reason: string; refs: Id[];
  qty?: Qty; assetId?: Id; legOf?: { legId: string; side: 'A' | 'B' };
  flowLeg?: true;
}
export interface Entry {
  entryId: Id; tick: Tick; template: TemplateId; reason: string; postings: Posting[];
  requestedBy: { module: string; phase: PhaseId; entityId?: Id; intentId?: Id };
  holdId?: Id; headline?: { amount: Money; ccy: Ccy; counterpartyId?: Id };
  invalid?: { invariantId: string; observed: string; expected: string };
  /** Parties the template was called with; borrowerId for LEND/REPAY/CB_CREDIT(_UNWIND) (PR #3 review F1, X-4). */
  meta?: {
    parties: Id[]; borrowerId?: Id;
    escrow?: { op: 'PLACE'; row: ConflictEscrow } | { op: 'SETTLE'; escrowId: Id; toAttacker: Money; toVictim: Money };
    accrual?: { id: Id; accrued?: Money; settled?: Money };
    garnish?: { id: Id; amount: Money };
  };
}
export interface Hold {
  holdId: Id; owner: Id; kind: 'CASH' | 'QTY'; ccy?: Ccy; assetId?: Id; amount: bigint; remaining: bigint;
  parts: { accountKey: string; amount: bigint; remaining: bigint }[];
  expiresTick: Tick; ref: Id; placedTick: Tick; purposeCode?: string;
  status: 'ACTIVE' | 'SETTLED' | 'RELEASED';
}
export interface Reject { code: 'LED_INSUFFICIENT_FUNDS' | 'LED_INSUFFICIENT_QTY' | 'LED_RESTRICTED_FUNDS' | 'LED_BAD_EXPIRY' | 'LED_UNKNOWN_ENTITY' }
export function isReject(x: unknown): x is Reject {
  return typeof x === 'object' && x !== null && 'code' in x;
}

/** led.escrow row (spec §6.11 Δ14). */
export interface ConflictEscrow {
  escrowId: Id; victimId: Id; attackerId: Id; opId: Id; code: string; ccy: Ccy; amount: Money;
  placedTick: Tick; expiresTick: Tick; caseId: Id | null; status: 'HELD' | 'RELEASED' | 'CLAWED_BACK' | 'SPLIT';
}
/** Accrual registry row (errata E-14). a = receivable holder (payee), b = payer. */
export interface AccrualRow { accrualId: Id; kind: string; code: string; module: number; a: Id; b: Id; ccy: Ccy; payable: number; accrued: Money; settled: Money }
