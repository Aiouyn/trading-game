// T04-11 sovereign bid intents (04 §4) and edge 12.
import { afterEach, describe, expect, it } from 'vitest';
import { MICRO_N, type Id, type SealedIntent } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { macroTables, type AuctionBid, type SovAuction } from '../schema';
import { cbRow, cbWorld, type CbWorld } from '../testkit/cbWorld';
import { auctionPrice, cashFor, runAuction } from '../rules/auction';
import { bindSovBidPorts, cancelHeldBidders, sovBidCancelIntent, sovBidIntent } from './sovBid';

const D = 720, AT = 100 * D + 330, T = AT - 2 * D, F = (x: number) => BigInt(x) * MICRO_N;
const LIC: Record<string, 'LIC1' | 'LIC2' | 'LIC4'> = { usr_l1: 'LIC1', usr_l2: 'LIC2', usr_l4: 'LIC4', usr_g1: 'LIC2', usr_g2: 'LIC2', usr_srl: 'LIC4', usr_held: 'LIC4' };
function ports(): MacroPorts {
  const d = defaultMacroPorts();
  return { ...d, players: { ...d.players, licenseOf: (_s, e) => LIC[e] ?? null, hasCharter: (_s, e, c) => e === 'bnk_c' && c === 'CH_BANK', isHeld: (_s, e) => e === 'usr_held',
    ownerGroupOf: (_s, e) => (e.startsWith('usr_g') ? 'grp' : e), reportingCcyOf: (_s, e) => (e === 'usr_srl' ? 'SRL' : 'FDL') } };
}
afterEach(() => bindSovBidPorts(defaultMacroPorts()));
const A: SovAuction = { id: 'auc_FDL_N10Y_100', govId: 'gov_FDL', assetId: 'ast_SOV_FDL_N10Y_3740', tenor: 'N10Y', reopening: false, announceTick: 97 * D + 420, bidOpenTick: 97 * D + 420,
  auctionTick: AT, offeredFace: F(10_000_000_000), whenIssuedYield: 0.03, bids: [] };
function world(capcon = 0): CbWorld {
  bindSovBidPorts(ports());
  const w = cbWorld([cbRow('FDL')], T);
  w.put(macroTables.auction.name, A);
  w.put(macroTables.issue.name, { id: A.assetId, assetId: A.assetId, govId: A.govId, tenor: 'N10Y', ccy: 'FDL', couponRate: 0.03, issueTick: AT, maturityTick: AT + 3640 * D,
    faceOutstanding: 0n, inflationLinked: false, fxDenominated: false, cac: { threshold: 0.75, aggregated: true }, onTheRun: false } as never);
  w.put(macroTables.bloc.name, { id: 'SRL', bloc: 'SRL', fx: { capitalControls: capcon }, shocks: [], sovereign: { stressIndex: 0, failedAuctions21d: 0 } } as never);
  return w;
}
let k = 0;
type BidP = Parameters<typeof sovBidIntent.validate>[1]['payload'];
const si = <P>(payload: P, actorId: Id): SealedIntent<P> => ({ intentId: `int_${k++}`, actorId, payload, tick: T } as SealedIntent<P>);
const comp = (who: string, face: string, yieldBp: number): SealedIntent<BidP> => si({ auctionId: A.id, kind: 'COMPETITIVE' as const, face, yieldBp, accountId: who }, who);
const nc = (who: string, face: string): SealedIntent<BidP> => si({ auctionId: A.id, kind: 'NONCOMPETITIVE' as const, face, accountId: who }, who);
const v = (w: CbWorld, i: SealedIntent<BidP>) => sovBidIntent.validate(w.ctx, i);
const bids = (w: CbWorld) => w.rows(macroTables.bid.name) as (AuctionBid & { id: string })[];

