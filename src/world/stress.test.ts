import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { creditExternal } from './core';
import { STRESS_KINDS, STRESS_MOVES } from '@/content/stress';
import { stressBook, stressMoveOf } from './stress';
import type { GameState } from './types';

const pid = 'p-stress';

function world(): GameState {
  const g = createGame('stress-test', { warmupDays: 1, npcs: false });
  applyCommand(g, pid, { type: 'join', handle: 'stressed', country: 'XX' });
  creditExternal(g, pid, 100_000, 'test grant');
  return g;
}

/** The first listed stock in a sector, with its mid price. */
function stockIn(g: GameState, sector: string) {
  const i = g.market.config.assets.findIndex((a) => a.assetClass === 'stock' && a.sector === sector && a.listed !== false);
  return { def: g.market.config.assets[i]!, px: Math.exp(g.market.assets[i]!.lnP) };
}

const hold = (g: GameState, id: string, qty: number) => {
  g.market.accounts[pid] = { ...g.market.accounts[pid]!, positions: { ...g.market.accounts[pid]!.positions, [id]: { qty, avgCost: 1, realizedPnl: 0 } } };
};

describe('stress test of the book', () => {
  it('shows no change for a book of cash alone', () => {
    const g = world();
    const s = stressBook(g, pid)!;
    expect(s.positions).toBe(0);
    expect(s.equity).toBe(g.market.accounts[pid]!.cash);
    for (const r of s.rows) expect(r.delta).toBe(0);
  });

  it('applies the crash multiplier to a tech stock, and the staples discount to a staples stock', () => {
    const g = world();
    const tech = stockIn(g, 'tech');
    hold(g, tech.def.id, 100);
    const crash = stressBook(g, pid)!.rows.find((r) => r.kind === 'crash')!;
    expect(crash.delta).toBeCloseTo(100 * tech.px * STRESS_MOVES.crash.stock * 1.4, 6);
    const staples = stockIn(g, 'staples');
    expect(stressMoveOf('crash', staples.def)).toBeCloseTo(STRESS_MOVES.crash.stock * 0.4, 9);
  });

  it('gains on a short position in a crash, because the quantity is negative', () => {
    const g = world();
    const tech = stockIn(g, 'tech');
    hold(g, tech.def.id, -50);
    const crash = stressBook(g, pid)!.rows.find((r) => r.kind === 'crash')!;
    expect(crash.delta).toBeGreaterThan(0);
  });

  it('states each change as a share of today\'s equity, and labels the rows that have no published figure', () => {
    const g = world();
    const tech = stockIn(g, 'tech');
    hold(g, tech.def.id, 100);
    const s = stressBook(g, pid)!;
    for (const r of s.rows) expect(r.pct).toBeCloseTo(r.delta / s.equity, 12);
    expect(s.rows.map((r) => r.kind)).toEqual(STRESS_KINDS);
    expect(s.rows.find((r) => r.kind === 'crisis')!.source).toBe('round');
    expect(s.rows.find((r) => r.kind === 'crash')!.source).toBe('published');
  });

  it('never reads the world-event schedule: the figures do not change with an event in the state', () => {
    const g = world();
    const tech = stockIn(g, 'tech');
    hold(g, tech.def.id, 100);
    const before = JSON.stringify(stressBook(g, pid));
    g.market = { ...g.market, worldEvents: { rng: { s: 0 } as unknown as never, seq: 9, drifts: [], active: undefined } as unknown as typeof g.market.worldEvents };
    expect(JSON.stringify(stressBook(g, pid))).toBe(before);
  });
});
