// T04-11 auction tests (04#21, 04#22, edges 10–11, exploits 4–5).
import { fnv1a32, MICRO_N, type Qty } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { DEALER_POOL_ID } from '../ids';
import { HOOK_CALL_TABLE, macroTables, type AuctionBid, type BlocId, type CentralBank, type SovAuction } from '../schema';
import { cbRow, cbWorld, stubPorts, type CbWorld } from '../testkit/cbWorld';
import { putBloc } from '../testkit/fiscalWorld';
import { afterFailedOrWeak, applyGroupCap, auctionPrice, backstopOrders, cashFor, clearAuction, ladderParams, NONCOMP_MAX_FACE, npcLadder, runAuction, type ClearingResult } from './auction';

const D = 720, F = (x: number): Qty => BigInt(x) * MICRO_N, AT = 100 * D + 330;
const auc = (b: BlocId, o: Partial<SovAuction> = {}): SovAuction => ({ id: `auc_${b}_N10Y_100`, govId: `gov_${b}`, assetId: `ast_SOV_${b}_N10Y_3740`, tenor: 'N10Y', reopening: false,
  announceTick: 97 * D + 420, bidOpenTick: 97 * D + 420, auctionTick: AT, offeredFace: F(10_000_000_000), whenIssuedYield: 0.03, bids: [], ...o });
const bid = (id: string, who: string, face: number, bp?: number): AuctionBid => ({ bidId: id, auctionId: 'auc_FDL_N10Y_100', bidderId: who, kind: bp === undefined ? 'NONCOMPETITIVE' : 'COMPETITIVE',
  ...(bp !== undefined ? { yieldBp: Math.round(bp * 100) } : {}), face: F(face), cashHoldId: '', submittedTick: AT - 10, primaryDealer: false });
const sum = (xs: { face: Qty }[]): Qty => xs.reduce((s, x) => s + x.face, 0n);
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const id = (x: string): string => x;
const npc = (b: BlocId) => (x: string): boolean => x === DEALER_POOL_ID(b);

function world(b: BlocId, stress: number, fear: number): CbWorld {
  const w = cbWorld([cbRow('FDL'), cbRow('SRL'), cbRow('EUN'), cbRow('PYN')], AT);
  for (const x of ['FDL', 'SRL', 'EUN', 'PYN'] as BlocId[]) {
    putBloc(w, x);
    const r = w.rows(macroTables.bloc.name).find((e) => (e as { id: string }).id === x) as Record<string, unknown>;
    w.put(macroTables.bloc.name, { ...r, id: x, shocks: [], sovereign: { spread10y: 0, stressIndex: x === b ? stress : 0, failedAuctions21d: 0 } } as never);
  }
  w.put(macroTables.global.name, { id: 'GLOBAL', fearIndex: fear } as never);
  const a = auc(b);
  w.put(macroTables.auction.name, a);
  w.put(macroTables.issue.name, { id: a.assetId, assetId: a.assetId, govId: a.govId, tenor: 'N10Y', ccy: b, couponRate: 0.03, issueTick: AT, maturityTick: AT + 3640 * D,
    faceOutstanding: 0n, inflationLinked: false, fxDenominated: false, cac: { threshold: 0.75, aggregated: true }, onTheRun: false } as never);
  return w;
}

