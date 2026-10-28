// T04-13 mkt.sov.exchangeVote (04 §4, §3.12.2 step 4).
import type { IntentHandler, Reject, SealedIntent, ValidateCtx } from '@tycoon/engine-core';
import { z } from 'zod';
import { macroTables, type ExchangeOffer, type SovereignDefaultCase, type SovExchangeVote } from '../schema';

const CLOSED: Reject = { code: 'SOV_AUCTION_CLOSED' }, LICENSE: Reject = { code: 'SOV_LICENSE' };
type P = { offerId: string; vote: 'ACCEPT' | 'REJECT' };
type Snap = { id: string; offerId: string; holderId: string; assetId: string; face: bigint };

function check(ctx: ValidateCtx, i: SealedIntent<P>): Reject | Snap[] {
  let offer: ExchangeOffer | undefined;
  for (const c of ctx.store.iter<SovereignDefaultCase>(macroTables.defaultCase.name)) offer ??= c.offers.find((o) => o.id === i.payload.offerId);
  if (!offer || offer.status !== 'OPEN' || ctx.tick < offer.openTick || ctx.tick >= offer.closeTick) return CLOSED;
  const rows: Snap[] = [];
  for (const r of ctx.store.iter<Snap>(macroTables.voteSnapshot.name)) if (r.offerId === offer.id && r.holderId === i.actorId) rows.push(r);
  return rows.length > 0 ? rows : LICENSE;
}
/** Open offer before closeTick (else SOV_AUCTION_CLOSED); the actor holds snapshot rows (else SOV_LICENSE); votes all of them; a later vote replaces the rows. */
export const exchangeVoteIntent: IntentHandler<P> = {
  kind: 'mkt.sov.exchangeVote', applyPhase: 'P1',
  schema: z.strictObject({ offerId: z.string().min(1), vote: z.enum(['ACCEPT', 'REJECT']) }),
  validate: (ctx, i) => { const r = check(ctx, i); return 'code' in r ? r : null; },
  apply: (ctx, i) => {
    const r = check(ctx, i);
    if ('code' in r) return r;
    for (const x of r) ctx.store.put<SovExchangeVote>(macroTables.vote.name, { id: x.id, offerId: x.offerId, holderId: x.holderId, assetId: x.assetId, face: x.face, vote: i.payload.vote });
    return null;
  },
};
