// T04-12 syndication tests (04 §3.10.6).
import { MICRO_N, SortedMap, type Id, type Qty } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { DEALER_POOL_ID } from '../ids';
import { syndicationOrderIntent } from '../intents/syndication';
import { bindPrimaryPorts } from '../intents/primaryPorts';
import type { MacroPorts } from '../ports';
import { macroTables, type BlocId, type Syndication, type SyndicationOrder } from '../schema';
import { cbRow, cbWorld, M, stubPorts, type CbWorld } from '../testkit/cbWorld';
import { putBloc } from '../testkit/fiscalWorld';
import { allocateSyndication, finalSpreadBp, leadManagers, openSyndication, priceSyndication, syndicationSize } from './syndication';
import { npcDealerKey } from './dealers';

const D = 720, F = (x: number): Qty => BigInt(x) * MICRO_N, SIZE = F(5_000_000_000), PT = 101 * D + 420;
const LEADS = ['bnk_l1', 'bnk_l2', 'bnk_l3'];
const syn = (o: Partial<Syndication> = {}): Syndication => ({ id: 'syn_FDL_N30Y_100', govId: 'gov_FDL', assetId: 'ast_SOV_FDL_N30Y_11020', size: SIZE, leadManagers: LEADS,
  bookOpenTick: 100 * D + 420, pricingTick: PT, guidanceSpreadBp: 5, feeRate: 0.0015, tenor: 'N30Y', curveYield: 0.04, ...o });
const ord = (id: string, who: Id, face: number, lim: number | null = null, holdId = ''): SyndicationOrder => ({ id, syndicationId: 'syn_FDL_N30Y_100', bidderId: who, face: F(face), limitSpreadBp: lim, holdId, tick: 0 });
const par: MacroPorts = { ...stubPorts(), assets: { ...stubPorts().assets, priceFromYield: () => 100 } };

describe('final spread', () => {
  it('3.2× → 3 bp, 5× → 0 bp (cap −5), 1.8× → 5 bp, exactly 2.5× → 4 bp, just under → 5 bp', () => {
    expect(finalSpreadBp(5, F(16_000_000_000), SIZE)).toBe(3);
    expect(finalSpreadBp(5, F(25_000_000_000), SIZE)).toBe(0);
    expect(finalSpreadBp(5, F(40_000_000_000), SIZE)).toBe(0);
    expect(finalSpreadBp(5, F(9_000_000_000), SIZE)).toBe(5);
    expect(finalSpreadBp(5, F(12_500_000_000), SIZE)).toBe(4);
    expect(finalSpreadBp(5, F(12_499_999_000), SIZE)).toBe(5);
    expect(finalSpreadBp(5, F(1), 0n)).toBe(5);
  });
});

describe('allocation', () => {
  const orders = [...LEADS.map((l) => ord(`o_${l}`, l, 1_000_000_000)), ord('o_a', 'bnk_a', 2_000_000_000), ord('o_b', 'bnk_b', 3_500_000_000), ord('o_c', 'bnk_c', 500_000_000, 2), ord('o_d', 'bnk_d', 500_000_000, 3)];
  it('leads take 750M each first; 2.75e9 pro rata over the other eligible orders; limit 2 bp below final 3 bp gets nothing; Σ ≤ size', () => {
    const a = allocateSyndication(syn(), orders, 0n, 3), by = (id: string): Qty => a.find((x) => x.orderId === id)?.face ?? 0n;
    for (const l of LEADS) expect(by(`o_${l}`)).toBe(F(750_000_000));
    expect(by('o_c')).toBe(0n);
    expect(by('o_a') + by('o_b') + by('o_d')).toBe(F(2_750_000_000));
    expect(by('o_a')).toBe(F(916_666_000) + (by('o_a') - F(916_666_000)));
    expect(by('o_a') >= F(916_666_000) && by('o_a') <= F(916_667_000)).toBe(true);
    expect(by('o_d') >= F(229_166_000) && by('o_d') <= F(229_167_000)).toBe(true);
    expect(a.reduce((t, x) => t + x.face, 0n)).toBe(SIZE);
    expect(a.some((x) => x.face === 0n)).toBe(false);
  });
  it('undersubscribed: everyone filled; the NPC ask joins the rest pool and comes last', () => {
    const a = allocateSyndication(syn(), [ord('o_a', 'bnk_a', 1_000_000), ord(`o_l`, 'bnk_l1', 10_000)], F(2_000_000), 5);
    expect(a).toEqual([{ orderId: 'o_a', bidderId: 'bnk_a', face: F(1_000_000) }, { orderId: 'o_l', bidderId: 'bnk_l1', face: F(10_000) },
      { orderId: 'syn_FDL_N30Y_100:npc', bidderId: DEALER_POOL_ID('FDL'), face: F(2_000_000) }]);
  });
  it('a lead whose orders exceed 15% takes its tranche only (its leftover does not enter the rest)', () => {
    const a = allocateSyndication(syn(), [ord('o_l', 'bnk_l1', 5_000_000_000)], 0n, 5);
    expect(a).toEqual([{ orderId: 'o_l', bidderId: 'bnk_l1', face: F(750_000_000) }]);
  });
  it('remainder lots are deterministic and lot-sized', () => {
    const os = [ord('o_x', 'bnk_x', 1_000_000), ord('o_y', 'bnk_y', 1_000_000), ord('o_z', 'bnk_z', 1_000_000)];
    const a = allocateSyndication(syn({ size: F(1_000_000), leadManagers: [] }), os, 0n, 5);
    expect(a.reduce((t, x) => t + x.face, 0n)).toBe(F(1_000_000));
    expect(a.every((x) => x.face % F(1000) === 0n)).toBe(true);
    expect(a).toEqual(allocateSyndication(syn({ size: F(1_000_000), leadManagers: [] }), [...os], 0n, 5));
  });
});