describe('04#22 NPC ladder', () => {
  it('calm: BTC 2.4, cover 2.3999239, stop 300.45 bp (level 18), at-stop 58,383,000 of 1,739,288,000, tail 0.45 bp', () => {
    const a = auc('FDL'), lp = ladderParams('FDL', 0, 30, a.offeredFace, a.offeredFace);
    expect(lp).toEqual({ btc: 2.4, mu: 0.00005, s: 0.00015 });
    const lad = npcLadder(a, 0.03, lp);
    expect(sum(lad)).toBe(F(23_999_239_000));
    const r = clearAuction(a, lad, 0.03, id, npc('FDL'), NONCOMP_MAX_FACE);
    expect(r.bidToCover).toBeCloseTo(2.3999239, 9);
    expect(r.stopYield).toBeCloseTo(0.030045, 12);
    expect(lad.find((x) => x.bidId.endsWith(':18'))!.yieldBp).toBe(30045);
    expect(lad.find((x) => x.bidId.endsWith(':18'))!.face).toBe(F(1_739_288_000));
    const at = r.awards.find((x) => x.bidId.endsWith(':18'))!;
    expect(at.face).toBe(F(58_383_000));
    expect(r.allotmentAtStopPct).toBeCloseTo(3.3567, 4);
    expect(r.tailBp).toBeCloseTo(0.45, 9);
    expect(r.awardedFace).toBe(a.offeredFace);
    expect(r.failed || r.weak).toBe(false);
    expect(r.npcShare).toBe(1);
  });
  it('property: 200 seeded calm auctions (stress 0, F ≤ 30) have cover in [2.0, 2.8]', () => {
    const r = rng(22);
    for (let i = 0; i < 200; i++) {
      const b = (['FDL', 'EUN', 'PYN', 'NKR', 'SRL'] as BlocId[])[Math.floor(r() * 5)]!, a = auc(b, { offeredFace: F(Math.floor(1e2 + r() * 5e4) * 1e6) });
      const y = 0.005 + r() * 0.075, lad = npcLadder(a, y, ladderParams(b, 0, r() * 30, a.offeredFace, a.offeredFace));
      const c = clearAuction(a, lad, y, id, npc(b), NONCOMP_MAX_FACE).bidToCover;
      expect(c).toBeGreaterThanOrEqual(2.0);
      expect(c).toBeLessThanOrEqual(2.8);
    }
  });
  it('stress 0.5, F 70 (non-FDL): BTC 1.584, μ = s = 5.5 bp, cover 1.5839498', () => {
    const w = world('PYN', 0.5, 70), a = auc('PYN'), lp = ladderParams('PYN', 0.5, 70, a.offeredFace, a.offeredFace);
    expect(lp.btc).toBeCloseTo(1.584, 12); expect(lp.mu).toBeCloseTo(0.00055, 12); expect(lp.s).toBeCloseTo(0.00055, 12);
    const r = runAuction(w.ctx, a, stubPorts());
    expect(r.bidToCover).toBeCloseTo(1.5839498, 9);
    expect(r.failed).toBe(false);
  });
  it('stress 1, F 100: BTC 0.84 → failed, cover 0.8399733, everything awarded', () => {
    const w = world('PYN', 1, 100), a = auc('PYN');
    expect(ladderParams('PYN', 1, 100, a.offeredFace, a.offeredFace).btc).toBeCloseTo(0.84, 12);
    const r = runAuction(w.ctx, a, stubPorts());
    expect(r.failed).toBe(true);
    expect(r.bidToCover).toBeCloseTo(0.8399733, 9);
    expect(r.awardedFace).toBe(F(8_399_733_000));
    expect(r.weak).toBe(false);
  });
  it('the size factor raises μ by 0.0003 per unit above the 4-auction average', () => {
    expect(ladderParams('FDL', 0, 0, F(2e9), F(1e9)).mu).toBeCloseTo(0.00035, 12);
    expect(ladderParams('FDL', 0, 0, F(5e8), F(1e9)).mu).toBeCloseTo(0.00005, 12);
    expect(ladderParams('FDL', 0, 100, F(1), F(1)).btc).toBeCloseTo(2.88, 12);
  });
});

