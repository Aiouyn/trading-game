// T04-20 day-close order (04 §3.1 row 3): QA mutants O2 (DAY_CLOSE curves before 3.8) and O6 (3.11 scheduleEmergency removed).
import { describe, expect, it, vi } from 'vitest';
import { nextTradingDay, TICKS_PER_GAME_DAY } from '@tycoon/engine-core';
import { macroTables, type CentralBank, type CurveState, type GlobalMacroState } from '../schema';
import { macroGenesis } from './genesis';
import { macroDayStep } from './dayStep';
import { macroWorld, type MacroWorld } from '../testkit/macroWorld';
import { stubPorts } from '../testkit/cbWorld';
import { swapLineActive } from '../rules/swapLines';
import { cbkId } from '@tycoon/engine-ledger';
vi.mock('../rules/t03Stubs', () => ({ effectiveMark: vi.fn(() => null), accountsOfEntity: vi.fn(() => []), committedBalance: vi.fn(() => 0n), putFact: vi.fn() }));
vi.mock('../views/ledgerSources', async (orig) => ({ ...(await orig<object>()), msiValue: vi.fn(() => 0) }));  // MISSING EXPORT T03-24 led.msi

const D = TICKS_PER_GAME_DAY, ports = stubPorts();
/** Genesis, then day 0 closes with GLOBAL FSI set to `fsi` (FSI is hourly, 2.7; the day step reads it). */
function closeDay0(fsi: number): MacroWorld {
  const w = macroWorld('ord', 0); macroGenesis(w.ctx, ports);
  const g = w.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')!;
  w.store.put(macroTables.global.name, { ...g, financialStressIndex: fsi });
  w.setTick(719); macroDayStep(w.ctx, ports);
  return w;
}
const curve = (w: MacroWorld, b: string) => w.store.get<CurveState>(macroTables.curve.name, b)!;
const cb = (w: MacroWorld, b: string) => w.store.get<CentralBank>(macroTables.cb.name, cbkId(b as never))!;

describe('day-close order', () => {
  it('O2: 3.8 swap lines open before the 3.9 DAY_CLOSE curves, so today\'s curve already has the −25 bp basis floor', () => {
    const w = closeDay0(0.7);
    expect(w.store.get<GlobalMacroState>(macroTables.global.name, 'GLOBAL')!.financialStressIndex).toBe(0.7);
    for (const b of ['EUN', 'PYN', 'NKR']) {
      expect(swapLineActive(w.store, b as never)).toBe(true);
      expect(curve(w, b).basis).toBe(-0.0025);   // raw −(0.0005 + 0.006·0.4) = −0.0029, floored by the line opened at 3.8
    }
    expect(swapLineActive(w.store, 'SRL')).toBe(false);   // no Concord programme
    expect(curve(w, 'SRL').basis).toBeCloseTo(-(0.003 + 0.015 * 0.7), 12);
    expect(w.events.filter((e) => e.kind === 'macro.cb.tool' && (e.payload as { tool: string }).tool === 'SWAPLINE_ON').map((e) => (e.payload as { bloc: string }).bloc))
      .toEqual(['EUN', 'PYN', 'NKR']);
  });
  it('O6: 3.11 schedules the emergency meeting at the day close (FSI ≥ 0.7 → FSI trigger, next trading day, tick 45)', () => {
    const w = closeDay0(0.7);
    for (const b of ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'] as const) {
      expect(cb(w, b).pendingEmergency).toEqual({ tick: nextTradingDay(b, 0) * D + 45, triggers: expect.arrayContaining(['FSI']) });
      expect(cb(w, b).emergencyCountQuarter).toBe(1);
    }
    const calm = closeDay0(0.1);
    for (const b of ['FDL', 'SRL']) expect(cb(calm, b).pendingEmergency).toBeNull();
  });
});