function world(b: BlocId = 'FDL', tick = PT): CbWorld {
  const w = cbWorld([cbRow(b)], tick); putBloc(w, b);
  const r = w.rows(macroTables.bloc.name)[0] as Record<string, unknown>;
  w.put(macroTables.bloc.name, { ...r, shocks: [], sovereign: { spread10y: 0, stressIndex: 0, failedAuctions21d: 0 } } as never);
  w.put(macroTables.global.name, { id: 'GLOBAL', fearIndex: 50 } as never);
  return w;
}
describe('pricing', () => {
  it('fee 0.0015 × 5e9 at 100 = 7.5M → 2.5M per lead as GOV_SYNDICATION_FEE; players SOV_BOND_ISSUE; NPC elastic; issue row; holds released; orders deleted', () => {
    const w = world(), s = syn({ leadManagers: ['bnk_l1', npcDealerKey('FDL', 0), npcDealerKey('FDL', 1)] });
    w.put(macroTables.syndication.name, s);
    const h1 = w.ctx.holds.placeCash('bnk_l1', 'FDL', F(1), PT + 1, 'x') as string, h2 = w.ctx.holds.placeCash('bnk_a', 'FDL', F(1), PT + 1, 'y') as string;
    const h3 = w.ctx.holds.placeCash('bnk_b', 'FDL', F(1), PT + 1, 'z') as string;
    w.put(macroTables.syndicationOrder.name, ord('o1', 'bnk_l1', 100_000_000, null, h1));
    w.put(macroTables.syndicationOrder.name, ord('o2', 'bnk_a', 100_000_000, null, h2));
    w.put(macroTables.syndicationOrder.name, ord('o3', 'bnk_b', 100_000_000, null, h3));
    w.ctx.holds.release(h3);
    priceSyndication(w.ctx, s, par);
    const fees = w.posts.filter((p) => p.code === 'GOV_SYNDICATION_FEE');
    expect(fees.map((p) => [p.from, p.to, p.amt])).toEqual([['gov_FDL', 'bnk_l1', M(2_500_000)], ['gov_FDL', DEALER_POOL_ID('FDL'), M(2_500_000)], ['gov_FDL', DEALER_POOL_ID('FDL'), M(2_500_000)]]);
    const sw = w.posts.filter((p) => p.op === 'swapAsset');
    expect(sw.map((p) => [p.from, p.to, p.code])).toEqual([['bnk_l1', 'gov_FDL', 'SOV_BOND_ISSUE'], ['bnk_a', 'gov_FDL', 'SOV_BOND_ISSUE']]);
    expect(sw[0]!.sub).toBe(`${s.assetId}:${F(100_000_000)}`);   // lead: within its 15% tranche, filled in full
    const qa = BigInt(sw[1]!.sub!.split(':')[1]!);
    expect(sw[1]!.amt).toBe(qa);                                  // at par cash = face
    expect(qa > 0n && qa < F(100_000_000)).toBe(true);            // pro rata with the NPC book
    const sumFace = sw.reduce((t, p) => t + BigInt(p.sub!.split(':')[1]!), 0n);
    const el = w.posts.filter((p) => p.op === 'elasticIn');
    expect(el.length).toBe(1);
    expect(el[0]).toMatchObject({ from: 'row', to: 'gov_FDL', code: 'SOV_DEBT_ELASTIC_PLACEMENT' });
    const iss = w.ctx.store.get<{ faceOutstanding: Qty; onTheRun: boolean; fxDenominated: boolean; ccy: string; tenor: string }>(macroTables.issue.name, s.assetId)!;
    expect(iss).toMatchObject({ onTheRun: true, fxDenominated: false, ccy: 'FDL', tenor: 'N30Y' });
    expect(iss.faceOutstanding).toBe(sumFace + el[0]!.amt);
    expect(iss.faceOutstanding).toBe(SIZE);
    expect(w.rows(macroTables.syndicationOrder.name)).toEqual([]);
    expect([h1, h2].map((h) => w.ctx.holds.get(h)?.status)).not.toContain('ACTIVE');
    expect(w.ctx.store.get<Syndication>(macroTables.syndication.name, s.id)!.pricedTick).toBe(PT);
    const ev = w.events.find((e) => e.kind === 'macro.sov.syndication.priced')!;
    expect(ev.payload).toMatchObject({ syndicationId: s.id, orders: 2, size: SIZE.toString() });
  });
  it('SRL FDL syndication settles in FDL and raises fxDebt; the old FDL line goes off the run', () => {
    const w = world('SRL'), s = syn({ id: 'syn_SRL_N10Y_FDL_100', govId: 'gov_SRL', assetId: 'ast_SOV_SRL_N10Y_3741', tenor: 'N10Y_FDL', leadManagers: [] });
    w.put(macroTables.syndication.name, s);
    w.put(macroTables.issue.name, { id: 'old', assetId: 'old', govId: 'gov_SRL', tenor: 'N10Y', ccy: 'FDL', fxDenominated: true, onTheRun: true, faceOutstanding: 0n } as never);
    w.put(macroTables.issue.name, { id: 'dom', assetId: 'dom', govId: 'gov_SRL', tenor: 'N10Y', ccy: 'SRL', fxDenominated: false, onTheRun: true, faceOutstanding: 0n } as never);
    const before = w.ctx.store.get<{ fiscal: { fxDebt: bigint } }>(macroTables.bloc.name, 'SRL')!.fiscal.fxDebt;
    priceSyndication(w.ctx, s, par);
    const el = w.posts.filter((p) => p.op === 'elasticIn');
    expect(el.every((p) => p.ccy === 'FDL')).toBe(true);
    expect(w.ctx.store.get<{ fiscal: { fxDebt: bigint } }>(macroTables.bloc.name, 'SRL')!.fiscal.fxDebt - before).toBe(el.reduce((t, p) => t + p.amt, 0n));
    expect(el.reduce((t, p) => t + p.amt, 0n) > 0n).toBe(true);
    expect(w.ctx.store.get<{ onTheRun: boolean }>(macroTables.issue.name, 'old')!.onTheRun).toBe(false);
    expect(w.ctx.store.get<{ onTheRun: boolean }>(macroTables.issue.name, 'dom')!.onTheRun).toBe(true);
    expect(w.ctx.store.get<{ ccy: string; fxDenominated: boolean; tenor: string }>(macroTables.issue.name, s.assetId)).toMatchObject({ ccy: 'FDL', fxDenominated: true, tenor: 'N10Y' });
  });
});

