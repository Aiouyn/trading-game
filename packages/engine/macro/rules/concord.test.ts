import { describe, expect, it } from 'vitest';
import { TICKS_PER_GAME_DAY as D } from '@tycoon/engine-core';
import { macroTables, type BlocId, type ConcordFacility } from '../schema';
import { CSF_ID } from '../ids';
import { M } from '../testkit/cbWorld';
import { fiscalWorld, putBloc } from '../testkit/fiscalWorld';
import { canAgreeConcord, compliance, concordActive, concordTranches, lendingCapacity, openConcord, quotas } from './concord';

const GDP: Record<BlocId, number> = { FDL: 40e12, EUN: 25e12, PYN: 10e12, NKR: 10e12, SRL: 15e12 };
function world(o: { s10?: number; hazard?: number; breakArmed?: boolean; svc?: boolean; cc?: 0 | 1 | 2 | 3 } = {}) {
  const w = fiscalWorld(100 * D);
  for (const b of Object.keys(GDP) as BlocId[]) {
    putBloc(w, b, { gdp: GDP[b], s10: b === 'SRL' ? o.s10 ?? 0 : 0 });
    const row = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, b)!;
    w.put(macroTables.bloc.name, { ...row, sovereign: { spread10y: b === 'SRL' ? o.s10 ?? 0 : 0, hazard: b === 'SRL' ? o.hazard ?? 0.1 : 0.01 },
      fx: { regime: 'FLOAT', capitalControls: b === 'SRL' ? o.cc ?? 0 : 0, breakArmed: b === 'SRL' && !!o.breakArmed, fxServicePending: b === 'SRL' && !!o.svc } } as never);
    w.put(macroTables.publicView.name, { id: b, bloc: b, fx: { spotVsFdl: 1 } } as never);
  }
  w.put(macroTables.curve.name, { id: 'FDL', nsOis: { L: 0.04, S: 0, C: 0, lambda: 1 } } as never);
  return w;
}
const fac = (w: ReturnType<typeof world>) => w.ctx.store.get<ConcordFacility>(macroTables.csf.name, CSF_ID)!;
const day = (w: ReturnType<typeof world>, n: number) => { for (let i = 0; i < n; i++) { w.setTick(w.ctx.tick + D); concordTranches(w.ctx); } };

