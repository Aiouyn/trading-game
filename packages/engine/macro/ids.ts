// T04-01: deterministic ids of 04 §2.1 (institutions authored per bloc, 00 §3.2; generated ids via 02's ctx.newId).
import type { Id } from '@tycoon/engine-core';
import type { PhaseCtx } from './core-port';
import type { BlocId, ReleaseKind } from './schema';

const BLOCS: readonly BlocId[] = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];
const PREFIXES = ['cbk_', 'gov_', 'exc_', 'reg_', 'crt_'] as const;

export const cbkId = (b: BlocId): Id => `cbk_${b}`;
export const govId = (b: BlocId): Id => `gov_${b}`;
export const excId = (b: BlocId): Id => `exc_${b}`;
export const regId = (b: BlocId): Id => `reg_${b}`;
export const crtId = (b: BlocId): Id => `crt_${b}`;
export const CSF_ID = 'npc_CSF' as const;
export const STAB_ID = 'sys_STAB' as const;
export const DEALER_POOL_ID = (b: BlocId): Id => `npc_PD_${b}`;

/** Bloc of one of the five per-bloc institutions (`cbk_|gov_|exc_|reg_|crt_` + bloc), else null. */
export function blocOfEntity(id: Id): BlocId | null {
  for (const p of PREFIXES) {
    if (id.startsWith(p)) {
      const rest = id.slice(p.length);
      for (const b of BLOCS) if (rest === b) return b;
      return null;
    }
  }
  return null;
}

/** ctx.newId('mrl') (Producer ruling on 04 §2.1 macro_rel: core id kinds are 2-5 letters); bloc and kind live in the release payload (02 owns the id format). */
export function releaseId(ctx: PhaseCtx, _b: BlocId, _k: ReleaseKind): Id { return ctx.newId('mrl'); }
export function meetingId(ctx: PhaseCtx): Id { return ctx.newId('mtg'); }
export function auctionId(ctx: PhaseCtx): Id { return ctx.newId('auc'); }
export function crisisId(ctx: PhaseCtx): Id { return ctx.newId('crs'); }
