import { describe, expect, it, vi } from 'vitest';
import { cbkId } from '@tycoon/engine-ledger';
import { macroTables, type BlocId, type CentralBank } from '../schema';
import { cbRow, cbWorld, M, stubPorts } from '../testkit/cbWorld';
import { corridorOf, setCorridor } from './corridor';
import { adjustRr, iorSplit, postInterestOnReserves, requiredReserves, reservePenalty, reservePenaltyRate } from './reserves';
import { putFact } from './t03Stubs';

vi.mock('./t03Stubs', () => ({ putFact: vi.fn() }));
const cbOf = (w: ReturnType<typeof cbWorld>, b: BlocId = 'FDL'): CentralBank => w.rows(macroTables.cb.name).find((c) => (c as CentralBank).id === cbkId(b)) as CentralBank;

describe('§3.8.2 IOR (04#41)', () => {
  it('04#41 IOR above 3× required is paid at the deposit rate', () => {
    const s = iorSplit(M(500e6), M(100e6), 3, 0.03, 0.0275);
    expect(s).toEqual({ tierBase: M(300e6), excess: M(200e6), tierInterest: 24_725_274_725n, excessInterest: 15_109_890_110n });
    expect(iorSplit(M(500e6), M(100e6), 5, 0.03, 0.0275).tierInterest).toBe(41_208_791_209n); // whole balance at i
    expect(s.tierInterest + s.excessInterest).not.toBe(41_208_791_209n);
    expect(iorSplit(M(200e6), M(100e6), 3, 0.03, 0.0275)).toMatchObject({ tierBase: M(200e6), excess: 0n });
  });
  it('world bank → two CBK_IOR_W pays from the cbk; player bank → two CBK_IOR_P mints; sorted ids; null reserves skipped', () => {
    const w = cbWorld([cbRow('FDL')]);
    const r = { balance: M(500e6), required: M(100e6) };
    postInterestOnReserves(w.ctx, 'FDL', stubPorts({ chartered: ['bnk_w', 'bnk_p', 'bnk_none'], reserves: { bnk_w: r, bnk_p: r }, players: ['bnk_p'] }));
    expect(w.posts).toEqual([
      { op: 'mint', to: 'bnk_p', amt: 24_725_274_725n, ccy: 'FDL', code: 'CBK_IOR_P' }, { op: 'mint', to: 'bnk_p', amt: 15_109_890_110n, ccy: 'FDL', code: 'CBK_IOR_P' },
      { op: 'pay', from: 'cbk_FDL', to: 'bnk_w', amt: 24_725_274_725n, ccy: 'FDL', code: 'CBK_IOR_W' }, { op: 'pay', from: 'cbk_FDL', to: 'bnk_w', amt: 15_109_890_110n, ccy: 'FDL', code: 'CBK_IOR_W' }]);
  });
  it('edge 2: EUN negative rates → charges (burn for a player bank, pay to the cbk for a world bank)', () => {
    const s = iorSplit(M(500e6), M(100e6), 3, -0.0025, -0.005);
    expect([s.tierInterest, s.excessInterest]).toEqual([-2_060_439_560n, -2_747_252_747n]);
    const w = cbWorld([cbRow('EUN', { policyRate: -0.0025, facilities: { lendingRate: 0, depositRate: -0.005, collateralHaircuts: {}, elaPenaltySpread: 0.015, maxTermDays: 7 } })]);
    const r = { balance: M(500e6), required: M(100e6) };
    postInterestOnReserves(w.ctx, 'EUN', stubPorts({ chartered: ['bnk_p', 'bnk_w'], reserves: { bnk_p: r, bnk_w: r }, players: ['bnk_p'] }));
    expect(w.posts.map((p) => [p.op, p.from ?? '', p.to ?? '', p.amt, p.code])).toEqual([
      ['burn', 'bnk_p', '', 2_060_439_560n, 'CBK_NEGATIVE_RATE_CHARGE_P'], ['burn', 'bnk_p', '', 2_747_252_747n, 'CBK_NEGATIVE_RATE_CHARGE_P'],
      ['pay', 'bnk_w', 'cbk_EUN', 2_060_439_560n, 'CBK_NEGATIVE_RATE_CHARGE_W'], ['pay', 'bnk_w', 'cbk_EUN', 2_747_252_747n, 'CBK_NEGATIVE_RATE_CHARGE_W']]);
  });
  it('edge 18: credit = null → nothing; zero parts post nothing', () => {
    const w = cbWorld([cbRow('FDL')]);
    postInterestOnReserves(w.ctx, 'FDL', stubPorts({ credit: false }));
    postInterestOnReserves(w.ctx, 'FDL', stubPorts({ chartered: ['bnk_z'], reserves: { bnk_z: { balance: 0n, required: 0n } } }));
    expect(w.posts).toEqual([]);
  });
});

