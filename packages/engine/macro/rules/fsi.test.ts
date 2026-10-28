import { describe, expect, it } from 'vitest';
import type { PhaseCtx } from '@tycoon/engine-core';
import { assertNoHiddenFields, MACRO_EVENTS } from '../events';
import { defaultMacroPorts, type MacroCreditPort, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type GlobalMacroState, type MacroInputs } from '../schema';
import { FSI_DIVISORS, FSI_WEIGHTS, fsiOf, hourlyFsi, type FsiComponents } from './fsi';

type Ev = { kind: string; payload: unknown; vis: string };
const sched = (o: Partial<GlobalMacroState['scheduler']> = {}): GlobalMacroState['scheduler'] => ({ lastMajorEndTick: null, lastMajorStartTick: null, majorsThisChapter: 0,
  playerCausedSuppressUntil: null, timezoneBandNext: 0, crisisWeek: null, crisisWeekUsedThisChapter: false, activeMajorId: null, activeStormIds: [], activeRippleIds: [], ...o });
/** The genesis HOURLY row (E-93 (2), T04-20 step 1.1): rv 0.16, gx return 0, the six fsi.* keys 0, IG absent. */
const GENESIS_HOURLY = { id: 'HOURLY', tick: 0, staleKeys: [] as string[], values: { rv21Gx: 0.16, gxReturnToday: 0, 'fsi.bankEquityDd': 0, 'fsi.ccpFund': 0,
  'fsi.etfDiscount': 0, 'fsi.interbank': 0, 'fsi.repoHaircut': 0, 'fsi.stablecoinDepeg': 0 } as Record<string, number> };
function fakeWorld(global: Record<string, unknown> | null, extra: Array<[string, Record<string, unknown>]> = [], gameDay = 10, o: { hourly?: boolean; blocs?: boolean } = {}) {
  const rows = new Map<string, unknown>();
  const key = (t: string, id: string): string => `${t}|${id}`;
  if (global) rows.set(key(macroTables.global.name, 'GLOBAL'), { id: 'GLOBAL', fearIndex: 22, riskAppetite: 0.56, financialStressIndex: 0, tariffLevel: 0.03, tariffBase: 0.03, worldTradeIndex: 100, scheduler: sched(), ...global });
  if (o.hourly !== false) rows.set(key(macroTables.inputs.name, 'HOURLY'), { ...GENESIS_HOURLY, values: { ...GENESIS_HOURLY.values } });
  if (o.blocs !== false) for (const b of BLOC_ORDER) rows.set(key(macroTables.bloc.name, b), { id: b, sovereign: { stressIndex: 0 } });
  for (const [t, r] of extra) rows.set(key(t, r.id as string), r);
  const events: Ev[] = [];
  let inputPuts = 0;
  const store = { get: (t: string, id: string) => rows.get(key(t, id)), put: (t: string, e: { id: string }) => { if (t === macroTables.inputs.name) inputPuts++; rows.set(key(t, e.id), e); },
    del: () => undefined, iter: () => [], range: () => [], index: () => [], count: () => 0 };
  const ctx = { tick: gameDay * 720, cal: { gameDay, tickOfDay: 0 }, store, emit: (kind: string, _s: unknown, payload: unknown, vis: string) => { events.push({ kind, payload, vis }); } } as unknown as PhaseCtx;
  return { ctx, events, global: () => rows.get(key(macroTables.global.name, 'GLOBAL')) as GlobalMacroState, inputs: () => rows.get(key(macroTables.inputs.name, 'INPUTS')) as MacroInputs | undefined,
    hourly: () => rows.get(key(macroTables.inputs.name, 'HOURLY')) as MacroInputs, inputPuts: () => inputPuts };
}
const WORKED: FsiComponents = { interbank: 0.006, repoHaircut: 3, ccpFund: 0, bankEquityDd: 0.2, igSpread: 0.012, stablecoinDepeg: 0.01, etfDiscount: 0.01, sovStressMax: 0.3 };
const KEYS = Object.freeze(['interbank', 'repoHaircut', 'ccpFund', 'bankEquityDd', 'igSpread', 'stablecoinDepeg', 'etfDiscount', 'sovStressMax'] as const);