describe('mkt.sov.bid', () => {
  it('rejects: CLOSED, LICENSE (held, LIC1 nc, LIC2 comp), FACE_STEP, YIELD_RANGE, CAP_EXCEEDED, CAPCON, HOLD_FAILED', () => {
    const w = world(2);
    expect(v(w, { ...comp('usr_l4', '10000', 300), payload: { ...comp('usr_l4', '10000', 300).payload, auctionId: 'nope' } })).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    w.setTick(AT); expect(v(w, comp('usr_l4', '10000', 300))).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    w.setTick(A.bidOpenTick - 1); expect(v(w, comp('usr_l4', '10000', 300))).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    w.setTick(AT - 1); expect(v(w, comp('usr_l4', '10000', 300))).toBeNull();
    w.setTick(T);
    expect(v(w, comp('usr_held', '10000', 300))).toEqual({ code: 'SOV_LICENSE' });
    expect(v(w, nc('usr_l1', '10000'))).toEqual({ code: 'SOV_LICENSE' });
    expect(v(w, nc('usr_l2', '10000'))).toBeNull();
    expect(v(w, comp('usr_l2', '10000', 300))).toEqual({ code: 'SOV_LICENSE' });
    expect(v(w, comp('bnk_c', '10000', 300))).toBeNull();
    w.put(macroTables.dealer.name, { id: 'FDL:usr_x', status: 'ACTIVE' } as never);
    expect(v(w, comp('usr_x', '10000', 300))).toBeNull();
    expect(v(w, comp('usr_l4', '15500', 300))).toEqual({ code: 'SOV_FACE_STEP' });
    expect(v(w, comp('usr_l4', '9000', 300))).toEqual({ code: 'SOV_FACE_STEP' });
    expect(v(w, comp('usr_l4', '10000', 501))).toEqual({ code: 'SOV_YIELD_RANGE' });
    expect(v(w, comp('usr_l4', '10000', 500))).toBeNull();
    expect(v(w, comp('usr_l4', '10000', 99))).toEqual({ code: 'SOV_YIELD_RANGE' });
    expect(v(w, comp('usr_l4', '10000', 300.05))).toEqual({ code: 'SOV_YIELD_RANGE' });
    expect(v(w, comp('usr_l4', '10000', 300.1))).toBeNull();
    expect(v(w, si({ auctionId: A.id, kind: 'COMPETITIVE' as const, face: '10000', accountId: 'usr_l4' }, 'usr_l4'))).toEqual({ code: 'SOV_YIELD_RANGE' });
    expect(v(w, nc('usr_g1', '10001000'))).toEqual({ code: 'SOV_CAP_EXCEEDED' });
    expect(sovBidIntent.apply(w.ctx, nc('usr_g1', '6000000'))).toBeNull();
    expect(v(w, nc('usr_g2', '4000000'))).toBeNull();
    expect(v(w, nc('usr_g2', '4001000'))).toEqual({ code: 'SOV_CAP_EXCEEDED' });
    expect(v(w, comp('usr_srl', '10000', 300))).toEqual({ code: 'CAPCON_BLOCKED' });
    w.failCash(true);
    expect(sovBidIntent.apply(w.ctx, comp('usr_l4', '10000', 300))).toEqual({ code: 'SOV_HOLD_FAILED' });
  });
  it('CAPCON needs SRL capital controls ≥ 2', () => {
    expect(v(world(1), comp('usr_srl', '10000', 300))).toBeNull();
  });
  it('accepted: hold at P(y − 50 bp) until auctionTick + 1, bid row (yield ×100), PARTIES event only', () => {
    const w = world(), i = comp('usr_l4', '1000000', 301.5);
    expect(sovBidIntent.apply(w.ctx, i)).toBeNull();
    const hold = cashFor(F(1_000_000), auctionPrice(w.ctx.store, ports(), A, 0.0301500 - 0.005, T));
    expect(w.holds).toEqual([{ id: 'hold_0', owner: 'usr_l4', amt: hold, expires: AT + 1, ref: i.intentId, open: true }]);
    expect(bids(w)).toEqual([expect.objectContaining({ auctionId: A.id, bidderId: 'usr_l4', kind: 'COMPETITIVE', yieldBp: 30150, face: F(1_000_000), cashHoldId: 'hold_0', submittedTick: T, primaryDealer: false })]);
    expect(w.events).toEqual([expect.objectContaining({ kind: 'macro.sov.bid.accepted', vis: 'PARTIES', partyIds: ['usr_l4'] })]);
    expect(w.events.filter((e) => e.vis === 'PUBLIC')).toEqual([]);
    const n = world(); sovBidIntent.apply(n.ctx, nc('usr_l2', '1000000'));
    expect(n.holds[0]!.amt).toBe(cashFor(F(1_000_000), auctionPrice(n.ctx.store, ports(), A, 0.025, T)));
    expect(bids(n)[0]!.yieldBp).toBeUndefined();
  });
});

describe('mkt.sov.bidCancel and edge 12', () => {
  it('cancel releases the hold and deletes the bid; not after auctionTick − 2; not someone else\'s bid', () => {
    const w = world();
    sovBidIntent.apply(w.ctx, comp('usr_l4', '1000000', 300));
    const bidId = bids(w)[0]!.bidId;
    expect(sovBidCancelIntent.validate(w.ctx, si({ bidId }, 'usr_l2'))).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    w.setTick(AT - 1);
    expect(sovBidCancelIntent.validate(w.ctx, si({ bidId }, 'usr_l4'))).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    w.setTick(AT - 2);
    expect(sovBidCancelIntent.apply(w.ctx, si({ bidId }, 'usr_l4'))).toBeNull();
    expect(w.holds[0]!.open).toBe(false);
    expect(bids(w)).toEqual([]);
  });
  it('edge 12: a hold released by 13 before the auction → the bid is dropped at P1 and the auction clears without it', () => {
    const w = world();
    sovBidIntent.apply(w.ctx, comp('usr_l4', '1000000', 290));
    sovBidIntent.apply(w.ctx, comp('bnk_c', '1000000', 290));
    w.ctx.holds.release('hold_0');
    w.setTick(AT);
    cancelHeldBidders(w.ctx, A.id);
    expect(bids(w).map((x) => x.bidderId)).toEqual(['bnk_c']);
    const r = runAuction(w.ctx, A, ports());
    expect(r.awards.map((x) => x.bidderId)).not.toContain('usr_l4');
    expect(r.awards.find((x) => x.bidderId === 'bnk_c')!.face).toBe(F(1_000_000));
  });
});