describe('04#21 uniform price, Σ awards ≤ offered, group cap 35%', () => {
  it('mixed book: every winner pays face × P*/100 at one P*; the linked group of 5 gets ≤ 35%; no PUBLIC event carries a bid', () => {
    const linked = ['usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5'], ports = stubPorts({ players: linked }), w = world('FDL', 0, 30), a = auc('FDL');
    const mine = [...linked.map((u, i) => bid(`bid_${i}`, u, 1_200_000_000, 290 + i)), bid('bid_a', 'usr_a', 1_000_000_000, 299.5), bid('bid_b', 'usr_b', 5_000_000)];
    for (const x of mine) w.put(macroTables.bid.name, { ...x, id: x.bidId, cashHoldId: w.ctx.holds.placeCash(x.bidderId, 'FDL', F(1), AT + 1, x.bidId) as string } as never);
    const r = runAuction(w.ctx, a, ports);
    expect(r.awardedFace).toBe(a.offeredFace);
    expect(sum(r.awards.filter((x) => linked.includes(x.bidderId)))).toBe(F(3_500_000_000));
    const res = w.events.find((e) => e.kind === 'macro.sov.auction.result')!, P = auctionPrice(w.ctx.store, ports, a, r.stopYield, w.ctx.tick);
    expect(res.payload).toMatchObject({ govId: 'gov_FDL', failed: false });
    const swaps = w.posts.filter((p) => p.op === 'swapAsset');
    expect(swaps.length).toBe(r.awards.filter((x) => x.bidderId !== DEALER_POOL_ID('FDL')).length);
    for (const s of swaps) { const aw = r.awards.find((x) => x.bidderId === s.from)!; expect(s.amt).toBe(cashFor(aw.face, P)); expect(s.code).toBe('SOV_BOND_ISSUE'); }
    const el = w.posts.filter((p) => p.op === 'elasticIn');
    expect(el).toEqual([expect.objectContaining({ from: 'row', to: 'gov_FDL', amt: cashFor(sum(r.awards.filter((x) => x.bidderId === DEALER_POOL_ID('FDL'))), P), code: 'SOV_DEBT_ELASTIC_PLACEMENT' })]);
    for (const e of w.events.filter((x) => x.vis === 'PUBLIC')) expect(JSON.stringify(e.payload)).not.toMatch(/bid_/);
    expect(w.events.filter((e) => e.kind === 'macro.sov.bid.result').every((e) => e.vis === 'PARTIES' && e.partyIds!.length === 1)).toBe(true);
    expect(w.rows(macroTables.bid.name)).toEqual([]);
    expect(w.holds.length).toBe(mine.length);
    expect(w.holds.every((h) => !h.open)).toBe(true);
    const iss = w.rows(macroTables.issue.name)[0] as { faceOutstanding: Qty; onTheRun: boolean };
    expect(iss).toMatchObject({ faceOutstanding: a.offeredFace, onTheRun: true });
    expect((w.rows(macroTables.auction.name)[0] as SovAuction).result!.awardedFace).toBe(a.offeredFace);
  });
  it('property (edge 11, exploits 4–5): 500 seeded books never award above offered, and no player group above 35%', () => {
    const r = rng(21);
    for (let i = 0; i < 500; i++) {
      const a = auc('FDL', { offeredFace: F(Math.floor(1 + r() * 1000) * 1e6) }), off = Number(a.offeredFace / MICRO_N), bids: AuctionBid[] = [];
      const n = Math.floor(r() * 30), g = (u: string): string => `g${Number(u.slice(1)) % 4}`;
      for (let k = 0; k < n; k++) {
        const face = Math.max(10, Math.floor((r() * off * 0.6) / 1000)) * 1000;
        bids.push(bid(`b${k}`, `u${Math.floor(r() * 12)}`, face, r() < 0.3 ? undefined : 295 + Math.floor(r() * 100) / 10));
      }
      const lad = r() < 0.2 ? [] : npcLadder(a, 0.03, ladderParams('FDL', r(), r() * 100, a.offeredFace, a.offeredFace));
      const c = clearAuction(a, [...bids, ...lad], 0.03, g, npc('FDL'), NONCOMP_MAX_FACE);
      expect(c.awardedFace).toBeLessThanOrEqual(a.offeredFace);
      for (const gr of ['g0', 'g1', 'g2', 'g3']) expect(sum(c.awards.filter((x) => !npc('FDL')(x.bidderId) && g(x.bidderId) === gr)) * 100n).toBeLessThanOrEqual(a.offeredFace * 35n);
      for (const x of c.awards) {
        const b = [...bids, ...lad].find((y) => y.bidId === x.bidId)!;
        expect(x.face).toBeLessThanOrEqual(b.face);
        if (!c.failed && b.yieldBp !== undefined) expect(b.yieldBp).toBeLessThanOrEqual(Math.round(c.stopYield * 1e6));
      }
      if (!c.failed) expect(c.awardedFace).toBe(a.offeredFace);
    }
  });
  it('exact fill: the stop is the bid where cumulative face first reaches the competitive amount', () => {
    const a = auc('FDL', { offeredFace: F(1_000_000_000) }), all = () => true;
    const r = clearAuction(a, [bid('x1', 'p1', 600_000_000, 300), bid('x2', 'p2', 400_000_000, 301), bid('x3', 'p3', 500_000_000, 302)], 0.03, id, all, NONCOMP_MAX_FACE);
    expect(r.stopYield).toBeCloseTo(0.0301, 12);
    expect(r.awards.find((x) => x.bidId === 'x3')?.face ?? 0n).toBe(0n);
  });
  it('cashFor: face × P/100 in money micro-units', () => {
    expect(cashFor(F(1000), 99.5)).toBe(F(995));
    expect(cashFor(F(1000), 100)).toBe(F(1000));
  });
  it('backstop: the last day takes the remainder so the plan face is bought exactly', () => {
    const w = world('FDL', 0, 30), c = w.rows(macroTables.cb.name).find((x) => (x as CentralBank).id === 'cbk_FDL') as CentralBank;
    const days = [101, 102, 103], plan = { assetId: 'ast_SOV_FDL_N10Y_3740', face: F(1_000_001_000), days, done: [] as number[] };
    w.put(macroTables.cb.name, { ...c, backstop: plan } as never);
    const ports = stubPorts({ assets: { [plan.assetId]: { cls: 'GOV', issuerBloc: 'FDL', maturityTick: null, px: 100n * MICRO_N } } }), qs: Qty[] = [];
    for (const d of days) { w.setTick(d * D + 100); qs.push(...backstopOrders(w.ctx, ports).map((o) => o.qty)); }
    expect(qs).toEqual([F(333_333_000), F(333_333_000), F(333_335_000)]);
  });
  it('applyGroupCap keeps noncompetitive first, then cuts the highest yields', () => {
    const k = applyGroupCap([bid('c1', 'x', 300_000_000, 301), bid('c2', 'x', 100_000_000, 300), bid('n1', 'x', 5_000_000)], F(1_000_000_000), () => 'G');
    expect(k.map((x) => [x.bidId, x.face])).toEqual([['c1', F(245_000_000)], ['c2', F(100_000_000)], ['n1', F(5_000_000)]]);
  });
  it('ties at the stop: equal faces are ordered by fnv1a32(bidId + auctionId), never by arrival', () => {
    const a = auc('FDL', { offeredFace: F(1_000_001_000) }), all = () => true;
    const xs = [bid('bid_A', 'p1', 600_000_000, 300), bid('bid_B', 'p2', 500_000_000, 301), bid('bid_C', 'p3', 500_000_000, 301)];
    const r1 = clearAuction(a, xs, 0.03, id, all, NONCOMP_MAX_FACE), r2 = clearAuction(a, [...xs].reverse(), 0.03, id, all, NONCOMP_MAX_FACE);
    expect(r1.awards).toEqual(r2.awards);
    const f = r1.awards.filter((x) => x.bidId !== 'bid_A').map((x) => x.face).sort();
    expect(f).toEqual([F(200_000_000), F(200_001_000)]);
    const first = fnv1a32('bid_B' + a.id) < fnv1a32('bid_C' + a.id) ? 'bid_B' : 'bid_C';
    expect(r1.awards.find((x) => x.bidId === first)!.face).toBe(F(200_001_000));
    expect(r1.awardedFace).toBe(a.offeredFace);
  });
  it('noncompetitive at 25% of offered → pro rata to 20%', () => {
    const a = auc('FDL', { offeredFace: F(1_000_000_000) });
    const nc = Array.from({ length: 25 }, (_, i) => bid(`nc_${String(i).padStart(2, '0')}`, `p${i}`, 10_000_000));
    const r = clearAuction(a, [...nc, ...npcLadder(a, 0.03, ladderParams('FDL', 0, 30, a.offeredFace, a.offeredFace))], 0.03, id, npc('FDL'), NONCOMP_MAX_FACE);
    const got = r.awards.filter((x) => x.bidId.startsWith('nc_'));
    expect(sum(got)).toBe(F(200_000_000));
    expect(got.every((x) => x.face === F(8_000_000))).toBe(true);
    expect(r.awardedFace).toBe(a.offeredFace);
  });
  it('per-group noncompetitive cap: a group above 10,000,000 keeps 10,000,000', () => {
    const a = auc('FDL', { offeredFace: F(1_000_000_000) }), all = (x: string) => x === 'npc';
    const r = clearAuction(a, [bid('n1', 'p', 6_000_000), bid('n2', 'p', 6_000_000), bid('c', 'npc', 2_000_000_000, 300)], 0.03, () => 'G', all, NONCOMP_MAX_FACE);
    expect(sum(r.awards.filter((x) => x.bidderId === 'p'))).toBe(F(10_000_000));
  });
});

