import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { calendarFor } from './calendar';
import { today } from './core';
import { earningsCalendar } from '@/engine';
import type { GameState, Command } from './types';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  return g;
}

describe('the always-busy calendar', () => {
  it('has at least three real dated items in the next two game days, for a new player', () => {
    const g = joined('cal-busy');
    const items = calendarFor(g, 'u1', 2);
    expect(items.length).toBeGreaterThanOrEqual(3);
    const d0 = today(g);
    for (const it of items) {
      expect(it.day).toBeGreaterThanOrEqual(d0);
      expect(it.day).toBeLessThan(d0 + 2);
      expect(it.offset).toBe(it.day - d0);
    }
    expect(items.some((i) => i.kind === 'close' && i.offset === 0)).toBe(true);
    expect(items.some((i) => i.kind === 'close' && i.offset === 1)).toBe(true);
    expect(items.some((i) => i.kind === 'contracts')).toBe(true);
  });

  it('lists earnings only for reports the market really schedules', () => {
    const g = joined('cal-earn');
    const real = new Set(earningsCalendar(g.market, 1).map((e) => e.assetId));
    const items = calendarFor(g, 'u1', 2).filter((i) => i.kind === 'earnings');
    for (const i of items) expect(real.has(i.assetId!)).toBe(true);
  });

  it('shows the analyst and desk dues on their days, and nothing else invented', () => {
    const g = joined('cal-dues');
    const p = g.players.u1!;
    p.analyst = { tier: 'junior', hiredDay: 0, paidThroughDay: today(g) + 1 };
    const items = calendarFor(g, 'u1', 2);
    expect(items.some((i) => i.kind === 'analyst' && i.offset === 1)).toBe(true);
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of kinds) {
      expect(['close', 'contracts', 'earnings', 'bank', 'release', 'index', 'analyst', 'desk', 'business']).toContain(k);
    }
  });

  it('never prints a world event end or its duration: only the announced kind on the Wire is listed', () => {
    const g = joined('cal-event');
    const items = calendarFor(g, 'u1', 2);
    expect(JSON.stringify(items)).not.toMatch(/lastedDays|gxMove|endTick/);
  });
});
