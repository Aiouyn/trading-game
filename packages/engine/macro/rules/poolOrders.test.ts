// T04-09 pool orders, swap lines, reserve managers, profit remittance.
import { describe, expect, it, vi } from 'vitest';
import { MICRO_N, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { cbRow, cbWorld, M, stubPorts } from '../testkit/cbWorld';
import { macroTables, type AssetPurchaseProgram, type CentralBank, type NpcPoolOrder } from '../schema';
import type { MacroPorts } from '../ports';
import { applyPoolFills, iocLimit, LOT, sliceOfDay, writePoolOrders } from './poolOrders';
import { remitProfit, reserveTargets, RESERVE_TARGET } from './reserveManagers';
import { handleSwapDraws, MACRO_EXTENSION_CODES_SWAP, swapLineLimit, swapLineRate, swapLineStep } from './swapLines';

const acc = vi.hoisted(() => ({ rows: [] as { key: string; code: number }[], net: {} as Record<string, bigint> }));
vi.mock('./t03Stubs', () => ({ effectiveMark: () => null, accountsOfEntity: () => acc.rows.map((r) => ({ ...r, ccy: 'EUN', sub: '' })),
  periodNet: (_s: unknown, k: string, kind: string) => (kind === 'QUARTER' ? acc.net[k] ?? 0n : 0n) }));

const qe = (o: Partial<AssetPurchaseProgram> = {}): AssetPurchaseProgram =>
  ({ state: 'QE', purchasesPerMonth: M(1e9), eligible: { govBonds: 1, corpIG: 0, abs: 0 }, holdingsCapGdp: 0.35, qtRunoffCapPerMonth: 0.015, ...o });
const Y = 364 * TICKS_PER_GAME_DAY;
function ports(adv: number | null, fills: Record<number, { assetId: string; side: 'BUY' | 'SELL'; qty: bigint; notional: bigint }[]> = {}): MacroPorts {
  const d = stubPorts();
  return { ...d, markets: { ...d.markets, fairPriceOf: () => MICRO_N, makerHalfSpread: () => 0.001, lineAdv: () => adv,
    poolFills: (_s, t, id) => (id === 'CB:FDL' ? (fills[t] ?? []).map((f) => ({ ...f, ccy: 'FDL' as const })) : []) },
    assets: { ...d.assets, qeEligibleLines: () => [], assetInfo: () => ({ cls: 'GOV', issuerBloc: 'FDL', maturityTick: null, ccy: 'FDL' }),
      sovereignLines: (_s, g) => (g === govId('FDL') ? [{ assetId: 'f10', tenor: 'N10Y', couponRate: 0.03, maturityTick: 20 * Y, faceOutstanding: M(1e12), onTheRun: true, inflationLinked: false, fxDenominated: false }] : []) } } as MacroPorts;
}
const fdl = (w: ReturnType<typeof cbWorld>): CentralBank => w.ctx.store.get<CentralBank>(macroTables.cb.name, cbkId('FDL'))!;
const resFdl = (w: ReturnType<typeof cbWorld>, b: 'FDL' | 'EUN' | 'PYN' | 'NKR' | 'SRL'): bigint | undefined => w.ctx.store.get<CentralBank>(macroTables.cb.name, cbkId(b))!.reserves?.fdl;

describe('T04-09 slices and limits', () => {
  it('sliceOfDay(1,000 lots, 479) sums to 1,000 lots: floors, the remainder on the last tick', () => {
    let left = 1000n * LOT, sum = 0n;
    const sl: bigint[] = [];
    for (let k = 479; k >= 1; k--) { const s = sliceOfDay(left, k); expect(s % LOT).toBe(0n); sl.push(s); sum += s; left -= s; }
    expect(sum).toBe(1000n * LOT);
    expect(sl[0]).toBe(2n * LOT);
    expect(sl[478]).toBe(left + sl[478]!);
    expect(sliceOfDay(0n, 5)).toBe(0n);
    expect(sliceOfDay(LOT + LOT / 2n, 1)).toBe(LOT + LOT / 2n);   // the last tick takes the non-lot remainder too
  });
  it('IOC limit fair × (1 ± 2h)', () => {
    expect(iocLimit(M(1), 0.001, 'BUY')).toBe(M(1.002));
    expect(iocLimit(M(1), 0.001, 'SELL')).toBe(M(0.998));
  });
});

describe('T04-09 writePoolOrders / applyPoolFills', () => {
  const day = 2, t0 = day * TICKS_PER_GAME_DAY;   // game day 2: a weekday trading day
  const setup = (): ReturnType<typeof cbWorld> => {
    const w = cbWorld([cbRow('FDL', { qe: qe() })], t0 + 61);
    w.put(macroTables.bloc.name, { id: 'FDL', nominalGdp: M(32e12) } as never);
    return w;
  };
  it('first continuous tick plans the day; IOC slice at fair × (1 + 2h); ADV clip 10%', () => {
    const w = setup(), o = writePoolOrders(w.ctx, ports(null));
    const plan = fdl(w).qe.day!;
    expect(plan.gameDay).toBe(day);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ poolId: 'CB:FDL', assetId: 'f10', side: 'BUY', tif: 'TICK', limitPrice: M(1.002), purpose: 'QE', qty: sliceOfDay(plan.rows[0]!.face, 479) });
    const v = setup(), clip = writePoolOrders(v.ctx, ports(10_000_000));
    expect(clip[0]!.qty).toBe(1_000_000n);   // 10% of ADV 10,000,000
    expect(w.rows(macroTables.poolOrder.name)).toHaveLength(1);
  });
  it('fills reduce the remaining face and add to the month; unfilled face rolls forward; last tick rows are deleted', () => {
    const w = setup();
    const o1 = writePoolOrders(w.ctx, ports(null))[0]!, face0 = fdl(w).qe.day!.rows[0]!.face;
    w.setTick(t0 + 62);
    applyPoolFills(w.ctx, ports(null, { [t0 + 61]: [{ assetId: 'f10', side: 'BUY', qty: o1.qty / 2n, notional: o1.qty / 2n }] }));
    expect(w.rows(macroTables.poolOrder.name)).toEqual([]);
    expect(fdl(w).qe.day!.rows[0]!.face).toBe(face0 - o1.qty / 2n);
    expect(fdl(w).qe.month!.bought).toBe(o1.qty / 2n);
    expect(fdl(w).balanceSheet.govBonds).toBe(o1.qty / 2n);
    const o2 = writePoolOrders(w.ctx, ports(null))[0]!;
    expect(o2.qty).toBe(sliceOfDay(face0 - o1.qty / 2n, 478));
  });
  it('E-106 (2): the FDL leg of CB:<b> FX fills moves cb.reserves.fdl (EUNFDL BUY −notional, SELL +notional; FDL<X> BUY +qty, SELL −qty; bonds 0)', () => {
    const rs = { fdl: M(1000), gold: 0n, otherFx: {} };
    const w = cbWorld([cbRow('FDL'), cbRow('EUN', { reserves: rs, qe: qe() } as Partial<CentralBank>), cbRow('SRL', { reserves: rs, qe: qe() } as Partial<CentralBank>)], t0 + 62);
    const f: Record<string, { assetId: string; side: 'BUY' | 'SELL'; qty: bigint; notional: bigint }[]> = {
      'CB:EUN': [{ assetId: 'ast_FX_EUNFDL', side: 'BUY', qty: M(10), notional: M(11) }, { assetId: 'ast_FX_EUNFDL', side: 'SELL', qty: M(1), notional: M(2) }],
      'CB:SRL': [{ assetId: 'ast_FX_FDLSRL', side: 'SELL', qty: M(7), notional: M(35) }, { assetId: 'ast_FX_FDLSRL', side: 'BUY', qty: M(3), notional: M(15) },
        { assetId: 'g10', side: 'BUY', qty: M(50), notional: M(50) }] };
    const d = ports(null);
    applyPoolFills(w.ctx, { ...d, markets: { ...d.markets, poolFills: (_s, t, id) => (t === t0 + 61 ? (f[id] ?? []).map((x) => ({ ...x, ccy: 'FDL' as const })) : []) } } as MacroPorts);
    expect(resFdl(w, 'EUN')).toBe(M(1000) - M(11) + M(2));
    expect(resFdl(w, 'SRL')).toBe(M(1000) - M(7) + M(3));
    expect(resFdl(w, 'FDL')).toBeUndefined();
  });
  it('weekend and pre-open ticks write no QE orders; extra orders are written as handed in', () => {
    const w = setup();
    w.setTick(5 * TICKS_PER_GAME_DAY + 100);
    expect(writePoolOrders(w.ctx, ports(null))).toEqual([]);
    w.setTick(t0 + 30);
    const x = { id: 'fx1', poolId: 'CB:EUN', assetId: 'fx', side: 'SELL', qty: 5n, tif: 'TICK', tick: 0, purpose: 'FX_BAND' } as NpcPoolOrder;
    expect(writePoolOrders(w.ctx, ports(null), [x])).toEqual([{ ...x, tick: t0 + 30 }]);
  });
});

