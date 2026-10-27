// T04-01: deterministic ids of 04 §2.1 (institutions authored per bloc, 00 §3.2; generated ids via 02's ctx.newId).
import type { Id } from '@tycoon/engine-core';
import type { PhaseCtx } from './core-port';
import type { BlocId, ReleaseKind } from './schema';
// cbkId and govId live once, in the ledger (E-81 (i), AC-04-01-IDS-FROM-LEDGER); macro callers import them from there, not from here.
import { cbkId, govId } from '@tycoon/engine-ledger';

const BLOCS: readonly BlocId[] = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];

export const excId = (b: BlocId): Id => `exc_${b}`;
export const regId = (b: BlocId): Id => `reg_${b}`;
export const crtId = (b: BlocId): Id => `crt_${b}`;
export const CSF_ID = 'npc_CSF' as const;
export const STAB_ID = 'sys_STAB' as const;
export const DEALER_POOL_ID = (b: BlocId): Id => `npc_PD_${b}`;

/** The five per-bloc institution ids (cbk_ and gov_ from the ledger, E-81 (i)). */
const INSTITUTION_IDS: readonly ((b: BlocId) => Id)[] = [cbkId, govId, excId, regId, crtId];

/** Bloc of one of the five per-bloc institutions (`cbk_|gov_|exc_|reg_|crt_` + bloc), else null. */
export function blocOfEntity(id: Id): BlocId | null {
  for (const f of INSTITUTION_IDS) for (const b of BLOCS) if (f(b) === id) return b;
  return null;
}

/** ctx.newId('mrl') (Producer ruling on 04 §2.1 macro_rel: core id kinds are 2-5 letters); bloc and kind live in the release payload (02 owns the id format). */
export function releaseId(ctx: PhaseCtx, _b: BlocId, _k: ReleaseKind): Id { return ctx.newId('mrl'); }
export function meetingId(ctx: PhaseCtx): Id { return ctx.newId('mtg'); }
export function auctionId(ctx: PhaseCtx): Id { return ctx.newId('auc'); }
export function crisisId(ctx: PhaseCtx): Id { return ctx.newId('crs'); }
