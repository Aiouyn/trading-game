import { describe, expect, it } from 'vitest';
import { TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { macroTables, type BlocId, type FiscalProgram } from '../schema';
import { M } from '../testkit/cbWorld';
import { fiscalWorld, putBloc, type BlocOpts } from '../testkit/fiscalWorld';
import { tradingDayIndexInYear } from './calendar';
import type { FiscalDay } from './fiscal';
import { checkFiscalRule, runFiscalRuleChecks, swfStep, wouldBreach } from './fiscalRules';

const D = TICKS_PER_GAME_DAY;
const S = { regimeLabel: 'EXPANSION', trueRegime: 'EXPANSION', debtGdp: 0.9, deficitGdp: 0.02, primaryBalanceGdp: 0, outputGap: 0, s10: 0, fsi: 0.2, revenueAboveTrend: 0, concordActive: false };
const dayWithIndex = (b: BlocId, n: number): number => { for (let d = 0; ; d++) if (tradingDayIndexInYear(b, d) === n) return d; };
const nonCheckDay = (b: BlocId): number => { for (let d = 3; ; d++) { const i = tradingDayIndexInYear(b, d); if (i !== null && i !== 1 && i !== 131) return d; } };
function run(b: BlocId, day: number, o: BlocOpts): FiscalProgram[] {
  const w = fiscalWorld(day * D + 700);
  putBloc(w, b, o);
  runFiscalRuleChecks(w.ctx, b);
  return w.rows(macroTables.program.name) as FiscalProgram[];
}
const kinds = (ps: FiscalProgram[]): [string, number, number][] => ps.map((p) => [p.kind, p.sizeGdpPerYear, (p.endTick - p.startTick) / D]);

describe('T04-10 fiscal rules', () => {
  it('EUN deficit 0.035 on trading day 1 → AUSTERITY 0.005; with true CONTRACTION and FSI 0.55 → INFRASTRUCTURE 0.01 instead; ≤ cap nothing', () => {
    const d1 = dayWithIndex('EUN', 1);
    expect(kinds(run('EUN', d1, { fiscal: { deficitGdp: 0.035 } }))).toEqual([['AUSTERITY', 0.005, 182]]);
    expect(checkFiscalRule('EUN', { ...S, deficitGdp: 0.035, trueRegime: 'CONTRACTION', fsi: 0.55 })).toEqual([{ kind: 'INFRASTRUCTURE', sizeGdpPerYear: 0.01, days: 182, reason: 'DEFICIT_CAP_ESCAPE' }]);
    expect(checkFiscalRule('EUN', { ...S, deficitGdp: 0.035, trueRegime: 'CONTRACTION', fsi: 0.5 })[0]!.kind).toBe('AUSTERITY');
    expect(checkFiscalRule('EUN', { ...S, deficitGdp: 0.03 })).toEqual([]);
    const p = run('EUN', dayWithIndex('EUN', 131), { fiscal: { deficitGdp: 0.035 } })[0]!;
    expect([p.source, p.sponsorActorIds, p.budget]).toEqual(['AUTOMATIC', [], M((0.005 * 32e12 * 182) / 364)]);
  });
  it('FDL CONTRACTION declared today → INFRASTRUCTURE and HOUSEHOLD_TRANSFER 0.0075 for 364 days, once; on a later day nothing', () => {
    const d = nonCheckDay('FDL');
    const ps = run('FDL', d, { label: 'CONTRACTION', labelSinceDay: d });
    expect(kinds(ps)).toEqual([['INFRASTRUCTURE', 0.0075, 364], ['HOUSEHOLD_TRANSFER', 0.0075, 364]]);
    expect(ps[0]!.budget).toBe(M(0.0075 * 32e12));
    expect(run('FDL', d, { label: 'CONTRACTION', labelSinceDay: d - 1 })).toEqual([]);
    expect(run('FDL', dayWithIndex('FDL', 131), { label: 'CONTRACTION', labelSinceDay: 0 })).toEqual([]);
    expect(run('FDL', d, { label: 'RECOVERY', labelSinceDay: d })).toEqual([]);
  });
  it('FDL debt > 1.30 and s10 > 0.015 → AUSTERITY 0.005 on a check day (not at 1.30 or 0.015)', () => {
    expect(kinds(run('FDL', dayWithIndex('FDL', 1), { s10: 0.016, fiscal: { debtGdp: 1.31 } }))).toEqual([['AUSTERITY', 0.005, 182]]);
    expect(checkFiscalRule('FDL', { ...S, debtGdp: 1.30, s10: 0.02 })).toEqual([]);
    expect(checkFiscalRule('FDL', { ...S, debtGdp: 1.4, s10: 0.015 })).toEqual([]);
  });
  it('PYN pb −0.03, x −0.01 → cab −0.026 → AUSTERITY 0.01; cab +0.02 → HOUSEHOLD_TRANSFER 0.005; in band nothing; CONTRACTION → INDUSTRIAL_SUBSIDY 0.01', () => {
    expect(kinds(run('PYN', dayWithIndex('PYN', 1), { x: -0.01, fiscal: { primaryBalanceGdp: -0.03 } }))).toEqual([['AUSTERITY', 0.01, 182]]);
    const ht = checkFiscalRule('PYN', { ...S, primaryBalanceGdp: 0.02 })[0]!;
    expect([ht.kind, ht.sizeGdpPerYear]).toEqual(['HOUSEHOLD_TRANSFER', expect.closeTo(0.005, 12)]);
    const au = checkFiscalRule('PYN', { ...S, primaryBalanceGdp: -0.02 })[0]!;
    expect([au.kind, au.sizeGdpPerYear]).toEqual(['AUSTERITY', expect.closeTo(0.005, 12)]);
    expect(checkFiscalRule('PYN', { ...S, primaryBalanceGdp: 0.015 })).toEqual([]);
    expect(checkFiscalRule('PYN', { ...S, primaryBalanceGdp: -0.015 })).toEqual([]);
    expect(checkFiscalRule('PYN', { ...S, regimeLabel: 'CONTRACTION', primaryBalanceGdp: -0.03 })).toEqual([{ kind: 'INDUSTRIAL_SUBSIDY', sizeGdpPerYear: 0.01, days: 182, reason: 'BALANCED_CYCLE_CONTRACTION' }]);
  });
  it('SRL: boom → HOUSEHOLD_TRANSFER 0.6 × revenue above trend; CONTRACTION with s10 > 0.05 → AUSTERITY 0.015; Concord active → rule skipped', () => {
    expect(checkFiscalRule('SRL', { ...S, revenueAboveTrend: 0.01 })[0]).toEqual({ kind: 'HOUSEHOLD_TRANSFER', sizeGdpPerYear: expect.closeTo(0.006, 12), days: 182, reason: 'PROCYCLICAL_BOOM' });
    expect(checkFiscalRule('SRL', { ...S, regimeLabel: 'OVERHEATING', revenueAboveTrend: 0.01 })[0]!.kind).toBe('HOUSEHOLD_TRANSFER');
    expect(checkFiscalRule('SRL', { ...S, revenueAboveTrend: 0 })).toEqual([]);
    expect(checkFiscalRule('SRL', { ...S, regimeLabel: 'CONTRACTION', s10: 0.051 })).toEqual([{ kind: 'AUSTERITY', sizeGdpPerYear: 0.015, days: 182, reason: 'PROCYCLICAL_FORCED' }]);
    expect(checkFiscalRule('SRL', { ...S, regimeLabel: 'CONTRACTION', s10: 0.05 })).toEqual([]);
    expect(checkFiscalRule('SRL', { ...S, regimeLabel: 'CONTRACTION', s10: 0.06, concordActive: true })).toEqual([]);
    const d = dayWithIndex('SRL', 1), w = fiscalWorld(d * D);
    putBloc(w, 'SRL', { label: 'CONTRACTION', s10: 0.06 });
    w.put(macroTables.csf.name, { id: 'npc_CSF', programs: [{ bloc: 'SRL', startTick: 0, endTick: d * D + 1 }] } as never);
    runFiscalRuleChecks(w.ctx, 'SRL');
    expect(w.rows(macroTables.program.name)).toEqual([]);
    w.put(macroTables.csf.name, { id: 'npc_CSF', programs: [{ bloc: 'SRL', startTick: 0, endTick: d * D }] } as never);
    runFiscalRuleChecks(w.ctx, 'SRL');
    expect(kinds(w.rows(macroTables.program.name) as FiscalProgram[])).toEqual([['AUSTERITY', 0.015, 182]]);
  });
  it('SRL revenue above trend from the store: GDP 10% above trend → (revenue − revBase·trend)/GDP', () => {
    const w = fiscalWorld(dayWithIndex('SRL', 1) * D);
    putBloc(w, 'SRL', { gdp: 1e12 });
    w.put(macroTables.bloc.name, { ...(w.rows(macroTables.bloc.name)[0] as object), potentialGdpIndex: 100, realGdpIndex: 110 } as never);
    runFiscalRuleChecks(w.ctx, 'SRL');
    const p = w.rows(macroTables.program.name)[0] as FiscalProgram, rev = 0.27 * 1e12 + 1e12 * 0.6 * 0.06;
    expect(p.sizeGdpPerYear).toBeCloseTo((0.6 * (rev - (0.27 * 1e12) / 1.1)) / 1e12, 12);
  });
  it('non-check days run nothing (every rule armed)', () => {
    const d = nonCheckDay('EUN');
    expect(run('EUN', d, { fiscal: { deficitGdp: 0.05 } })).toEqual([]);
    expect(run('FDL', nonCheckDay('FDL'), { s10: 0.05, fiscal: { debtGdp: 2 } })).toEqual([]);
    expect(run('PYN', nonCheckDay('PYN'), { fiscal: { primaryBalanceGdp: -0.05 } })).toEqual([]);
  });
  it('NKR declaration → SWF-funded GREEN_ENERGY and HOUSEHOLD_TRANSFER 0.005 each', () => {
    const d = nonCheckDay('NKR');
    expect(kinds(run('NKR', d, { label: 'CONTRACTION', labelSinceDay: d }))).toEqual([['GREEN_ENERGY', 0.005, 364], ['HOUSEHOLD_TRANSFER', 0.005, 364]]);
  });
  const fd = (primary: number): FiscalDay => ({ revenue: 0, spending: 0, interest: 0, primary, deficit: 0, debt: 0n, debtGdp: 0, averageCoupon: 0, averageMaturityYears: 5 });
  it('NKR pb 0.03 → daily SWF transfer 0.01 × GDP/364 gov → swf; swfAssets mirrors; at 0.02 nothing; pb exactly 0.02 under CONTRACTION draws', () => {
    const w = fiscalWorld(10);
    putBloc(w, 'NKR', { gdp: 364e9 });
    w.cash['fnd_SWF_NKR:NKR'] = M(5);
    swfStep(w.ctx, fd(0.03));
    expect(w.posts).toEqual([{ op: 'pay', from: 'gov_NKR', to: 'fnd_SWF_NKR', amt: M(1e7), ccy: 'NKR', code: 'SWF_TRANSFER' }]);
    expect((w.rows(macroTables.bloc.name)[0] as { fiscal: { swfAssets: bigint } }).fiscal.swfAssets).toBe(M(1e7 + 5));
    swfStep(w.ctx, fd(0.02));
    expect(w.posts.length).toBe(1);
  });
  it('NKR CONTRACTION label: SWF draws ≤ 0.01 × GDP/364 a day back to the treasury, capped by the SWF cash', () => {
    const w = fiscalWorld(10);
    putBloc(w, 'NKR', { gdp: 364e9, label: 'CONTRACTION' });
    w.cash['fnd_SWF_NKR:NKR'] = M(3e9);
    swfStep(w.ctx, fd(0.02));
    w.cash['fnd_SWF_NKR:NKR'] = M(4e6);
    swfStep(w.ctx, fd(0.01));
    expect(w.posts.map((p) => [p.from, p.to, p.amt])).toEqual([['fnd_SWF_NKR', 'gov_NKR', M(1e7)], ['fnd_SWF_NKR', 'gov_NKR', M(4e6)]]);
    expect((w.rows(macroTables.bloc.name)[0] as { fiscal: { swfAssets: bigint } }).fiscal.swfAssets).toBe(0n);
  });
  it('wouldBreach per rule; AUSTERITY never', () => {
    const p = (kind: FiscalProgram['kind'], size: number): FiscalProgram => ({ id: 'x', bloc: 'FDL', kind, sizeGdpPerYear: size, sectorDemand: {}, budget: 0n, spent: 0n, startTick: 0, endTick: 1, source: 'POLITICS', sponsorActorIds: [] });
    const I = p('INFRASTRUCTURE', 0.01), A = p('AUSTERITY', 0.01);
    expect([wouldBreach('EUN', I, { ...S, deficitGdp: 0.028 }), wouldBreach('EUN', I, { ...S, deficitGdp: 0.02 }), wouldBreach('EUN', I, { ...S, deficitGdp: 0.028, trueRegime: 'CONTRACTION', fsi: 0.55 })]).toEqual([true, false, false]);
    expect([wouldBreach('FDL', I, { ...S, debtGdp: 1.31, s10: 0.016 }), wouldBreach('FDL', I, { ...S, debtGdp: 1.31 })]).toEqual([true, false]);
    expect([wouldBreach('PYN', I, { ...S, primaryBalanceGdp: 0 }), wouldBreach('PYN', I, { ...S, primaryBalanceGdp: -0.01 }), wouldBreach('PYN', p('TAX_CUT', -0.03), { ...S })]).toEqual([false, true, true]);
    expect([wouldBreach('NKR', I, { ...S, primaryBalanceGdp: 0.031 }), wouldBreach('NKR', I, { ...S, primaryBalanceGdp: 0.029 })]).toEqual([false, true]);
    expect([wouldBreach('SRL', I, { ...S, concordActive: true }), wouldBreach('SRL', I, S)]).toEqual([true, false]);
    for (const b of ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'] as const) expect(wouldBreach(b, A, { ...S, deficitGdp: 0.5, debtGdp: 3, s10: 0.2, primaryBalanceGdp: -0.2, concordActive: true })).toBe(false);
  });
});
