import { describe, expect, it } from 'vitest';
import { TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { defaultMacroPorts, type MacroPorts } from '../ports';
import { BLOC_ORDER, macroTables, type BlocMacroState, type GlobalMacroState, type WorldEvent } from '../schema';
import { schedWorld, type SchedWorld } from '../testkit/schedWorld';
import { emergentCheck, EMERGENT_CHECK_EVERY_TICKS, measureOutcomes } from './emergent';
import { stepPhases } from './phases';
import { schedOf } from './scheduler';

const D = TICKS_PER_GAME_DAY, H = EMERGENT_CHECK_EVERY_TICKS;
const majors = (w: SchedWorld): WorldEvent[] => w.store.iter<WorldEvent>(macroTables.event.name).filter((e) => e.tier === 'MAJOR');
const setG = (w: SchedWorld, patch: Partial<GlobalMacroState>): void =>
  w.store.put(macroTables.global.name, { ...w.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')!, ...patch } as never);
const hourly = (w: SchedWorld, values: Record<string, number>): void => w.store.put(macroTables.inputs.name, { id: 'HOURLY', tick: 0, staleKeys: [], values } as never);
function hours(w: SchedWorld, from: number, n: number, ports: MacroPorts = defaultMacroPorts()): number {
  let t = from;
  for (let i = 0; i < n; i++) { w.setTick(t); emergentCheck(w.ctx, ports); t += H; }
  return t;
}

describe('T04-18 emergent labels', () => {
  it('EMERGENT_CHECK_EVERY_TICKS is one game hour', () => expect(H * 24).toBe(D));
  it('FSI 0.76 for 72 hours → one BANKING_PANIC (interbank dominant); 71 → none', () => {
    const w = schedWorld('e1'); setG(w, { financialStressIndex: 0.76 }); hourly(w, { 'fsi.interbank': 0.015, 'fsi.repoHaircut': 2 });
    const t = hours(w, 50 * D, 71);
    expect(majors(w)).toEqual([]);
    hours(w, t, 1);
    expect(majors(w).map((e) => [e.kind, e.origin])).toEqual([['BANKING_PANIC', 'EMERGENT']]);
  });
  it('repo dominant → FUNDING_RUN', () => {
    const w = schedWorld('e2'); setG(w, { financialStressIndex: 0.8 }); hourly(w, { 'fsi.interbank': 0.001, 'fsi.repoHaircut': 10 });
    hours(w, 50 * D, 72);
    expect(majors(w).map((e) => e.kind)).toEqual(['FUNDING_RUN']);
  });
  it('an FSI dip resets the 72-hour count', () => {
    const w = schedWorld('e3'); setG(w, { financialStressIndex: 0.8 });
    let t = hours(w, 50 * D, 40); setG(w, { financialStressIndex: 0.7 }); t = hours(w, t, 1); setG(w, { financialStressIndex: 0.8 }); hours(w, t, 71);
    expect(majors(w)).toEqual([]);
  });
  it('hack ≥ 85 for 48 hours with player share 0.6 → PLAYER_CAUSED and suppression set; share 0.4 → EMERGENT', () => {
    for (const [share, origin] of [[0.6, 'PLAYER_CAUSED'], [0.4, 'EMERGENT']] as const) {
      const w = schedWorld('e4'), ports: MacroPorts = { ...defaultMacroPorts(), conflict: { worldHackRate: () => 85, playerHackShare: () => share } };
      const t = hours(w, 50 * D, 47, ports);
      expect(majors(w)).toEqual([]);
      hours(w, t, 1, ports);
      expect(majors(w).map((e) => [e.kind, e.origin])).toEqual([['CYBER_PANDEMIC', origin]]);
      expect(schedOf(w.store).playerCausedSuppressUntil).toBe(origin === 'PLAYER_CAUSED' ? t + 336 * D : null);
    }
  });
  it('a repeated condition does not re-fire until 7 calm days', () => {
    const w = schedWorld('e5'); let on = true;
    const ports: MacroPorts = { ...defaultMacroPorts(), markets: { ...defaultMacroPorts().markets, indexWideHalt: () => on } };
    const fires = (): number => majors(w).reduce((a, e) => a + e.causeChain.filter((c) => c.key === 'emergent.FLASH_CRASH').length, 0) - 1;   // re-fires after the first
    let t = hours(w, 50 * D, 5, ports);
    expect(majors(w).map((e) => e.kind)).toEqual(['FLASH_CRASH']); expect(fires()).toBe(0);
    on = false; t = hours(w, t, 24 * 7 - 1, ports); on = true; t = hours(w, t, 1, ports);
    expect(fires()).toBe(0);
    on = false; t = hours(w, t, 24 * 7 + 1, ports); on = true; hours(w, t, 1, ports);
    expect(fires()).toBe(1);
  });
  it('currency break, selective default, depeg and GX drawdown labels with their blocs', () => {
    const w = schedWorld('e6'), b = w.store.get<BlocMacroState>(macroTables.bloc.name, 'SRL')!;
    w.store.put(macroTables.bloc.name, { ...b, fx: { ...b.fx, breakTick: 50 * D - 6 * D } } as never);
    hours(w, 50 * D, 1);
    expect(majors(w).map((e) => [e.kind, e.blocs])).toEqual([['CURRENCY_CRISIS', ['SRL']]]);
    const w2 = schedWorld('e7'), b2 = w2.store.get<BlocMacroState>(macroTables.bloc.name, 'PYN')!;
    w2.store.put(macroTables.bloc.name, { ...b2, fx: { ...b2.fx, breakTick: 50 * D - 7 * D } } as never);
    hours(w2, 50 * D, 1);
    expect(majors(w2)).toEqual([]);
    const w3 = schedWorld('e8'), b3 = w3.store.get<BlocMacroState>(macroTables.bloc.name, 'PYN')!;
    w3.store.put(macroTables.bloc.name, { ...b3, sovereign: { ...b3.sovereign, status: 'SELECTIVE_DEFAULT' } } as never);
    hours(w3, 50 * D, 1);
    expect(majors(w3).map((e) => [e.kind, e.blocs])).toEqual([['SOVEREIGN_DEBT_CRISIS', ['PYN']]]);
    for (const [v, k] of [[0.11, 'CRYPTO_WINTER'], [0.1, null]] as const) {
      const w4 = schedWorld('e9'); hours(w4, 50 * D, 1, { ...defaultMacroPorts(), assets: { ...defaultMacroPorts().assets, maxStablecoinDepeg: () => v } });
      expect(majors(w4).map((e) => e.kind)).toEqual(k ? [k] : []);
    }
    for (const [v, k] of [[0.2, 'EQUITY_BUBBLE_BURST'], [0.19, null]] as const) {
      const w5 = schedWorld('e10'); hours(w5, 50 * D, 1, { ...defaultMacroPorts(), markets: { ...defaultMacroPorts().markets, gxDrawdown21d: () => v } });
      expect(majors(w5).map((e) => e.kind)).toEqual(k ? [k] : []);
    }
  });
  it('emergent events write no shock rows (precursor or trigger)', () => {
    const w = schedWorld('e11'); setG(w, { financialStressIndex: 0.8 });
    const t = hours(w, 50 * D, 72);
    for (let k = t; k < t + 3 * D; k++) { w.setTick(k); stepPhases(w.ctx); }
    const ev = majors(w)[0]!;
    expect(ev.phase).not.toBe('PRECURSOR'); expect(ev.shocks).toEqual([]);
    for (const b of BLOC_ORDER) expect(w.store.get<BlocMacroState>(macroTables.bloc.name, b)!.shocks).toEqual([]);
  });
});

describe('T04-18 measureOutcomes', () => {
  it('peak FSI and F over the event life, bloc s10 and CPI change, SRL and PYN spot change', () => {
    const w = schedWorld('mo'); w.setTick(20 * D + 5);
    const row = (b: string, d: number, o: Record<string, number>) => w.store.put(macroTables.history.name, { id: `${b}:${d}`, bloc: b, gameDay: d, fsi: 0, fearIndex: 0, cpiLevel: 100, spotVsFdl: 1, ...o } as never);
    row('GLOBAL', 9, { fsi: 0.9, fearIndex: 90 }); row('GLOBAL', 10, { fsi: 0.4, fearIndex: 30 }); row('GLOBAL', 15, { fsi: 0.6, fearIndex: 70 });
    row('FDL', 10, { cpiLevel: 100 }); row('FDL', 20, { cpiLevel: 103 });
    row('SRL', 10, { spotVsFdl: 2 }); row('SRL', 20, { spotVsFdl: 2.5 }); row('PYN', 12, { spotVsFdl: 4 }); row('PYN', 19, { spotVsFdl: 3 });
    const b = w.store.get<BlocMacroState>(macroTables.bloc.name, 'FDL')!;
    w.store.put(macroTables.bloc.name, { ...b, sovereign: { ...b.sovereign, spread10y: 0.012 } } as never);
    setG(w, { financialStressIndex: 0.1, fearIndex: 20 });
    const o = measureOutcomes(w.store, { precursorStartTick: 10 * D, blocs: ['FDL'], phaseSinceTick: 0 } as unknown as WorldEvent);
    expect(o['peakFsi']).toBeCloseTo(0.6, 12); expect(o['peakFear']).toBeCloseTo(70, 12);
    expect(o['cpiChange_FDL']).toBeCloseTo(0.03, 12); expect(o['s10_FDL']).toBe(0.012);
    expect(o['srlSpotChange']).toBeCloseTo(0.25, 12); expect(o['pynSpotChange']).toBeCloseTo(-0.25, 12);
    expect(o['cpiChange_SRL']).toBeUndefined();
  });
});
