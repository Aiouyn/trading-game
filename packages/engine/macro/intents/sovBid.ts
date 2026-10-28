// T04-11 sovereign bid intents (04 §4, §3.10.3): mkt.sov.bid, mkt.sov.bidCancel, and the P1 sweep of bids whose cash hold was released (edge 12).
import { MICRO_N, roundHalfEven, type Ccy, type IntentHandler, type PhaseCtx, type Qty, type Reject, type SealedIntent, type ValidateCtx } from '@tycoon/engine-core';
import { z } from 'zod';
import { blocOfEntity } from '../ids';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { macroTables, type AuctionBid, type BlocMacroState, type PrimaryDealerStatus, type SovAuction, type SovereignIssue } from '../schema';
import { auctionPrice, cashFor, NONCOMP_MAX_FACE } from '../rules/auction';

// Decision: as intents/facilities.ts, the handlers are constants and bind their ports once at init (T04-21); unbound = defaultMacroPorts().
let ports: MacroPorts = defaultMacroPorts();
export function bindSovBidPorts(p: MacroPorts): void { ports = p; }

const CLOSED: Reject = { code: 'SOV_AUCTION_CLOSED' }, LICENSE: Reject = { code: 'SOV_LICENSE' }, STEP: Reject = { code: 'SOV_FACE_STEP' };
const RANGE: Reject = { code: 'SOV_YIELD_RANGE' }, CAP: Reject = { code: 'SOV_CAP_EXCEEDED' }, HOLD: Reject = { code: 'SOV_HOLD_FAILED' }, CAPCON: Reject = { code: 'CAPCON_BLOCKED' };
const LIC_RANK = { LIC0: 0, LIC1: 1, LIC2: 2, LIC3: 3, LIC4: 4 } as const;
const HOLD_SPREAD = 0.005;   // hold priced at y − 50 bp
const B = macroTables.bid.name;
type Row = AuctionBid & { id: string };
const bidsOf = (s: ValidateCtx['store'], auctionId: string): Row[] => [...s.index<Row>(B, 'auctionId', auctionId)].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

type BidP = { auctionId: string; kind: 'COMPETITIVE' | 'NONCOMPETITIVE'; face: string; yieldBp?: number; accountId: string };
type Ok = { a: SovAuction; face: Qty; bp100?: number; hold: bigint; ccy: Ccy };

function check(ctx: ValidateCtx, i: SealedIntent<BidP>): Reject | Ok {
  const p = i.payload, s = ctx.store, a = s.get<SovAuction>(macroTables.auction.name, p.auctionId);
  if (!a || a.result || a.whenIssuedYield === null || ctx.tick < a.bidOpenTick || ctx.tick > a.auctionTick - 1) return CLOSED;
  const b = blocOfEntity(a.govId) ?? 'FDL', yWi = a.whenIssuedYield, pl = ports.players;
  if (pl.isHeld(s, i.actorId)) return LICENSE;
  const lic = LIC_RANK[pl.licenseOf(s, i.actorId) ?? 'LIC0'];
  if (p.kind === 'NONCOMPETITIVE' ? lic < 2 : !(lic >= 4 || pl.hasCharter(s, p.accountId, 'CH_BANK', b) || pl.hasCharter(s, p.accountId, 'CH_FUND', b)
    || s.get<PrimaryDealerStatus>(macroTables.dealer.name, `${b}:${p.accountId}`)?.status === 'ACTIVE')) return LICENSE;
  const units = BigInt(p.face);
  if (units % 1000n !== 0n || units < 10_000n) return STEP;
  const face = units * MICRO_N;
  let bp100: number | undefined;
  if (p.kind === 'COMPETITIVE') {
    const y = p.yieldBp;
    if (y === undefined || Math.abs(y * 10 - roundHalfEven(y * 10)) > 1e-6 || Math.abs(y - yWi * 1e4) > 200 + 1e-9) return RANGE;
    bp100 = roundHalfEven(y * 100);
  } else {
    const g = pl.ownerGroupOf(s, p.accountId);
    const had = bidsOf(s, a.id).filter((x) => x.kind === 'NONCOMPETITIVE' && pl.ownerGroupOf(s, x.bidderId) === g).reduce((t, x) => t + x.face, 0n);
    if (had + face > NONCOMP_MAX_FACE) return CAP;
  }
  const ccy = s.get<SovereignIssue & { id: string }>(macroTables.issue.name, a.assetId)?.ccy ?? b;
  const srl = s.get<BlocMacroState & { id: string }>(macroTables.bloc.name, 'SRL');
  if ((srl?.fx.capitalControls ?? 0) >= 2 && ccy !== 'SRL' && pl.reportingCcyOf?.(s, p.accountId) === 'SRL') return CAPCON;
  const yHold = (bp100 !== undefined ? bp100 / 1e6 : yWi) - HOLD_SPREAD;
  return { a, face, ...(bp100 !== undefined ? { bp100 } : {}), hold: cashFor(face, auctionPrice(s, ports, a, yHold, ctx.tick)), ccy };
}
const rej = (r: Reject | Ok): Reject | null => ('code' in r ? r : null);

