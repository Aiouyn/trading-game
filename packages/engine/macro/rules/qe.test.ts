// T04-09 qe: 04#19 and the card's size / mix / taper / QT numbers.
import { describe, expect, it, vi } from 'vitest';
import { MICRO_N, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { cbkId } from '@tycoon/engine-ledger';
import { cbRow, cbWorld, M, stubPorts } from '../testkit/cbWorld';
import { macroTables, type AssetPurchaseProgram, type CentralBank } from '../schema';
import type { MacroPorts } from '../ports';
import { termPremium10 } from './curves';
import { dailyProgram, holdingsOf, lineCapRoom, purchasesSize, qeDecision, runoffOfDay, tradingDaysLeftInMonth } from './qe';

vi.mock('./t03Stubs', () => ({ effectiveMark: () => null }));
const Y = 364 * TICKS_PER_GAME_DAY;
const qe = (o: Partial<AssetPurchaseProgram> = {}): AssetPurchaseProgram =>
  ({ state: 'NONE', purchasesPerMonth: 0n, eligible: { govBonds: 1, corpIG: 0, abs: 0 }, holdingsCapGdp: 0.35, qtRunoffCapPerMonth: 0.015, ...o });
type Line = { assetId: string; face: bigint; mat: number };
function ports(lines: Line[], px: Record<string, bigint> = {}): MacroPorts {
  const p = stubPorts();
  return { ...p, markets: { ...p.markets, fairPriceOf: (_s, a) => px[a] ?? MICRO_N },
    assets: { ...p.assets, qeEligibleLines: () => [],
      sovereignLines: () => lines.map((l) => ({ assetId: l.assetId, tenor: 'N10Y', couponRate: 0.03, maturityTick: l.mat, faceOutstanding: l.face, onTheRun: false, inflationLinked: false, fxDenominated: false })) } } as MacroPorts;
}
const X = { i: 0, iStar: -0.015, elb: 0, rStarCb: 0.005, target: 0.02, fsi: 0.2, lowDepthDays: 0, nominalGdp: M(32e12), holdingsGdp: 0, securitizationCrisis: false, bloc: 'FDL' as const };

describe('T04-09 QE size and mix', () => {
  it('elb 0, i* −0.015, GDP 32e12 → 120e9 per month; 20 trading days of 28 → 6e9 per day at the start', () => {
    expect(purchasesSize(0, -0.015, M(32e12), false)).toBe(M(120e9));
    expect(tradingDaysLeftInMonth('FDL', 0)).toBe(20);
    expect(M(120e9) / 20n).toBe(M(6e9));
  });
  // Decision: the card's row "i* −0.05 → capped 480e9" contradicts its own formula (0.0025 × 5 = 0.0125 → 400e9); the formula holds,
  // and the cap is shown at i* −0.07 (0.0175 → 0.015).
  it('i* −0.05 → 400e9 by the formula; i* −0.07 → capped at 0.015 × GDP = 480e9; dysfunction floor 160e9; tiny gap → 0.0025 floor', () => {
    expect(purchasesSize(0, -0.05, M(32e12), false)).toBe(M(400e9));
    expect(purchasesSize(0, -0.07, M(32e12), false)).toBe(M(480e9));
    expect(purchasesSize(0, 0.01, M(32e12), true)).toBe(M(160e9));
    expect(purchasesSize(0, -0.006, M(32e12), false)).toBe(M(80e9));
  });
  it('ELB start, mix 0.8/0.2 at FSI 0.55, ABS 0.1 out of corpIG in a securitization crisis', () => {
    const cb = cbRow('FDL', { qe: qe() });
    expect(qeDecision(cb, { ...X, fsi: 0.5 })).toMatchObject({ state: 'QE', reason: 'QE_START', mode: 'ELB', purchasesPerMonth: M(120e9), eligible: { govBonds: 1, corpIG: 0, abs: 0 } });
    expect(qeDecision(cb, { ...X, fsi: 0.55 }).eligible).toEqual({ govBonds: 0.8, corpIG: 0.2, abs: 0 });
    expect(qeDecision(cb, { ...X, fsi: 0.55, securitizationCrisis: true }).eligible).toEqual({ govBonds: 0.8, corpIG: 0.1, abs: 0.1 });
    expect(qeDecision(cb, { ...X, iStar: -0.005 }).state).toBe('NONE');   // needs i* < elb − 0.005
    expect(qeDecision(cb, { ...X, i: 0.001 }).state).toBe('NONE');        // needs i = elb
  });
  it('DYSFUNCTION: FSI > 0.6 and 3 low-depth days, rate above elb', () => {
    const cb = cbRow('FDL', { qe: qe() });
    expect(qeDecision(cb, { ...X, i: 0.03, iStar: 0.03, fsi: 0.61, lowDepthDays: 3 })).toMatchObject({ state: 'QE', mode: 'DYSFUNCTION', purchasesPerMonth: M(160e9) });
    expect(qeDecision(cb, { ...X, i: 0.03, iStar: 0.03, fsi: 0.61, lowDepthDays: 2 }).state).toBe('NONE');
    expect(qeDecision(cb, { ...X, i: 0.03, iStar: 0.03, fsi: 0.6, lowDepthDays: 3 }).state).toBe('NONE');
  });
});

describe('T04-09 taper, hold, QT', () => {
  it('QE with i* = elb + 0.003 → HOLD; i* = elb + 0.002 stays QE', () => {
    const cb = cbRow('FDL', { qe: qe({ state: 'QE', purchasesPerMonth: M(1) }) });
    expect(qeDecision(cb, { ...X, iStar: 0.003 })).toMatchObject({ state: 'HOLD', reason: 'QE_HOLD', purchasesPerMonth: 0n });
    expect(qeDecision(cb, { ...X, iStar: 0.002 }).state).toBe('QE');
  });
  it('HOLD → QT exactly at i = r*_cb + π* − 0.005 with holdings; not below, not without holdings; QT with none left → NONE', () => {
    const cb = cbRow('FDL', { qe: qe({ state: 'HOLD' }) }), q = { ...X, i: 0.02, iStar: 0.02, holdingsGdp: 0.1 };
    expect(qeDecision(cb, q)).toMatchObject({ state: 'QT', reason: 'QT_START' });
    expect(qeDecision(cb, { ...q, i: 0.0199 }).state).toBe('HOLD');
    expect(qeDecision(cb, { ...q, holdingsGdp: 0 }).state).toBe('HOLD');
    expect(qeDecision(cbRow('FDL', { qe: qe({ state: 'QT' }) }), { ...q, holdingsGdp: 0 }).state).toBe('NONE');
  });
  it('QT: 10e9 maturing on 400e9 holdings → runoff 6e9 (0.015 cap), reinvest 4e9; HOLD reinvests all', () => {
    const day = 7, tick = day * TICKS_PER_GAME_DAY;
    const lines: Line[] = [{ assetId: 'b_mat', face: M(100e9), mat: tick + 100 }, { assetId: 'b_long', face: M(2000e9), mat: tick + 5 * Y }];
    for (const state of ['QT', 'HOLD'] as const) {
      const w = cbWorld([cbRow('FDL', { qe: qe({ state }) })], tick);
      w.put(macroTables.bloc.name, { id: 'FDL', nominalGdp: M(32e12) } as never);
      const pos = (a: string): bigint => (a === 'b_mat' ? M(10e9) : a === 'b_long' ? M(390e9) : 0n);
      const p = ports(lines), rows = dailyProgram(w.ctx.store, 'FDL', day, p, pos);
      expect(holdingsOf(w.ctx.store, 'FDL', p, pos, tick).total).toBe(M(400e9));
      expect(rows).toEqual([{ assetId: 'b_long', side: 'BUY', face: state === 'QT' ? M(4e9) : M(10e9) }]);
      expect(runoffOfDay(w.ctx.store, 'FDL', day, p, pos)).toBe(state === 'QT' ? M(6e9) : 0n);
    }
  });
  it('PYN QT sells ≤ 0.005 × holdings per month spread over the days left; FDL sells nothing', () => {
    const day = 7, tick = day * TICKS_PER_GAME_DAY, lines: Line[] = [{ assetId: 'b1', face: M(2000e9), mat: tick + 5 * Y }];
    for (const b of ['PYN', 'FDL'] as const) {
      const w = cbWorld([cbRow(b, { qe: qe({ state: 'QT', month: { start: 0, bought: 0n, sold: 0n, runoff: 0n } }) })], tick);
      w.put(macroTables.bloc.name, { id: b, nominalGdp: M(32e12) } as never);
      const rows = dailyProgram(w.ctx.store, b, day, ports(lines), () => M(400e9));
      const left = tradingDaysLeftInMonth(b, day);
      expect(rows).toEqual(b === 'PYN' ? [{ assetId: 'b1', side: 'SELL', face: M(2e9) / BigInt(left) }] : []);
    }
  });
});

describe('T04-09 04#19: QE of 10% of GDP lowers TP10 by 25 bp; CB ≤ 50% of any line', () => {
  it('termPremium10 qeHoldingsGdp 0.10 vs 0 differs by −0.0025', () => {
    const base = { b: 'FDL' as const, piE5: 0.02, target: 0.02, debtGdp: 1.0, dStar: 1.0, qeHoldingsGdp: 0, fear: 50, shockSum: 0 };
    expect(termPremium10({ ...base, qeHoldingsGdp: 0.1 }) - termPremium10(base)).toBeCloseTo(-0.0025, 12);
  });
  it('120 game days of 0.015 × GDP: every line ≤ 50% of face after every day (the small 2% line saturates at exactly 50%), total ≤ 0.35 × GDP', () => {
    const gdp = M(32e12), big = M(400e9), lines: Line[] = ['g1', 'g2', 'g3', 'g4'].map((id) => ({ assetId: id, face: big, mat: 200 * TICKS_PER_GAME_DAY + 10 * Y }));
    lines.push({ assetId: 'g5', face: (4n * big * 2n) / 98n, mat: 200 * TICKS_PER_GAME_DAY + 10 * Y });
    const w = cbWorld([cbRow('FDL', { qe: qe({ state: 'QE', purchasesPerMonth: (gdp * 15n) / 1000n }) })], 0);
    w.put(macroTables.bloc.name, { id: 'FDL', nominalGdp: gdp } as never);
    const pos: Record<string, bigint> = {}, p = ports(lines), position = (a: string): bigint => pos[a] ?? 0n;
    let buys = 0;
    for (let d = 0; d < 120; d++) {
      const cb = w.ctx.store.get<CentralBank>(macroTables.cb.name, cbkId('FDL'))!;
      const ms = d - (d % 91) + (d % 91 < 28 ? 0 : d % 91 < 56 ? 28 : 56);
      const month = cb.qe.month?.start === ms ? cb.qe.month : { start: ms, bought: 0n, sold: 0n, runoff: 0n };
      let bought = month.bought;
      for (const r of dailyProgram(w.ctx.store, 'FDL', d, p, position)) { pos[r.assetId] = position(r.assetId) + r.face; bought += r.face; buys++; }
      w.put(macroTables.cb.name, { ...cb, qe: { ...cb.qe, month: { ...month, bought } } } as never);
      let tot = 0n;
      for (const l of lines) { expect(position(l.assetId) * 2n).toBeLessThanOrEqual(l.face); tot += position(l.assetId); }
      expect(tot * 100n).toBeLessThanOrEqual(gdp * 35n);
    }
    expect(buys).toBeGreaterThan(0);
    for (const l of lines) expect(lineCapRoom(position(l.assetId), l.face)).toBe(0n);
    expect(pos['g5']).toBe(lines[4]!.face / 2n);
  });
  it('the 0.35 × GDP holdings cap clips the day: 1e9 of room left buys exactly 1e9 at par', () => {
    const gdp = M(1e12), lines: Line[] = [{ assetId: 'g1', face: M(2e12), mat: 10 * Y }];
    const w = cbWorld([cbRow('FDL', { qe: qe({ state: 'QE', purchasesPerMonth: M(120e9) }) })], 0);
    w.put(macroTables.bloc.name, { id: 'FDL', nominalGdp: gdp } as never);
    expect(dailyProgram(w.ctx.store, 'FDL', 0, ports(lines), () => M(349e9))).toEqual([{ assetId: 'g1', side: 'BUY', face: M(1e9) }]);
  });
});
