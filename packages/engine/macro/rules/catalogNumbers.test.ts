// T04-18 exact numbers: storm vectors (card step 2), ripple effects (step 3), §3.16.6 hook rules on every MAJORS spec, and the writeHook guard.
import { describe, expect, it, vi } from 'vitest';
vi.mock('./t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));
import { defaultMacroPorts } from '../ports';
import { macroTables, type CrisisKind, type GlobalMacroState, type HookCall } from '../schema';
import { TICKS_PER_GAME_DAY as D } from '@tycoon/engine-core';
import { macroWorld } from '../testkit/macroWorld';
import { macroGenesis } from '../core/genesis';
import { catalogInputs, MAJORS } from './crisisCatalog';
import { HOOKS, ownersOf, writeHook } from './hooks';
import { forceEvent } from './scheduler';
import { rippleEffect, stormShocks } from './shocks';
import { expectedHooks } from '../harness/scenarios/macro-crisis-calibration';

const ports = defaultMacroPorts();
const sh = (bloc: string, target: string, value: number, startTick: number, endTick: number, shape = 'STEP', halfLifeDays?: number) =>
  ({ kind: 'SHOCK', bloc, shock: { target, value, startTick, endTick, shape, ...(halfLifeDays === undefined ? {} : { halfLifeDays }) } });
const hk = (owner: string, hook: string, args: object) => ({ kind: 'HOOK', owner, hook, args });

describe('T04-18 storm vectors (card step 2, sev 1.2)', () => {
  it('each of the 8 storms writes exactly the card vector', () => {
    const v = 1.2;
    expect(stormShocks('RATE_SCARE', v, { bloc: 'EUN' })).toEqual([sh('EUN', 'tp10', 0.004 * v, 0, 5 * D, 'RAMP'), sh('EUN', 'tp10', 0.004 * v, 5 * D, 30 * D, 'DECAY', 10)]);
    expect(stormShocks('OIL_SPIKE_LITE', v, {})).toEqual([hk('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.03 * v, days: 20 })]);
    expect(stormShocks('CRYPTO_FLUSH', v, {})).toEqual([hk('16', 'WIRE_ITEM', { key: 'storm.crypto_flush.hype', delta: -0.4 }), hk('05', 'makerWithdrawal', { assetFilter: 'CRYPTO', depthMult: 0.5, ticks: 720 })]);
    expect(stormShocks('CREDIT_WOBBLE', v, {})).toEqual([hk('07', 'corporatePdMultiplier', { bloc: 'WORLD', mult: 1.4, days: 30 })]);
    expect(stormShocks('CREDIT_WOBBLE', v, { bankRun: { bankId: 'b1', delta: -0.15 } })).toEqual([hk('07', 'depositConfidenceShock', { bankIds: ['b1'], delta: -0.15 })]);
    expect(stormShocks('FX_SQUALL', v, { bloc: 'PYN' })).toEqual([sh('PYN', 'capital_flow', -0.4 * v, 0, 10 * D)]);
    expect(stormShocks('SECTOR_ROTATION', v, { sector: 4 })).toEqual([hk('06', 'erpShock', { bloc: 'WORLD', sector: 4, deltaPremium: 0.01, halfLifeDays: null }),
      hk('06', 'erpShock', { bloc: 'WORLD', sector: 5, deltaPremium: -0.005, halfLifeDays: null })]);
    expect(stormShocks('EARNINGS_SCARE', v, {})).toEqual([hk('06', 'consensusEpsShock', { delta: -0.05 })]);
    expect(stormShocks('LIQUIDITY_HICCUP', v, { assetClass: 'FX' })).toEqual([hk('05', 'makerWithdrawal', { assetFilter: 'FX', depthMult: 0.5, ticks: 60 })]);
  });
});

describe('T04-18 ripple effects (card step 3)', () => {
  it('each of the 5 ripples writes exactly the card effect at the GLOBAL tick', () => {
    const w = macroWorld('rip', 0); macroGenesis(w.ctx, ports);
    const g = w.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')!;
    w.store.put(macroTables.global.name, { ...g, tick: 7 * D });
    const t = 7 * D, u = { sign: -1, size: 0.04, length: 6 };
    expect(rippleEffect(w.store, 'SECTOR_SHOCK', { ...u, target: 3 })).toEqual([sh('WORLD', 'sector_value:3', -0.04, t, t + 6 * D)]);
    expect(rippleEffect(w.store, 'REGULATORY_NOTE', { ...u, target: 2 })).toEqual([sh('WORLD', 'sector_value:2', -0.04, t, t + 6 * D)]);
    expect(rippleEffect(w.store, 'LOCAL_BOOM', { ...u, target: 'c9' })).toEqual([sh('WORLD', 'city_activity:c9', 0.04, t, t + 6 * D)]);
    expect(rippleEffect(w.store, 'COMMODITY_SUPPLY', { ...u, target: 3 })).toEqual([hk('06', 'commoditySupplyShock', { commodityId: 'WHEAT', pct: 0.04, days: 6 })]);
    expect(rippleEffect(w.store, 'COMMODITY_DEMAND', { ...u, target: 0 })).toEqual([hk('06', 'commoditySupplyShock', { commodityId: 'CRUDE', pct: -0.04, days: 6 })]);
  });
});

describe('T04-18 §3.16.6 hooks on the 15 majors', () => {
  const w = macroWorld('hooks', 0); macroGenesis(w.ctx, ports);
  const s = catalogInputs(w.store, ports);
  for (const m of MAJORS) it(`${m.kind}: every hook is a §3.16.6 name with its owner and exactly its args; non-wire hooks are the §3.16.4 ones`, () => {
    const ev = forceEvent(w.ctx, m.kind, { severity: 1, blocs: ['SRL'] });
    const all = [...m.precursor(ev), ...m.trigger(ev, s)].filter((x) => x.kind === 'HOOK') as { owner: HookCall['owner']; hook: string; args: HookCall['args'] }[];
    for (const x of all) {
      expect(HOOKS[x.hook], x.hook).toBeDefined();
      expect(ownersOf(x.hook)).toContain(x.owner);
      expect(Object.keys(x.args).sort()).toEqual([...HOOKS[x.hook]!.args].sort());
    }
    expect(all.filter((x) => x.hook !== 'WIRE_ITEM').map((x) => ({ owner: x.owner, hook: x.hook, args: x.args }))).toEqual(expectedHooks(m.kind as CrisisKind, ev.blocs[0]!));
  });
});

describe('T04-18 writeHook guard', () => {
  const w = macroWorld('guard', 0);
  it('rejects an empty worldEventId, an unknown hook, a wrong owner and a missing arg; allows each listed owner', () => {
    expect(() => writeHook(w.ctx, '07', 'depositConfidenceShock', { bankIds: [], delta: -0.1 }, '')).toThrow(/worldEventId/);
    expect(() => writeHook(w.ctx, '07', 'noSuchHook', {}, 'ev1')).toThrow(/unknown hook/);
    expect(() => writeHook(w.ctx, '06', 'depositConfidenceShock', { bankIds: [], delta: -0.1 }, 'ev1')).toThrow(/owner 06/);
    expect(() => writeHook(w.ctx, '07', 'depositConfidenceShock', { bankIds: [] }, 'ev1')).toThrow(/without arg delta/);
    for (const o of ['07', '10'] as const) expect(writeHook(w.ctx, o, 'ltvTighten', { bloc: 'SRL', delta: -0.2 }, 'ev1')).toMatchObject({ owner: o, worldEventId: 'ev1' });
    expect(ownersOf('RESCUE_MERGER_PROPOSAL')).toEqual(['16', '07']);
    expect(ownersOf('CYBERCERT_PATCH')).toEqual(['12', '13']);
    expect(ownersOf('nope')).toEqual([]);
  });
});
