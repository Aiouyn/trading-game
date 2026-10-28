// T04-12 mkt.sov.buybackOffer (04 §4, §3.10.7).
import { MICRO_N, type IntentHandler, type Price, type Qty, type Reject, type SealedIntent, type ValidateCtx } from '@tycoon/engine-core';
import { z } from 'zod';
import { macroTables, type Buyback, type BuybackOffer } from '../schema';
import { buybackOpen } from '../rules/buyback';
import { primaryPorts } from './primaryPorts';

const CLOSED: Reject = { code: 'SOV_AUCTION_CLOSED' }, STEP: Reject = { code: 'SOV_FACE_STEP' }, HOLD: Reject = { code: 'SOV_HOLD_FAILED' };
const BO = macroTables.buybackOffer.name;
type P = { buybackId: string; assetId: string; face: string; minPrice: string };
type Ok = { bb: Buyback; face: Qty; minPrice: Price };
/** "99.8" per 100 face → Price per unit (micro) exactly: per100 × 10,000. */
export const per100ToPrice = (s: string): Price => { const [a, f = ''] = s.split('.'); return BigInt(a!) * 10_000n + BigInt(f.padEnd(4, '0')); };

function check(ctx: ValidateCtx, i: SealedIntent<P>): Reject | Ok {
  const p = i.payload, st = ctx.store, bb = st.get<Buyback>(macroTables.buyback.name, p.buybackId);
  if (!buybackOpen(bb, ctx.tick) || !bb!.assetIds.includes(p.assetId)) return CLOSED;
  const units = BigInt(p.face);
  if (units % 1000n !== 0n || units < 10_000n) return STEP;
  const face = units * MICRO_N;
  if (ctx.ledger.availableQty(i.actorId, p.assetId) - (primaryPorts().credit?.pledgedQty(st, i.actorId, p.assetId) ?? 0n) < face) return HOLD;
  return { bb: bb!, face, minPrice: per100ToPrice(p.minPrice) };
}
/** Open buyback, listed asset, face step as auctions, availableQty − pledgedQty ≥ face (else SOV_HOLD_FAILED); qty hold placed in apply. */
export const buybackOfferIntent: IntentHandler<P> = {
  kind: 'mkt.sov.buybackOffer', applyPhase: 'P1',
  schema: z.strictObject({ buybackId: z.string().min(1), assetId: z.string().min(1), face: z.string().regex(/^[1-9][0-9]*$/), minPrice: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$/) }),
  validate: (ctx, i) => { const r = check(ctx, i); return 'code' in r ? r : null; },
  apply: (ctx, i) => {
    const v = check(ctx, i);
    if ('code' in v) return v;
    const h = ctx.holds.placeQty(i.actorId, i.payload.assetId, v.face, v.bb.tick + 1, i.intentId);
    if (typeof h !== 'string') return HOLD;
    const id = ctx.newId('bbo');
    ctx.store.put<BuybackOffer>(BO, { id, buybackId: v.bb.id, holderId: i.actorId, assetId: i.payload.assetId, face: v.face, minPrice: v.minPrice, holdId: h, tick: ctx.tick });
    return null;
  },
};
