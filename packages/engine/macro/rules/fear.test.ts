import { describe, expect, it } from 'vitest';
import { tradingDaysBetween, type PhaseCtx } from '@tycoon/engine-core';
import { assertNoHiddenFields, MACRO_EVENTS } from '../events';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type GlobalMacroState, type MacroInputs } from '../schema';
import { hourlyFsi } from './fsi';
import { crisisTerm, fearRaw, hourlyFear, impliedVolAnchor, riskAppetite, stepFear, type FearInputs } from './fear';

const NEUTRAL: FearInputs = { rv21Gx: 0.16, creditSpreadIdx: 1, fsi: 0, crisisTerm: 0, tension: 50, hackRate: 50, gxReturnToday: 0, gxReturn63d: 0 };
const STORM: FearInputs = { rv21Gx: 0.24, creditSpreadIdx: 1.1, fsi: 0.3, crisisTerm: 0.5, tension: 60, hackRate: 50, gxReturnToday: -0.01, gxReturn63d: -0.05 };

type Ev = { kind: string; payload: unknown; vis: string };
const sched = (o: Partial<GlobalMacroState['scheduler']> = {}): GlobalMacroState['scheduler'] => ({ lastMajorEndTick: null, lastMajorStartTick: null, majorsThisChapter: 0,
  playerCausedSuppressUntil: null, timezoneBandNext: 0, crisisWeek: null, crisisWeekUsedThisChapter: false, activeMajorId: null, activeStormIds: [], activeRippleIds: [], ...o });
/** The genesis HOURLY row (E-93 (2), T04-20 step 1.1). */
const GENESIS_HOURLY = { id: 'HOURLY', tick: 0, staleKeys: [] as string[], values: { rv21Gx: 0.16, gxReturnToday: 0, 'fsi.bankEquityDd': 0, 'fsi.ccpFund': 0,
  'fsi.etfDiscount': 0, 'fsi.interbank': 0, 'fsi.repoHaircut': 0, 'fsi.stablecoinDepeg': 0 } as Record<string, number> };
const hourlyWith = (v: Record<string, number>, staleKeys: string[] = []): [string, Record<string, unknown>] =>
  [macroTables.inputs.name, { ...GENESIS_HOURLY, staleKeys, values: { ...GENESIS_HOURLY.values, ...v } }];
const hist = (d: number, equityIndex: number): [string, Record<string, unknown>] => [macroTables.history.name, { id: `GLOBAL:${d}`, equityIndex }];
function fakeWorld(global: Record<string, unknown> | null, extra: Array<[string, Record<string, unknown>]> = [], gameDay = 10, o: { hourly?: boolean } = {}) {
  const rows = new Map<string, unknown>();
  const key = (t: string, id: string): string => `${t}|${id}`;
  if (global) rows.set(key(macroTables.global.name, 'GLOBAL'), { id: 'GLOBAL', fearIndex: 22, riskAppetite: 0.56, financialStressIndex: 0, tariffLevel: 0.03, tariffBase: 0.03, worldTradeIndex: 100, scheduler: sched(), ...global });
  if (o.hourly !== false) rows.set(key(macroTables.inputs.name, 'HOURLY'), { ...GENESIS_HOURLY, values: { ...GENESIS_HOURLY.values } });
  for (const b of BLOC_ORDER) rows.set(key(macroTables.bloc.name, b), { id: b, sovereign: { stressIndex: 0 } });
  for (const [t, r] of extra) rows.set(key(t, r.id as string), r);
  const events: Ev[] = [];
  let inputPuts = 0;
  const store = { get: (t: string, id: string) => rows.get(key(t, id)), put: (t: string, e: { id: string }) => { if (t === macroTables.inputs.name) inputPuts++; rows.set(key(t, e.id), e); },
    del: () => undefined, iter: () => [], range: () => [], index: () => [], count: () => 0 };
  const ctx = { tick: gameDay * 720, cal: { gameDay, tickOfDay: 0 }, store, emit: (kind: string, _s: unknown, payload: unknown, vis: string) => { events.push({ kind, payload, vis }); } } as unknown as PhaseCtx;
  return { ctx, events, global: () => rows.get(key(macroTables.global.name, 'GLOBAL')) as GlobalMacroState, inputs: () => rows.get(key(macroTables.inputs.name, 'INPUTS')) as MacroInputs | undefined,
    hourly: () => rows.get(key(macroTables.inputs.name, 'HOURLY')) as MacroInputs, inputPuts: () => inputPuts };
}
const ports = (o: { rv?: number | null; r?: number | null; lvl?: number | null; ig?: number | null } = {}): MacroPorts => {
  const p = defaultMacroPorts();
  return { ...p, markets: { ...p.markets, rv21Gx: () => o.rv ?? null, gxReturnToday: () => o.r ?? null, gxLevel: () => o.lvl ?? null },
    assets: { ...p.assets, igCreditSpreadIndex: () => o.ig ?? null } };
};

