import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { credit } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { checkGoals, goalsView } from './learn';
import { ledgerOf } from './ledger';
import { GOAL_LADDER, LESSON_IDS } from '@/content/learning';
import type { GameState, Command, Player } from './types';
import type { RoundTrip } from './ledger-types';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  return g;
}

function boost(g: GameState, amount: number) {
  credit(g, 'u1', amount, 'test');
  const p = g.players.u1!;
  refreshNetWorth(g, p);
  applyRank(g, p, null);
}

const me = (g: GameState): Player => g.players.u1!;

describe('lessons (server record)', () => {
  it('a completed lesson is kept on the player record, once', () => {
    const g = joined('learn-lesson');
    expect(cmd(g, 'u1', { type: 'lesson.complete', lessonId: '3' }).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'lesson.complete', lessonId: '3' }).ok).toBe(true);
    expect(me(g).lessons).toEqual(['3']);
    expect(cmd(g, 'u1', { type: 'lesson.complete', lessonId: '99' }).ok).toBe(false);
    expect(LESSON_IDS.length).toBe(10);
  });
});

describe('the goal ladder (opt-in, checked on the server)', () => {
  it('is off by default and checks nothing until a player opts in', () => {
    const g = joined('goal-off');
    boost(g, 20_000);
    stepGame(g);
    expect(me(g).goals?.optIn ?? false).toBe(false);
    expect(me(g).goals?.done ?? {}).toEqual({});
    expect(goalsView(me(g)).optIn).toBe(false);
  });

  it('the server checks the rungs on the net worth cadence once opted in, each one once', () => {
    const g = joined('goal-on');
    expect(cmd(g, 'u1', { type: 'goals.optIn', on: true }).ok).toBe(true);
    boost(g, 20_000);
    while (g.market.tick % 12 !== 0) stepGame(g);
    stepGame(g);
    expect(me(g).goals!.done['goal-nw20k']).toBeDefined();
    expect(me(g).inbox.some((n) => n.msg?.key === 'goal.done.goal-nw20k')).toBe(true);
    const doneAt = me(g).goals!.done['goal-nw20k'];
    for (let k = 0; k < 24; k++) stepGame(g);
    expect(me(g).goals!.done['goal-nw20k']).toBe(doneAt);
  });

  it('holding three assets ticks the hold rung, even with no closed trade', () => {
    const g = joined('goal-hold');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    me(g).stats.maxPositions = 3;
    const fresh = checkGoals(g, me(g), null);
    expect(fresh).toContain('goal-hold3');
    expect(me(g).goals!.done['goal-profit']).toBeUndefined();
  });

  it('closing a profitable round trip ticks the profit rung', () => {
    const g = joined('goal-profit');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    const L = ledgerOf(g, 'u1')!;
    const rt: RoundTrip = {
      id: 't1', assetId: 'HLCN', kind: 'stock', side: 'long', openedTick: 1, closedTick: 2, qty: 1, avgEntry: 10, avgExit: 11,
      realizedPnl: 0.5, fees: 0.1, fills: 2, closeReason: 'order',
    };
    L.trips.push(rt);
    expect(checkGoals(g, me(g), null)).toContain('goal-profit');
  });

  it('the view shows the rungs in order and the next one to reach', () => {
    const g = joined('goal-view');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    boost(g, 20_000);
    checkGoals(g, me(g), null);
    const v = goalsView(me(g));
    expect(v.rungs.map((r) => r.id)).toEqual(GOAL_LADDER.map((r) => r.id));
    expect(v.rungs[0]!.done).toBe(true);
    expect(v.next).toBe('goal-profit');
  });
});
