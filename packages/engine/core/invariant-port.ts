// SPEC GAP: InvariantImpl / InvariantDef / InvariantCtx are owned by T20A-01 (not built). Minimal local port with the
// G6 InvariantImpl shape; the ctx members are the ones INV-ENG-003 needs (T02-07 step 2). Replace with the T20A-01 import.
import type { Id } from './types';

export interface InvariantDef { id: string; scope: 'TICK' | 'OFFLINE'; severity: 'FATAL' | 'ERROR' | 'WARN'; module: string }
export interface InvariantCtx {
  readonly tick: number;
  readonly worldSeedPublicSalt: Uint8Array;
  facts(key: string): readonly unknown[];
  readonly pre: { get(table: string, id: Id): unknown };
}
export type InvariantResult = { ok: true } | { ok: false; entityIds: Id[]; observed: string; expected: string };
export interface InvariantImpl { def: InvariantDef; check(ctx: InvariantCtx): InvariantResult }
