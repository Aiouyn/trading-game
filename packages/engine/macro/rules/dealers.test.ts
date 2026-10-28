// T04-12 primary dealer tests (04 §3.10.5).
import { MICRO_N, SortedMap, type Id, type Qty } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { DEALER_POOL_ID } from '../ids';
import type { MacroPorts } from '../ports';
import { macroTables, type AuctionBid, type PrimaryDealerStatus } from '../schema';
import { cbRow, cbWorld, M, stubPorts, type CbWorld } from '../testkit/cbWorld';
import { primaryDealerApplyIntent, primaryDealerResignIntent } from '../intents/dealer';
import { bindPrimaryPorts } from '../intents/primaryPorts';
import { putBloc } from '../testkit/fiscalWorld';
import { activeDealers, dealerCount, dealerEligibility, dealerShares, isQualifyingBid, leagueTable, npcDealerKey, obligationMinFace, quarterEndDealerReview, quarterOf, recordDealerAuction } from './dealers';

const D = 720, Q = 91 * D, F = (x: number): Qty => BigInt(x) * MICRO_N, T = macroTables.dealer.name;
const DEBT = M(1e12);
function ports(o: { bank?: Id[]; swf?: Id[]; equity?: Record<string, bigint>; lowRep?: Id[] } = {}): MacroPorts {
  const p = stubPorts();
  return { ...p, players: { ...p.players, hasCharter: (_s, e, ch) => ch === 'CH_BANK' && (o.bank ?? []).includes(e), swfPrivilege: (_s, e) => (o.swf ?? []).includes(e),
    reputationLowestBand: (_s, e) => (o.lowRep ?? []).includes(e) }, credit: { ...p.credit!, bankEquity: (_s, e) => o.equity?.[e] ?? null } };
}
const row = (e: Id, o: Partial<PrimaryDealerStatus> = {}): PrimaryDealerStatus => ({ id: `FDL:${e}`, bloc: 'FDL', entityId: e, npc: false, status: 'ACTIVE', fromQuarter: 0,
  revokedUntilQuarter: null, auctionsThisQuarter: 0, auctionsBidThisQuarter: 0, missesThisQuarter: 0, awardedFaceQuarter: new SortedMap(), ...o });
const bid = (who: Id, face: number, bp?: number): AuctionBid => ({ bidId: `bid_${who}_${face}`, auctionId: 'a', bidderId: who, kind: bp === undefined ? 'NONCOMPETITIVE' : 'COMPETITIVE',
  ...(bp !== undefined ? { yieldBp: bp } : {}), face: F(face), cashHoldId: '', submittedTick: 0, primaryDealer: true });
const world = (tick = 10 * Q + 5 * D): CbWorld => { const w = cbWorld([cbRow('FDL')], tick); putBloc(w, 'FDL', { fiscal: { debt: DEBT } as never }); return w; };
const get = (w: CbWorld, e: Id): PrimaryDealerStatus | undefined => w.rows(T).find((r) => (r as PrimaryDealerStatus).entityId === e) as PrimaryDealerStatus | undefined;

