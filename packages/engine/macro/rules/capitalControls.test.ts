import { describe, expect, it } from 'vitest';
import { TICKS_PER_GAME_DAY as D } from '@tycoon/engine-core';
import { macroTables, type FxState } from '../schema';
import { fiscalWorld, putBloc } from '../testkit/fiscalWorld';
import { capconDecision, MACRO_EXTENSION_CODES_FX, setCapitalControls, stepCapitalControls } from './capitalControls';

const lvl = (o: { sellCcy: 'SRL' | 'FDL'; buyCcy: 'SRL' | 'FDL'; reduceOnlyFxDerivativeClose?: boolean }) => ({ controlled: 'SRL' as const, reduceOnlyFxDerivativeClose: false, ...o });
describe('T04-14 capital controls', () => {
  it('04#31 level 2 blocks SRL→FDL, lets reduce-only closes and SRL-for-SRL through; level 1 levies 1%', () => {
    expect(capconDecision(2, lvl({ sellCcy: 'SRL', buyCcy: 'FDL' }))).toEqual({ allowed: false, levyRate: 0, reject: 'CAPCON_BLOCKED' });
    expect(capconDecision(3, lvl({ sellCcy: 'SRL', buyCcy: 'FDL' })).reject).toBe('CAPCON_BLOCKED');
    expect(capconDecision(2, lvl({ sellCcy: 'SRL', buyCcy: 'FDL', reduceOnlyFxDerivativeClose: true })).allowed).toBe(true);
    expect(capconDecision(2, lvl({ sellCcy: 'SRL', buyCcy: 'SRL' }))).toEqual({ allowed: true, levyRate: 0 });
    expect(capconDecision(2, lvl({ sellCcy: 'FDL', buyCcy: 'SRL' }))).toEqual({ allowed: true, levyRate: 0 });
    expect(capconDecision(1, lvl({ sellCcy: 'SRL', buyCcy: 'FDL' }))).toEqual({ allowed: true, levyRate: 0.01 });
    expect(capconDecision(0, lvl({ sellCcy: 'SRL', buyCcy: 'FDL' }))).toEqual({ allowed: true, levyRate: 0 });
  });
  it('declares the five extension codes', () => {
    expect(MACRO_EXTENSION_CODES_FX.map((c) => `${c.code}:${c.cls}`).sort((a, b) => (a < b ? -1 : 1)))
      .toEqual(['CAPCON_LEVY:SINK', 'CSF_DISBURSE:TRANSFER', 'CSF_INTEREST:TRANSFER', 'CSF_REPAY:TRANSFER', 'MAC_FX_CA_ABSORB:TRANSFER']);
  });
  it('starts at the next tick; steps 3 (72d) → 2 (3d) → 1 (28d) → 0 with an event at each change', () => {
    const t0 = 50 * D + 100, w = fiscalWorld(t0);
    putBloc(w, 'SRL');
    const row = w.ctx.store.get<Record<string, unknown>>(macroTables.bloc.name, 'SRL')!;
    w.put(macroTables.bloc.name, { ...row, fx: { capitalControls: 0 } } as never);
    const fx = () => w.ctx.store.get<{ fx: FxState }>(macroTables.bloc.name, 'SRL')!.fx;
    setCapitalControls(w.ctx, 'SRL', 3, 72, 'BREAK');
    stepCapitalControls(w.ctx);
    expect(fx().capitalControls).toBe(0);
    const seen: [number, number][] = [];
    for (let t = t0 + 1; t <= t0 + 1 + (72 + 3 + 28) * D + 5; t++) {
      w.setTick(t); stepCapitalControls(w.ctx);
      if (seen.length === 0 || seen[seen.length - 1]![1] !== fx().capitalControls) seen.push([t - t0 - 1, fx().capitalControls]);
    }
    expect(seen).toEqual([[0, 3], [72 * D, 2], [75 * D, 1], [103 * D, 0]]);
    expect(w.events.filter((e) => e.kind === 'macro.fx.capcontrols').map((e) => (e.payload as { level: number }).level)).toEqual([3, 2, 1, 0]);
    expect(w.events.every((e) => e.vis === 'PUBLIC')).toBe(true);
  });
});