const res = (a: SovAuction, o: Partial<ClearingResult>): ClearingResult => ({ awards: [], stopYield: 0.03, allotmentAtStopPct: 100, bidToCover: 0.6, tailBp: 0, awardedFace: F(6_000_000_000),
  npcShare: 1, playerShare: 0, failed: true, weak: false, ...o, ...(o.awardedFace === undefined ? { awardedFace: (a.offeredFace * 6n) / 10n } : {}) });

describe('failed and weak auctions', () => {
  const setup = (b: BlocId) => {
    const w = world(b, 0, 30), a = auc(b);
    w.put(macroTables.issue.name, { id: `ast_SOV_${b}_B3M_110`, assetId: `ast_SOV_${b}_B3M_110`, govId: `gov_${b}`, tenor: 'B3M', ccy: b, couponRate: 0, issueTick: 19 * D, maturityTick: AT + 10 * D,
      faceOutstanding: F(5_000_000_000), inflationLinked: false, fxDenominated: false, cac: { threshold: 0.75, aggregated: true }, onTheRun: true } as never);
    return { w, a };
  };
  const bloc = (w: CbWorld, b: BlocId) => w.rows(macroTables.bloc.name).find((e) => (e as { id: string }).id === b) as { shocks: { id: string; value: number; startTick: number; endTick: number; target: string }[];
    fiscal: { shortfallCarry?: Qty }; sovereign: { failedAuctions21d: number } };
  const cb = (w: CbWorld, b: BlocId) => w.rows(macroTables.cb.name).find((e) => (e as CentralBank).bloc === b) as CentralBank;

  it('failed FDL: stress +0.15 for 21 days, shortfall onto the next B3M, backstop 100% of the shortfall over 5 trading days', () => {
    const { w, a } = setup('FDL');
    const next: SovAuction = { ...auc('FDL'), id: 'auc_FDL_B3M_103', tenor: 'B3M', auctionTick: AT + 3 * D, offeredFace: F(1_000_000_000), assetId: 'ast_SOV_FDL_B3M_194' };
    w.put(macroTables.auction.name, next);
    w.put(macroTables.auction.name, { ...a, result: { failed: true } } as never);
    afterFailedOrWeak(w.ctx, 'FDL', a, res(a, {}));
    const bl = bloc(w, 'FDL');
    expect(bl.shocks).toEqual([{ id: `shk_auc_${a.id}`, target: 'auction_stress', value: 0.15, startTick: AT, endTick: AT + 21 * D, shape: 'STEP' }]);
    expect(bl.sovereign.failedAuctions21d).toBe(1);
    expect(bl.fiscal.shortfallCarry).toBeUndefined();
    expect((w.rows(macroTables.auction.name).find((x) => (x as SovAuction).id === next.id) as SovAuction).offeredFace).toBe(F(5_000_000_000));
    const p = cb(w, 'FDL').backstop!;
    expect(p.face).toBe(F(4_000_000_000));
    expect(p.days.length).toBe(5);
    const ports = stubPorts({ assets: { [a.assetId]: { cls: 'GOV', issuerBloc: 'FDL', maturityTick: null, px: 100n * MICRO_N } } }), orders = [];
    for (const d of p.days) { w.setTick(d * D + 100); orders.push(...backstopOrders(w.ctx, ports)); expect(backstopOrders(w.ctx, ports)).toEqual([]); }
    expect(orders.length).toBe(5);
    expect(orders.reduce((s, o) => s + o.qty, 0n)).toBe(F(4_000_000_000));
    expect(orders.every((o) => o.purpose === 'BACKSTOP' && o.side === 'BUY' && o.tif === 'TICK' && o.assetId === a.assetId && o.poolId === 'CB:FDL')).toBe(true);
    expect(orders[0]!.qty).toBe(F(800_000_000));
    expect(cb(w, 'FDL').backstop).toBeUndefined();
  });
  it('failed with no later B3M: the shortfall is carried in fiscal.shortfallCarry', () => {
    const { w, a } = setup('FDL');
    afterFailedOrWeak(w.ctx, 'FDL', a, res(a, {}));
    expect(bloc(w, 'FDL').fiscal.shortfallCarry).toBe(F(4_000_000_000));
  });
  it('backstop share: SRL 50%, EUN none without Concord, EUN 100% with an active Concord program', () => {
    const s = setup('SRL');
    afterFailedOrWeak(s.w.ctx, 'SRL', s.a, res(s.a, {}));
    expect(cb(s.w, 'SRL').backstop!.face).toBe(F(2_000_000_000));
    const e = setup('EUN');
    afterFailedOrWeak(e.w.ctx, 'EUN', e.a, res(e.a, {}));
    expect(cb(e.w, 'EUN').backstop).toBeUndefined();
    const c = setup('EUN');
    c.w.put(macroTables.csf.name, { id: 'npc_CSF', programs: [{ bloc: 'EUN', startTick: 0, endTick: AT + D }] } as never);
    afterFailedOrWeak(c.w.ctx, 'EUN', c.a, res(c.a, {}));
    expect(cb(c.w, 'EUN').backstop!.face).toBe(F(4_000_000_000));
  });
  it('no backstop while government cash covers the face maturing in the next 21 days', () => {
    const { w, a } = setup('FDL');
    w.cash['gov_FDL:FDL'] = F(5_000_000_000);
    afterFailedOrWeak(w.ctx, 'FDL', a, res(a, {}));
    expect(cb(w, 'FDL').backstop).toBeUndefined();
  });
  it('weak (tail 3.1 bp): +0.05 stress for 21 days and one WIRE_ITEM hook; no shortfall, no backstop', () => {
    const { w } = setup('FDL'), a = auc('FDL', { offeredFace: F(1_000_000_000) });
    const r = clearAuction(a, [bid('w1', 'npc_PD_FDL', 2_000_000_000, 303.1)], 0.03, id, npc('FDL'), NONCOMP_MAX_FACE);
    expect(r.tailBp).toBeCloseTo(3.1, 9);
    expect(r.weak).toBe(true); expect(r.failed).toBe(false);
    afterFailedOrWeak(w.ctx, 'FDL', a, r);
    expect(bloc(w, 'FDL').shocks.map((x) => x.value)).toEqual([0.05]);
    expect(w.rows(HOOK_CALL_TABLE.name)).toEqual([expect.objectContaining({ owner: '16', hook: 'WIRE_ITEM', args: { key: 'weak_auction', auctionId: a.id }, worldEventId: a.id })]);
    expect(a.id).toMatch(/^auc_[A-Z]{3}_[A-Z0-9]+_\d+$/);   // AC-04-18-HOOKID (1)
    expect(cb(w, 'FDL').backstop).toBeUndefined();
    expect(bloc(w, 'FDL').fiscal.shortfallCarry).toBeUndefined();
  });
  it('weak by cover: cover 1.4 with tail 0 is weak; tail 3.0 with cover 2 is not', () => {
    const a = auc('FDL', { offeredFace: F(1_000_000_000) });
    expect(clearAuction(a, [bid('w1', 'npc_PD_FDL', 1_400_000_000, 300)], 0.03, id, npc('FDL'), NONCOMP_MAX_FACE).weak).toBe(true);
    expect(clearAuction(a, [bid('w1', 'npc_PD_FDL', 2_000_000_000, 303)], 0.03, id, npc('FDL'), NONCOMP_MAX_FACE).weak).toBe(false);
  });
  it('the auction_stress shock feeds the next ladder (stress = stressIndex + shocks)', () => {
    const { w, a } = setup('PYN');
    afterFailedOrWeak(w.ctx, 'PYN', a, res(a, {}));
    const b = auc('PYN', { id: 'auc_PYN_N10Y_101' });
    const r = runAuction(w.ctx, b, stubPorts());
    expect(r.bidToCover).toBeLessThan(2.4 * (1 - 0.5 * 0.15) + 1e-9);
  });
});
