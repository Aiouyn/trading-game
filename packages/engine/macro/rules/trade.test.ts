import { describe, expect, it } from 'vitest';
import type { PhaseCtx } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type GlobalMacroState, type MacroInputs } from '../schema';
import { dailyTrade, stepTariff, worldTradeIndex } from './trade';

type Ev = { kind: string; payload: unknown; vis: string };
const sched = (o: Partial<GlobalMacroState['scheduler']> = {}): GlobalMacroState['scheduler'] => ({ lastMajorEndTick: null, lastMajorStartTick: null, majorsThisChapter: 0,
  playerCausedSuppressUntil: null, timezoneBandNext: 0, crisisWeek: null, crisisWeekUsedThisChapter: false, activeMajorId: null, activeStormIds: [], activeRippleIds: [], ...o });
function fakeWorld(global: Record<string, unknown> | null, extra: Array<[string, Record<string, unknown>]> = [], gameDay = 10) {
  const rows = new Map<string, unknown>();
  const key = (t: string, id: string): string => `${t}|${id}`;
  if (global) rows.set(key(macroTables.global.name, 'GLOBAL'), { id: 'GLOBAL', fearIndex: 22, riskAppetite: 0.56, financialStressIndex: 0, tariffLevel: 0.03, worldTradeIndex: 100, scheduler: sched(), ...global });
  for (const [t, r] of extra) rows.set(key(t, r.id as string), r);
  const events: Ev[] = [];
  const store = { get: (t: string, id: string) => rows.get(key(t, id)), put: (t: string, e: { id: string }) => { rows.set(key(t, e.id), e); },
    del: () => undefined, iter: () => [], range: () => [], index: () => [], count: () => 0 };
  const ctx = { tick: gameDay * 720, cal: { gameDay, tickOfDay: 0 }, store, emit: (kind: string, _s: unknown, payload: unknown, vis: string) => { events.push({ kind, payload, vis }); } } as unknown as PhaseCtx;
  return { ctx, events, global: () => rows.get(key(macroTables.global.name, 'GLOBAL')) as GlobalMacroState, inputs: () => rows.get(key(macroTables.inputs.name, 'INPUTS')) as MacroInputs | undefined };
}
const all = (v: number): Record<BlocId, number> => Object.fromEntries(BLOC_ORDER.map((b) => [b, v])) as Record<BlocId, number>;

describe('T04-15 world trade index (04 §3.14.3)', () => {
  it('genesis WTI 100 exactly', () => { expect(worldTradeIndex(all(100), 0.03)).toBe(100); });
  it('all real indices 101: tariff 0.03 → 101.503744, tariff 0.10 → 87.382328', () => {
    expect(worldTradeIndex(all(101), 0.03)).toBeCloseTo(101.503744, 6);
    expect(worldTradeIndex(all(101), 0.10)).toBeCloseTo(87.382328, 6);
  });
  it('weights by gdpShare0', () => {
    const r = all(100); r.FDL = 200;   // s = 1 + 0.32
    expect(worldTradeIndex(r, 0.03)).toBeCloseTo(100 * 1.32 ** 1.5, 9);
  });
  it('stepTariff sums deltas and clamps to [0, 0.4]', () => {
    expect(stepTariff(0.03, [0.02, 0.01])).toBeCloseTo(0.06, 15);
    expect(stepTariff(0.35, [0.1])).toBe(0.4);
    expect(stepTariff(0.03, [-0.1])).toBe(0);
    expect(stepTariff(0.03, [])).toBe(0.03);
  });
});

