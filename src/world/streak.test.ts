import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { REAL_DAY_TICKS, STREAK, claimStreak, markStreakAction, nextStreak, streakCash, streakView } from './streak';
import type { GameState } from './types';

const pid = 'p-streak';

function world(rankId = 'R2'): GameState {
  const g = createGame('streak-test', { warmupDays: 1, npcs: false });
  applyCommand(g, pid, { type: 'join', handle: 'streaker', country: 'XX' });
  g.players[pid]!.rankId = rankId;
  return g;
}

/** Move the world to real day `d`, log the player in on it, and (by default) record one action that day. */
function atDay(g: GameState, d: number, acted = true): void {
  g.market = { ...g.market, tick: d * REAL_DAY_TICKS + 5 };
  const p = g.players[pid]!;
  p.online = false;
  p.lastSeenTick = g.market.tick;
  if (acted) markStreakAction(g, pid);
}

describe('streak gates', () => {
  it('refuses a claim with no login today, with the three parts of the refusal', () => {
    const g = world();
    atDay(g, 0, true);
    g.market = { ...g.market, tick: REAL_DAY_TICKS + 5 };
    g.players[pid]!.lastSeenTick = 5;
    const r = claimStreak(g, pid);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/login today/);
  });

  it('refuses a claim with no action today', () => {
    const g = world();
    atDay(g, 0, false);
    const r = claimStreak(g, pid);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/one action today/);
  });

  it('allows one claim a real day', () => {
    const g = world();
    atDay(g, 0);
    expect(claimStreak(g, pid).ok).toBe(true);
    expect(claimStreak(g, pid).error).toMatch(/already claimed/);
  });

  it('counts a successful command as the day\'s action, through applyCommand', () => {
    const g = world();
    g.market = { ...g.market, tick: 5 };
    g.players[pid]!.online = false;
    // a failed action (no such lot) is not an action
    applyCommand(g, pid, { type: 'auction.bid', lot: '0:none', amount: 1 });
    expect(g.players[pid]!.streak?.actedDay ?? -1).toBe(-1);
  });
});

describe('streak growth and cash', () => {
  it('pays a day one amount that grows with the streak to a 7-day cap, never above 100 x the rank index', () => {
    const g = world('R2');
    expect(streakCash(1, 'R2')).toBeCloseTo(200 / 7, 2);
    expect(streakCash(7, 'R2')).toBe(200);
    expect(streakCash(40, 'R2')).toBe(200);
    expect(streakCash(7, 'R6')).toBe(600);
    expect(streakCash(7, 'R0')).toBe(0);
    for (let d = 0; d < 8; d++) {
      atDay(g, d);
      expect(claimStreak(g, pid).ok).toBe(true);
    }
    expect(g.players[pid]!.streak!.count).toBe(8);
  });

  it('books the cash as a daily-streak faucet, to the cent, and moves no sink', () => {
    const g = world('R2');
    atDay(g, 0);
    const before = g.market.accounts[pid]!.cash;
    const sinks = JSON.stringify(g.economy.sinks);
    const r = claimStreak(g, pid);
    expect(r.ok).toBe(true);
    const cash = (r.data as { cash: number }).cash;
    expect(g.market.accounts[pid]!.cash - before).toBeCloseTo(cash, 2);
    expect(g.economy.faucets['daily streak']).toBeCloseTo(cash, 2);
    expect(JSON.stringify(g.economy.sinks)).toBe(sinks);
  });

  it('pays nothing at the Broke rank, but the streak still counts', () => {
    const g = world('R0');
    atDay(g, 0);
    const r = claimStreak(g, pid);
    expect((r.data as { cash: number }).cash).toBe(0);
    expect(g.players[pid]!.streak!.count).toBe(1);
  });
});

describe('streak rest day and breaks', () => {
  it('keeps half the streak across one missed day, once a week', () => {
    const g = world();
    for (const d of [0, 1, 2]) { atDay(g, d); claimStreak(g, pid); }
    atDay(g, 4);
    const r = claimStreak(g, pid);
    expect((r.data as { restUsed: boolean }).restUsed).toBe(true);
    // half of 3, rounded down, plus today's claim
    expect(g.players[pid]!.streak!.count).toBe(2);
  });

  it('restarts the streak when a second missed day comes in the same week', () => {
    const g = world();
    for (const d of [0, 1, 2]) { atDay(g, d); claimStreak(g, pid); }
    atDay(g, 4); claimStreak(g, pid);
    atDay(g, 6);
    const r = claimStreak(g, pid);
    expect((r.data as { restUsed: boolean }).restUsed).toBe(false);
    expect(g.players[pid]!.streak!.count).toBe(1);
  });

  it('restarts after two or more missed days in a row', () => {
    const g = world();
    atDay(g, 0); claimStreak(g, pid);
    atDay(g, 1); claimStreak(g, pid);
    atDay(g, 4);
    claimStreak(g, pid);
    expect(g.players[pid]!.streak!.count).toBe(1);
  });

  it('computes the next count from the stored streak, and the rest day only with a single gap', () => {
    const s = { count: 10, lastDay: 0, restWeek: -1, actedDay: -1, badges: [], titles: [] };
    expect(nextStreak(s, 1)).toEqual({ count: 11, restUsed: false });
    expect(nextStreak(s, 2)).toEqual({ count: 6, restUsed: true });
    expect(nextStreak(s, 3)).toEqual({ count: 1, restUsed: false });
  });
});

describe('streak milestones and view', () => {
  it('gives a badge at 3 days, and a badge and a title at 7', () => {
    const g = world();
    for (let d = 0; d < 3; d++) { atDay(g, d); claimStreak(g, pid); }
    expect(g.players[pid]!.streak!.badges).toContain(STREAK.milestones[0]!.badge);
    for (let d = 3; d < 7; d++) { atDay(g, d); claimStreak(g, pid); }
    expect(g.players[pid]!.streak!.badges).toContain('streak7');
    expect(g.players[pid]!.streak!.titles).toContain('regular');
  });

  it('shows the claim state and the next milestone, with the refusal when a claim is closed', () => {
    const g = world();
    atDay(g, 0, false);
    const closed = streakView(g, pid)!;
    expect(closed.canClaim).toBe(false);
    expect(closed.block).toMatch(/one action/);
    expect(closed.nextMilestone).toBe(3);
    markStreakAction(g, pid);
    expect(streakView(g, pid)!.canClaim).toBe(true);
  });
});