/** Decision: holds are placed in apply (P6, after the re-check), as in intents/facilities.ts. */
export const sovBidIntent: IntentHandler<BidP> = {
  kind: 'mkt.sov.bid', applyPhase: 'P6',
  schema: z.strictObject({ auctionId: z.string().min(1), kind: z.enum(['COMPETITIVE', 'NONCOMPETITIVE']), face: z.string().regex(/^[1-9][0-9]*$/),
    yieldBp: z.number().finite().optional(), accountId: z.string().min(1) }),
  validate: (ctx, i) => rej(check(ctx, i)),
  apply: (ctx, i) => {
    const v = check(ctx, i);
    if ('code' in v) return v;
    const h = ctx.holds.placeCash(i.payload.accountId, v.ccy, v.hold, v.a.auctionTick + 1, i.intentId);
    if (typeof h !== 'string') return HOLD;
    const bidId = ctx.newId('bid');
    const row: Row = { id: bidId, bidId, auctionId: v.a.id, bidderId: i.payload.accountId, kind: i.payload.kind, ...(v.bp100 !== undefined ? { yieldBp: v.bp100 } : {}),
      face: v.face, cashHoldId: h, submittedTick: ctx.tick, primaryDealer: ctx.store.get<PrimaryDealerStatus>(macroTables.dealer.name, `${blocOfEntity(v.a.govId)}:${i.payload.accountId}`)?.status === 'ACTIVE' };
    ctx.store.put<Row>(B, row);
    ctx.emit('macro.sov.bid.accepted', [row.bidderId], { auctionId: row.auctionId, bidId, kind: row.kind, face: i.payload.face, ...(v.bp100 !== undefined ? { yieldBp: v.bp100 } : {}) },
      'PARTIES', [row.bidderId]);
    return null;
  },
};

type CancelP = { bidId: string };
/** Own bid (same owner group as the actor), tick ≤ auctionTick − 2; else SOV_AUCTION_CLOSED (Decision: unknown or foreign bids use the same code, so a sealed bid's existence never leaks). */
function checkCancel(ctx: ValidateCtx, i: SealedIntent<CancelP>): Reject | Row {
  const s = ctx.store, x = s.get<Row>(B, i.payload.bidId), a = x ? s.get<SovAuction>(macroTables.auction.name, x.auctionId) : undefined;
  if (!x || !a || ports.players.ownerGroupOf(s, x.bidderId) !== ports.players.ownerGroupOf(s, i.actorId) || ctx.tick > a.auctionTick - 2) return CLOSED;
  return x;
}
export const sovBidCancelIntent: IntentHandler<CancelP> = {
  kind: 'mkt.sov.bidCancel', applyPhase: 'P6', schema: z.strictObject({ bidId: z.string().min(1) }),
  validate: (ctx, i) => { const r = checkCancel(ctx, i); return 'code' in r ? r : null; },
  apply: (ctx, i) => {
    const r = checkCancel(ctx, i);
    if ('code' in r) return r;
    ctx.holds.release(r.cashHoldId);
    ctx.store.del(B, r.id);
    return null;
  },
};

/** P1 of the auction tick: a bid whose cash hold is no longer ACTIVE (released by 13, edge 12) is deleted before clearing. */
export function cancelHeldBidders(ctx: PhaseCtx, auctionId: string): void {
  for (const x of bidsOf(ctx.store, auctionId)) if (ctx.holds.get(x.cashHoldId)?.status !== 'ACTIVE') ctx.store.del(B, x.id);
}
