import { describe, expect, it } from 'vitest';
import { openAccount } from '@/engine';
import { applyCommand, createGame } from './game';
import { STABILIZER_MEASURE, STABILIZER_WINDOW, stabilizerDay, stabilizerSupply } from './boards';
import { cashOf } from './core';
import type { GameState } from './types';

function world(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const [pid, handle] of [['u1', 'ada'], ['u2', 'bea']] as const) {
    const r = applyCommand(g, pid, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  }
  return g;
}

describe('stabilizer supply is net worth per player', () => {
  it('doubling marks, with cash held fixed, moves the per-player supply', () => {
    const g = world('stab-marks');
    const c1 = cashOf(g, 'u1');
    const c2 = cashOf(g, 'u2');
    const marks = 40_000;
    g.players.u1!.netWorth = c1 + marks;
    g.players.u2!.netWorth = c2 + marks;
    const before = stabilizerSupply(g);
    expect(before).toBeCloseTo((c1 + c2) / 2 + marks, 6);
    g.players.u1!.netWorth = c1 + 2 * marks;
    g.players.u2!.netWorth = c2 + 2 * marks;
    expect(cashOf(g, 'u1')).toBe(c1);
    expect(cashOf(g, 'u2')).toBe(c2);
    expect(stabilizerSupply(g)).toBeCloseTo(before + marks, 6);
  });

  it('cloning the player set at the same wealth per player does not move the supply, and a market-only account is not a player', () => {
    const g = world('stab-clone');
    const nw = 80_000;
    g.players.u1!.netWorth = nw;
    g.players.u2!.netWorth = -500;
    expect(stabilizerSupply(g)).toBeCloseTo(nw / 2, 6);
    g.players.u2!.netWorth = nw;
    const before = stabilizerSupply(g);
    expect(before).toBeCloseTo(nw, 6);
    g.players.u3 = { ...g.players.u1!, id: 'u3', handle: 'cy' };
    expect(stabilizerSupply(g)).toBeCloseTo(before, 6);
    g.market = openAccount(g.market, 'micro-only', 5_000_000);
    expect(stabilizerSupply(g)).toBeCloseTo(before, 6);
  });

  it('a 2% per-player path over the window engages, and a 0.5% path does not', () => {
    const engage = (seed: string, daily: number) => {
      const g = world(seed);
      for (const p of Object.values(g.players)) p.netWorth = 100_000;
      const supply = stabilizerSupply(g);
      g.economy.stabilizer.measure = STABILIZER_MEASURE;
      g.economy.stabilizer.integral = 0;
      g.economy.stabilizer.sinkMult = 1;
      g.economy.stabilizer.hist = Array(STABILIZER_WINDOW).fill(supply / (1 + daily) ** STABILIZER_WINDOW);
      stabilizerDay(g);
      return g.economy.stabilizer.sinkMult;
    };
    expect(engage('stab-2pct', 0.02)).toBeGreaterThan(1);
    expect(engage('stab-half', 0.005)).toBe(1);
  });

  it('an untagged history is dropped, and the levy does not engage on that day', () => {
    const g = world('stab-old');
    delete g.economy.stabilizer.measure;
    g.economy.stabilizer.hist = [1, 1, 1, 1, 1, 1, 1];
    g.economy.stabilizer.sinkMult = 1;
    g.economy.stabilizer.integral = 0;
    stabilizerDay(g);
    expect(g.economy.stabilizer.measure).toBe(STABILIZER_MEASURE);
    expect(g.economy.stabilizer.hist).toHaveLength(1);
    expect(g.economy.stabilizer.hist![0]).toBeCloseTo(stabilizerSupply(g), 6);
    expect(g.economy.stabilizer.sinkMult).toBe(1);
  });
});
