import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { credit } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { checkGoals, goalsView } from './learn';
import { playerView } from './view';
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
    expect(goalsView(g, me(g)).optIn).toBe(false);
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
      id: 't1', playerId: 'u1', assetId: 'HLCN', kind: 'stock', side: 'long', openTick: 1, closeTick: 2, qty: 1, avgEntry: 10,
      avgExit: 11, realizedPnl: 0.5, midPnl: 0.6, slippagePnl: 0, feesPaid: 0.1, fills: 2, closeReason: 'order', explainable: true,
    };
    L.trips.push(rt);
    expect(checkGoals(g, me(g), null)).toContain('goal-profit');
  });

  it('the view shows the rungs in order and the next one to reach', () => {
    const g = joined('goal-view');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    boost(g, 20_000);
    checkGoals(g, me(g), null);
    const v = goalsView(g, me(g));
    expect(v.rungs.map((r) => r.id)).toEqual(GOAL_LADDER.map((r) => r.id));
    expect(v.rungs[0]!.done).toBe(true);
    expect(v.next).toBe('goal-profit');
  });
});

describe('the goal ladder basis', () => {
  it('a net worth rung reads the rank basis (liquidation mark), not the mid mark', () => {
    const g = joined('goal-basis');
    expect(cmd(g, 'u1', { type: 'goals.optIn', on: true }).ok).toBe(true);
    const p = me(g);
    p.netWorth = 25_000; // the mid mark is above $20k, the liquidation mark (the rank's basis) is not
    p.markNetWorth = 10_000;
    checkGoals(g, p, null);
    expect(p.goals!.done['goal-nw20k']).toBeUndefined();
    p.markNetWorth = 20_000;
    checkGoals(g, p, null);
    expect(p.goals!.done['goal-nw20k']).toBeDefined();
  });
});


describe('the goal ladder progress (server reading, the same basis as the checks)', () => {
  it('an open net worth rung reads the rank basis toward its target', () => {
    const g = joined('goal-progress');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    me(g).markNetWorth = 10_000;
    const r = goalsView(g, me(g)).rungs[0]!;
    expect(r).toMatchObject({ id: 'goal-nw20k', done: false, value: 10_000, target: 20_000, unit: 'money' });
    expect(r.progress).toBeCloseTo(0.5);
  });

  it('an open rung never reads full before its check records it', () => {
    const g = joined('goal-cap');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    me(g).markNetWorth = 25_000; // over the target, but the check has not run yet
    const r = goalsView(g, me(g)).rungs[0]!;
    expect(r.done).toBe(false);
    expect(r.progress).toBeLessThan(1);
    expect(r.value).toBe(20_000);
  });

  it('a done rung stays full after the reading drops', () => {
    const g = joined('goal-kept');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    me(g).markNetWorth = 20_000;
    checkGoals(g, me(g), null);
    me(g).markNetWorth = 5_000;
    const r = goalsView(g, me(g)).rungs[0]!;
    expect(r.done).toBe(true);
    expect(r.progress).toBe(1);
  });

  it('the hold rung counts peak positions, and the profit rung has no bar reading', () => {
    const g = joined('goal-count');
    cmd(g, 'u1', { type: 'goals.optIn', on: true });
    me(g).stats.maxPositions = 2;
    const v = goalsView(g, me(g));
    const hold = v.rungs.find((r) => r.id === 'goal-hold3')!;
    expect(hold).toMatchObject({ value: 2, target: 3, unit: 'count' });
    expect(hold.progress).toBeCloseTo(2 / 3);
    expect(v.rungs.find((r) => r.id === 'goal-profit')).toMatchObject({ value: null, target: null, unit: null, progress: 0 });
  });
});

describe('the weekly challenge attempt (kept on the player record)', () => {
  it('one claim per ISO week, durable on the record and in the view', () => {
    const g = joined('challenge-claim');
    expect(cmd(g, 'u1', { type: 'challenge.claim', weekKey: '2026-W41' }).ok).toBe(true);
    const again = cmd(g, 'u1', { type: 'challenge.claim', weekKey: '2026-W41' });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already/);
    expect(cmd(g, 'u1', { type: 'challenge.claim', weekKey: '2026-W42' }).ok).toBe(true);
    expect(cmd(g, 'u1', { type: 'challenge.claim', weekKey: 'next week' }).ok).toBe(false);
    expect(me(g).challengeWeeks).toEqual(['2026-W41', '2026-W42']);
    expect(playerView(g, 'u1')?.trading.challengeWeeks).toEqual(['2026-W41', '2026-W42']);
  });

  it('keeps the last 60 weeks', () => {
    const g = joined('challenge-keep');
    for (let i = 0; i < 61; i++) {
      cmd(g, 'u1', { type: 'challenge.claim', weekKey: `${2000 + Math.floor(i / 52)}-W${String((i % 52) + 1).padStart(2, '0')}` });
    }
    expect(me(g).challengeWeeks!.length).toBe(60);
    expect(me(g).challengeWeeks![0]).toBe('2000-W02');
  });
});