describe('T04-15 fear formulas (04 §3.14.1 worked numbers)', () => {
  it('neutral inputs → raw 23.147522', () => { expect(fearRaw(NEUTRAL)).toBeCloseTo(23.147522, 6); });
  it('storm example → exponent 2.826667, raw 94.409994', () => {
    expect(Math.log(fearRaw(STORM) / (100 - fearRaw(STORM)))).toBeCloseTo(2.826667, 6);
    expect(fearRaw(STORM)).toBeCloseTo(94.409994, 6);
  });
  it('each term moves the exponent by its coefficient', () => {
    const z = (x: FearInputs): number => Math.log(fearRaw(x) / (100 - fearRaw(x)));
    const base = z(NEUTRAL);
    expect(z({ ...NEUTRAL, rv21Gx: 0.32 }) - base).toBeCloseTo(3, 9);
    expect(z({ ...NEUTRAL, creditSpreadIdx: 2 }) - base).toBeCloseTo(2, 9);
    expect(z({ ...NEUTRAL, fsi: 1 }) - base).toBeCloseTo(2.5, 9);
    expect(z({ ...NEUTRAL, crisisTerm: 1 }) - base).toBeCloseTo(1, 9);
    expect(z({ ...NEUTRAL, tension: 100 }) - base).toBeCloseTo(0.8, 9);
    expect(z({ ...NEUTRAL, hackRate: 100 }) - base).toBeCloseTo(0.5, 9);
    expect(z({ ...NEUTRAL, gxReturnToday: -0.03 }) - base).toBeCloseTo(2, 9);
    expect(z({ ...NEUTRAL, gxReturnToday: 0.03 }) - base).toBeCloseTo(0, 9);   // only falls count
    expect(z({ ...NEUTRAL, gxReturn63d: 0.10 }) - base).toBeCloseTo(-0.5, 9);
  });
  it('one hourly step from F 22 → 43.208396; two steps halve the gap', () => {
    const raw = fearRaw(STORM);
    expect(stepFear(22, raw)).toBeCloseTo(43.208396, 6);
    expect(raw - stepFear(stepFear(22, raw), raw)).toBeCloseTo((raw - 22) / 2, 9);
  });
  it('RA at F 75 = −0.5; impliedVolAnchor(25) = 0.20', () => {
    expect(riskAppetite(75)).toBe(-0.5);
    expect(riskAppetite(0)).toBe(1);
    expect(impliedVolAnchor(25)).toBeCloseTo(0.20, 15);
  });
});

describe('T04-15 crisisTerm', () => {
  const ev = (id: string, phase: string): [string, Record<string, unknown>] => [macroTables.event.name, { id, phase, shocks: [] }];
  it('1 in TRIGGER or CONTAGION, 0.5 with only a storm, else 0', () => {
    expect(crisisTerm(fakeWorld({ scheduler: sched({ activeMajorId: 'e1' }) }, [ev('e1', 'TRIGGER')]).ctx.store)).toBe(1);
    expect(crisisTerm(fakeWorld({ scheduler: sched({ activeMajorId: 'e1' }) }, [ev('e1', 'CONTAGION')]).ctx.store)).toBe(1);
    expect(crisisTerm(fakeWorld({ scheduler: sched({ activeStormIds: ['s1'] }) }).ctx.store)).toBe(0.5);
    expect(crisisTerm(fakeWorld({ scheduler: sched({ activeMajorId: 'e1', activeStormIds: ['s1'] }) }, [ev('e1', 'PRECURSOR')]).ctx.store)).toBe(0.5);
    expect(crisisTerm(fakeWorld({ scheduler: sched({ activeMajorId: 'e1' }) }, [ev('e1', 'PRECURSOR')]).ctx.store)).toBe(0);
    expect(crisisTerm(fakeWorld({}).ctx.store)).toBe(0);
    expect(crisisTerm(fakeWorld(null).ctx.store)).toBe(0);
  });
});

