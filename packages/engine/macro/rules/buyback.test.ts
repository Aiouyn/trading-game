// T04-12 buyback tests (04 §3.10.7).
import { MICRO_N, type Id, type Qty } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { buybackOfferIntent, per100ToPrice } from '../intents/buyback';
import { bindPrimaryPorts } from '../intents/primaryPorts';
import type { MacroPorts } from '../ports';
import { macroTables, type Buyback, type BuybackOffer } from '../schema';
import { cbRow, cbWorld, M, stubPorts, type CbWorld } from '../testkit/cbWorld';
import { putBloc } from '../testkit/fiscalWorld';
import { buybackOpen, buybackTrigger, MACRO_EXTENSION_CODES_PRIMARY, openBuyback, settleBuyback } from './buyback';

const D = 720, F = (x: number): Qty => BigInt(x) * MICRO_N, T0 = 100 * D + 420, OFF = 'ast_SOV_FDL_N5Y_2000', ON = 'ast_SOV_FDL_N5Y_2500';
const base = { cashBuffer: M(30e9), cashTarget: M(10e9), stress: 0.1, offTheRunDepth: 1, fsi: 0, debt: M(1e12) };
function world(gdp = 1e12): CbWorld {
  const w = cbWorld([cbRow('FDL')], T0); putBloc(w, 'FDL', { gdp, fiscal: { spendingGdp: 0.13, debt: M(1e12) } as never });
  const r = w.rows(macroTables.bloc.name)[0] as Record<string, unknown>;
  w.put(macroTables.bloc.name, { ...r, shocks: [], sovereign: { spread10y: 0, stressIndex: 0, failedAuctions21d: 0 } } as never);
  for (const [id, otr, mat] of [[OFF, false, T0 + 1000 * D], [ON, true, T0 + 1500 * D], ['ast_SOV_FDL_N2Y_90', false, T0 - 1]] as const)
    w.put(macroTables.issue.name, { id, assetId: id, govId: 'gov_FDL', tenor: 'N5Y', ccy: 'FDL', onTheRun: otr, maturityTick: mat, faceOutstanding: F(50e9), fxDenominated: false } as never);
  return w;
}

describe('trigger', () => {
  it('cash 3× target, stress 0.1, debt 1e12 → open, maxFace = min(cash − 2 × target, 20e9)', () => {
    expect(buybackTrigger(base)).toEqual({ open: true, maxFaceCash: M(10e9), reason: 'EXCESS_CASH' });
    expect(buybackTrigger({ ...base, cashBuffer: M(60e9) }).maxFaceCash).toBe(M(20e9));
    expect(buybackTrigger({ ...base, cashBuffer: M(20e9) }).open).toBe(false);
    expect(buybackTrigger({ ...base, stress: 0.2 }).open).toBe(false);
  });
  it('dysfunction opens at FSI 0.6 with depth 0.4 (excess = cash − target); depth 0.5 or FSI 0.5 do not', () => {
    const d = { ...base, cashBuffer: M(15e9), offTheRunDepth: 0.4, fsi: 0.6 };
    expect(buybackTrigger(d)).toEqual({ open: true, maxFaceCash: M(5e9), reason: 'DYSFUNCTION' });
    expect(buybackTrigger({ ...d, stress: 0.5, cashBuffer: M(30e9) })).toEqual({ open: true, maxFaceCash: M(20e9), reason: 'DYSFUNCTION' });
    expect(buybackTrigger({ ...d, offTheRunDepth: 0.5 }).open).toBe(false);
    expect(buybackTrigger({ ...d, fsi: 0.5 }).open).toBe(false);
    expect(buybackTrigger({ ...d, cashBuffer: M(5e9) }).open).toBe(false);
  });
  it('codes: GOV_SYNDICATION_FEE TRANSFER/PAY, GOV_BUYBACK TRANSFER/SWAP_ASSET', () => {
    expect(MACRO_EXTENSION_CODES_PRIMARY.map((c) => [c.code, c.cls, c.template])).toEqual([['GOV_SYNDICATION_FEE', 'TRANSFER', 'PAY'], ['GOV_BUYBACK', 'TRANSFER', 'SWAP_ASSET']]);
  });
});

