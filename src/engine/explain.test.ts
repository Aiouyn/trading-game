import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { explainMove } from './ecology';
import { openAccount, placeOrder } from './trading';
import type { WorldState } from './types';

const TPD = 24;
const ASSET = 'OSTV';
const ALLOWED = new Set(['value', 'trend', 'retail', 'pension', 'maker', 'news', 'you', 'players']);

/** Opens the given accounts, then for each of `days` game days every account buys `qty` of ASSET at the open. */
function trade(players: string[], days: number, qty = 5): WorldState {
  let s = createWorld('explain', universeConfig({ ticksPerDay: TPD }));
  for (const p of players) s = openAccount(s, p);
  for (let d = 0; d < days; d++) {
    for (const p of players) s = placeOrder(s, { playerId: p, assetId: ASSET, side: 'buy', type: 'market', qty }).state;
    s = stepMany(s, TPD).state;
  }
  return s;
}

describe('explainMove', () => {
  it('rejects the open session day and anything after the last close', () => {
    const s = trade(['p0'], 3);
    expect(() => explainMove(s, ASSET, 0, 3)).toThrow(/open or not closed/);
    expect(() => explainMove(s, ASSET, 0, 9)).toThrow(/open or not closed/);
    expect(() => explainMove(s, ASSET, 4, 2)).toThrow(/after toDay/);
    expect(() => explainMove(s, 'NOPE', 0, 1)).toThrow(/unknown asset/);
  });

  it('explains a closed window and its parts sum to the total exactly', () => {
    const s = trade(['p0'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    const sum = Object.values(e.parts).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBeCloseTo(e.totalLog, 14);
    expect(e.total).toBeCloseTo(Math.expm1(e.totalLog), 14);
    expect(e.from).toBe(0);
    expect(e.to).toBe(2);
  });

  it('clamps a window that starts before the listing to the first logged day', () => {
    const s = trade(['p0'], 3);
    expect(explainMove(s, ASSET, -5, 2).from).toBe(0);
  });

  it('shows pool types and player rows only, never a name', () => {
    const s = trade(['p0', 'p1', 'p2', 'p3', 'p4'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(Object.keys(e.parts).every((k) => ALLOWED.has(k))).toBe(true);
  });

  it('solo: the only player is You, never Players', () => {
    const s = trade(['p0'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.you).toBeDefined();
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays).toEqual([]);
  });

  it('online: five accounts with none above 40% show as Players, every day', () => {
    const s = trade(['p0', 'p1', 'p2', 'p3', 'p4'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeDefined();
    expect(e.parts.you).toBeUndefined();
    expect(e.foldedDays).toEqual([]);
  });

  it('online: four accounts fold into Retail, every day', () => {
    const s = trade(['p0', 'p1', 'p2', 'p3'], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays).toEqual([0, 1, 2]);
  });

  it('online: one account above 40% of the day folds even with five accounts', () => {
    let s = createWorld('explain', universeConfig({ ticksPerDay: TPD }));
    for (const p of ['p0', 'p1', 'p2', 'p3', 'p4']) s = openAccount(s, p);
    for (let d = 0; d < 3; d++) {
      s = placeOrder(s, { playerId: 'p0', assetId: ASSET, side: 'buy', type: 'market', qty: 50 }).state;
      for (const p of ['p1', 'p2', 'p3', 'p4']) s = placeOrder(s, { playerId: p, assetId: ASSET, side: 'buy', type: 'market', qty: 1 }).state;
      s = stepMany(s, TPD).state;
    }
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays.length).toBe(3);
  });

  it('the Players rule is applied per day before the window is summed, so an adjacent window cannot isolate one account', () => {
    // days 0 and 1: five accounts trade; day 2: only p0 trades (fails the rule, folds to Retail)
    let s = createWorld('explain', universeConfig({ ticksPerDay: TPD }));
    const all = ['p0', 'p1', 'p2', 'p3', 'p4'];
    for (const p of all) s = openAccount(s, p);
    for (let d = 0; d < 3; d++) {
      for (const p of d < 2 ? all : ['p0']) s = placeOrder(s, { playerId: p, assetId: ASSET, side: 'buy', type: 'market', qty: 5 }).state;
      s = stepMany(s, TPD).state;
    }
    const two = explainMove(s, ASSET, 0, 1);
    const three = explainMove(s, ASSET, 0, 2);
    expect(three.foldedDays).toContain(2);
    // the implied day 2 Players flow is exactly zero: the lone account never reached the Players row
    expect((three.parts.players ?? 0) - (two.parts.players ?? 0)).toBe(0);
  });
});