describe('T04-15 fsiOf (04 §3.14.2)', () => {
  it('weights and divisors as specified; weights sum to 1', () => {
    expect(KEYS.map((k) => FSI_WEIGHTS[k])).toEqual([0.20, 0.10, 0.10, 0.15, 0.20, 0.05, 0.05, 0.15]);
    expect(KEYS.map((k) => FSI_DIVISORS[k])).toEqual([0.015, 10, 0.25, 0.50, 0.03, 0.10, 0.05, 1]);
    expect(KEYS.reduce((a, k) => a + FSI_WEIGHTS[k], 0)).toBeCloseTo(1, 15);
  });
  it('worked example → 0.31', () => {
    const r = fsiOf(WORKED);
    expect(r.fsi).toBeCloseTo(0.31, 12);
    const want = { interbank: 0.4, repoHaircut: 0.3, ccpFund: 0, bankEquityDd: 0.4, igSpread: 0.4, stablecoinDepeg: 0.1, etfDiscount: 0.2, sovStressMax: 0.3 };
    for (const k of KEYS) expect(r.normalized[k]).toBeCloseTo(want[k], 12);
  });
  it('every component at its divisor → 1.0; above clamps; negatives clamp to 0; null → 0', () => {
    const at = { ...FSI_DIVISORS } as FsiComponents;
    expect(fsiOf(at).fsi).toBeCloseTo(1, 12);
    const twice = Object.fromEntries(KEYS.map((k) => [k, 2 * FSI_DIVISORS[k]])) as unknown as FsiComponents;
    expect(fsiOf(twice).fsi).toBeCloseTo(1, 12);
    expect(fsiOf({ ...WORKED, repoHaircut: -5 }).normalized.repoHaircut).toBe(0);
    expect(fsiOf({ ...WORKED, interbank: null }).fsi).toBeCloseTo(0.31 - 0.08, 12);
    for (const k of KEYS) expect(fsiOf({ ...WORKED, [k]: 0 }).fsi).toBeCloseTo(0.31 - FSI_WEIGHTS[k] * fsiOf(WORKED).normalized[k], 12);
  });
});

const credit = (o: { ib?: number | null; repo?: number | null; ccp?: number | null } = {}): MacroCreditPort => ({
  creditAggregates: () => (o.ib === null ? null : { credit: 0, creditConditions: 0, interbankSpread: o.ib ?? 0 }),
  repoHaircutIndexChange: () => o.repo ?? null, ccpDefaultFundUsage: () => o.ccp ?? null } as unknown as MacroCreditPort);
const portsOf = (c: MacroCreditPort | null, o: { dd?: number | null; ig?: number | null; depeg?: number | null; etf?: number | null } = {}): MacroPorts => {
  const p = defaultMacroPorts();
  return { ...p, credit: c, markets: { ...p.markets, bankEquityDrawdown364: (_s, b) => (b === 'WORLD' ? o.dd ?? null : 0.5) },
    assets: { ...p.assets, igCreditSpreadIndex: () => o.ig ?? null, maxStablecoinDepeg: () => o.depeg ?? null },
    funds: { ...p.funds, etfDiscountIndex: () => o.etf ?? null } };
};
const blocRows = (stress: number[]): Array<[string, Record<string, unknown>]> => BLOC_ORDER.map((b, i) => [macroTables.bloc.name, { id: b, sovereign: { stressIndex: stress[i] } }]);