describe('T04-09 swap lines', () => {
  const world = (basis: number | null, fsi = 0.2, lines: CentralBank['swapLinesOut'] = []): ReturnType<typeof cbWorld> => {
    const xs = (['EUN', 'PYN', 'NKR', 'SRL'] as const).map((b) => cbRow(b, { reserves: { fdl: M(1000), gold: 0n, otherFx: {} } } as Partial<CentralBank>));
    const w = cbWorld([cbRow('FDL', { policyRate: 0.03, swapLinesOut: lines }), ...xs], 1000);
    w.put(macroTables.bloc.name, { id: 'EUN', nominalGdp: M(20e12) } as never);
    w.put(macroTables.global.name, { id: 'GLOBAL', financialStressIndex: fsi } as never);
    if (basis !== null) w.put(macroTables.curve.name, { id: 'EUN', basis } as never);
    return w;
  };
  const p = (): MacroPorts => { const d = stubPorts(); return { ...d, markets: { ...d.markets, fxSpot: (_s, c) => (c === 'EUN' ? 1.1 : null) } } as MacroPorts; };
  it('limit for EUN at GDP 20e12 and spot 1.1 = 660e9 FDL; codes declared TRANSFER', () => {
    expect(swapLineLimit(M(20e12), 1.1)).toBe(M(660e9));
    expect(MACRO_EXTENSION_CODES_SWAP.map((c) => [c.code, c.cls, c.template])).toEqual([
      ['CBK_SWAP_LINE_DRAW', 'TRANSFER', 'FX'], ['CBK_SWAP_LINE_REPAY', 'TRANSFER', 'FX'], ['CBK_SWAP_LINE_INTEREST', 'TRANSFER', 'PAY']]);
  });
  it('activation at basis −0.0041 (not −0.004); off after 10 calm trading days with zero drawn', () => {
    const w = world(-0.0041);
    swapLineStep(w.ctx, p());
    const eun = (): CentralBank['swapLinesOut'][number] | undefined => fdl(w).swapLinesOut.find((l) => l.counterpartyCbk === cbkId('EUN'));
    expect(eun()).toMatchObject({ active: true, limit: M(660e9), calmDays: 0 });
    w.put(macroTables.curve.name, { id: 'EUN', basis: -0.004 } as never);
    for (let k = 1; k <= 9; k++) { swapLineStep(w.ctx, p()); expect(eun()).toMatchObject({ active: true, calmDays: k }); }
    swapLineStep(w.ctx, p());
    expect(eun()!.active).toBe(false);
    expect(w.events.map((e) => (e.payload as { tool: string; bloc: string }).tool)).toEqual(['SWAPLINE_ON', 'SWAPLINE_OFF']);
    const v = world(-0.004);
    swapLineStep(v.ctx, p());
    expect(fdl(v).swapLinesOut.find((l) => l.counterpartyCbk === cbkId('EUN'))).toBeUndefined();
  });
  it('drawn line stays on; SRL needs an ACTIVE Concord program; FSI > 0.6 activates', () => {
    const w = world(-0.001, 0.2, [{ counterpartyCbk: cbkId('EUN'), limit: 1n, spread: 0.0025, active: true, drawn: M(5), calmDays: 20 }]);
    swapLineStep(w.ctx, p());
    expect(fdl(w).swapLinesOut[0]).toMatchObject({ active: true, drawn: M(5) });
    expect(w.posts[0]).toMatchObject({ op: 'pay', from: cbkId('EUN'), to: cbkId('FDL'), ccy: 'FDL', code: 'CBK_SWAP_LINE_INTEREST' });
    expect(w.posts[0]!.amt).toBeGreaterThan(0n);
    expect(resFdl(w, 'EUN')).toBe(M(1000) - w.posts[0]!.amt);   // E-106 (2): interest mirrored on the borrowing cbk
    const v = world(null, 0.61);
    swapLineStep(v.ctx, p());
    expect(fdl(v).swapLinesOut.filter((l) => l.active).map((l) => l.counterpartyCbk)).toEqual([cbkId('EUN'), cbkId('PYN'), cbkId('NKR')]);
    v.put(macroTables.csf.name, { id: 'npc_CSF', programs: [{ bloc: 'SRL', startTick: 0, endTick: 5000 }] } as never);
    swapLineStep(v.ctx, p());
    expect(fdl(v).swapLinesOut.find((l) => l.counterpartyCbk === cbkId('SRL'))?.active).toBe(true);
  });
  it('rate = FDL OIS(1/364) + 0.0025 (flat curve → i + 0.0025)', () => {
    expect(swapLineRate(world(null).ctx.store)).toBeCloseTo(0.0325, 12);
  });
  it('draw within limit posts fx FDL → X at amount ÷ spot; over limit refused; repay clipped to drawn', () => {
    const w = world(null, 0.2, [{ counterpartyCbk: cbkId('EUN'), limit: M(100), spread: 0.0025, active: true, drawn: 0n, calmDays: 0 }]);
    w.ctx.send(cbkId('EUN'), 'mac.swap.draw', { bloc: 'EUN', amount: String(M(110)) }, 'NEXT');
    w.ctx.send(cbkId('EUN'), 'mac.swap.draw', { bloc: 'EUN', amount: String(M(101)) }, 'NEXT');
    w.ctx.send(cbkId('EUN'), 'mac.swap.repay', { bloc: 'EUN', amount: String(M(500)) }, 'NEXT');
    w.deliver();
    w.put(macroTables.cb.name, { ...fdl(w), swapLinesOut: [{ ...fdl(w).swapLinesOut[0]!, limit: M(110) }] } as never);
    handleSwapDraws(w.ctx, p());
    expect(w.posts.map((x) => [x.from, x.to, x.ccy, x.amt, x.code])).toEqual([
      [cbkId('FDL'), cbkId('EUN'), 'FDL', M(110), 'CBK_SWAP_LINE_DRAW'], [cbkId('EUN'), cbkId('FDL'), 'EUN', M(100), 'CBK_SWAP_LINE_DRAW'],
      [cbkId('EUN'), cbkId('FDL'), 'EUN', M(100), 'CBK_SWAP_LINE_REPAY'], [cbkId('FDL'), cbkId('EUN'), 'FDL', M(110), 'CBK_SWAP_LINE_REPAY']]);
    expect(fdl(w).swapLinesOut[0]!.drawn).toBe(0n);
    // E-106 (2) mirror, as posted: DRAW +110 and REPAY +110 FDL into cbk_EUN (the REPAY template's FDL leg runs cbk_FDL → cbk_EUN)
    expect(resFdl(w, 'EUN')).toBe(M(1000) + M(220));
    expect(resFdl(w, 'FDL')).toBeUndefined();
  });
});

