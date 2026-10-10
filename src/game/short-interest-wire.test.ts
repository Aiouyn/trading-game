import { describe, expect, it } from 'vitest';
import { publicShortInterest } from '@/engine';
import { createGame, stepGame } from '@/world/game';
import { SHORT_INTEREST_EVERY } from '@/world/core';
import { marketFrame } from '@/world/view';
import type { GameState } from '@/world/types';
import { ShortInterestWire, welcomeShortInterest } from '../../server/wire';

const STOCK = 'OSTV';

/** Gives `n` accounts a short position of `qty` in STOCK (accounts sh0..shN, as the engine's publicShortInterest reads them). */
function withShorts(g: GameState, n: number, qty: number): GameState {
  const accounts = { ...g.market.accounts };
  for (let i = 0; i < n; i++) {
    const id = `sh${i}`;
    accounts[id] = {
      playerId: id, cash: 0, startingCash: 0, positions: { [STOCK]: { qty: -qty, avgCost: 10, realizedPnl: 0 } },
      realizedPnl: 0, feesPaid: 0, peakEquity: 0, maxDrawdown: 0, dayStartEquity: 0,
    };
  }
  return { ...g, market: { ...g.market, accounts } };
}

/** Steps the game `n` ticks, through the same stepGame the server runs. */
function advance(g: GameState, n: number): void {
  for (let i = 0; i < n; i++) stepGame(g);
}

describe('ShortInterestWire: the public figure on the tick stream (P3)', () => {
  it('the cadence is slow: the figure is only considered on a due tick, and only sent when it changed', () => {
    const g = createGame('short-cadence', { warmupDays: 1, npcs: false });
    const wire = new ShortInterestWire();
    expect(g.market.tick % SHORT_INTEREST_EVERY).toBe(0);
    const first = wire.due(g);
    expect(first).not.toBeNull();
    expect(first![STOCK]).toBe(0);
    advance(g, 1);
    expect(wire.due(g)).toBeNull();
    advance(g, SHORT_INTEREST_EVERY - 1);
    expect(g.market.tick % SHORT_INTEREST_EVERY).toBe(0);
    expect(wire.due(g)).toBeNull();
  });

  it('a change is sent once, on the next due tick, and carries the server figure', () => {
    const g0 = createGame('short-change', { warmupDays: 1, npcs: false });
    const wire = new ShortInterestWire();
    wire.due(g0);
    const shares = g0.market.config.assets.find((a) => a.id === STOCK)!.sharesOutstanding!;
    const g = withShorts(g0, 5, Math.round(shares * 0.004));
    advance(g, SHORT_INTEREST_EVERY);
    const sent = wire.due(g);
    expect(sent).not.toBeNull();
    expect(sent).toEqual(publicShortInterest(g.market));
    expect(sent![STOCK]).toBeGreaterThan(0);
    advance(g, SHORT_INTEREST_EVERY);
    expect(wire.due(g)).toBeNull();
  });

  it('a withheld figure (one holder dominates) is sent as null, and names no account', () => {
    const g0 = createGame('short-withheld', { warmupDays: 1, npcs: false });
    const wire = new ShortInterestWire();
    wire.due(g0);
    const g = withShorts(g0, 2, 1000);
    advance(g, SHORT_INTEREST_EVERY);
    const sent = wire.due(g)!;
    expect(sent[STOCK]).toBeNull();
    expect(Object.keys(sent).some((k) => k.startsWith('sh'))).toBe(false);
  });

  it('the frame carries no figure by default: only the server attaches it, on a due change or in a welcome', () => {
    const g = createGame('short-frame', { warmupDays: 1, npcs: false });
    expect(marketFrame(g).shortInterest).toBeUndefined();
    expect(welcomeShortInterest(g)).toEqual(publicShortInterest(g.market));
  });
});
