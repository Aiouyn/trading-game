import { describe, expect, it } from 'vitest';
import { Rng, ecoArchive, gameDayOfTick, seedStream, TRADE_REALIZED_TOLERANCE, type Side } from '@/engine';
import { applyCommand, createGame, stepGame } from './game';
import { TPD, credit } from './core';
import { explainTradeFor, ledgerOf } from './ledger';
import type { Command, GameState } from './types';

/** The ledger's round trip explained by the engine's explainTrade, through the world's ledger (R3). */

function game(seed: string): GameState {
  return createGame(seed, { warmupDays: 1, npcs: false });
}

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function join(g: GameState, pid: string, rich: number) {
  const j = cmd(g, pid, { type: 'join', handle: 'trader_' + pid, country: 'AV' });
  if (!j.ok) throw new Error('join refused: ' + j.error);
  g.players[pid]!.onboarding.skipped = true;
  credit(g, pid, rich, 'test');
}

function trade(g: GameState, pid: string, assetId: string, side: Side, qty: number) {
  const r = cmd(g, pid, { type: 'order.place', order: { assetId, side, type: 'market', qty } });
  if (!r.ok) throw new Error(`${side} refused: ${r.error}`);
}

/** Steps until the game day after `day` has begun, so `day` is closed and its explanation is available. */
function runPastDay(g: GameState, day: number) {
  while (gameDayOfTick(g.market.tick, TPD) <= day + 1) stepGame(g);
}

describe('explainTradeFor: a trip from the trade ledger', () => {
  it('a real round trip explains to its ledger realized P&L within a cent, and its identity holds on the books', () => {
    const g = game('explain-trip');
    join(g, 'u1', 300_000);
    trade(g, 'u1', 'HLCN', 'buy', 40);
    for (let k = 0; k < TPD + 40; k++) stepGame(g);
    trade(g, 'u1', 'HLCN', 'sell', 40); // the trip closes on this fill
    stepGame(g);
    const trip = ledgerOf(g, 'u1')!.trips.at(-1)!;
    expect(trip.assetId).toBe('HLCN');
    expect(trip.explainable).toBe(true);
    expect(trip.closeReason).toBe('order');
    // the identity on the books: realized = mid + slippage - fees
    expect(Math.abs(trip.realizedPnl - (trip.midPnl + trip.slippagePnl - trip.feesPaid))).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
    runPastDay(g, gameDayOfTick(trip.closeTick, TPD));
    const r = explainTradeFor(g, 'u1', trip.id);
    expect(r.roundTripId).toBe(trip.id);
    expect(Math.abs(r.total - trip.realizedPnl)).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
    expect(r.realized).toBe(trip.realizedPnl);
    expect(r.rows.fees ?? 0).toBeCloseTo(trip.slippagePnl - trip.feesPaid, 9);
  });

  it('a flip splits its fill between two trips, and both trips are explainable with the identity to the cent', () => {
    const g = game('explain-flip');
    join(g, 'u1', 300_000);
    trade(g, 'u1', 'NRON', 'buy', 30);
    for (let k = 0; k < 200; k++) stepGame(g);
    trade(g, 'u1', 'NRON', 'sell', 50); // closes the 30 long and opens a 20 short
    for (let k = 0; k < 200; k++) stepGame(g);
    trade(g, 'u1', 'NRON', 'buy', 20); // covers the short
    stepGame(g);
    const trips = ledgerOf(g, 'u1')!.trips.filter((t) => t.assetId === 'NRON');
    expect(trips.map((t) => t.side)).toEqual(['long', 'short']);
    expect(trips.map((t) => t.qty)).toEqual([30, 20]);
    for (const t of trips) {
      expect(t.explainable).toBe(true);
      expect(Math.abs(t.realizedPnl - (t.midPnl + t.slippagePnl - t.feesPaid))).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
    }
  });

  it('every explainable trip of a random run satisfies the identity, and a trip that predates the ledger is refused', () => {
    const g = game('explain-random');
    join(g, 'u1', 300_000);
    const rng = new Rng(seedStream('explain-random', 'trades'));
    const ids = ['HLCN', 'NRON', 'AVBK'];
    for (let k = 0; k < 1200; k++) {
      if (rng.uniform() < 0.3) {
        const id = ids[Math.floor(rng.uniform() * ids.length)]!;
        const side: Side = rng.uniform() < 0.5 ? 'buy' : 'sell';
        // a refused order (the simple-mode cap) is simply not placed
        cmd(g, 'u1', { type: 'order.place', order: { assetId: id, side, type: 'market', qty: 1 + Math.floor(rng.uniform() * 4) } });
      }
      stepGame(g);
    }
    const trips = ledgerOf(g, 'u1')!.trips;
    expect(trips.length).toBeGreaterThan(5);
    for (const t of trips.filter((x) => x.explainable)) {
      expect(Math.abs(t.realizedPnl - (t.midPnl + t.slippagePnl - t.feesPaid))).toBeLessThanOrEqual(TRADE_REALIZED_TOLERANCE);
    }
    // a trip whose entry predates the ledger: the ledger is dropped and rebuilt over an open position
    const h = game('explain-prior');
    join(h, 'u2', 300_000);
    trade(h, 'u2', 'HLCN', 'buy', 10);
    stepGame(h);
    delete h.ledgers!['u2'];
    stepGame(h); // the ledger is rebuilt from the account, which still holds the 10
    trade(h, 'u2', 'HLCN', 'sell', 10);
    stepGame(h);
    const pre = ledgerOf(h, 'u2')!.trips.at(-1)!;
    expect(pre.explainable).toBe(false);
    expect(() => explainTradeFor(h, 'u2', pre.id)).toThrow(/cannot be explained/);
    // the archive covers the game's closed days, so a ledger trip of a closed day is explainable from it
    expect(ecoArchive(g.market).length).toBeGreaterThan(0);
  });
});