describe('eligibility', () => {
  const p = ports({ bank: ['bnk_a', 'bnk_r', 'bnk_low'], swf: ['swf_x'], equity: { bnk_a: M(5e8), bnk_low: M(4e8), bnk_r: M(1e9) }, lowRep: ['bnk_r'] });
  it('equity ≥ 0.0005 × debt passes; no charter, 0.0004 × debt, lowest reputation band and a live ban are CBK_NOT_ELIGIBLE', () => {
    const w = world();
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'bnk_a', DEBT)).toBeNull();
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'usr_x', DEBT)).toBe('CBK_NOT_ELIGIBLE');
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'bnk_low', DEBT)).toBe('CBK_NOT_ELIGIBLE');
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'bnk_r', DEBT)).toBe('CBK_NOT_ELIGIBLE');
    w.put(T, row('bnk_a', { status: 'REVOKED', revokedUntilQuarter: 12 }));
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'bnk_a', DEBT)).toBe('CBK_NOT_ELIGIBLE');
  });
  it('an SWF qualifies on its net worth; without it, it does not', () => {
    const w = world();
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'swf_x', DEBT, M(5e8))).toBeNull();
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'swf_x', DEBT, M(4.99e8))).toBe('CBK_NOT_ELIGIBLE');
    expect(dealerEligibility(w.ctx.store, p, 'FDL', 'swf_x', DEBT)).toBe('CBK_NOT_ELIGIBLE');
  });
  it('apply intent: APPLIED, ACTIVE exactly at the next quarter start; resign → removed at the review; foreign bank rejected', () => {
    bindPrimaryPorts(p);
    const w = world(), si = (pl: unknown, a = 'bnk_a') => ({ intentId: 'i1', actorId: a, payload: pl, tick: w.ctx.tick } as never);
    expect(primaryDealerApplyIntent.validate(w.ctx, si({ bloc: 'FDL', bankId: 'bnk_a' }, 'usr_other'))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(primaryDealerApplyIntent.apply(w.ctx, si({ bloc: 'FDL', bankId: 'bnk_a', nameInLeague: true }))).toBeNull();
    expect(get(w, 'bnk_a')).toMatchObject({ status: 'APPLIED', fromQuarter: 11, nameInLeague: true });
    expect(primaryDealerApplyIntent.validate(w.ctx, si({ bloc: 'FDL', bankId: 'bnk_a' }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    w.setTick(11 * Q - 1); quarterEndDealerReview(w.ctx, 'FDL');
    expect(get(w, 'bnk_a')!.status).toBe('APPLIED');
    w.setTick(11 * Q); quarterEndDealerReview(w.ctx, 'FDL');
    expect(get(w, 'bnk_a')).toMatchObject({ status: 'ACTIVE', fromQuarter: 11 });
    expect(primaryDealerResignIntent.validate(w.ctx, si({ bloc: 'FDL', bankId: 'bnk_a' }, 'usr_other'))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    expect(primaryDealerResignIntent.apply(w.ctx, si({ bloc: 'FDL', bankId: 'bnk_a' }))).toBeNull();
    expect(get(w, 'bnk_a')!.status).toBe('RESIGNING');
    expect(primaryDealerResignIntent.validate(w.ctx, si({ bloc: 'FDL', bankId: 'bnk_a' }))).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    w.setTick(12 * Q); quarterEndDealerReview(w.ctx, 'FDL');
    expect(get(w, 'bnk_a')).toBeUndefined();
  });
  it('SWF apply converts net worth to the bloc currency at spot', () => {
    const q = ports({ swf: ['swf_x'] });
    bindPrimaryPorts({ ...q, markets: { ...q.markets, fxSpot: () => 2 } });
    const w = cbWorld([cbRow('SRL')], 0); putBloc(w, 'SRL', { fiscal: { debt: DEBT } as never });
    w.cash['swf_x:FDL'] = M(8e8);   // = 4e8 SRL < 5e8 (as FDL it would pass)
    const si = { intentId: 'i', actorId: 'swf_x', payload: { bloc: 'SRL', bankId: 'swf_x' }, tick: 0 } as never;
    expect(primaryDealerApplyIntent.validate(w.ctx, si)).toEqual({ code: 'CBK_NOT_ELIGIBLE' });
    w.cash['swf_x:FDL'] = M(1e9);
    expect(primaryDealerApplyIntent.validate(w.ctx, si)).toBeNull();
  });
});

describe('obligations and review', () => {
  it('obligationMinFace(10e9, 10) = 500e6, floored to 1,000', () => {
    expect(obligationMinFace(F(10_000_000_000), 10)).toBe(F(500_000_000));
    expect(obligationMinFace(F(10_000_999), 10)).toBe(F(500_000));
  });
  it('a bid at y_WI + 5 bp qualifies, + 5.1 bp does not; noncompetitive and small bids do not', () => {
    const off = F(10_000_000_000);
    expect(isQualifyingBid(bid('b', 500_000_000, 30_500), off, 10, 0.03)).toBe(true);
    expect(isQualifyingBid(bid('b', 500_000_000, 30_510), off, 10, 0.03)).toBe(false);
    expect(isQualifyingBid(bid('b', 499_999_000, 30_000), off, 10, 0.03)).toBe(false);
    expect(isQualifyingBid(bid('b', 900_000_000), off, 10, 0.03)).toBe(false);
  });
  it('dealerCount with 2 active players = 10 (applied, revoked and NPC rows do not count)', () => {
    const w = world();
    for (const r of [row('bnk_b'), row('bnk_a'), row('bnk_c', { status: 'APPLIED' }), row('bnk_d', { status: 'REVOKED' }), row(DEALER_POOL_ID('FDL'), { npc: true })]) w.put(T, r);
    expect(dealerCount(w.ctx.store, 'FDL')).toBe(10);
    expect(activeDealers(w.ctx.store, 'FDL').map((r) => r.entityId)).toEqual(['bnk_a', 'bnk_b']);
  });
  it('three misses → REVOKED until the start of the quarter after next; two misses stay ACTIVE; the ban lifts then', () => {
    const w = world(10 * Q + 3 * D), off = F(10_000_000_000);
    w.put(T, row('bnk_a')); w.put(T, row('bnk_b'));
    for (let k = 0; k < 3; k++) recordDealerAuction(w.ctx, 'FDL', off, 0.03, [bid('bnk_b', 2_000_000_000, 30_000), ...(k === 0 ? [bid('bnk_a', 2_000_000_000, 30_000)] : [])],
      [{ bidderId: 'bnk_b', face: F(1_000_000_000) }, { bidderId: DEALER_POOL_ID('FDL'), face: F(8_000_000_000) }]);
    expect(get(w, 'bnk_a')).toMatchObject({ auctionsThisQuarter: 3, auctionsBidThisQuarter: 1, missesThisQuarter: 2 });
    recordDealerAuction(w.ctx, 'FDL', off, 0.03, [], []);
    expect(get(w, 'bnk_b')).toMatchObject({ auctionsThisQuarter: 4, auctionsBidThisQuarter: 3, missesThisQuarter: 1 });
    expect(get(w, 'bnk_b')!.awardedFaceQuarter.get('000010')).toBe(F(3_000_000_000).toString());
    expect(get(w, DEALER_POOL_ID('FDL'))).toMatchObject({ npc: true, status: 'ACTIVE' });
    expect(get(w, DEALER_POOL_ID('FDL'))!.awardedFaceQuarter.get('000010')).toBe(F(24_000_000_000).toString());
    w.setTick(11 * Q); quarterEndDealerReview(w.ctx, 'FDL');
    expect(get(w, 'bnk_a')).toMatchObject({ status: 'REVOKED', revokedUntilQuarter: 12, missesThisQuarter: 0 });
    expect(get(w, 'bnk_b')).toMatchObject({ status: 'ACTIVE', missesThisQuarter: 0, auctionsThisQuarter: 0, auctionsBidThisQuarter: 0 });
    expect(get(w, DEALER_POOL_ID('FDL'))!.npc).toBe(true);
    w.setTick(12 * Q - 1); quarterEndDealerReview(w.ctx, 'FDL');
    expect(get(w, 'bnk_a')!.status).toBe('REVOKED');
    w.setTick(12 * Q); quarterEndDealerReview(w.ctx, 'FDL');
    expect(get(w, 'bnk_a')).toBeUndefined();
    expect(quarterOf(12 * Q - 1)).toBe(11);
  });
  it('exactly three misses revoke (≥ 3)', () => {
    const w = world(); w.put(T, row('bnk_a', { missesThisQuarter: 3 }));
    w.setTick(11 * Q); quarterEndDealerReview(w.ctx, 'FDL');
    expect(get(w, 'bnk_a')!.status).toBe('REVOKED');
  });
});

describe('shares and league table', () => {
  const fq = (m: Record<string, number>): SortedMap<string, string> => new SortedMap(Object.entries(m).map(([k, v]) => [k, F(v).toString()] as const));
  it('NPC pool splits into 8 equal dealers; a non-opted player is unnamed, an opted one named; ranks by share', () => {
    const w = world();
    w.put(T, row(DEALER_POOL_ID('FDL'), { npc: true, awardedFaceQuarter: fq({ '000009': 999, '000010': 5_000 }) }));
    w.put(T, row('bnk_a', { awardedFaceQuarter: fq({ '000010': 3_000 }) }));
    w.put(T, row('bnk_b', { nameInLeague: true, awardedFaceQuarter: fq({ '000010': 2_000, '000011': 50_000 }) }));
    const sh = dealerShares(w.ctx.store, 'FDL', 10 * Q, 11 * Q);
    expect(sh.length).toBe(10);
    expect(sh.slice(0, 3).map((x) => [x.entityKey, +x.share.toFixed(9)])).toEqual([['bnk_a', 0.3], ['bnk_b', 0.2], [npcDealerKey('FDL', 0), 0.0625]]);
    const lt = leagueTable(w.ctx.store, 'FDL', 10);
    expect(lt.slice(0, 3).map((x) => [x.rank, +x.share.toFixed(9), x.name])).toEqual([[1, 0.3, null], [2, 0.2, 'bnk_b'], [3, 0.0625, npcDealerKey('FDL', 0)]]);
    expect(dealerShares(w.ctx.store, 'FDL', 0, 0).every((x) => x.share === 0)).toBe(true);
  });
});