describe('T04-15 hourlyFsi', () => {
  it('worked example end to end: FSI 0.31 to GLOBAL, macro.fsi PUBLIC with the normalized components, no hidden field', () => {
    const w = fakeWorld({}, blocRows([0.1, 0.3, 0.2, 0, 0.05]));
    hourlyFsi(w.ctx, portsOf(credit({ ib: 0.006, repo: 3, ccp: 0 }), { dd: 0.2, ig: 0.012, depeg: 0.01, etf: 0.01 }));
    expect(w.global().financialStressIndex).toBeCloseTo(0.31, 12);
    expect(w.events).toHaveLength(1);
    const e = w.events[0]!;
    expect(e.kind).toBe('macro.fsi'); expect(e.vis).toBe('PUBLIC');
    const want: Record<string, number> = { interbankSpread: 0.4, repoHaircutChange: 0.3, ccpFundUsage: 0, npcBankEquityDrawdown: 0.4, igSpread: 0.4, stablecoinDepeg: 0.1, etfDiscount: 0.2, sovereignStress: 0.3 };
    const got = e.payload as { fsi: number; components: Record<string, number> };
    expect(got.fsi).toBe(w.global().financialStressIndex);
    expect(Object.keys(got.components).sort((a, b) => a.localeCompare(b))).toEqual(Object.keys(want).sort((a, b) => a.localeCompare(b)));
    for (const k of Object.keys(want)) expect(got.components[k]).toBeCloseTo(want[k]!, 12);
    expect(() => MACRO_EVENTS['macro.fsi']!.parse(e.payload)).not.toThrow();
    expect(assertNoHiddenFields(e.payload)).toEqual([]);
    expect(w.hourly().staleKeys).toEqual([]);
    expect(w.hourly().values['fsi.interbank']).toBeCloseTo(0.006, 12);
    expect(w.hourly().values['igCreditSpreadIndex']).toBe(0.012);
    expect(w.hourly().tick).toBe(w.ctx.tick);
    expect(w.inputs()).toBeUndefined();   // E-93 (2): hourly code never writes INPUTS
  });
  it('interbank is GDP-weighted with gdpShare0', () => {
    const p = portsOf(credit());
    p.credit = { ...credit(), creditAggregates: (_s, b) => ({ credit: 0, creditConditions: 0, interbankSpread: b === 'FDL' ? 0.015 : 0 }) } as MacroCreditPort;
    const w = fakeWorld({});
    hourlyFsi(w.ctx, p);
    expect(w.global().financialStressIndex).toBeCloseTo(0.20 * 0.32, 12);
  });
  const E93_IB: Record<string, number> = { FDL: 0.004, EUN: 0.006, PYN: 0.008, NKR: 0.003, SRL: 0.02 };
  const ibPort = (spread: Record<string, number | null>): MacroCreditPort => ({ ...credit({ repo: 0, ccp: 0 }),
    creditAggregates: (_s: unknown, b: string) => (spread[b] === null ? null : { credit: 0, creditConditions: 0, interbankSpread: spread[b]! }) }) as unknown as MacroCreditPort;
  it('E-93 (3) interbank example: composite 0.00773, normalized 0.515333, weighted 0.103067', () => {
    const w = fakeWorld({});
    hourlyFsi(w.ctx, portsOf(ibPort(E93_IB)));
    expect(w.hourly().values['fsi.interbank']).toBeCloseTo(0.00773, 12);
    expect((w.events[0]!.payload as { components: Record<string, number> }).components.interbankSpread).toBeCloseTo(0.515333, 6);
    expect(w.global().financialStressIndex).toBeCloseTo(0.103067, 6);
  });
  it('E-93 (3): with 07 present and one bloc null, the composite holds 0.00773 and fsi.interbank is stale (no renormalizing)', () => {
    const w = fakeWorld({});
    hourlyFsi(w.ctx, portsOf(ibPort(E93_IB)));
    expect(w.hourly().staleKeys).not.toContain('fsi.interbank');
    hourlyFsi(w.ctx, portsOf(ibPort({ ...E93_IB, SRL: null, FDL: 0.015 })));
    expect(w.hourly().values['fsi.interbank']).toBeCloseTo(0.00773, 12);
    expect(w.global().financialStressIndex).toBeCloseTo(0.103067, 6);
    expect(w.hourly().staleKeys.filter((k) => k === 'fsi.interbank')).toEqual(['fsi.interbank']);
  });
  it('credit port null → interbank, repo and CCP components 0, not stale, held values untouched', () => {
    const w = fakeWorld({}, [[macroTables.inputs.name, { ...GENESIS_HOURLY, values: { ...GENESIS_HOURLY.values, 'fsi.interbank': 0.015 } }]]);
    hourlyFsi(w.ctx, portsOf(null, { dd: 0.5 }));
    const c = (w.events[0]!.payload as { components: Record<string, number> }).components;
    expect([c.interbankSpread, c.repoHaircutChange, c.ccpFundUsage]).toEqual([0, 0, 0]);
    expect(w.global().financialStressIndex).toBeCloseTo(0.15, 12);
    expect(w.hourly().staleKeys).toEqual(['igCreditSpreadIndex', 'fsi.stablecoinDepeg', 'fsi.etfDiscount']);
    expect(w.hourly().values['fsi.interbank']).toBe(0.015);
  });
  it('a missing component holds its last value in HOURLY and is listed stale once; genesis zeros count 0; IG absent counts 0', () => {
    const w = fakeWorld({});
    hourlyFsi(w.ctx, portsOf(credit({ ib: 0.015, repo: 10, ccp: 0.25 }), { dd: 0.5, ig: 0.03, depeg: 0.1, etf: 0.05 }));
    expect(w.global().financialStressIndex).toBeCloseTo(0.85, 12);   // all but sovereign stress (bloc rows at 0)
    hourlyFsi(w.ctx, portsOf(credit({ ib: null }), {}));
    hourlyFsi(w.ctx, portsOf(credit({ ib: null }), {}));
    expect(w.global().financialStressIndex).toBeCloseTo(0.85, 12);
    expect(w.hourly().staleKeys).toEqual(['fsi.interbank', 'fsi.repoHaircut', 'fsi.ccpFund', 'fsi.bankEquityDd', 'igCreditSpreadIndex', 'fsi.stablecoinDepeg', 'fsi.etfDiscount']);
    expect(w.hourly().values).toEqual({ rv21Gx: 0.16, gxReturnToday: 0, 'fsi.interbank': 0.015, 'fsi.repoHaircut': 10, 'fsi.ccpFund': 0.25, 'fsi.bankEquityDd': 0.5,
      igCreditSpreadIndex: 0.03, 'fsi.stablecoinDepeg': 0.1, 'fsi.etfDiscount': 0.05 });
    expect(w.inputs()).toBeUndefined();
    const fresh = fakeWorld({});
    hourlyFsi(fresh.ctx, portsOf(credit({ ib: null })));
    expect(fresh.global().financialStressIndex).toBe(0);
  });
  it('E-93 (2): HOURLY is put only when a value or staleKeys changed', () => {
    const w = fakeWorld({});
    const live = portsOf(credit({ ib: 0.006, repo: 3, ccp: 0 }), { dd: 0.2, ig: 0.012, depeg: 0.01, etf: 0.01 });
    hourlyFsi(w.ctx, live);
    expect(w.inputPuts()).toBe(1);
    hourlyFsi(w.ctx, live);   // same values
    expect(w.inputPuts()).toBe(1);
    hourlyFsi(w.ctx, portsOf(credit({ ib: 0.006, repo: 3, ccp: 0 }), { dd: 0.2, ig: 0.012, depeg: 0.01, etf: null }));   // new stale key
    expect(w.inputPuts()).toBe(2);
    hourlyFsi(w.ctx, portsOf(credit({ ib: 0.006, repo: 3, ccp: 0 }), { dd: 0.2, ig: 0.012, depeg: 0.01, etf: null }));   // already stale
    expect(w.inputPuts()).toBe(2);
    hourlyFsi(w.ctx, portsOf(credit({ ib: 0.006, repo: 3, ccp: 0 }), { dd: 0.25, ig: 0.012, depeg: 0.01, etf: null }));   // value change
    expect(w.inputPuts()).toBe(3);
    const g = fakeWorld({});
    hourlyFsi(g.ctx, portsOf(credit({ ib: 0, repo: 0, ccp: 0 }), { dd: 0, ig: null, depeg: 0, etf: 0 }));   // genesis values, IG newly stale
    expect(g.inputPuts()).toBe(1);
    const z = fakeWorld({});
    hourlyFsi(z.ctx, portsOf(credit({ ib: 0, repo: 0, ccp: 0 }), { dd: 0, ig: 0, depeg: 0, etf: 0 }));   // only IG is new
    expect(z.inputPuts()).toBe(1);
    hourlyFsi(z.ctx, portsOf(credit({ ib: 0, repo: 0, ccp: 0 }), { dd: 0, ig: 0, depeg: 0, etf: 0 }));
    expect(z.inputPuts()).toBe(1);
  });
  it('sovereign stress is the max over the bloc rows', () => {
    const w = fakeWorld({}, blocRows([0.1, 0.7, 0.2, 0.9, 0.05]));
    hourlyFsi(w.ctx, portsOf(null));
    expect(w.global().financialStressIndex).toBeCloseTo(0.15 * 0.9, 12);
  });
  it('E-93 (4): missing GLOBAL, HOURLY or bloc row → MAC_STATE_MISSING with the row id', () => {
    expect(() => hourlyFsi(fakeWorld(null).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['GLOBAL'] }));
    expect(() => hourlyFsi(fakeWorld({}, [], 10, { hourly: false }).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: ['HOURLY'] }));
    expect(() => hourlyFsi(fakeWorld({}, [], 10, { blocs: false }).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'MAC_STATE_MISSING', entityIds: [BLOC_ORDER[0]] }));
  });
});
