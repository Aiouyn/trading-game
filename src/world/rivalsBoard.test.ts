import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD } from './core';
import { playerView } from './view';
import { rivalsBoard } from './rivalsBoard';
import { rivalEquity } from '@/engine';
import type { GameState } from './types';

const ARR = { changePct: 0 };

function game(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1 });
  applyCommand(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  return g;
}

function run(g: GameState, n: number) {
  for (let k = 0; k < n; k++) stepGame(g);
}

/** Sets the player's net worth (test helper: the board reads the stored figure). */
function setWorth(g: GameState, pid: string, amount: number) {
  g.players[pid]!.netWorth = amount;
  g.players[pid]!.markNetWorth = amount; // the rank basis reads the mark (R-9-4), which the game refreshes with the raw value
}

describe('the Rivals board (velvet-rivals-board.md)', () => {
  it('lists the three engine rivals with names and net worth, sorted, with the ladder funds nearest the player', () => {
    const g = game('board');
    run(g, 2);
    const b = rivalsBoard(g, 'u1', ARR)!;
    const engine = b.rows.filter((r) => !r.id.startsWith('lad-')).map((r) => r.id).sort();
    expect(engine).toEqual(['hale', 'pinn', 'vetch']);
    expect(b.rows.filter((r) => r.id.startsWith('lad-')).length).toBeGreaterThan(0);
    for (let i = 1; i < b.rows.length; i++) expect(b.rows[i - 1]!.equity).toBeGreaterThanOrEqual(b.rows[i]!.equity);
    for (const r of b.rows.filter((x) => !x.id.startsWith('lad-'))) expect(r.equity).toBe(Math.round(rivalEquity(g.market, r.id) * 100) / 100);
  });

  it('exposes no style, cash, holdings, targets, dates or tickers on any rival element (the no-leak rule)', () => {
    const g = game('noleak');
    run(g, 3);
    const b = rivalsBoard(g, 'u1', ARR)!;
    const text = JSON.stringify(b);
    for (const word of ['value', 'momentum', 'degen', 'crypto', 'units', 'target', 'cash', 'peak', 'style', 'rebalance', 'trade']) {
      expect(text.toLowerCase()).not.toContain(`"${word}"`);
    }
    for (const r of b.rows) expect(Object.keys(r).sort()).toEqual(['equity', 'id', 'name', 'rank', 'sinceStart', 'spark']);
    expect(Object.keys(b.you).sort()).toEqual(['netWorth', 'rank', 'sinceStart']);
  });

  it('ranks the player among the rivals, and the next-up chip names the lowest rival above with the gap', () => {
    const g = game('next');
    run(g, 1);
    setWorth(g, 'u1', 5e12); // above every rival at the start
    const low = rivalsBoard(g, 'u1', ARR)!;
    expect(low.you.rank).toBe(1);
    expect(low.nextUp).toBeNull();
    // a player just under the highest shown rival: the chip is a rival above, the gap is the difference to that rival
    const top = low.rows[0]!;
    setWorth(g, 'u1', top.equity - 1240);
    const mid = rivalsBoard(g, 'u1', ARR)!;
    expect(mid.you.rank).toBeGreaterThan(1);
    expect(mid.nextUp).not.toBeNull();
    const up = mid.rows.find((r) => r.id === mid.nextUp!.id)!;
    expect(up.equity).toBeLessThanOrEqual(top.equity);
    expect(mid.nextUp!.gap).toBeCloseTo(up.equity - mid.you.netWorth, 1);
    expect(mid.nextUp!.gap).toBeGreaterThan(0);
  });

  it('a rival below the player ranks under them, and the ranks follow the equity order with no repeats', () => {
    const g = game('rank');
    run(g, 1);
    setWorth(g, 'u1', 1e12);
    const b = rivalsBoard(g, 'u1', ARR)!;
    expect(b.you.rank).toBe(1);
    // unique ranks: a rival sits under the rivals above it in the sort, and under the player when the player is above it
    for (let i = 1; i < b.rows.length; i++) expect(b.rows[i]!.rank).toBeGreaterThan(b.rows[i - 1]!.rank);
    for (const r of b.rows) expect(r.rank).toBeGreaterThanOrEqual(2);
    expect(new Set(b.rows.map((r) => r.rank)).size).toBe(b.rows.length);
  });

  it('the 1W sparkline and the quarter chart are the rival\'s own closes, one per game day', () => {
    const g = game('chart');
    run(g, 3 * TPD + 5);
    const b = rivalsBoard(g, 'u1', ARR);
    expect(b).not.toBeNull();
    for (const r of b!.rows) {
      const days = b!.chart[r.id]!;
      expect(days.length).toBeGreaterThan(0);
      expect(days.length).toBeLessThanOrEqual(63);
      expect(r.spark).toEqual(days.slice(-7).map((d) => d.equity));
      for (let i = 1; i < days.length; i++) expect(days[i]!.day).toBeGreaterThan(days[i - 1]!.day);
    }
  });

  it('the player\'s own "since start" is the arrival change (the Portfolio figure), not the net worth over the starting cash', () => {
    const g = game('since');
    run(g, 1);
    expect(rivalsBoard(g, 'u1', { changePct: 0.0123 })!.you.sinceStart).toBe(0.0123);
  });

  it('is in the player view, and is null in a world with no rivals', () => {
    const g = game('view');
    run(g, 1);
    const v = playerView(g, 'u1')!;
    expect(v.rivals).not.toBeNull();
    expect(v.rivals!.rows.length).toBeGreaterThanOrEqual(3);
    expect(v.rivals!.you.sinceStart).toBeCloseTo(v.arrival.changePct, 12);
    const none = game('none');
    none.market.config.rivals = [];
    expect(rivalsBoard(none, 'u1', ARR)).toBeNull();
  });
});
