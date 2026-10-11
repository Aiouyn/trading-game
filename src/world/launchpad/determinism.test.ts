import { describe, expect, it } from 'vitest';
import { Rng, seedStream } from '@/engine';
import { applyCommand, stepGame } from '../game';
import { createGame } from '../game';
import { CREATOR, HOLDER, TRADER, lpWorld } from './fixture';
import type { Command, GameState } from '../types';

/**
 * Determinism and replay (lead-launchpad.md L1): the same seed and the same command log give a byte-identical Launchpad state and
 * market, and a world that never launches keeps no Launchpad state at all.
 */

/** A seeded command log: launches, buys, sells and buzz at fixed ticks, the same for every replay. */
function play(g: GameState, ticks: number): void {
  const rng = new Rng(seedStream('lp-det', 'log'));
  applyCommand(g, CREATOR, { type: 'lp.launch', name: 'Determine', ticker: 'DETM', tagline: 'tg3', allocation: 1_000_000 } as Command);
  for (let k = 0; k < ticks; k++) {
    if (k % 60 === 0) {
      const pid = [CREATOR, TRADER, HOLDER][Math.floor(rng.uniform() * 3)]!;
      const u = rng.uniform();
      if (u < 0.6) applyCommand(g, pid, { type: 'lp.buy', ticker: 'DETM', spendCents: 200 + Math.round(rng.uniform() * 2_000), maxSlip: 0.5 });
      else applyCommand(g, pid, { type: 'lp.buzz', ticker: 'DETM', kind: 'board' });
    }
    stepGame(g);
  }
}

describe('determinism and replay (L1)', () => {
  it('the same seed and command log replay to a byte-identical Launchpad state and market', () => {
    const a = lpWorld('lp-det', { npcLaunches: true });
    const b = lpWorld('lp-det', { npcLaunches: true });
    play(a, 240);
    play(b, 240);
    expect(JSON.stringify(a.launchpad)).toBe(JSON.stringify(b.launchpad));
    expect(JSON.stringify(a.market.accounts)).toBe(JSON.stringify(b.market.accounts));
    expect(JSON.stringify(a.market.assets)).toBe(JSON.stringify(b.market.assets));
  });

  it('a world that never launches keeps no Launchpad state through a day of steps', () => {
    const g = createGame('no-lp', { warmupDays: 0, npcs: false });
    for (let k = 0; k < 40; k++) stepGame(g);
    expect('launchpad' in g).toBe(false);
  });
});
