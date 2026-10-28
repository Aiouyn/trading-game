// T04-12 bank.primaryDealer.apply / bank.primaryDealer.resign (04 §4, §3.10.5).
import { SortedMap, type IntentHandler, type Money, type Reject, type SealedIntent, type ValidateCtx } from '@tycoon/engine-core';
import { z } from 'zod';
import { macroTables, BLOC_ORDER, type BlocId, type BlocMacroState, type PrimaryDealerStatus } from '../schema';
import { dealerEligibility, quarterOf } from '../rules/dealers';
import { primaryPorts } from './primaryPorts';

const NOT_ELIGIBLE: Reject = { code: 'CBK_NOT_ELIGIBLE' }, T = macroTables.dealer.name;
const bloc = z.enum(BLOC_ORDER as [BlocId, ...BlocId[]]);
type ApplyP = { bloc: BlocId; bankId: string; nameInLeague?: boolean };
type ResignP = { bloc: BlocId; bankId: string };
const sameGroup = (ctx: ValidateCtx, a: string, b: string): boolean => primaryPorts().players.ownerGroupOf(ctx.store, a) === primaryPorts().players.ownerGroupOf(ctx.store, b);
/** Decision: an SWF entity's equity is ctx.ledger.netWorth (book NW, read as FDL) divided by fxSpot of the bloc (FDL per unit); FDL or no print → as is. */
function swfNetWorth(ctx: ValidateCtx, b: BlocId, id: string): Money {
  const nw = ctx.ledger.netWorth(id), spot = b === 'FDL' ? null : primaryPorts().markets.fxSpot(ctx.store, b);
  return spot !== null && spot > 0 ? (nw * 1_000_000n) / BigInt(Math.floor(spot * 1e6)) : nw;
}
function checkApply(ctx: ValidateCtx, i: SealedIntent<ApplyP>): Reject | null {
  const p = i.payload, debt = ctx.store.get<BlocMacroState & { id: BlocId }>(macroTables.bloc.name, p.bloc)?.fiscal.debt ?? 0n;
  if (!sameGroup(ctx, i.actorId, p.bankId)) return NOT_ELIGIBLE;
  const code = dealerEligibility(ctx.store, primaryPorts(), p.bloc, p.bankId, debt, swfNetWorth(ctx, p.bloc, p.bankId));
  return code === null ? null : { code };
}
/** APPLIED now; ACTIVE from the next game-quarter start (quarterEndDealerReview). */
export const primaryDealerApplyIntent: IntentHandler<ApplyP> = {
  kind: 'bank.primaryDealer.apply', applyPhase: 'P1',
  schema: z.strictObject({ bloc, bankId: z.string().min(1), nameInLeague: z.boolean().optional() }),
  validate: checkApply,
  apply: (ctx, i) => {
    const r = checkApply(ctx, i);
    if (r) return r;
    const p = i.payload;
    ctx.store.put<PrimaryDealerStatus>(T, { id: `${p.bloc}:${p.bankId}`, bloc: p.bloc, entityId: p.bankId, npc: false, status: 'APPLIED', fromQuarter: quarterOf(ctx.tick) + 1,
      revokedUntilQuarter: null, auctionsThisQuarter: 0, auctionsBidThisQuarter: 0, missesThisQuarter: 0, awardedFaceQuarter: new SortedMap(), nameInLeague: p.nameInLeague === true });
    return null;
  },
};
function checkResign(ctx: ValidateCtx, i: SealedIntent<ResignP>): Reject | PrimaryDealerStatus {
  const r = ctx.store.get<PrimaryDealerStatus>(T, `${i.payload.bloc}:${i.payload.bankId}`);
  return r && !r.npc && (r.status === 'ACTIVE' || r.status === 'APPLIED') && sameGroup(ctx, i.actorId, r.entityId) ? r : NOT_ELIGIBLE;
}
/** ACTIVE or APPLIED → RESIGNING (removed at the quarter review); anything else CBK_NOT_ELIGIBLE. */
export const primaryDealerResignIntent: IntentHandler<ResignP> = {
  kind: 'bank.primaryDealer.resign', applyPhase: 'P1',
  schema: z.strictObject({ bloc, bankId: z.string().min(1) }),
  validate: (ctx, i) => { const r = checkResign(ctx, i); return 'code' in r ? r : null; },
  apply: (ctx, i) => {
    const r = checkResign(ctx, i);
    if ('code' in r) return r;
    ctx.store.put<PrimaryDealerStatus>(T, { ...r, status: 'RESIGNING' });
    return null;
  },
};