describe('open, size, leads, orders', () => {
  it('size: N30Y 0.32 × GFN_q − reopenings, FDL 0.20 × GFN_q, floored to 1e6, never negative', () => {
    expect(syndicationSize('N30Y', M(10_000_000_000), F(1_000_000_000))).toBe(F(2_200_000_000));
    expect(syndicationSize('N10Y_FDL', M(10_000_999_999), 0n)).toBe(F(2_000_000_000));
    expect(syndicationSize('N30Y', M(1e9), F(1e9))).toBe(0n);
  });
  it('leads: top shares over the two prior quarters, ACTIVE players only; NPC keys fill when no dealer won anything', () => {
    const w = world(), fq = (q: string, x: number) => new SortedMap([[q, F(x).toString()]] as const);
    const r = (e: string, o: object) => ({ id: `FDL:${e}`, bloc: 'FDL', entityId: e, npc: false, status: 'ACTIVE', fromQuarter: 0, revokedUntilQuarter: null, auctionsThisQuarter: 0,
      auctionsBidThisQuarter: 0, missesThisQuarter: 0, awardedFaceQuarter: new SortedMap(), ...o } as never);
    const q = Math.floor(PT / D / 91);
    w.put(macroTables.dealer.name, r('bnk_a', { awardedFaceQuarter: fq(String(q - 1).padStart(6, '0'), 9_000) }));
    w.put(macroTables.dealer.name, r('bnk_c', { status: 'RESIGNING', awardedFaceQuarter: fq(String(q - 2).padStart(6, '0'), 90_000) }));
    w.put(macroTables.dealer.name, r('bnk_d', { awardedFaceQuarter: fq(String(q).padStart(6, '0'), 90_000) }));
    w.put(macroTables.dealer.name, r(DEALER_POOL_ID('FDL'), { npc: true, awardedFaceQuarter: fq(String(q - 2).padStart(6, '0'), 8_000) }));
    expect(leadManagers(w.ctx.store, 'FDL', PT)).toEqual(['bnk_a', npcDealerKey('FDL', 0), npcDealerKey('FDL', 1)]);
    w.ctx.store.del(macroTables.dealer.name, `FDL:${DEALER_POOL_ID('FDL')}`); w.ctx.store.del(macroTables.dealer.name, 'FDL:bnk_a');
    expect(leadManagers(w.ctx.store, 'FDL', w.ctx.tick)).toEqual([0, 1, 2].map((i) => npcDealerKey('FDL', i)));
  });
  it('open: pricing at t = 420 of the next trading day, announced with syndication: true; orders: closed, license, cap, step, hold', () => {
    const w = world('FDL', 100 * D + 420);
    const s = openSyndication(w.ctx, 'FDL', 'N30Y', SIZE);
    expect(s.pricingTick % D).toBe(420);
    expect(s.pricingTick > s.bookOpenTick && s.pricingTick <= s.bookOpenTick + 4 * D).toBe(true);
    expect(w.events.find((e) => e.kind === 'macro.sov.auction.announced')!.payload).toMatchObject({ syndication: true, tenor: 'N30Y', auctionId: s.id });
    const p = stubPorts({ players: ['bnk_a', 'bnk_b'] });
    bindPrimaryPorts({ ...p, players: { ...p.players, hasCharter: (_s, e, c) => c === 'CH_BANK' && e !== 'usr_x' }, assets: { ...p.assets, priceFromYield: () => 100 } });
    const si = (face: string, a = 'bnk_a') => ({ intentId: `i${face}${a}`, actorId: a, payload: { syndicationId: s.id, face }, tick: w.ctx.tick } as never);
    expect(syndicationOrderIntent.validate(w.ctx, si('1000000', 'usr_x'))).toEqual({ code: 'SOV_LICENSE' });
    expect(syndicationOrderIntent.validate(w.ctx, si('10500'))).toEqual({ code: 'SOV_FACE_STEP' });
    expect(syndicationOrderIntent.validate(w.ctx, si('1750001000'))).toEqual({ code: 'SOV_CAP_EXCEEDED' });
    expect(syndicationOrderIntent.apply(w.ctx, si('1000000000'))).toBeNull();
    expect(syndicationOrderIntent.validate(w.ctx, si('750001000', 'bnk_b'))).toEqual({ code: 'SOV_CAP_EXCEEDED' });
    expect(syndicationOrderIntent.validate(w.ctx, si('750000000', 'bnk_b'))).toBeNull();
    expect(w.holds[0]).toMatchObject({ owner: 'bnk_a', amt: M(1_000_000_000), expires: s.pricingTick + 1 });
    w.failCash(true);
    expect(syndicationOrderIntent.apply(w.ctx, si('10000', 'bnk_b'))).toEqual({ code: 'SOV_HOLD_FAILED' });
    w.setTick(s.pricingTick);
    expect(syndicationOrderIntent.validate(w.ctx, si('10000'))).toEqual({ code: 'SOV_AUCTION_CLOSED' });
  });
});
