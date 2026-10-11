import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { credit } from './core';
import { refreshNetWorth } from './assets';
import { applyRank } from './players';
import { orderError } from './orders';
import type { GameState, Command } from './types';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

function world(seed: string, skipped: boolean): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  g.players.u1!.onboarding.skipped = skipped;
  return g;
}

function boost(g: GameState, amount: number) {
  credit(g, 'u1', amount, 'test');
  refreshNetWorth(g, g.players.u1!);
  applyRank(g, g.players.u1!, null);
}

/** HLCN trades near $180, so with $5,250 of cash, 20% is about $1,050: six shares is over the cap, five is under. */
const SIX = { assetId: 'HLCN', side: 'buy' as const, type: 'market' as const, qty: 6 };
const FIVE = { ...SIX, qty: 5 };

describe('simple mode: the 20% cap until Hustler', () => {
  it('caps the buy at 20% of cash when onboarding was skipped, which was the bypass (DESIGN.md:124)', () => {
    const g = world('simple-skip', true);
    const r = cmd(g, 'u1', { type: 'order.place', order: SIX });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/20%/);
    expect(cmd(g, 'u1', { type: 'order.place', order: FIVE }).ok).toBe(true);
  });

  it('keeps the cap after the first trade, while the player is below Hustler', () => {
    const g = world('simple-after', true);
    expect(cmd(g, 'u1', { type: 'order.place', order: FIVE }).ok).toBe(true);
    stepGame(g);
    expect(g.players.u1!.stats.trades).toBe(1);
    expect(cmd(g, 'u1', { type: 'order.place', order: SIX }).error).toMatch(/20%/);
  });

  it('lifts the cap at Hustler', () => {
    const g = world('simple-r1', true);
    boost(g, 20_000);
    expect(g.players.u1!.rankId).toBe('R1');
    expect(cmd(g, 'u1', { type: 'order.place', order: { ...SIX, qty: 40 } }).ok).toBe(true);
  });

  it('the license and the court hold still come first; a sell of shares held is never capped, a short is', () => {
    const g = world('simple-gates', true);
    expect(orderError(g, g.players.u1!, { assetId: 'NOPE', side: 'buy', type: 'market', qty: 1 })).toBe('unknown asset');
    expect(orderError(g, g.players.u1!, { assetId: 'GOLD', side: 'buy', type: 'market', qty: 0.001 })).toMatch(/Pro license/);
    // a sell of nothing held opens a short, and the cap counts it like a buy (the Retail license may short from R0)
    expect(orderError(g, g.players.u1!, { assetId: 'HLCN', side: 'sell', type: 'market', qty: 999 })).toMatch(/20%/);
    expect(cmd(g, 'u1', { type: 'order.place', order: FIVE }).ok).toBe(true);
    stepGame(g);
    expect(g.market.accounts.u1!.positions.HLCN!.qty).toBe(5);
    expect(orderError(g, g.players.u1!, { assetId: 'HLCN', side: 'sell', type: 'market', qty: 5 })).toBeNull();
  });

  it('the cap is aggregate: three orders in one tick cannot pass it (the probe that passed 51% of cash)', () => {
    const g = world('simple-agg', true);
    // $5,250 of cash: 20% is about $1,050, so one five-share buy (about $887) fits and a second one does not
    const r = [cmd(g, 'u1', { type: 'order.place', order: FIVE }), cmd(g, 'u1', { type: 'order.place', order: FIVE }), cmd(g, 'u1', { type: 'order.place', order: FIVE })];
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
    expect(r[1]!.error).toMatch(/20%/);
    stepGame(g);
    expect(g.market.accounts.u1!.positions.HLCN!.qty).toBe(5);
    expect(g.market.accounts.u1!.cash / 5250).toBeGreaterThan(0.8);
  });

  it('a short counts against the same cap as a buy, and a short that fits is accepted at R0', () => {
    const g = world('simple-short', true);
    expect(cmd(g, 'u1', { type: 'order.place', order: { ...FIVE, side: 'sell' } }).ok).toBe(true);
    const second = cmd(g, 'u1', { type: 'order.place', order: { ...FIVE, side: 'buy' } });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/20%/);
  });
});