describe('T04-09 reserve managers and remittance', () => {
  it("reserveTargets('FDL') = EUN 0.5, GOLD 0.25, NKR 0.125, PYN 0.125; 'SRL' = the table", () => {
    expect(reserveTargets('FDL')).toEqual({ FDL_BONDS: 0, EUN_BONDS: 0.5, GOLD: 0.25, NKR_BONDS: 0.125, PYN_BONDS: 0.125 });
    expect(reserveTargets('SRL')).toEqual({ ...RESERVE_TARGET });
    expect(reserveTargets('EUN')).toEqual({ FDL_BONDS: 0.75, EUN_BONDS: 0, GOLD: 0.125, NKR_BONDS: 0.0625, PYN_BONDS: 0.0625 });
  });
  it('income 5,000,000 and expenses 2,000,000 post 3,000,000 CBK_PROFIT_REMITTANCE; a loss posts nothing', () => {
    acc.rows = [{ key: 'a4', code: 4100 }, { key: 'a5', code: 5100 }, { key: 'a1', code: 1100 }];
    acc.net = { a4: -M(5_000_000), a5: M(2_000_000), a1: M(9) };
    const w = cbWorld([cbRow('EUN')], 91 * 720);
    expect(remitProfit(w.ctx, 'EUN')).toBe(M(3_000_000));
    expect(w.posts).toEqual([{ op: 'pay', from: cbkId('EUN'), to: govId('EUN'), amt: M(3_000_000), ccy: 'EUN', code: 'CBK_PROFIT_REMITTANCE' }]);
    acc.net = { a4: -M(1), a5: M(2) };
    const v = cbWorld([cbRow('EUN')], 91 * 720);
    expect(remitProfit(v.ctx, 'EUN')).toBe(0n);
    expect(v.posts).toEqual([]);
  });
});
