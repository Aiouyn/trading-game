import { TICKS_PER_GAME_DAY as D } from '@tycoon/engine-core';
import { describe, expect, it } from 'vitest';
import { macroTables, type ActiveShock, type WorldEvent } from '../schema';
import { cbWorld } from '../testkit/cbWorld';
import { putBloc } from '../testkit/fiscalWorld';
import { activeShockProduct, activeShockSum, applyEventShocks, shock, shockValue } from './shocks';

const sh = (o: Partial<ActiveShock>): ActiveShock => ({ id: 's', target: 'tp10', value: 1, startTick: 0, endTick: 100 * D, shape: 'STEP', ...o } as ActiveShock);
const ev = (o: Partial<WorldEvent> = {}): WorldEvent => ({ id: 'ev1', tier: 'MAJOR', kind: 'TRADE_WAR', blocs: ['FDL'], sectors: [], assetsHint: [], phase: 'TRIGGER', phaseSinceTick: 0,
  precursorStartTick: 0, triggerTick: 0, plannedEndTick: 50 * D, origin: 'SCHEDULED', severity: 1, shocks: [], publicTitleKey: null, causeChain: [], ...o } as WorldEvent);

describe('T04-18 shocks', () => {
  it('DECAY value 10, half-life 7: 5 at day 7, 1.25 at day 21, 0 at end', () => {
    const s = sh({ value: 10, shape: 'DECAY', halfLifeDays: 7, endTick: 30 * D });
    expect(shockValue(s, 7 * D)).toBeCloseTo(5, 12);
    expect(shockValue(s, 21 * D)).toBeCloseTo(1.25, 12);
    expect(shockValue(s, 30 * D)).toBe(0);
    expect(() => shockValue({ ...s, halfLifeDays: undefined }, D)).toThrow(/halfLifeDays/);
  });
  it('STEP and RAMP shapes, 0 before start', () => {
    expect(shockValue(sh({ startTick: 10 }), 9)).toBe(0);
    expect(shockValue(sh({ value: 2 }), 50 * D)).toBe(2);
    expect(shockValue(sh({ value: 2, shape: 'RAMP' }), 25 * D)).toBeCloseTo(0.5, 12);
  });
  it('sum and product per scope (bloc row vs WORLD events)', () => {
    const w = cbWorld([], 10 * D); putBloc(w, 'FDL');
    const st = w.rows(macroTables.bloc.name)[0] as Record<string, unknown>;
    w.put(macroTables.bloc.name, { ...st, shocks: [sh({ value: 0.002 }), sh({ id: 't', value: 0.003 }), sh({ id: 'u', target: 'x', value: 9 }),
      sh({ id: 'm', target: 'lambda_raw_mult', value: 3 }), sh({ id: 'n', target: 'lambda_raw_mult', value: 2 }), sh({ id: 'o', target: 'lambda_raw_mult', value: 4, startTick: 20 * D })] } as never);
    w.put(macroTables.event.name, ev({ shocks: [sh({ id: 'w', target: 'tariff_level', value: 0.1 })] }) as never);
    expect(activeShockSum(w.ctx.store, 'tp10', 'FDL', 10 * D)).toBeCloseTo(0.005, 15);
    expect(activeShockSum(w.ctx.store, 'tp10', 'WORLD', 10 * D)).toBe(0);
    expect(activeShockSum(w.ctx.store, 'tariff_level', 'WORLD', 10 * D)).toBeCloseTo(0.1, 15);
    expect(activeShockSum(w.ctx.store, 'tariff_level', 'FDL', 10 * D)).toBe(0);
    expect(activeShockProduct(w.ctx.store, 'lambda_raw_mult', 'FDL', 10 * D)).toBe(6);
    expect(activeShockProduct(w.ctx.store, 'none', 'FDL', 10 * D)).toBe(1);
  });
  it('applyEventShocks: bloc shocks on the bloc row, WORLD on the event, ONE_OFF fx fair, one causeChain entry each', () => {
    const w = cbWorld([], 0); putBloc(w, 'PYN');
    const st = w.rows(macroTables.bloc.name)[0] as Record<string, unknown>;
    w.put(macroTables.bloc.name, { ...st, shocks: [], fx: { fairValueLn: 0.5 } } as never);
    const e = ev({ blocs: ['PYN'] }); w.put(macroTables.event.name, e as never);
    applyEventShocks(w.ctx, e, [shock('PYN', 'x_target', -0.02, 0, 10 * D), shock('WORLD', 'tariff_level', 0.1, 0, 364 * D), { kind: 'ONE_OFF', target: 'fx_fair_ln', value: -0.05, bloc: 'PYN' }]);
    const b = w.rows(macroTables.bloc.name)[0] as { shocks: ActiveShock[]; fx: { fairValueLn: number } }, out = w.rows(macroTables.event.name)[0] as WorldEvent;
    expect(b.shocks.map((x) => [x.id, x.target, x.sourceCrisisId])).toEqual([['shk_ev1_0', 'x_target', 'ev1']]);
    expect(out.shocks.map((x) => [x.id, x.target])).toEqual([['shk_ev1_1', 'tariff_level']]);
    expect(b.fx.fairValueLn).toBeCloseTo(0.45, 15);
    expect(out.causeChain.map((c) => c.key)).toEqual(['shock.x_target', 'shock.tariff_level', 'oneoff.fx_fair_ln']);
  });
});
