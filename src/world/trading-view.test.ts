import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { marketFrame, playerView } from './view';
import type { GameState, Command } from './types';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

describe('the owner\'s trading record in the view (private)', () => {
  it('the owner sees their fills, the benchmark, the closes and the calendar; the public frame has none of it', () => {
    const g = createGame('view-trading', { warmupDays: 1, npcs: false });
    for (let k = 0; k < 10; k++) stepGame(g);
    cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
    g.players.u1!.onboarding.skipped = true;
    cmd(g, 'u1', { type: 'order.place', order: { assetId: 'HLCN', side: 'buy', type: 'market', qty: 2 } });
    while (g.market.tick < 1440) stepGame(g);
    const v = playerView(g, 'u1')!;
    expect(v.trading.fills.length).toBe(1);
    expect(v.trading.fills[0]!.reason).toBe('order');
    expect(v.trading.benchmark).not.toBeNull();
    expect(v.trading.closes.length).toBe(1);
    expect(v.trading.closes[0]!.lines.length).toBeGreaterThan(3); // rendered for the view
    expect(v.trading.calendar.length).toBeGreaterThanOrEqual(3);
    expect(v.trading.goals.optIn).toBe(false);
    const frame = JSON.stringify(marketFrame(g, true));
    expect(frame).not.toMatch(/benchmark|dayCloses|closes|ghost|fills/);
  });
});