describe('T04-15 hourlyFear', () => {
  const g0 = (x: Partial<FearInputs> = {}): number => stepFear(22, fearRaw({ ...NEUTRAL, tension: 30, hackRate: 0, ...x }));
  it('genesis neutral inputs (no modules): F steps from 22 toward raw(rv .16, csi 1, T 30, H 0); RA; macro.fear PUBLIC with no hidden field', () => {
    const w = fakeWorld({});
    hourlyFear(w.ctx, defaultMacroPorts());
    const F = g0();
    expect(w.global().fearIndex).toBe(F);
    expect(w.global().riskAppetite).toBe(1 - F / 50);
    expect(w.events).toEqual([{ kind: 'macro.fear', payload: { F, RA: 1 - F / 50 }, vis: 'PUBLIC' }]);
    expect(() => MACRO_EVENTS['macro.fear']!.parse(w.events[0]!.payload)).not.toThrow();
    expect(assertNoHiddenFields(w.events[0]!.payload)).toEqual([]);
    expect(w.hourly().staleKeys).toEqual(['igCreditSpreadIndex', 'rv21Gx', 'gxReturnToday']);
    expect(w.hourly().values).toEqual(GENESIS_HOURLY.values);
    expect(w.hourly().tick).toBe(w.ctx.tick);
    expect(w.inputs()).toBeUndefined();   // E-93 (2): hourly code never writes INPUTS
  });
  it('uses live inputs, this hour’s FSI and the snapshot’s tension and hack rate (storm example 43.208396)', () => {
    const w = fakeWorld({ fearIndex: 22, financialStressIndex: 0.3, scheduler: sched({ activeStormIds: ['s'] }) },
      [[macroTables.inputs.name, { id: 'INPUTS', tick: 0, staleKeys: [], values: { geopoliticalTension: 60, worldHackRate: 50 } }],
       hourlyWith({ 'igClose.99': 0.01 }), hist(10, 5000)], 100);
    hourlyFear(w.ctx, ports({ rv: 0.24, r: -0.01, lvl: 4750, ig: 0.0122222222222222 }));
    // csi = 0.012222/mean(0.01, 0.012222) = 1.1; r63 = 4750/5000 − 1 = −5% (day 100: 63 FDL trading days before day 99 is day 10)
    expect(w.global().fearIndex).toBeCloseTo(43.208396, 6);
    expect(w.hourly().staleKeys).toEqual([]);
    expect(w.hourly().values['igClose.100']).toBe(0.0122222222222222);
  });
  it('a null rv21 holds the previous value in HOURLY and lists rv21Gx as stale (once)', () => {
    const w = fakeWorld({});
    hourlyFear(w.ctx, ports({ rv: 0.24, r: 0, lvl: null, ig: 0.01 }));
    const F1 = w.global().fearIndex;
    hourlyFear(w.ctx, ports({ rv: null, r: 0, lvl: null, ig: 0.01 }));
    hourlyFear(w.ctx, ports({ rv: null, r: 0, lvl: null, ig: 0.01 }));
    const raw = fearRaw({ ...NEUTRAL, rv21Gx: 0.24, tension: 30, hackRate: 0 });
    expect(F1).toBe(stepFear(22, raw));
    expect(w.global().fearIndex).toBe(stepFear(stepFear(F1, raw), raw));   // 0.24 held, not 0.16
    expect(w.hourly().values['rv21Gx']).toBe(0.24);
    expect(w.hourly().staleKeys).toEqual(['rv21Gx']);
    expect(w.inputs()).toBeUndefined();
  });
  it('a null IG holds the last IG level against the stored closes; never held → csi 1', () => {
    const w = fakeWorld({}, [hourlyWith({ igCreditSpreadIndex: 0.0122222222222222, 'igClose.9': 0.01, 'igClose.10': 0.0122222222222222 })]);
    hourlyFear(w.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: null }));
    expect(w.global().fearIndex).toBeCloseTo(g0({ creditSpreadIdx: 1.1 }), 9);
    expect(w.hourly().staleKeys).toEqual(['igCreditSpreadIndex']);
    expect(w.hourly().values['igClose.10']).toBe(0.0122222222222222);
    const z = fakeWorld({}, [hourlyWith({ 'igClose.9': 0.01 })]);
    hourlyFear(z.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: null }));
    expect(z.global().fearIndex).toBe(g0());
  });
  it('IG history: the 364-day mean drops the close 364 days back, and HOURLY drops its key', () => {
    const vals: Record<string, number> = { 'igClose.-354': 0.05 };   // day 10 − 364: leaves the window today
    for (let d = -353; d < 10; d++) vals[`igClose.${d}`] = 0.01;
    const w = fakeWorld({}, [hourlyWith(vals)]);
    hourlyFear(w.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: 0.01 }));
    expect(w.hourly().values['igClose.-354']).toBeUndefined();
    expect(w.hourly().values['igClose.10']).toBe(0.01);
    expect(w.global().fearIndex).toBeCloseTo(g0(), 12);   // csi 1 exactly
    expect(w.inputs()).toBeUndefined();
  });
  it('E-93 (2): HOURLY is put only when a value or staleKeys changed', () => {
    const w = fakeWorld({});
    hourlyFear(w.ctx, ports({ rv: 0.2, r: 0.01, lvl: null, ig: 0.01 }));
    expect(w.inputPuts()).toBe(1);
    hourlyFear(w.ctx, ports({ rv: 0.2, r: 0.01, lvl: null, ig: 0.01 }));
    expect(w.inputPuts()).toBe(1);
    hourlyFear(w.ctx, ports({ rv: null, r: 0.01, lvl: null, ig: 0.01 }));
    expect(w.inputPuts()).toBe(2);
    hourlyFear(w.ctx, ports({ rv: null, r: 0.01, lvl: null, ig: 0.01 }));
    expect(w.inputPuts()).toBe(2);
    hourlyFear(w.ctx, ports({ rv: null, r: 0.02, lvl: null, ig: 0.01 }));
    expect(w.inputPuts()).toBe(3);
    const g = fakeWorld({}, [hourlyWith({ igCreditSpreadIndex: 0.01, 'igClose.10': 0.01 })]);
    hourlyFear(g.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: 0.01 }));   // all equal to the held values
    expect(g.inputPuts()).toBe(0);
  });
  it('#72 item 3: card order inside the hour, hourlyFsi then hourlyFear reading the FSI just written', () => {
    const w = fakeWorld({ financialStressIndex: 0 });
    const p = defaultMacroPorts();
    const q: MacroPorts = { ...p, markets: { ...p.markets, bankEquityDrawdown364: () => 0.5 } };   // FSI = 0.15 · clamp(0.5/0.50) = 0.15
    hourlyFsi(w.ctx, q);
    expect(w.global().financialStressIndex).toBeCloseTo(0.15, 12);
    hourlyFear(w.ctx, q);
    expect(w.global().fearIndex).toBeCloseTo(g0({ fsi: 0.15 }), 12);
  });
  it('E-93 (3): r63 is 63 FDL trading days back from the latest closed trading day, not 63 game days', () => {
    expect(tradingDaysBetween('FDL', 15, 102)).toBe(63);   // day 105: days 103, 104 are the weekend; latest close 102
    const w = fakeWorld({}, [hist(15, 5000), hist(42, 500), hist(14, 500), hist(16, 500), hist(39, 500)], 105);
    hourlyFear(w.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }));
    expect(w.global().fearIndex).toBeCloseTo(g0({ gxReturn63d: 0.1 }), 9);
    const v = fakeWorld({}, [hist(10, 5000), hist(37, 500), hist(9, 500), hist(11, 500)], 100);
    hourlyFear(v.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }));
    expect(v.global().fearIndex).toBeCloseTo(g0({ gxReturn63d: 0.1 }), 9);
  });
  it('E-93 (3): r63 is 0 until the history row exists (early game, no row, no level); day 88 reaches back to genesis day 0', () => {
    const early = fakeWorld({}, [hist(0, 5000)], 10);
    hourlyFear(early.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }));
    expect(early.global().fearIndex).toBe(g0());
    const none = fakeWorld({}, [], 100);
    hourlyFear(none.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }));
    expect(none.global().fearIndex).toBe(g0());
    const noLvl = fakeWorld({}, [hist(10, 5000)], 100);
    hourlyFear(noLvl.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: null }));
    expect(noLvl.global().fearIndex).toBe(g0());
    const d88 = fakeWorld({}, [hist(0, 5000)], 88);
    hourlyFear(d88.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }));
    expect(d88.global().fearIndex).toBeCloseTo(g0({ gxReturn63d: 0.1 }), 9);
  });
  it('#72 (a): r63Day honours the holidays flag (day 100: day 10 with holidays off, day 9 with the D016 table on: FDL day 60 is closed)', () => {
    const off = fakeWorld({}, [hist(10, 5000), hist(9, 2500)], 100);
    hourlyFear(off.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }));
    expect(off.global().fearIndex).toBeCloseTo(g0({ gxReturn63d: 0.1 }), 9);
    const on = fakeWorld({}, [hist(10, 5000), hist(9, 2500)], 100);
    hourlyFear(on.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }), true);
    expect(on.global().fearIndex).toBeCloseTo(g0({ gxReturn63d: 1.2 }), 9);
    // day 237: the latest close skips the FDL HARVEST holiday (day 236) too → day 147 (148 if the latest-close walk ignored it)
    const harvest = fakeWorld({}, [hist(147, 5000), hist(148, 2500)], 237);
    hourlyFear(harvest.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }), true);
    expect(harvest.global().fearIndex).toBeCloseTo(g0({ gxReturn63d: 0.1 }), 9);
  });
  it('#72 (c): once the history row exists a null GX level holds the last r63 and lists gxReturn63d stale (once); never held → 0', () => {
    const w = fakeWorld({}, [hist(10, 5000)], 100);
    hourlyFear(w.ctx, ports({ rv: 0.16, r: 0, lvl: 5500, ig: null }));
    expect(w.hourly().values['gxReturn63d']).toBeCloseTo(0.1, 15);
    expect(w.hourly().staleKeys).not.toContain('gxReturn63d');
    const F1 = w.global().fearIndex;
    hourlyFear(w.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: null }));
    hourlyFear(w.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: null }));
    const raw = fearRaw({ ...NEUTRAL, tension: 30, hackRate: 0, gxReturn63d: 0.1 });
    expect(w.global().fearIndex).toBe(stepFear(stepFear(F1, raw), raw));   // 0.1 held, not 0
    expect(w.hourly().staleKeys.filter((k) => k === 'gxReturn63d')).toEqual(['gxReturn63d']);
    const fresh = fakeWorld({}, [hist(10, 5000)], 100);
    hourlyFear(fresh.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: null }));
    expect(fresh.global().fearIndex).toBe(g0());
    expect(fresh.hourly().staleKeys).toContain('gxReturn63d');
    const early = fakeWorld({}, [], 100);
    hourlyFear(early.ctx, ports({ rv: 0.16, r: 0, lvl: null, ig: null }));
    expect(early.hourly().staleKeys).not.toContain('gxReturn63d');   // before history exists: 0, nothing held
  });
  it('E-93 (4): missing GLOBAL or HOURLY row → MAC_STATE_MISSING with the row id', () => {
    expect(() => hourlyFear(fakeWorld(null).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['GLOBAL'] }));
    expect(() => hourlyFear(fakeWorld({}, [], 10, { hourly: false }).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['HOURLY'] }));
  });
});
