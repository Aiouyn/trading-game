// T04-12 mkt.sov.syndicationOrder (04 §4, §3.10.6).
import { MICRO_N, type Ccy, type IntentHandler, type Qty, type Reject, type SealedIntent, type ValidateCtx } from '@tycoon/engine-core';
import { z } from 'zod';
import { blocOfEntity } from '../ids';
import { macroTables, type BlocId, type PrimaryDealerStatus, type Syndication, type SyndicationOrder } from '../schema';
import { cashFor } from '../rules/auction';
import { newLineCoupon } from '../rules/issuance';
import { syndicationPrice } from '../rules/syndication';
import { primaryPorts } from './primaryPorts';

const CLOSED: Reject = { code: 'SOV_AUCTION_CLOSED' }, LICENSE: Reject = { code: 'SOV_LICENSE' }, STEP: Reject = { code: 'SOV_FACE_STEP' };
const CAP: Reject = { code: 'SOV_CAP_EXCEEDED' }, HOLD: Reject = { code: 'SOV_HOLD_FAILED' };
const LIC_RANK = { LIC0: 0, LIC1: 1, LIC2: 2, LIC3: 3, LIC4: 4 } as const;
const GROUP_CAP_BP = 3500n, HOLD_SPREAD = 0.005, SO = macroTables.syndicationOrder.name;
type P = { syndicationId: string; face: string; limitSpreadBp?: number };
type Ok = { s: Syndication; face: Qty; hold: bigint; ccy: Ccy };

function check(ctx: ValidateCtx, i: SealedIntent<P>): Reject | Ok {
  const st = ctx.store, p = i.payload, s = st.get<Syndication>(macroTables.syndication.name, p.syndicationId), ports = primaryPorts(), pl = ports.players;
  if (!s || s.pricedTick !== undefined || ctx.tick < s.bookOpenTick || ctx.tick >= s.pricingTick) return CLOSED;
  const b = (blocOfEntity(s.govId) ?? 'FDL') as BlocId, me = i.actorId;
  if (pl.isHeld(st, me)) return LICENSE;
  if (!(LIC_RANK[pl.licenseOf(st, me) ?? 'LIC0'] >= 4 || pl.hasCharter(st, me, 'CH_BANK', b) || pl.hasCharter(st, me, 'CH_FUND', b)
    || st.get<PrimaryDealerStatus>(macroTables.dealer.name, `${b}:${me}`)?.status === 'ACTIVE')) return LICENSE;
  const units = BigInt(p.face);
  if (units % 1000n !== 0n || units < 10_000n) return STEP;
  const face = units * MICRO_N, g = pl.ownerGroupOf(st, me);
  const had = [...st.iter<SyndicationOrder>(SO)].filter((o) => o.syndicationId === s.id && pl.ownerGroupOf(st, o.bidderId) === g).reduce((t, o) => t + o.face, 0n);
  if ((had + face) * 10_000n > s.size * GROUP_CAP_BP) return CAP;
  const yG = (s.curveYield ?? 0) + s.guidanceSpreadBp / 1e4;
  return { s, face, hold: cashFor(face, syndicationPrice(st, ports, s, newLineCoupon(yG), yG - HOLD_SPREAD, ctx.tick)), ccy: s.tenor === 'N10Y_FDL' ? 'FDL' : b };
}
/** Book open (bookOpenTick ≤ tick < pricingTick); competitive eligibility of T04-11; face step as auctions; 35% owner-group cap of size;
 *  cash hold at the price of (guidance − 50 bp), placed in apply. Decision: the order is the actor's own (no accountId field in the payload). */
export const syndicationOrderIntent: IntentHandler<P> = {
  kind: 'mkt.sov.syndicationOrder', applyPhase: 'P1',
  schema: z.strictObject({ syndicationId: z.string().min(1), face: z.string().regex(/^[1-9][0-9]*$/), limitSpreadBp: z.number().int().optional() }),
  validate: (ctx, i) => { const r = check(ctx, i); return 'code' in r ? r : null; },
  apply: (ctx, i) => {
    const v = check(ctx, i);
    if ('code' in v) return v;
    const h = ctx.holds.placeCash(i.actorId, v.ccy, v.hold, v.s.pricingTick + 1, i.intentId);
    if (typeof h !== 'string') return HOLD;
    const id = ctx.newId('syo');
    ctx.store.put<SyndicationOrder>(SO, { id, syndicationId: v.s.id, bidderId: i.actorId, face: v.face, limitSpreadBp: i.payload.limitSpreadBp ?? null, holdId: h, tick: ctx.tick });
    return null;
  },
};
