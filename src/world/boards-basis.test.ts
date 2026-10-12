import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { computeBoards } from './boards';
import { rankBasisOf } from './social';
import { refreshNetWorth } from './assets';
import type { GameState } from './types';

/**
 * R-9-4 (Phase 9 rulings): every leaderboard ranks on the rank basis (marked net worth minus loans owed and net gifts received),
 * the same value rank-ups key off. A gifted or borrowed balance buys no board row, as it buys no rank.
 */
function world(ids: string[]): GameState {
  const g = createGame('boards-basis', { warmupDays: 0, npcs: false });
  for (const id of ids) expect(applyCommand(g, id, { type: 'join', handle: `t_${id}`, country: 'AV' }).ok).toBe(true);
  return g;
}

describe('leaderboards rank on the rank basis (R-9-4)', () => {
  it('a gifted balance does not lift an account above an honest one with the same marked net worth', () => {
    const g = world(['honest', 'gifted']);
    for (const id of ['honest', 'gifted']) {
      const p = g.players[id]!;
      refreshNetWorth(g, p);
      p.netWorth = 500_000;
      p.markNetWorth = 500_000;
    }
    g.players.gifted!.giftsNet = 300_000;
    computeBoards(g);
    expect(rankBasisOf(g, g.players.gifted!)).toBe(200_000);
    expect(g.boards.nwRank.honest).toBe(1);
    expect(g.boards.nwRank.gifted).toBe(2);
    expect(g.boards.netWorth.find((r) => r.id === 'gifted')!.value).toBe(200_000);
  });

  it('the chapter ladder counts a gain on the basis: a gift received during the chapter is not a gain', () => {
    const g = world(['honest', 'gifted']);
    for (const id of ['honest', 'gifted']) {
      const p = g.players[id]!;
      p.netWorth = 100_000;
      p.markNetWorth = 100_000;
      p.chapterStartNetWorth = 100_000;
      p.chapterStartBasis = 100_000;
    }
    // the gifted account is handed 150k in the chapter: raw net worth 250k, basis still 100k
    g.players.gifted!.netWorth = 250_000;
    g.players.gifted!.markNetWorth = 250_000;
    g.players.gifted!.giftsNet = 150_000;
    computeBoards(g);
    const chapter = (id: string) => g.boards.chapter.find((r) => r.id === id)!.value;
    expect(chapter('gifted')).toBe(0);
    expect(chapter('honest')).toBe(0);
    // an honest account that earns 50k in the chapter counts 50k
    g.players.honest!.netWorth = 150_000;
    g.players.honest!.markNetWorth = 150_000;
    computeBoards(g);
    expect(chapter('honest')).toBe(50_000);
  });

  it('a save from before R-9-4 has no chapterStartBasis: the chapter starts at its raw chapter-start net worth', () => {
    const g = world(['honest']);
    const p = g.players.honest!;
    p.netWorth = 120_000;
    p.markNetWorth = 120_000;
    p.chapterStartNetWorth = 100_000;
    delete p.chapterStartBasis;
    computeBoards(g);
    expect(g.boards.chapter.find((r) => r.id === 'honest')!.value).toBe(20_000);
  });
});
