import { describe, expect, it } from 'vitest';
import type { PhaseCtx } from '@tycoon/engine-core';
import { assertNoHiddenFields, MACRO_EVENTS } from '../events';
import { defaultMacroPorts, type MacroCreditPort, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type GlobalMacroState, type MacroInputs } from '../schema';
import { FSI_DIVISORS, FSI_WEIGHTS, fsiOf, hourlyFsi, type FsiComponents } from './fsi';

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
    expect(w.inputs()!.staleKeys).toEqual([]);
  });
  it('interbank is GDP-weighted with gdpShare0', () => {
    const p = portsOf(credit());
    p.credit = { ...credit(), creditAggregates: (_s, b) => ({ credit: 0, creditConditions: 0, interbankSpread: b === 'FDL' ? 0.015 : 0 }) } as MacroCreditPort;
    const w = fakeWorld({});
    hourlyFsi(w.ctx, p);
    expect(w.global().financialStressIndex).toBeCloseTo(0.20 * 0.32, 12);
  });
  it('credit port null → interbank, repo and CCP components 0, not stale', () => {
    const w = fakeWorld({});
    hourlyFsi(w.ctx, portsOf(null, { dd: 0.5 }));
    const c = (w.events[0]!.payload as { components: Record<string, number> }).components;
    expect([c.interbankSpread, c.repoHaircutChange, c.ccpFundUsage]).toEqual([0, 0, 0]);
    expect(w.global().financialStressIndex).toBeCloseTo(0.15, 12);
    expect(w.inputs()!.staleKeys).toEqual(['igSpread', 'stablecoinDepeg', 'etfDiscount']);
  });
  it('a missing component holds its last value and is listed stale; with no history it counts 0', () => {
    const w = fakeWorld({});
    hourlyFsi(w.ctx, portsOf(credit({ ib: 0.015, repo: 10, ccp: 0.25 }), { dd: 0.5, ig: 0.03, depeg: 0.1, etf: 0.05 }));
    expect(w.global().financialStressIndex).toBeCloseTo(0.85, 12);   // all but sovereign stress (no bloc rows → 0)
    hourlyFsi(w.ctx, portsOf(credit({ ib: null }), {}));
    expect(w.global().financialStressIndex).toBeCloseTo(0.85, 12);
    expect(w.inputs()!.staleKeys).toEqual(['interbank', 'repoHaircut', 'ccpFund', 'bankEquityDd', 'igSpread', 'stablecoinDepeg', 'etfDiscount']);
    const fresh = fakeWorld({});
    hourlyFsi(fresh.ctx, portsOf(credit({ ib: null })));
    expect(fresh.global().financialStressIndex).toBe(0);
  });
  it('sovereign stress is the max over the bloc rows', () => {
    const w = fakeWorld({}, blocRows([0.1, 0.7, 0.2, 0.9, 0.05]));
    hourlyFsi(w.ctx, portsOf(null));
    expect(w.global().financialStressIndex).toBeCloseTo(0.15 * 0.9, 12);
  });
  it('throws without the GLOBAL row', () => { expect(() => hourlyFsi(fakeWorld(null).ctx, defaultMacroPorts())).toThrow(expect.objectContaining({ code: 'I0.macro_global' })); });
});
