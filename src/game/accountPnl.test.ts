import { describe, expect, it } from 'vitest';
import { commission, portfolio } from '@/engine';
import { applyCommand, createGame, stepGame } from '@/world/game';
import type { Command, GameState } from '@/world/types';
import { accountOpenPnl } from './accountPnl';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A player who bought a little of two names a few ticks in, so the account holds open positions. */
function holding(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const j = cmd(g, 'u1', { type: 'join', handle: 'trader_pnl', country: 'AV' });
  if (!j.ok) throw new Error(j.error);
  g.players.u1!.onboarding.skipped = true;
  for (const assetId of ['HLCN', 'NRON']) {
    const r = cmd(g, 'u1', { type: 'order.place', order: { assetId, side: 'buy', type: 'market', qty: 1 } });
    if (!r.ok) throw new Error(r.error);
  }
  for (let k = 0; k < 30; k++) stepGame(g);
  return g;
}

describe('the account open P&L (the top strip, the Portfolio and each Broker show this one figure)', () => {
  it('is the unrealised P&L of the open positions less the exit fee each would pay if sold now', () => {
    const g = holding('pnl-open');
    const defOf = (id: string) => g.market.config.assets.find((a) => a.id === id);
    const pf = portfolio(g.market, 'u1');
    expect(pf.positions.length).toBeGreaterThan(0);
    const expected = pf.positions.reduce((s, p) => {
      const def = defOf(p.assetId);
      return s + p.unrealizedPnl - (def ? commission(g.market, def, Math.abs(p.marketValue)) : 0);
    }, 0);
    const got = accountOpenPnl(g.market, 'u1', defOf);
    expect(got).toBeCloseTo(expected, 9);
    // the exit fee makes it smaller than the raw unrealised figure the engine reports
    expect(got).toBeLessThan(pf.unrealizedPnl);
  });

  it('is zero with no open position', () => {
    const g = createGame('pnl-flat', { warmupDays: 1, npcs: false });
    for (let k = 0; k < 10; k++) stepGame(g);
    const j = cmd(g, 'u1', { type: 'join', handle: 'trader_flat', country: 'AV' });
    if (!j.ok) throw new Error(j.error);
    expect(accountOpenPnl(g.market, 'u1', (id) => g.market.config.assets.find((a) => a.id === id))).toBe(0);
  });
});
