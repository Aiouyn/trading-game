import { describe, expect, it } from 'vitest';
import { LIFE_ITEMS } from '@/content/lifestyle';
import { dayOfTick, earningsCalendar, type EarningsInfo } from '@/engine';
import type { WorldState } from '@/engine/types';
import { computeReserveFactor, computeWeekLots, reserveFactor, weekLots } from './auctions';
import { applyCommand, createGame, stepGame } from './game';
import { clearPureMemos, pureMemo } from './pure-memo';
import { computeWeekSeeds, weekSeeds } from './tournament';
import { playerView } from './view';

// V1-PHASE9 9C.1: every view read the auction lots, the reserve factors, the tournament seeds and the earnings calendar, and each
// was recomputed per socket. They are now answered from memos (pure: the key carries every input) or by one pass over the assets.
// Each test compares the answer with the uncached reference, and a view is compared cold (every memo empty, so each value is
// computed fresh) with warm (the same view after the memos are filled).

/** The earnings report of one asset, as earningsInfo was written before the one-pass calendar (the reference). */
function earningsReference(state: WorldState, assetId: string): EarningsInfo | null {
  if (!state.config.catalysts) return null;
  const i = state.config.assets.findIndex((d) => d.id === assetId);
  if (i < 0 || state.config.assets[i]!.assetClass !== 'stock') return null;
  const a = state.assets[i]!;
  if (a.nextEarnings === undefined) return null;
  const today = dayOfTick(state.tick, state.config.ticksPerDay);
  return {
    assetId, day: a.nextEarnings, daysAway: a.nextEarnings - today,
    consensus: a.consensus ?? null, rumor: a.rumor ?? null, last: a.lastEarnings ?? null,
  };
}

function calendarReference(state: WorldState, withinDays: number): EarningsInfo[] {
  const out: EarningsInfo[] = [];
  for (const d of state.config.assets) {
    const e = earningsReference(state, d.id);
    if (e && e.daysAway >= 0 && e.daysAway <= withinDays) out.push(e);
  }
  return out.sort((x, y) => x.daysAway - y.daysAway || x.assetId.localeCompare(y.assetId));
}

describe('the per-view memos answer what the uncached functions answer (9C.1)', () => {
  it('weekLots equals computeWeekLots for many seeds and weeks, and a caller cannot change the memo', () => {
    let lots = 0;
    for (const seed of ['alpha', 'beta|1', 'x', '0123456789abcdef']) {
      for (let week = 0; week < 40; week++) {
        const want = computeWeekLots(seed, week);
        const got = weekLots(seed, week);
        expect(got).toEqual(want);
        lots += got.length;
        // a second read is the same answer, and changing the returned copy does not reach the next read
        got.pop();
        expect(weekLots(seed, week)).toEqual(want);
      }
    }
    expect(lots).toBeGreaterThan(100);
  });

  it('reserveFactor equals computeReserveFactor for every item and week', () => {
    for (const seed of ['alpha', 'beta|1']) {
      for (let week = 0; week < 6; week++) {
        for (const item of LIFE_ITEMS) {
          expect(reserveFactor(seed, week, item.id)).toBe(computeReserveFactor(seed, week, item.id));
        }
      }
    }
  });

  it('weekSeeds equals computeWeekSeeds for several counts and weeks', () => {
    for (const secret of ['s1', 'a|b']) {
      for (const week of ['0', '1', '17']) {
        for (const count of [1, 3, 10]) {
          expect(weekSeeds(week, secret, count)).toEqual(computeWeekSeeds(week, secret, count));
        }
      }
    }
  });

  it('the memo is bounded: past its cap the oldest key is computed again, with the same answer', () => {
    let calls = 0;
    const memo = pureMemo<number>(2);
    const make = (v: number) => () => { calls++; return v * 10; };
    expect(memo('a', make(1))).toBe(10);
    expect(memo('b', make(2))).toBe(20);
    expect(memo('c', make(3))).toBe(30); // evicts 'a'
    expect(calls).toBe(3);
    expect(memo('b', make(2))).toBe(20); // still held
    expect(calls).toBe(3);
    expect(memo('a', make(1))).toBe(10); // recomputed
    expect(calls).toBe(4);
  });

  it('earningsCalendar equals the per-asset reference over seeded worlds, duplicate ids included', () => {
    let items = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const g = createGame(`memo-cal-${seed}`, { warmupDays: 0, npcs: false });
      for (let t = 0; t < 40; t++) {
        stepGame(g);
        for (const days of [0, 3, 10, 30]) {
          const want = calendarReference(g.market, days);
          expect(earningsCalendar(g.market, days)).toEqual(want);
          items += want.length;
        }
      }
      // a world whose asset list names one id twice: each asset takes the first index of its id, as findIndex does
      const m = structuredClone(g.market);
      m.config.assets.push({ ...m.config.assets[0]! });
      m.assets.push({ ...m.assets[0]! });
      expect(earningsCalendar(m, 30)).toEqual(calendarReference(m, 30));
    }
    expect(items).toBeGreaterThan(20);
  });

  it('a player view is the same with the memos cold (empty, so each value is computed) and warm', () => {
    const g = createGame('memo-view', { warmupDays: 0 });
    for (let i = 0; i < 30; i++) {
      applyCommand(g, `m${i}`, { type: 'join', handle: `mv${i}`, country: 'AV' });
    }
    for (let t = 0; t < 30; t++) stepGame(g);
    for (let i = 0; i < 30; i++) {
      const id = `m${i}`;
      clearPureMemos();
      const cold = JSON.stringify(playerView(g, id));
      const warm = JSON.stringify(playerView(g, id));
      expect(warm).toBe(cold);
    }
  });
});
