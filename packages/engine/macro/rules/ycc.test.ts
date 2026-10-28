// T04-09 ycc: 04#20 on the market stub, start streak, exit raises, edge 20.
import { describe, expect, it } from 'vitest';
import { dmath, sessionState, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { cbRow, cbWorld, M, stubPorts } from '../testkit/cbWorld';
import { createMarketStub } from '../testing/marketStub';
import { macroTables, type AssetPurchaseProgram, type CentralBank, type HookCall } from '../schema';
import type { MacroPorts } from '../ports';
import { applyPoolFills, writePoolOrders } from './poolOrders';
import { yccAtMeeting, yccBid, yccDayClose, yccExitStep, yccStartCheck } from './ycc';

const qe: AssetPurchaseProgram = { state: 'NONE', purchasesPerMonth: 0n, eligible: { govBonds: 1, corpIG: 0, abs: 0 }, holdingsCapGdp: 0.35, qtRunoffCapPerMonth: 0.015 };
const cbOf = (w: ReturnType<typeof cbWorld>): CentralBank => w.ctx.store.get<CentralBank>(macroTables.cb.name, cbkId('PYN'))!;
const priceOfYield = (y: number): number => 100 * dmath.exp(-10 * y), yieldOfPrice = (p: number): number => -dmath.ln(p / 100) / 10;
const CAP = 0.005, FACE = M(1e14), ADV = M(1e9);

function run(startPos: bigint, days: number): { closes: number[]; w: ReturnType<typeof cbWorld> } {
  const w = cbWorld([cbRow('PYN', { policyRate: 0, qe, yccRaises: 0, yccHighInflDays: 0, ycc10Streak: 0, ycc: { tenorYears: 10, capYield: CAP, active: true, startedTick: 0 } })], 0);
  w.put(macroTables.bloc.name, { id: 'PYN', nominalGdp: M(1e15) } as never);
  const key = `${cbkId('PYN')}:pyn10`;
  w.qty[key] = startPos;
  const m = createMarketStub({ assetId: 'pyn10', y0: CAP - 0.0005, driftPerTick: 0.0001, sellFlowPerTick: ADV, priceOfYield, yieldOfPrice });
  const d = stubPorts();
  const p = { ...d, markets: { ...d.markets, lineAdv: () => m.adv(), fairPriceOf: () => m.fairPrice(), makerHalfSpread: () => null, poolFills: (_s, t, id) => m.poolFills(t, id) },
    assets: { ...d.assets, priceFromYield: (_s, _a, y) => priceOfYield(y),
      sovereignLines: (_s, g) => (g === 'gov_PYN' || g.endsWith('PYN') ? [{ assetId: 'pyn10', tenor: 'N10Y', couponRate: 0, maturityTick: 10 * 364 * 720, faceOutstanding: FACE, onTheRun: true, inflationLinked: false, fxDenominated: false }] : []) } } as MacroPorts;
  const closes: number[] = [];
  for (let tick = 0; tick < days * TICKS_PER_GAME_DAY; tick++) {
    w.setTick(tick);
    applyPoolFills(w.ctx, p);
    const orders = writePoolOrders(w.ctx, p);
    if (sessionState('BLOC_LISTED', tick, { bloc: 'PYN', holidayFxDepthMult: 1 }).state !== 'CONTINUOUS') continue;
    for (const f of m.step(tick, orders)) w.qty[key] = (w.qty[key] ?? 0n) + f.qty;
    if (tick % TICKS_PER_GAME_DAY === 539) closes.push(m.yield());
  }
  return { closes, w };
}

describe('T04-09 04#20 YCC on the market stub', () => {
  it('run A, ample capacity: every closing yield ≤ cap + 2 bp for 20 game days; no pressure hook', () => {
    const { closes, w } = run(0n, 20);
    expect(closes.length).toBeGreaterThan(10);
    for (const y of closes) expect(y).toBeLessThanOrEqual(CAP + 0.0002);
    expect(w.rows(macroTables.hookCall.name)).toEqual([]);
  });
  it('run B, line cap room nearly used: once capacity hits 0 the close exceeds cap + 2 bp; exactly one WIRE_ITEM ycc_under_pressure', () => {
    const { closes, w } = run(FACE / 2n - 30n * ADV, 3);
    expect(closes.some((y) => y > CAP + 0.0002)).toBe(true);
    const hooks = w.rows(macroTables.hookCall.name) as HookCall[];
    expect(hooks.map((h) => [h.owner, h.hook, h.args, h.worldEventId])).toEqual([['16', 'WIRE_ITEM', { key: 'ycc_under_pressure', bloc: 'PYN' }, `ycp_PYN_${Math.floor(hooks[0]!.createdTick / 720)}`]]);
    expect(hooks[0]!.worldEventId).toMatch(/^ycp_[A-Z]{3}_\d+$/);   // AC-04-18-HOOKID (1)
    expect(w.qty[`${cbkId('PYN')}:pyn10`]).toBe(FACE / 2n);
  });
  it('bid = 2 × ADV, shrinks to capacity, none at zero capacity or when YCC is off', () => {
    const w = cbWorld([cbRow('PYN', { qe, ycc: { tenorYears: 10, capYield: CAP, active: true, startedTick: 0 } })], 0);
    const d = stubPorts();
    const p = { ...d, markets: { ...d.markets, lineAdv: () => 1000 }, assets: { ...d.assets, priceFromYield: () => 95,
      sovereignLines: () => [{ assetId: 'pyn10', tenor: 'N10Y', couponRate: 0, maturityTick: 1e9, faceOutstanding: FACE, onTheRun: true, inflationLinked: false, fxDenominated: false }] } } as MacroPorts;
    expect(yccBid(w.ctx.store, 'PYN', p, 10_000n)).toMatchObject({ side: 'BUY', qty: 2000n, limitPrice: M(0.95), tif: 'RESTING', purpose: 'YCC', poolId: 'CB:PYN' });
    expect(yccBid(w.ctx.store, 'PYN', p, 1500n)?.qty).toBe(1500n);
    expect(yccBid(w.ctx.store, 'PYN', p, 0n)).toBeNull();
    w.put(macroTables.cb.name, cbRow('PYN', { qe, ycc: null }));
    expect(yccBid(w.ctx.store, 'PYN', p, 10_000n)).toBeNull();
  });
});

describe('T04-09 YCC start and exit', () => {
  it('i = elb = 0 and y10 − i = 0.011 for 9 trading days → no start; the 10th starts with cap 0.005 (YCC_START)', () => {
    const w = cbWorld([cbRow('PYN', { policyRate: 0, qe, ycc: null, ycc10Streak: 0, yccHighInflDays: 0, yccRaises: 0 })], 0);
    for (let k = 1; k <= 9; k++) { yccDayClose(w.ctx, 'PYN', 0, 0.011, 0.02, 0.025); expect(cbOf(w).ycc).toBeNull(); expect(cbOf(w).ycc10Streak).toBe(k); }
    yccDayClose(w.ctx, 'PYN', 0, 0.011, 0.02, 0.025);
    expect(cbOf(w).ycc).toMatchObject({ capYield: 0.005, active: true });
    expect(w.events).toEqual([{ kind: 'macro.cb.tool', subjectIds: [cbkId('PYN')], payload: { bloc: 'PYN', tool: 'YCC_START', params: { capYield: 0.005 } }, vis: 'PUBLIC' }]);
  });
  it('streak resets on a day with y10 − i ≤ 0.01 or i above elb; non-YCC bloc never starts', () => {
    const cb = cbRow('PYN', { ycc: null });
    expect(yccStartCheck(cb, 0, 0, 0.011, 8)).toEqual({ start: false, streak: 9 });
    expect(yccStartCheck(cb, 0, 0, 0.01, 8)).toEqual({ start: false, streak: 0 });
    expect(yccStartCheck(cb, 0.001, 0, 0.02, 8)).toEqual({ start: false, streak: 0 });
    const w = cbWorld([cbRow('EUN', { policyRate: 0, qe, ycc: null, ycc10Streak: 9, yccHighInflDays: 0, yccRaises: 0 })], 0);
    yccDayClose(w.ctx, 'EUN', 0, 0.02, 0, 0.02);
    expect(w.events).toEqual([]);
  });
  it('63 trading days of π_core > π* + 0.005 → RAISE 0.0025 at the meeting, twice, then REMOVE; removal at the cap costs −0.10 credibility', () => {
    const y = { tenorYears: 10 as const, capYield: CAP, active: true, startedTick: 0 };
    expect(yccExitStep(cbRow('PYN', { ycc: y, yccRaises: 0 }), 0.031, 0.025, 62).action).toBe('NONE');
    expect(yccExitStep(cbRow('PYN', { ycc: y, yccRaises: 0 }), 0.03, 0.025, 63).action).toBe('NONE');
    const w = cbWorld([cbRow('PYN', { qe, credibility: 0.8, ycc: y, yccRaises: 0, yccHighInflDays: 63, ycc10Streak: 0 })], 0);
    expect(yccAtMeeting(w.ctx, 'PYN', 0.031, 0.025, true)).toBe('RAISE');
    expect(cbOf(w).ycc?.capYield).toBe(0.0075);
    expect(yccAtMeeting(w.ctx, 'PYN', 0.031, 0.025, true)).toBe('RAISE');
    expect(cbOf(w).ycc?.capYield).toBe(0.01);
    expect(yccAtMeeting(w.ctx, 'PYN', 0.031, 0.025, true)).toBe('REMOVE');
    expect(cbOf(w)).toMatchObject({ ycc: null, yccRaises: 0 });
    expect(cbOf(w).credibility).toBeCloseTo(0.7, 12);
    expect(w.events.map((e) => (e.payload as { tool: string }).tool)).toEqual(['YCC_RAISE', 'YCC_RAISE', 'YCC_END']);
    const v = cbWorld([cbRow('PYN', { qe, credibility: 0.8, ycc: y, yccRaises: 2, yccHighInflDays: 63, ycc10Streak: 0 })], 0);
    yccAtMeeting(v.ctx, 'PYN', 0.031, 0.025, false);
    expect(cbOf(v).credibility).toBe(0.8);
  });
});
