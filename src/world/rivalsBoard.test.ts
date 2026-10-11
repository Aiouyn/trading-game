import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { TPD } from './core';
import { playerView } from './view';
import { rivalsBoard } from './rivalsBoard';
import { rivalEquity } from '@/engine';
import type { GameState } from './types';

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

}

describe('the Rivals board (velvet-rivals-board.md)', () => {
  it('lists the three rivals with names and net worth, sorted, and the player with the same rules', () => {
    const g = game('board');
    run(g, 2);
    const b = rivalsBoard(g, 'u1', 5000)!;
    expect(b.rows.map((r) => r.id).sort()).toEqual(['hale', 'pinn', 'vetch']);
    for (let i = 1; i < b.rows.length; i++) expect(b.rows[i - 1]!.equity).toBeGreaterThanOrEqual(b.rows[i]!.equity);
    for (const r of b.rows) expect(r.equity).toBe(Math.round(rivalEquity(g.market, r.id) * 100) / 100);
  });

  it('exposes no style, cash, holdings, targets, dates or tickers on any rival element (the no-leak rule)', () => {
    const g = game('noleak');
    run(g, 3);
    const b = rivalsBoard(g, 'u1', 5000)!;
    const text = JSON.stringify(b);
    for (const word of ['value', 'momentum', 'degen', 'crypto', 'units', 'target', 'cash', 'peak', 'style', 'rebalance', 'trade']) {
      expect(text.toLowerCase()).not.toContain(`"${word}"`);
    }
    for (const r of b.rows) expect(Object.keys(r).sort()).toEqual(['equity', 'id', 'name', 'rank', 'sinceStart', 'spark']);
    expect(Object.keys(b.you).sort()).toEqual(['netWorth', 'rank', 'sinceStart']);
  });

  it('ranks the player among the rivals, and the next-up chip names the rival directly above with the gap', () => {
    const g = game('next');
    run(g, 1);
    setWorth(g, 'u1', 5_000_000); // above every rival at the start
    const low = rivalsBoard(g, 'u1', 5000)!;
    expect(low.you.rank).toBe(1);
    expect(low.nextUp).toBeNull();
    // a player just under the top rival: the next-up chip is that rival, and the gap is the difference
    const top = low.rows[0]!;
    g.players.u1!.netWorth = top.equity - 1240;
    const mid = rivalsBoard(g, 'u1', 5000)!;
    expect(mid.you.rank).toBe(1 + mid.rows.filter((r) => r.equity > mid.you.netWorth).length);
    expect(mid.you.rank).toBeGreaterThan(1);
    expect(mid.nextUp).not.toBeNull();
    expect(mid.nextUp!.id).toBe(top.id);
    expect(mid.nextUp!.gap).toBeCloseTo(1240, 2);
  });

  it('a rival below the player ranks under them and the rival rank counts the player', () => {
    const g = game('rank');
    run(g, 1);
    g.players.u1!.netWorth = 1e12;
    const b = rivalsBoard(g, 'u1', 5000)!;
    expect(b.you.rank).toBe(1);
    // unique ranks: a rival sits under the rivals above it in the sort, and under the player when the player is above it
    for (const [i, r] of b.rows.entries()) expect(r.rank).toBe(1 + i + 1);
    expect(new Set(b.rows.map((r) => r.rank)).size).toBe(b.rows.length);
  });

  it('the 1W sparkline and the quarter chart are the rival\'s own closes, one per game day', () => {
    const g = game('chart');
    run(g, 3 * TPD + 5);
    const b = rivalsBoard(g, 'u1', 5000)!;
    for (const r of b.rows) {
      const days = b.chart[r.id]!;
      expect(days.length).toBeGreaterThan(0);
      expect(days.length).toBeLessThanOrEqual(63);
      expect(r.spark).toEqual(days.slice(-7).map((d) => d.equity));
      for (let i = 1; i < days.length; i++) expect(days[i]!.day).toBeGreaterThan(days[i - 1]!.day);
    }
  });

  it('is in the player view, and is null in a world with no rivals', () => {
    const g = game('view');
    run(g, 1);
    const v = playerView(g, 'u1')!;
    expect(v.rivals).not.toBeNull();
    expect(v.rivals!.rows.length).toBe(3);
    const none = game('none');
    none.market.config.rivals = [];
    expect(rivalsBoard(none, 'u1', 5000)).toBeNull();
  });
});