describe('T04-15 dailyTrade', () => {
  const withDelta = (d: number): MacroPorts => { const p = defaultMacroPorts(); return { ...p, world: { ...p.world, tariffDelta: () => d } }; };
  it('genesis state, no modules → tariff 0.03, WTI 100', () => {
    const w = fakeWorld({}, BLOC_ORDER.map((b) => [macroTables.bloc.name, { id: b, realGdpIndex: 100 }]));
    dailyTrade(w.ctx, defaultMacroPorts());
    expect([w.global().tariffLevel, w.global().worldTradeIndex]).toEqual([0.03, 100]);
  });
  it('applies the 16 delta and a tariff_level shock that started today (only on that day), then WTI from the bloc rows', () => {
    const tick = 10 * 720;
    const ev = { id: 'tw', phase: 'TRIGGER', shocks: [{ id: 'k', target: 'tariff_level', value: 0.05, startTick: tick - 3, endTick: tick + 9999, shape: 'STEP' },
      { id: 'k2', target: 'gdp_growth', value: 9, startTick: tick - 3, endTick: tick + 9999, shape: 'STEP' }] };
    const old = { id: 'old', phase: 'CONTAGION', shocks: [{ id: 'k3', target: 'tariff_level', value: 0.05, startTick: tick - 720, endTick: tick + 9999, shape: 'STEP' }] };
    const w = fakeWorld({ scheduler: { activeMajorId: 'tw', activeStormIds: ['old'], activeRippleIds: [] } },
      [[macroTables.event.name, ev], [macroTables.event.name, old], ...BLOC_ORDER.map((b): [string, Record<string, unknown>] => [macroTables.bloc.name, { id: b, realGdpIndex: 101 }])]);
    dailyTrade(w.ctx, withDelta(0.02));
    expect(w.global().tariffLevel).toBeCloseTo(0.10, 15);
    expect(w.global().worldTradeIndex).toBeCloseTo(87.382328, 6);
  });
  it('counts storm and ripple tariff_level shocks that started today; a shock starting later is not applied yet', () => {
    const tick = 10 * 720;
    const shock = (id: string, value: number, startTick: number) => ({ id, target: 'tariff_level', value, startTick, endTick: tick + 9999, shape: 'STEP' });
    const major = { id: 'mj', phase: 'TRIGGER', shocks: [shock('f', 0.07, tick + 5)] };
    const storm = { id: 'st', phase: 'TRIGGER', shocks: [shock('s', 0.02, tick - 1)] };
    const ripple = { id: 'rp', phase: 'TRIGGER', shocks: [shock('r', 0.01, tick)] };
    const w = fakeWorld({ scheduler: sched({ activeMajorId: 'mj', activeStormIds: ['st'], activeRippleIds: ['rp'] }) },
      [[macroTables.event.name, major], [macroTables.event.name, storm], [macroTables.event.name, ripple], ...BLOC_ORDER.map((b): [string, Record<string, unknown>] => [macroTables.bloc.name, { id: b, realGdpIndex: 100 }])]);
    dailyTrade(w.ctx, withDelta(0));
    expect(w.global().tariffLevel).toBeCloseTo(0.06, 15);
  });
  it('tariff clamps at 0.4', () => {
    const w = fakeWorld({ tariffLevel: 0.39 }, [...BLOC_ORDER.map((b): [string, Record<string, unknown>] => [macroTables.bloc.name, { id: b, realGdpIndex: 100 }])]);
    dailyTrade(w.ctx, withDelta(0.05));
    expect(w.global().tariffLevel).toBe(0.4);
  });
  it('#72 item 5 reading: a tariff_level shock is applied once, on the day it starts, not again the next day', () => {
    const tick = 10 * 720;
    const ev = { id: 'tw', phase: 'TRIGGER', shocks: [{ id: 'k', target: 'tariff_level', value: 0.05, startTick: tick - 3, endTick: tick + 9999, shape: 'STEP' }] };
    const w = fakeWorld({ scheduler: sched({ activeMajorId: 'tw' }) }, [[macroTables.event.name, ev], ...BLOC_ORDER.map((b): [string, Record<string, unknown>] => [macroTables.bloc.name, { id: b, realGdpIndex: 100 }])]);
    dailyTrade(w.ctx, withDelta(0));
    expect(w.global().tariffLevel).toBeCloseTo(0.08, 15);
    const next = { ...w.ctx, tick: tick + 720, cal: { gameDay: 11, tickOfDay: 0 } } as typeof w.ctx;
    dailyTrade(next, withDelta(0));
    expect(w.global().tariffLevel).toBeCloseTo(0.08, 15);
  });
  it('#72 item 7: no fallback to 100, a missing bloc row or realGdpIndex is I0.macro_bloc', () => {
    const rows = (skip: string, row: Record<string, unknown>): Array<[string, Record<string, unknown>]> =>
      BLOC_ORDER.filter((b) => b !== skip).map((b): [string, Record<string, unknown>] => [macroTables.bloc.name, { id: b, realGdpIndex: 100 }]).concat(row.id ? [[macroTables.bloc.name, row]] : []);
    expect(() => dailyTrade(fakeWorld({}, rows('SRL', {})).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'I0.macro_bloc' }));
    expect(() => dailyTrade(fakeWorld({}, rows('EUN', { id: 'EUN' })).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'I0.macro_bloc' }));
    expect(() => dailyTrade(fakeWorld({}, rows('PYN', { id: 'PYN', realGdpIndex: Number.NaN })).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'I0.macro_bloc' }));
    expect(() => dailyTrade(fakeWorld({}, rows('', {})).ctx, defaultMacroPorts())).not.toThrow();
  });
  it('throws without the GLOBAL row', () => { expect(() => dailyTrade(fakeWorld(null).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'I0.macro_global' })); });
});
