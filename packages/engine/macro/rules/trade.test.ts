import { describe, expect, it } from 'vitest';
import type { PhaseCtx } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocId, type GlobalMacroState, type MacroInputs } from '../schema';
import { dailyTrade, effectiveTariff, stepTariff, worldTradeIndex } from './trade';

type Ev = { kind: string; payload: unknown; vis: string };
const sched = (o: Partial<GlobalMacroState['scheduler']> = {}): GlobalMacroState['scheduler'] => ({ lastMajorEndTick: null, lastMajorStartTick: null, majorsThisChapter: 0,
  playerCausedSuppressUntil: null, timezoneBandNext: 0, crisisWeek: null, crisisWeekUsedThisChapter: false, activeMajorId: null, activeStormIds: [], activeRippleIds: [], ...o });
function fakeWorld(global: Record<string, unknown> | null, extra: Array<[string, Record<string, unknown>]> = [], gameDay = 10) {
  const rows = new Map<string, unknown>();
  const key = (t: string, id: string): string => `${t}|${id}`;
  if (global) rows.set(key(macroTables.global.name, 'GLOBAL'), { id: 'GLOBAL', fearIndex: 22, riskAppetite: 0.56, financialStressIndex: 0, tariffLevel: 0.03, tariffBase: 0.03, worldTradeIndex: 100, scheduler: sched(), ...global });
  for (const [t, r] of extra) rows.set(key(t, r.id as string), r);
  const events: Ev[] = [];
  const store = { get: (t: string, id: string) => rows.get(key(t, id)), put: (t: string, e: { id: string }) => { rows.set(key(t, e.id), e); },
    del: () => undefined, iter: (t: string) => [...rows].filter(([k]) => k.startsWith(`${t}|`)).map(([, v]) => v), range: () => [], index: () => [], count: () => 0 };
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
  it('effectiveTariff = clamp(base + shock sum, 0, 0.4)', () => {
    expect(effectiveTariff(0.03, 0.10)).toBeCloseTo(0.13, 15);
    expect(effectiveTariff(0.35, 0.10)).toBe(0.4);
    expect(effectiveTariff(0.03, -0.1)).toBe(0);
    expect(effectiveTariff(0.03, 0)).toBe(0.03);
  });
  it('stepTariff sums deltas and clamps to [0, 0.4]', () => {
    expect(stepTariff(0.03, [0.02, 0.01])).toBeCloseTo(0.06, 15);
    expect(stepTariff(0.35, [0.1])).toBe(0.4);
    expect(stepTariff(0.03, [-0.1])).toBe(0);
    expect(stepTariff(0.03, [])).toBe(0.03);
  });
});