describe('T04-14 Concord', () => {
  it('quotas are 2% of GDP_FDL; capacity is 3·Σ at world GDP 100e12', () => {
    const w = world();
    expect(quotas(w.ctx.store).SRL).toBe(M(300e9));
    expect(lendingCapacity(w.ctx.store)).toBe(M(6e12));
  });
  it('needs a crisis condition and λ·0.6 < 0.15', () => {
    expect(canAgreeConcord(world().ctx.store, 'SRL')).toBe(false);
    expect(canAgreeConcord(world({ s10: 0.09 }).ctx.store, 'SRL')).toBe(true);
    expect(canAgreeConcord(world({ breakArmed: true }).ctx.store, 'SRL')).toBe(true);
    expect(canAgreeConcord(world({ svc: true }).ctx.store, 'SRL')).toBe(true);
    expect(canAgreeConcord(world({ s10: 0.08 }).ctx.store, 'SRL')).toBe(false);
    expect(canAgreeConcord(world({ s10: 0.09, hazard: 0.25 }).ctx.store, 'SRL')).toBe(false);
    expect(canAgreeConcord(world({ s10: 0.09, hazard: 0.24 }).ctx.store, 'SRL')).toBe(true);
  });
  it('opens at 3× quota, rate OIS5 + 0.02, 4 tranches 91 days apart, 8 quarterly repayments from 364 days after the last', () => {
    const w = world({ breakArmed: true, cc: 2 });
    const t = w.ctx.tick, p = openConcord(w.ctx, 'SRL', 'BREAK_PENDING')!;
    expect(p.size).toBe(M(900e9));
    expect(p.rate).toBeCloseTo(0.06, 12);
    expect(p.trancheTicks).toEqual([t, t + 91 * D, t + 182 * D, t + 273 * D]);
    expect(p.endTick).toBe(t + 273 * D + 364 * D + 7 * 91 * D);
    expect(w.posts.filter((x) => x.code === 'CSF_DISBURSE').map((x) => x.amt)).toEqual([M(225e9)]);
    expect(concordActive(w.ctx.store, 'SRL')).toBe(true);
    expect(lendingCapacity(w.ctx.store)).toBe(M(6e12 - 225e9));
    expect(canAgreeConcord(w.ctx.store, 'SRL')).toBe(false);
    expect(w.events.find((e) => e.kind === 'macro.csf.program')?.vis).toBe('PUBLIC');
    expect(w.events.some((e) => e.kind === 'macro.fx.capcontrols')).toBe(false);   // phase-out is scheduled for tick+1
    expect(w.ctx.store.get<{ fx: { capconSchedule?: { level: number; startTick: number } } }>(macroTables.bloc.name, 'SRL')!.fx.capconSchedule).toMatchObject({ level: 0, startTick: t + 1 });
  });
  it('a day step opens a SPREAD program when s10 > 0.08 and agreeable', () => {
    const w = world({ s10: 0.09 });
    day(w, 1);
    expect(concordActive(w.ctx.store, 'SRL')).toBe(true);
    expect(fac(w).programs[0]!.cause).toBe('SPREAD');
  });
  it('RESTRUCTURING bypasses the crisis condition', () => {
    expect(openConcord(world().ctx, 'SRL', 'RESTRUCTURING')).not.toBeNull();
    expect(openConcord(world().ctx, 'SRL', 'SPREAD')).toBeNull();
  });
  it('compliance = clamp(achieved/step) × (phased ? 1 : 0.5)', () => {
    const p = { conditions: { primaryBalanceStepPerYear: 0.015 } } as never;
    expect(compliance(p, 0.009, true)).toBeCloseTo(0.6, 12);
    expect(compliance(p, 0.03, false)).toBe(0.5);
    expect(compliance(p, -0.01, true)).toBe(0);
  });
  it('compliance 0.6 suspends the tranche with a Wire hook; 1.0 disburses; interest is paid quarterly', () => {
    for (const [pb, paid] of [[0.009 * 91 / 364, false], [0.015 * 91 / 364, true]] as const) {
      const w = world({ breakArmed: true });
      openConcord(w.ctx, 'SRL', 'BREAK_PENDING');
      const row = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, 'SRL')!;
      w.put(macroTables.bloc.name, { ...row, fiscal: { ...(row.fiscal as object), primaryBalanceGdp: pb } } as never);
      day(w, 91);
      const p = fac(w).programs[0]!;
      expect(p.compliance).toBeCloseTo(paid ? 1 : 0.6, 9);
      expect(w.posts.filter((x) => x.code === 'CSF_DISBURSE').length).toBe(paid ? 2 : 1);
      expect(p.skipped).toBe(paid ? 0 : 1);
      expect(w.rows(macroTables.hookCall.name).length).toBe(paid ? 0 : 1);
      const int = w.posts.filter((x) => x.code === 'CSF_INTEREST');
      expect(int.length).toBe(1);
      expect(Number(int[0]!.amt) / 1e6).toBeCloseTo(225e9 * 0.06 * 91 / 364, -3);
    }
  });
  it('repays in 8 installments and closes', () => {
    const w = world({ breakArmed: true });
    openConcord(w.ctx, 'SRL', 'BREAK_PENDING');
    const row = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, 'SRL')!;
    w.put(macroTables.bloc.name, { ...row, fiscal: { ...(row.fiscal as object), primaryBalanceGdp: 0.05 } } as never);
    day(w, 273 + 364 + 7 * 91);
    const rep = w.posts.filter((x) => x.code === 'CSF_REPAY');
    expect(rep.length).toBe(8);
    expect(rep.reduce((a, x) => a + x.amt, 0n)).toBe(M(900e9));
    expect(concordActive(w.ctx.store, 'SRL')).toBe(false);
    expect(lendingCapacity(w.ctx.store)).toBe(M(6e12));
  });
});