describe('open, offers, settle', () => {
  const ports = (pledged: Record<string, bigint> = {}, px: bigint | null = 1_000_000n): MacroPorts => {
    const p = stubPorts({ assets: { [OFF]: { cls: 'GOV', issuerBloc: 'FDL', maturityTick: T0 + 1000 * D, px } } });
    return { ...p, credit: { ...p.credit!, pledgedQty: (_s, e, a) => pledged[`${e}:${a}`] ?? 0n } };
  };
  it('opens on off-the-run unmatured lines only, closes at t = 330 of the next trading day; nothing opens without excess', () => {
    const w = world();
    w.cash['gov_FDL:FDL'] = M(30e9);
    const bb = openBuyback(w.ctx, 'FDL', ports())!;
    expect(bb.assetIds).toEqual([OFF]);
    expect(Number(bb.maxFace - F(10e9)) ** 2 <= 1e6).toBe(true);
    expect(bb.tick % D).toBe(330);
    expect(bb.tick > T0 && bb.tick <= T0 + 4 * D).toBe(true);
    expect(buybackOpen(bb, bb.tick - 1)).toBe(true);
    expect(buybackOpen(bb, bb.tick)).toBe(false);
    const w2 = world(); w2.cash['gov_FDL:FDL'] = M(15e9);
    expect(openBuyback(w2.ctx, 'FDL', ports())).toBeNull();
  });
  it('99.80 and 100.05 accepted in that order at their own prices, 100.20 rejected (cap 100.10); holds released; face retired; pledged bonds cannot be offered', () => {
    const w = world(), p = ports({ 'usr_p:ast_SOV_FDL_N5Y_2000': F(5_000_000) });
    bindPrimaryPorts(p);
    const bb: Buyback = { id: 'bb_FDL_100', govId: 'gov_FDL', assetIds: [OFF], maxFace: F(10e9), tick: T0 + D - 90, offers: [] };
    w.put(macroTables.buyback.name, bb);
    for (const e of ['usr_a', 'usr_b', 'usr_c', 'usr_p']) w.qty[`${e}:${OFF}`] = F(10_000_000);
    const si = (a: Id, face: string, minPrice: string, asset = OFF) => ({ intentId: `i_${a}_${face}`, actorId: a, payload: { buybackId: bb.id, assetId: asset, face, minPrice }, tick: T0 } as never);
    expect(buybackOfferIntent.validate(w.ctx, si('usr_p', '5001000', '99.00'))).toEqual({ code: 'SOV_HOLD_FAILED' });
    expect(buybackOfferIntent.validate(w.ctx, si('usr_p', '5000000', '99.00'))).toBeNull();
    expect(buybackOfferIntent.validate(w.ctx, si('usr_a', '10001000', '99.00'))).toEqual({ code: 'SOV_HOLD_FAILED' });
    w.qty[`usr_c:${OFF}`] = F(10_000_000) - 1n;
    expect(buybackOfferIntent.validate(w.ctx, si('usr_c', '10000000', '99.00'))).toEqual({ code: 'SOV_HOLD_FAILED' });
    w.qty[`usr_c:${OFF}`] = F(10_000_000);
    expect(buybackOfferIntent.validate(w.ctx, si('usr_a', '1000', '99.00'))).toEqual({ code: 'SOV_FACE_STEP' });
    expect(buybackOfferIntent.validate(w.ctx, si('usr_a', '10000', '99.00', ON))).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    expect(buybackOfferIntent.apply(w.ctx, si('usr_c', '3000000', '100.20'))).toBeNull();
    expect(buybackOfferIntent.apply(w.ctx, si('usr_b', '2000000', '100.05'))).toBeNull();
    expect(buybackOfferIntent.apply(w.ctx, si('usr_a', '1000000', '99.80'))).toBeNull();
    expect(w.holds.map((h) => [h.owner, h.assetId, h.amt, h.expires])).toContainEqual(['usr_a', OFF, F(1_000_000), bb.tick + 1]);
    w.setTick(bb.tick);
    expect(buybackOfferIntent.validate(w.ctx, si('usr_a', '10000', '99.00'))).toEqual({ code: 'SOV_AUCTION_CLOSED' });
    settleBuyback(w.ctx, bb, p);
    const sw = w.posts.filter((x) => x.op === 'swapAsset');
    expect(sw.map((x) => [x.from, x.to, x.amt, x.code, x.sub])).toEqual([['gov_FDL', 'usr_a', M(998_000), 'GOV_BUYBACK', `${OFF}:${F(1_000_000)}`],
      ['gov_FDL', 'usr_b', M(2_001_000), 'GOV_BUYBACK', `${OFF}:${F(2_000_000)}`]]);
    expect(w.holds.every((h) => !h.open)).toBe(true);
    expect(w.rows(macroTables.buybackOffer.name)).toEqual([]);
    expect(w.ctx.store.get<{ faceOutstanding: Qty }>(macroTables.issue.name, OFF)!.faceOutstanding).toBe(F(50e9) - F(3_000_000));
    expect(w.ctx.store.get<Buyback>(macroTables.buyback.name, bb.id)!.offers.map((o) => o.holderId)).toEqual(['usr_a', 'usr_b']);
    expect(w.events.find((e) => e.kind === 'macro.sov.buyback.result')!.payload).toEqual({ buybackId: bb.id, govId: 'gov_FDL', acceptedFace: F(3_000_000).toString(), offers: 2,
      averagePrice: '999667' /* 2,999,000 / 3,000,000 per unit, half-even */ });
  });
  it('maxFace binds: the last accepted offer is cut to a 1,000 lot; a missing fair price rejects everything', () => {
    const w = world(), bb: Buyback = { id: 'bb_FDL_100', govId: 'gov_FDL', assetIds: [OFF], maxFace: F(1_500_500), tick: T0 + D, offers: [] };
    w.put(macroTables.buyback.name, bb);
    const off = (id: string, who: Id, face: number, px: string): BuybackOffer => ({ id, buybackId: bb.id, holderId: who, assetId: OFF, face: F(face), minPrice: per100ToPrice(px),
      holdId: w.ctx.holds.placeQty(who, OFF, F(face), bb.tick + 1, id) as string, tick: T0 });
    for (const e of ['usr_a', 'usr_b']) w.qty[`${e}:${OFF}`] = F(10_000_000);
    w.put(macroTables.buybackOffer.name, off('o1', 'usr_a', 1_000_000, '99.5'));
    w.put(macroTables.buybackOffer.name, off('o2', 'usr_b', 1_000_000, '99.6'));
    w.put(macroTables.buybackOffer.name, off('o0', 'usr_b', 1_000_000, '99.0'));
    w.ctx.holds.release((w.rows(macroTables.buybackOffer.name).find((o) => (o as BuybackOffer).id === 'o0') as BuybackOffer).holdId);   // dead hold → not accepted
    settleBuyback(w.ctx, bb, ports());
    expect(w.posts.filter((x) => x.op === 'swapAsset').map((x) => [x.to, x.sub])).toEqual([['usr_a', `${OFF}:${F(1_000_000)}`], ['usr_b', `${OFF}:${F(500_000)}`]]);
    const w2 = world(); w2.put(macroTables.buyback.name, bb);
    w2.qty[`usr_a:${OFF}`] = F(10_000_000);
    w2.put(macroTables.buybackOffer.name, { id: 'o1', buybackId: bb.id, holderId: 'usr_a', assetId: OFF, face: F(1_000), minPrice: 1n, holdId: w2.ctx.holds.placeQty('usr_a', OFF, F(1_000), bb.tick + 1, 'o1') as string, tick: T0 } as never);
    settleBuyback(w2.ctx, bb, ports({}, null));
    expect(w2.posts).toEqual([]);
    expect(w2.events.find((e) => e.kind === 'macro.sov.buyback.result')!.payload).toMatchObject({ acceptedFace: '0', offers: 0, averagePrice: null });
  });
  it('per100ToPrice: "99.8" = 998000, "100" = 1000000, "100.0525" = 1000525', () => {
    expect([per100ToPrice('99.8'), per100ToPrice('100'), per100ToPrice('100.0525')]).toEqual([998_000n, 1_000_000n, 1_000_525n]);
  });
});
