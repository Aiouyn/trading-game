import { describe, expect, it } from 'vitest';
import { netWorthRows } from './NetWorthFigures';
import { applyCommand, createGame, stepGame } from '@/world/game';
import { netWorthBreakdown, type NetWorthBreakdown } from '@/world/core';
import { BUSINESSES } from '@/content/businesses';
import type { Command, GameState } from '@/world/types';

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A live player: the same breakdown the top bar reads from the player view (netWorthBreakdown in world/core.ts). */
function live(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 5; k++) stepGame(g);
  cmd(g, 'u1', { type: 'join', handle: 'tycoon', country: 'AV' });
  g.players.u1!.onboarding.skipped = true;
  return g;
}

const fixture: NetWorthBreakdown = {
  cash: 1200, markets: 800, businesses: 2050, property: 300, mortgages: 120, lifestyle: 40, lab: 15, companies: 0, funds: 60, tokens: 5, total: 0,
};

describe('the net worth breakdown in the top bar', () => {
  it('the rows of a fixture add up to the total (debts subtracted), so the breakdown never disagrees with the figure', () => {
    const nw = { ...fixture, total: fixture.cash + fixture.markets + fixture.businesses + fixture.property - fixture.mortgages + fixture.lifestyle + fixture.lab + fixture.companies + fixture.funds + fixture.tokens };
    const sum = netWorthRows(nw).reduce((s, r) => s + r.value, 0);
    expect(sum).toBeCloseTo(nw.total, 9);
  });

  it('lists the parts in order and shows debts as a negative', () => {
    const rows = netWorthRows(fixture);
    expect(rows.map((r) => r.key)).toEqual(['cash', 'markets', 'businesses', 'property', 'companies', 'funds', 'tokens', 'lab', 'lifestyle', 'debts']);
    expect(rows.at(-1)).toEqual({ key: 'debts', value: -120 });
  });

  it('the rows of the live breakdown add up to its total, before and after a shop purchase', () => {
    const g = live('nw-live');
    const check = () => {
      const nw = netWorthBreakdown(g, 'u1');
      const sum = netWorthRows(nw).reduce((s, r) => s + r.value, 0);
      expect(sum).toBeCloseTo(nw.total, 6);
      return nw;
    };
    check();
    const def = BUSINESSES.find((b) => b.tier === 1 && b.sector === 'food')!;
    const before = netWorthBreakdown(g, 'u1').total;
    expect(cmd(g, 'u1', { type: 'biz.buy', defId: def.id, cityId: 'avalon' }).ok).toBe(true);
    const after = check();
    expect(after.businesses).toBeGreaterThan(0);
    expect(after.total).toBeCloseTo(before, 6);
  });
});
