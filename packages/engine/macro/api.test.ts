import { describe, expect, it, vi } from 'vitest';
import { dmath, type StoreRead } from '@tycoon/engine-core';
import { cbkId, govId } from '@tycoon/engine-ledger';
import { BLOC_DEFAULTS } from './blocs';
import { macroTables, type BlocMacroState, type CurveState, type GlobalMacroState } from './schema';
import * as api from './api';
import { macroGenesis } from './core/genesis';
import { macroWorld } from './testkit/macroWorld';
import { stubPorts } from './testkit/cbWorld';
import { nsZero } from './rules/nelsonSiegel';
import { priceIndexOf } from './rules/inflation';
vi.mock('./rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));

type Put = (t: string, e: { id: string }) => void;
/** genesis world whose store answers index() from the macroTables index defs (schedWorld indexes only hook_call/event). */
function world(): { s: StoreRead; put: Put } {
  const w = macroWorld('a', 0); macroGenesis(w.ctx, stubPorts());
  const defs = Object.values(macroTables) as { name: string; indexes?: { name: string; key(e: unknown): string | null }[] }[];
  const s = { ...w.store, get: w.store.get.bind(w.store), iter: w.store.iter.bind(w.store),
    index: (t: string, n: string, k: string) => { const ix = defs.find((d) => d.name === t)?.indexes?.find((x) => x.name === n); return ix ? w.store.iter(t).filter((e) => ix.key(e) === k).reverse() : []; } } as unknown as StoreRead;   // reversed: readers must not lean on index order
  return { s, put: (t, e) => w.store.put(t, e) };
}
const blocOf = (s: StoreRead, b: 'FDL' | 'EUN' | 'PYN') => s.get<BlocMacroState>(macroTables.bloc.name, b)!;

describe('T04-20 api readers', () => {
  it('state readers return the stored values', () => {
    const { s } = world(), e = blocOf(s, 'EUN'), g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')!, c = s.get<CurveState>(macroTables.curve.name, 'EUN')!;
    expect(api.getBlocRegime(s, 'EUN')).toBe('EXPANSION');
    expect(api.getGlobalRegime(s)).toBe('EXPANSION');
    expect(api.fear(s)).toBe(22);
    expect(api.getGlobalMacro(s)).toBe(g);
    expect(api.getCurves(s, 'EUN')).toBe(c);
    expect(api.policyRate(s, 'EUN')).toBe(s.get<{ policyRate: number }>(macroTables.cb.name, cbkId('EUN'))!.policyRate);
    expect([api.outputGap(s, 'EUN'), api.neutralRate(s, 'EUN'), api.wageIndex(s, 'EUN')]).toEqual([e.outputGap, e.rStar, e.wageIndex]);
    expect(api.y10(s, 'EUN')).toBe(nsZero(c.ns, 10));
    expect(api.govYield(s, 'EUN', 5)).toBe(nsZero(c.ns, 5));
    expect(api.billYield(s, 'EUN', 0.5)).toBe(nsZero(c.ns, 0.5));
    expect(api.billYield(s, 'EUN', 3)).toBe(nsZero(c.ns, 1));
    expect(api.sovereignPd(s, 'EUN')).toBe(e.sovereign.ratingInputs.marketPd1y);
    expect(api.priceIndex(s, 'EUN', 'WAGE')).toBe(priceIndexOf(e, g, BLOC_DEFAULTS.EUN.fx0, BLOC_DEFAULTS.EUN.fx0, 'WAGE'));
    expect(api.cpiAt(s, 'EUN', 0)).toBeNull();
    expect(() => api.getCurves({ ...s, get: () => undefined } as StoreRead, 'FDL')).toThrow(/curve FDL missing/);
  });
  it('getFxState: FDL spot 1; PYN band as levels exp(c ± hw)', () => {
    const { s } = world(), p = blocOf(s, 'PYN').fx;
    expect(api.getFxState(s, 'FDL').spotVsFdl).toBe(1);
    const f = api.getFxState(s, 'PYN');
    expect(f.regime).toBe(p.regime);
    expect(f.band).toEqual(p.band ? { lo: dmath.exp(p.band.centerLn - p.band.halfWidth), hi: dmath.exp(p.band.centerLn + p.band.halfWidth) } : null);
    expect(f.band).not.toBeNull();
  });
  it('sovereignPd is the market PD, not the model PD', () => {
    const { s, put } = world(), e = blocOf(s, 'EUN');
    put(macroTables.bloc.name, { ...e, id: 'EUN', sovereign: { ...e.sovereign, ratingInputs: { ...e.sovereign.ratingInputs, marketPd1y: 0.07, modelPd1y: 0.02 } } } as never);
    expect(api.sovereignPd(s, 'EUN')).toBe(0.07);
  });
  it('cpiAt reads the history row', () => {
    const { s, put } = world();
    put(macroTables.history.name, { id: 'EUN:3', bloc: 'EUN', gameDay: 3, cpiLevel: 101.5 } as never);
    expect(api.cpiAt(s, 'EUN', 3)).toBe(101.5);
  });
  it('factorJumps maps release reactions of the tick, causeId = releaseId', () => {
    const { s, put } = world();
    put(macroTables.release.name, { id: 'rel_x', bloc: 'EUN', kind: 'CPI', pending: false, releasedTick: 900, riskReaction: { equityJump: -0.01, fxValueJump: 0.002 } } as never);
    put(macroTables.release.name, { id: 'rel_y', bloc: 'EUN', kind: 'CPI', pending: false, releasedTick: 901, riskReaction: { equityJump: 1, fxValueJump: 1 } } as never);
    expect(api.factorJumps(s, 900)).toEqual([{ bloc: 'EUN', equityJump: -0.01, fxValueJump: 0.002, causeId: 'rel_x' }]);
  });
  it('hooks: marketHookCalls = 05 rows starting at tick; scheduledMandateFlows = MANDATE_SELL only', () => {
    const { s, put } = world(), h = (id: string, owner: string, hook: string, startTick: number) => put(macroTables.hookCall.name, { id, owner, hook, args: {}, worldEventId: '', createdTick: startTick - 1, startTick } as never);
    h('hook_2', '05', 'MANDATE_SELL', 50); h('hook_1', '05', 'OTHER', 50); h('hook_3', '16', 'MANDATE_SELL', 50); h('hook_4', '05', 'MANDATE_SELL', 51);
    expect(api.marketHookCalls(s, 50).map((x) => x.id)).toEqual(['hook_1', 'hook_2']);
    expect(api.scheduledMandateFlows(s, 50).map((x) => x.id)).toEqual(['hook_2']);
  });
  it('npcPoolOrders by tick in id order; issuanceCalendar in [from, to] by tick then id', () => {
    const { s, put } = world();
    for (const [id, tick] of [['po_b', 7], ['po_a', 7], ['po_c', 8]] as const) put(macroTables.poolOrder.name, { id, tick } as never);
    expect(api.npcPoolOrders(s, 7).map((x) => x.id)).toEqual(['po_a', 'po_b']);
    const before = api.issuanceCalendar(s, 'NKR', 0, 1e9).length;
    for (const [id, t] of [['z1', 100], ['z0', 100], ['z2', 99], ['z3', 2001]] as const) put(macroTables.auction.name, { id, govId: govId('NKR'), auctionTick: t } as never);
    expect(api.issuanceCalendar(s, 'NKR', 99, 100).map((x) => x.id)).toEqual(['z2', 'z0', 'z1']);
    expect(api.issuanceCalendar(s, 'NKR', 0, 1e9).length).toBe(before + 4);
  });
  it('macroValueShocks: `<target>` reads WORLD, `<target>:<bloc>` reads the bloc', () => {
    const { s, put } = world(), sh = (target: string, value: number) => ({ id: `sh_${target}_${value}`, target, value, startTick: 0, endTick: 1000, shape: 'STEP' });
    const g = s.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')!, e = blocOf(s, 'EUN');
    put(macroTables.bloc.name, { ...e, id: 'EUN', shocks: [sh('equity', 0.03)] } as never);
    put(macroTables.global.name, { ...g, id: 'GLOBAL' } as never);
    expect(api.macroValueShocks(s, 'equity:EUN', 10)).toBeCloseTo(0.03, 12);
    expect(api.macroValueShocks(s, 'equity:FDL', 10)).toBe(0);
  });
  it('re-exports', () => { expect(typeof api.nsZero).toBe('function'); expect(typeof api.activeWorldEvents).toBe('function'); expect(typeof api.sovereignStatus).toBe('function'); });
});