describe('§3.8.2 requirement and penalty', () => {
  it('requiredReserves = rr × eligible (half-even); penalty 1,442.307692; rate = lendingRate + 0.02', () => {
    expect(requiredReserves(0.05, M(1e6))).toBe(M(50_000));
    expect(requiredReserves(0.01, 150n)).toBe(2n);
    expect(reservePenalty(M(10e6), 0.0325)).toBe(1_442_307_692n);
    expect(reservePenaltyRate(cbWorld([cbRow('FDL')]).ctx.store, 'FDL')).toBeCloseTo(0.0525, 12);
  });
  it('adjustRr: SRL only; DEFENCE +0.02 to the 0.20 cap; EASING once per quarter, floor at macro_rr_srl; RR_CHANGE emitted', () => {
    const w = cbWorld([cbRow('SRL', { reserveRequirement: 0.1 }), cbRow('FDL')]);
    expect(adjustRr(w.ctx, 'FDL', 'DEFENCE')).toBe(false);
    const seq: number[] = [];
    for (let k = 0; k < 6; k++) { adjustRr(w.ctx, 'SRL', 'DEFENCE'); seq.push(cbOf(w, 'SRL').reserveRequirement); }
    expect(seq).toEqual([0.12, 0.14, 0.16, 0.18, 0.2, 0.2]);
    expect(adjustRr(w.ctx, 'SRL', 'DEFENCE')).toBe(false);
    expect(w.events.filter((e) => e.kind === 'macro.cb.tool')).toHaveLength(5);
    expect(w.events[0]).toEqual({ kind: 'macro.cb.tool', subjectIds: ['cbk_SRL'], payload: { bloc: 'SRL', tool: 'RR_CHANGE', params: { rr: 0.12, reason: 'DEFENCE' } }, vis: 'PUBLIC' });
    expect(adjustRr(w.ctx, 'SRL', 'EASING')).toBe(true);
    expect(adjustRr(w.ctx, 'SRL', 'EASING')).toBe(false);
    expect(cbOf(w, 'SRL').reserveRequirement).toBe(0.18);
    w.setTick(w.ctx.tick + 91 * 720);
    expect(adjustRr(w.ctx, 'SRL', 'EASING')).toBe(true);
    expect(cbOf(w, 'SRL').reserveRequirement).toBe(0.16);
    const f = cbWorld([cbRow('SRL', { reserveRequirement: 0.11 })]);
    expect(adjustRr(f.ctx, 'SRL', 'EASING')).toBe(true);
    expect(cbOf(f, 'SRL').reserveRequirement).toBe(0.1);
    f.setTick(f.ctx.tick + 91 * 720);
    expect(adjustRr(f.ctx, 'SRL', 'EASING')).toBe(false);
  });
});

describe('§3.8.1 corridor', () => {
  it('corridorOf floors the deposit rate without negative rates', () => {
    expect(corridorOf(0.0025, false, 0.0025)).toEqual({ lendingRate: 0.005, depositRate: 0 });
    expect(corridorOf(-0.0025, true, 0.0025)).toEqual({ lendingRate: 0, depositRate: -0.005 });
  });
  it('setCorridor writes the facility terms and FACILITY_RATE_E6 = half-even(lendingRate × 1e6)', () => {
    const w = cbWorld([cbRow('FDL', { policyRate: 0.0425, facilities: { lendingRate: 0, depositRate: 0, collateralHaircuts: { x: 1 }, elaPenaltySpread: 0, maxTermDays: 1 } }), cbRow('EUN', { policyRate: 0.001 })]);
    setCorridor(w.ctx, 'FDL'); setCorridor(w.ctx, 'EUN');
    expect(cbOf(w).facilities.lendingRate).toBeCloseTo(0.045, 15);
    expect({ ...cbOf(w).facilities, lendingRate: 0 }).toEqual({ lendingRate: 0, depositRate: 0.04, collateralHaircuts: { x: 1 }, elaPenaltySpread: 0.015, maxTermDays: 7 });
    expect(cbOf(w, 'EUN').facilities.depositRate).toBeCloseTo(-0.0015, 15);
    expect(vi.mocked(putFact).mock.calls.map((c) => c.slice(1))).toEqual([['FACILITY_RATE_E6', 'FDL', 45_000], ['FACILITY_RATE_E6', 'EUN', 3500]]);
  });
});
