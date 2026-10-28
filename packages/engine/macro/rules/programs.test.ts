import { describe, expect, it } from 'vitest';
import { TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { macroTables, type BlocId, type FiscalProgram } from '../schema';
import { M, stubPorts, type CbWorld } from '../testkit/cbWorld';
import { fiscalWorld, putBloc } from '../testkit/fiscalWorld';
import type { MacroPorts } from '../ports';
import { liquidityPremium } from './sovCredit';
import { acceptProposals, activeIncentives, addProgram, handleProgramSpend, MACRO_EXTENSION_CODES_FISCAL, ruleBreachPremium, SECTOR_DEMAND_DEFAULTS, sectorDemandAdd } from './programs';

const D = TICKS_PER_GAME_DAY, T0 = 50 * D + 100, WIN = 131_040;
const prog = (o: Partial<FiscalProgram>): FiscalProgram => ({ id: 'fp_1', bloc: 'EUN', kind: 'INFRASTRUCTURE', sizeGdpPerYear: 0.01, sectorDemand: {}, budget: M(1e9), spent: 0n,
  startTick: T0, endTick: T0 + 364 * D, source: 'POLITICS', sponsorActorIds: ['act_a'], ...o });
const ports = (ps: FiscalProgram[]): MacroPorts => { const p = stubPorts(); return { ...p, world: { ...p.world, fiscalProposals: () => ps } }; };
const IND = 4, MAT = 3;   // positions of INDUSTRIALS and MATERIALS in the test kit's ContentView.sectors()
function world(deficitGdp: number, b: BlocId = 'EUN'): CbWorld { const w = fiscalWorld(T0); putBloc(w, b, { fiscal: { deficitGdp } }); return w; }

describe('T04-10 programs', () => {
  it('04#45 a breaching program raises the liquidity premium by 25 bp for 182 game days and emits macro.fiscal.rule_breach', () => {
    const w = world(0.028), base = liquidityPremium('EUN', 0.8, 0);
    expect(acceptProposals(w.ctx, 'EUN', ports([prog({})])).map((p) => p.id)).toEqual(['fp_1']);
    const br = w.events.filter((e) => e.kind === 'macro.fiscal.rule_breach');
    expect(br).toEqual([{ kind: 'macro.fiscal.rule_breach', subjectIds: ['gov_EUN'], payload: { bloc: 'EUN', rule: 'DEFICIT_CAP', programId: 'fp_1' }, vis: 'PUBLIC' }]);
    const lp = (t: number): number => liquidityPremium('EUN', 0.8, ruleBreachPremium(w.ctx.store, 'EUN', t));
    expect(lp(T0 - 1)).toBe(base);
    expect(lp(T0) - base).toBeCloseTo(0.0025, 12);
    expect(lp(T0 + WIN - 1) - base).toBeCloseTo(0.0025, 12);
    expect(lp(T0 + WIN)).toBe(base);
    const ev = w.events.find((e) => e.kind === 'macro.fiscal.program')!;
    expect([ev.vis, (ev.payload as { sponsors: string[] }).sponsors]).toEqual(['PUBLIC', ['act_a']]);
  });
  it('a program within the rule (deficit 0.015) emits no breach and adds no premium; proposals for other blocs and repeats are ignored', () => {
    const w = world(0.015);
    acceptProposals(w.ctx, 'EUN', ports([prog({}), prog({ id: 'fp_0', bloc: 'FDL' })]));
    expect(w.events.map((e) => e.kind)).toEqual(['macro.fiscal.program']);
    expect(ruleBreachPremium(w.ctx.store, 'EUN', T0)).toBe(0);
    expect(acceptProposals(w.ctx, 'EUN', ports([prog({})]))).toEqual([]);
    expect(w.rows(macroTables.program.name).length).toBe(1);
    expect((w.rows(macroTables.bloc.name)[0] as { fiscal: { programs: FiscalProgram[] } }).fiscal.programs.map((p) => p.id)).toEqual(['fp_1']);
  });
  it('two overlapping breaches → +0.005; the other bloc unaffected', () => {
    const w = world(0.028);
    addProgram(w.ctx, prog({ id: 'a' }), true);
    w.setTick(T0 + 10 * D);
    addProgram(w.ctx, prog({ id: 'b' }), true);
    expect(ruleBreachPremium(w.ctx.store, 'EUN', T0 + 10 * D)).toBeCloseTo(0.005, 12);
    expect(ruleBreachPremium(w.ctx.store, 'EUN', T0 + WIN)).toBeCloseTo(0.0025, 12);
    expect(ruleBreachPremium(w.ctx.store, 'FDL', T0 + 10 * D)).toBe(0);
  });
  it('AUSTERITY never breaches (EUN deficit 0.2)', () => {
    const w = world(0.2);
    acceptProposals(w.ctx, 'EUN', ports([prog({ kind: 'AUSTERITY' })]));
    expect(w.events.map((e) => e.kind)).toEqual(['macro.fiscal.program']);
  });
  it('sectorDemandAdd: INFRASTRUCTURE 0.015 → Industrials +0.09, Materials +0.06; inactive or other bloc 0; explicit sectorDemand kept', () => {
    const w = world(0);
    addProgram(w.ctx, prog({ sizeGdpPerYear: 0.015 }), false);
    expect(sectorDemandAdd(w.ctx.store, 'EUN', IND, T0)).toBeCloseTo(0.09, 12);
    expect(sectorDemandAdd(w.ctx.store, 'EUN', MAT, T0)).toBeCloseTo(0.06, 12);
    expect(sectorDemandAdd(w.ctx.store, 'EUN', 0, T0)).toBe(0);
    expect(sectorDemandAdd(w.ctx.store, 'EUN', IND, T0 + 364 * D)).toBe(0);
    expect(sectorDemandAdd(w.ctx.store, 'FDL', IND, T0)).toBe(0);
    addProgram(w.ctx, prog({ id: 'fp_2', sectorDemand: { 0: 0.02 } }), false);
    expect(sectorDemandAdd(w.ctx.store, 'EUN', 0, T0)).toBeCloseTo(0.02, 12);
    expect(sectorDemandAdd(w.ctx.store, 'EUN', IND, T0)).toBeCloseTo(0.09, 12);
    expect(SECTOR_DEMAND_DEFAULTS.AI_COMPUTE).toEqual({ SEMI: 0.05, TECH: 0.03 });
  });
  it('incentives: remaining after mac.program.spent messages; stops at budget (overshoot recorded)', () => {
    const w = world(0);
    addProgram(w.ctx, prog({ budget: M(100), incentive: { target: 'CAPEX_SECTOR', sector: IND, rate: 0.10 } }), false);
    addProgram(w.ctx, prog({ id: 'fp_9', budget: M(100), incentive: { target: 'HIRING', rate: 0.05 } }), false);
    expect(activeIncentives(w.ctx.store, 'EUN', 'CAPEX_SECTOR', T0)).toEqual([{ programId: 'fp_1', rate: 0.10, sector: IND, remaining: M(100) }]);
    const spend = (amount: bigint): void => { w.ctx.send('gov_EUN', 'mac.program.spent', { programId: 'fp_1', amount }, 'NEXT'); w.deliver(); handleProgramSpend(w.ctx); };
    spend(M(40));
    expect(activeIncentives(w.ctx.store, 'EUN', 'CAPEX_SECTOR', T0)[0]!.remaining).toBe(M(60));
    spend(M(60));
    expect(activeIncentives(w.ctx.store, 'EUN', 'CAPEX_SECTOR', T0)).toEqual([]);
    spend(M(10));
    expect(activeIncentives(w.ctx.store, 'EUN', 'CAPEX_SECTOR', T0)).toEqual([]);
    expect((w.ctx.store.get(macroTables.program.name, 'fp_1') as FiscalProgram).spent).toBe(M(110));
    expect(activeIncentives(w.ctx.store, 'EUN', 'HIRING', T0).map((x) => x.programId)).toEqual(['fp_9']);
    expect(activeIncentives(w.ctx.store, 'EUN', 'HIRING', T0 + 364 * D)).toEqual([]);
  });
  it('two extension codes, TRANSFER / PAY', () => {
    expect(MACRO_EXTENSION_CODES_FISCAL.map((c) => [c.code, c.cls, c.template])).toEqual([['GOV_SUBSIDY_P', 'TRANSFER', 'PAY'], ['SWF_TRANSFER', 'TRANSFER', 'PAY']]);
  });
});