describe('T04-15 dailyTrade', () => {
  const withDelta = (d: number | ((day: number) => number)): MacroPorts => { const p = defaultMacroPorts();
    return { ...p, world: { ...p.world, tariffDelta: (_s: unknown, tick: number) => (typeof d === 'number' ? d : d(Math.floor(tick / 720))) } }; };
  const blocs = (v = 100): Array<[string, Record<string, unknown>]> => BLOC_ORDER.map((b): [string, Record<string, unknown>] => [macroTables.bloc.name, { id: b, realGdpIndex: v }]);
  const shock = (id: string, value: number, startTick: number, endTick: number, shape = 'STEP', o: Record<string, unknown> = {}) =>
    ({ id, target: 'tariff_level', value, startTick, endTick, shape, ...o });
  const evRow = (id: string, shocks: unknown[]): [string, Record<string, unknown>] => [macroTables.event.name, { id, phase: 'TRIGGER', shocks }];
  /** Runs dailyTrade at the close of each day in `days` and returns [tariffBase, tariffLevel] after each. */
  function run(w: ReturnType<typeof fakeWorld>, days: number[], p: MacroPorts): Array<[number, number]> {
    return days.map((d) => { dailyTrade({ ...w.ctx, tick: d * 720, cal: { gameDay: d, tickOfDay: 0 } } as typeof w.ctx, p);
      return [(w.global() as GlobalMacroState).tariffBase, w.global().tariffLevel]; });
  }
  it('genesis state, no modules → base 0.03, tariff 0.03, WTI 100', () => {
    const w = fakeWorld({}, blocs());
    dailyTrade(w.ctx, defaultMacroPorts());
    expect([w.global().tariffBase, w.global().tariffLevel, w.global().worldTradeIndex]).toEqual([0.03, 0.03, 100]);
  });
  it('16 delta moves the base, an active tariff_level shock lifts the level, then WTI from the bloc rows', () => {
    const tick = 10 * 720;
    const ev: [string, Record<string, unknown>] = [macroTables.event.name, { id: 'tw', phase: 'TRIGGER', shocks: [shock('k', 0.05, tick - 3, tick + 9999),
      { id: 'k2', target: 'gdp_growth', value: 9, startTick: tick - 3, endTick: tick + 9999, shape: 'STEP' }] }];
    const w = fakeWorld({}, [ev, ...blocs(101)]);
    dailyTrade(w.ctx, withDelta(0.02));
    expect(w.global().tariffBase).toBeCloseTo(0.05, 15);
    expect(w.global().tariffLevel).toBeCloseTo(0.10, 15);
    expect(w.global().worldTradeIndex).toBeCloseTo(87.382328, 6);
  });
  it('E-94 (a) example 1: TRADE_WAR +0.10 on days 11–14: level 0.03 → 0.13 while active → 0.03 at the end; base stays 0.03', () => {
    const w = fakeWorld({}, [evRow('tw', [shock('k', 0.10, 11 * 720 - 5, 15 * 720 - 5)]), ...blocs()]);
    const r = run(w, [10, 11, 12, 13, 14, 15, 16], withDelta(0));
    expect(r.map(([b]) => b)).toEqual([0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03]);
    const lv = r.map(([, l]) => l);
    expect(lv[0]).toBe(0.03); for (const l of lv.slice(1, 5)) expect(l).toBeCloseTo(0.13, 15);
    expect(lv.slice(5)).toEqual([0.03, 0.03]);
  });
  it('AC-04-15-TARIFF-CAP: base 0.25, shock → 0.35; delta +0.10 → base 0.35, level 0.40; shock ends → 0.35 exactly (E-93 (3) gave 0.30)', () => {
    const w = fakeWorld({ tariffBase: 0.25, tariffLevel: 0.25 }, [evRow('tw', [shock('k', 0.10, 11 * 720 - 5, 14 * 720 - 5)]), ...blocs()]);
    const r = run(w, [11, 12, 13, 14], withDelta((d) => (d === 12 ? 0.10 : 0)));
    expect(r).toEqual([[0.25, 0.35], [0.35, 0.4], [0.35, 0.4], [0.35, 0.35]]);
  });
  it('AC-04-15-TARIFF-NOSHOCK: deltas +0.02, +0.05, −0.01 from 0.03 → level equals base each day and the E-93 (3) path bit for bit', () => {
    const deltas: Record<number, number> = { 10: 0.02, 11: 0.05, 12: -0.01 };
    const w = fakeWorld({}, blocs());
    const r = run(w, [10, 11, 12], withDelta((d) => deltas[d]!));
    let e93 = 0.03;
    for (const [i, [b, l]] of r.entries()) { e93 = stepTariff(e93, [deltas[10 + i]!, 0 - 0]); expect(l).toBe(b); expect(l).toBe(e93); }
    expect(r[2]![1]).toBeCloseTo(0.09, 15);
  });
  it('sums the tariff_level shocks of every event; a shock starting later is not applied yet', () => {
    const tick = 10 * 720;
    const w = fakeWorld({}, [evRow('mj', [shock('f', 0.07, tick + 5, tick + 9999)]), evRow('st', [shock('s', 0.02, tick - 1, tick + 9999)]),
      evRow('rp', [shock('r', 0.01, tick, tick + 9999)]), ...blocs()]);
    dailyTrade(w.ctx, withDelta(0));
    expect(w.global().tariffLevel).toBeCloseTo(0.06, 15);
    expect(w.global().tariffBase).toBe(0.03);
  });
  it('T04-18 step 4 shapes: RAMP rises linearly from 0 on [start, end); DECAY halves every halfLifeDays; DECAY without halfLifeDays faults', () => {
    const ramp = fakeWorld({}, [evRow('r', [shock('k', 0.10, 10 * 720, 14 * 720, 'RAMP')]), ...blocs()]);
    const rl = run(ramp, [10, 11, 12, 13, 14, 15], withDelta(0)).map(([, l]) => l);
    [0.03, 0.055, 0.08, 0.105, 0.03, 0.03].forEach((v, i) => expect(rl[i]).toBeCloseTo(v, 15));
    const dec = fakeWorld({}, [evRow('d', [shock('k', 0.08, 10 * 720, 99 * 720, 'DECAY', { halfLifeDays: 1 })]), ...blocs()]);
    const dl = run(dec, [10, 11, 12], withDelta(0)).map(([, l]) => l);
    [0.11, 0.07, 0.05].forEach((v, i) => expect(dl[i]).toBeCloseTo(v, 12));
    const bad = fakeWorld({}, [evRow('d', [shock('k', 0.08, 10 * 720, 99 * 720, 'DECAY')]), ...blocs()]);
    expect(() => dailyTrade(bad.ctx, withDelta(0))).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['k'] }));
  });
  it('tariff clamps at 0.4', () => {
    const w = fakeWorld({ tariffBase: 0.39, tariffLevel: 0.39 }, blocs());
    dailyTrade(w.ctx, withDelta(0.05));
    expect([w.global().tariffBase, w.global().tariffLevel]).toEqual([0.4, 0.4]);
  });
  it('E-93 (5): no fallback to 100, a missing bloc row or realGdpIndex is MAC_STATE_MISSING with the bloc id', () => {
    const rows = (skip: string, row: Record<string, unknown>): Array<[string, Record<string, unknown>]> =>
      blocs().filter(([, r]) => r.id !== skip).concat(row.id ? [[macroTables.bloc.name, row]] : []);
    expect(() => dailyTrade(fakeWorld({}, rows('SRL', {})).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['SRL'] }));
    expect(() => dailyTrade(fakeWorld({}, rows('EUN', { id: 'EUN' })).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['EUN'] }));
    expect(() => dailyTrade(fakeWorld({}, rows('', {})).ctx, defaultMacroPorts())).not.toThrow();
  });
  it('E-93 (4): missing GLOBAL row or its tariffBase → MAC_STATE_MISSING [GLOBAL]', () => {
    expect(() => dailyTrade(fakeWorld(null).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['GLOBAL'] }));
    expect(() => dailyTrade(fakeWorld({ tariffBase: undefined }, blocs()).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['GLOBAL'] }));
  });
});
