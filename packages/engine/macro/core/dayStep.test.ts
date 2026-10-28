import { describe, expect, it, vi } from 'vitest';
import { TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { BLOC_ORDER, macroTables, type BlocMacroState, type GlobalMacroState, type MacroInputs } from '../schema';
import { macroGenesis } from './genesis';
import { historyAt } from './history';
import { inputSnapshot, macroDayStep, updatePeNorm } from './dayStep';
import { macroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));  // MISSING EXPORT T03-24 led.msi

const D = TICKS_PER_GAME_DAY;
const run = (days: number, seed = 'g', ports = stubPorts()) => {
  const w = macroWorld(seed, 0); macroGenesis(w.ctx, ports);
  for (let d = 0; d < days; d++) { w.setTick(d * D + 719); macroDayStep(w.ctx, ports); }
  return w;
};
const finite = (v: unknown): boolean => typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(finite) : v !== null && typeof v === 'object' ? Object.values(v).every(finite) : true;

describe('T04-20 updatePeNorm', () => {
  it('15 → 15 + (20 − 15)/1820 = 15.00275; null leaves it', () => {
    expect(updatePeNorm(15, 20)).toBeCloseTo(15.0027473, 6);
    expect(updatePeNorm(20, null)).toBe(20);
  });
});

describe('T04-20 macroDayStep', () => {
  it('04#43: 30 days with credit port null, every bloc state finite, day 0 credit = credit0', () => {
    const w = run(30);
    for (const b of BLOC_ORDER) {
      const s = w.store.get<BlocMacroState>(macroTables.bloc.name, b)!;
      expect(finite(s)).toBe(true);
      expect(s.tick).toBe(29 * D + 719);
    }
    expect(finite(w.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL'))).toBe(true);
    expect(historyAt(w.store, 'FDL', 29)).not.toBeNull();
    const f = w.store.get<BlocMacroState>(macroTables.bloc.name, 'FDL')!;
    expect(f.headlineInflation).toBe(f.coreInflation);  // < 364 days of history: headline = core
  });
  it('deterministic per seed', () => {
    const a = run(10, 's'), c = run(10, 's');
    expect(a.store.get(macroTables.bloc.name, 'FDL')).toEqual(c.store.get(macroTables.bloc.name, 'FDL'));
  });
  it('04#3 (reduced, 60 days): an extra stream drawn every day changes no macro row', () => {
    const ports = stubPorts(), a = run(60, 'x'), w = macroWorld('x', 0); macroGenesis(w.ctx, ports);
    for (let d = 0; d < 60; d++) { w.setTick(d * D + 719); w.ctx.rng('test.extra').normal(); macroDayStep(w.ctx, ports); }
    for (const b of BLOC_ORDER) expect(w.store.get(macroTables.bloc.name, b)).toEqual(a.store.get(macroTables.bloc.name, b));
    expect(w.store.get(macroTables.global.name, 'GLOBAL')).toEqual(a.store.get(macroTables.global.name, 'GLOBAL'));
  });
  it('§3.19 stream keys: global regime draws from macro.global_regime, blocs from macro.regime:<b>', () => {
    const w = macroWorld('g', 0), ports = stubPorts(), keys: string[] = [], rng = w.ctx.rng; macroGenesis(w.ctx, ports);
    (w.ctx as { rng: typeof rng }).rng = (k: string) => { keys.push(k); return rng(k); };
    w.setTick(719); macroDayStep(w.ctx, ports);
    const reg = keys.filter((k) => k.includes('regime'));
    expect(reg.slice(0, 1 + BLOC_ORDER.length)).toEqual(['macro.global_regime', ...BLOC_ORDER.map((b) => `macro.regime:${b}`)]);
  });
  it('E-90 (3): day-0 close leaves credit at credit0; later days move it', () => {
    const w = run(1), s = w.store.get<BlocMacroState>(macroTables.bloc.name, 'FDL')!;
    expect(s.credit).toBe(s.credit0);
    const w2 = run(5), s2 = w2.store.get<BlocMacroState>(macroTables.bloc.name, 'FDL')!;
    expect(s2.credit).not.toBe(s2.credit0);
  });
  it('regime and real side move: outputGap, cpi and rStar change from genesis', () => {
    const w0 = macroWorld('g', 0); macroGenesis(w0.ctx, stubPorts());
    const a = w0.store.get<BlocMacroState>(macroTables.bloc.name, 'EUN')!, b = run(20).store.get<BlocMacroState>(macroTables.bloc.name, 'EUN')!;
    expect(b.outputGap).not.toBe(a.outputGap); expect(b.cpiLevel).not.toBe(a.cpiLevel); expect(b.rStar).not.toBe(a.rStar); expect(b.realGdpIndex).not.toBe(a.realGdpIndex);
  });
});

describe('T04-20 inputSnapshot (E-93 (2))', () => {
  it('one SEALED macro.input.stale with sorted union of keys; HOURLY.staleKeys cleared', () => {
    const w = macroWorld('g', 0); macroGenesis(w.ctx, stubPorts());
    const h = w.store.get<MacroInputs>(macroTables.inputs.name, 'HOURLY')!;
    w.store.put(macroTables.inputs.name, { ...h, staleKeys: ['zz.hourly', '0first', 'zz.hourly'] });
    w.events.length = 0; w.setTick(719); inputSnapshot(w.ctx, stubPorts());
    const ev = w.events.filter((e) => e.kind === 'macro.input.stale');
    expect(ev).toHaveLength(1); expect(ev[0]!.vis).toBe('SEALED');
    const keys = (ev[0]!.payload as { keys: string[] }).keys;
    expect(keys[0]).toBe('0first'); expect(keys).toContain('zz.hourly'); expect(keys).toEqual([...keys].sort()); expect(new Set(keys).size).toBe(keys.length);
    expect(w.store.get<MacroInputs>(macroTables.inputs.name, 'HOURLY')!.staleKeys).toEqual([]);
  });
});
