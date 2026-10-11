import { describe, expect, it } from 'vitest';
import { Rng, seedStream } from '@/engine';
import { applyCommand, stepGame } from '../game';
import { TPD } from '../core';
import { bookedNet, engineTallyOf, netWorldMoney } from '../company/exploits/sequences';
import type { Command, GameState } from '../types';
import { CREATOR, HOLDER, TRADER, lpWorld } from './fixture';

/**
 * The Launchpad's money closes every game day to the cent (lead-launchpad.md L8): launches, curve buys and sells by players and
 * the NPC retail, sniper and buzz flows, and a graduation, with the world's identity (money = booked lines + engine tally) checked
 * at each day boundary. The residual is the difference of the three moves; it must be zero to the cent.
 */

const DAYS = 2;

function identityResidual(g: GameState, m0: number, b0: number, e0: number): number {
  return (netWorldMoney(g) - m0) - (bookedNet(g) - b0) - (engineTallyOf(g) - e0);
}

describe('the launchpad zero-sum (L8)', () => {
  it(`over ${DAYS} game days of launches, trades, buzz and NPC flow, the money closes to the cent every day`, () => {
    const g = lpWorld('lp-zerosum', { npcLaunches: true });
    const rng = new Rng(seedStream('lp-zerosum', 'actions'));
    const players = [CREATOR, TRADER, HOLDER];
    let launched = 0;
    for (let day = 0; day < DAYS; day++) {
      const m0 = netWorldMoney(g);
      const b0 = bookedNet(g);
      const e0 = engineTallyOf(g);
      // a launch by the creator on the first day, and then trades and buzz by the three players every few ticks
      if (day === 0) {
        const r = applyCommand(g, CREATOR, { type: 'lp.launch', name: 'Zero Sum', ticker: 'ZSUM', tagline: 'tg2', allocation: 3_000_000 } as Command);
        if (r.ok) launched++;
      }
      for (let k = 0; k < TPD; k++) {
        if (k % 90 === 0) {
          const pid = players[Math.floor(rng.uniform() * players.length)]!;
          const tickers = Object.keys(g.launchpad?.tokens ?? {});
          const ticker = tickers[Math.floor(rng.uniform() * tickers.length)];
          if (ticker) {
            const t = g.launchpad!.tokens[ticker]!;
            const u = rng.uniform();
            if (u < 0.45) applyCommand(g, pid, { type: 'lp.buy', ticker, spendCents: Math.round(100 + rng.uniform() * 5_000), maxSlip: 0.5 });
            else if (u < 0.85) {
              const have = t.bal[pid] ?? 0;
              if (have > 0) applyCommand(g, pid, { type: 'lp.sell', ticker, tokens: Math.max(1, Math.floor(have * rng.uniform())), maxSlip: 0.5 });
            } else applyCommand(g, pid, { type: 'lp.buzz', ticker, kind: rng.uniform() < 0.5 ? 'board' : 'wire' });
          }
        }
        stepGame(g);
      }
      const residual = identityResidual(g, m0, b0, e0);
      expect(Math.abs(residual), `day ${day} residual`).toBeLessThan(0.005);
    }
    expect(launched).toBe(1);
    expect(g.launchpad!.order.length).toBeGreaterThan(0);
  });
});
