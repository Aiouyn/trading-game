import { describe, expect, it } from 'vitest';
import { BUSINESSES } from '../../src/content/businesses';
import { SHOP } from '../../src/content/shops';
import { TPD, bizDef, credit } from '../../src/world/core';
import { applyCommand, createGame, stepGame } from '../../src/world/game';
import { wellRunCommands } from '../../src/world/shops';
import type { GameState } from '../../src/world/types';
import { checkIn } from './wealth';

/**
 * Integration (R-9-9 review): the owner's check-in on a real game. The shops are the world's own, so the net history the
 * exit rule reads is the one `shopsDay` keeps (the valuation window), not a hand-made array of the wrong length.
 */

const LOSER_SECTOR = 'compute';
const WINNER_SECTOR = 'media';

/** A bot with two tier-1 shops in different pools (avalon:compute and nordhaven:media), both run well. */
function game(): { g: GameState; loser: string; winner: string } {
  const g = createGame('wealth-checkin-1', { warmupDays: 2, npcs: false });
  applyCommand(g, 'bot', { type: 'join', handle: 'median', country: 'AV' });
  const p = g.players.bot!;
  p.onboarding.skipped = true;
  p.rankId = 'R5';
  credit(g, 'bot', 5e9, 'calibration');
  const tier1 = (sector: string) => BUSINESSES.find((b) => b.tier === 1 && b.sector === sector)!;
  const a = applyCommand(g, 'bot', { type: 'biz.buy', defId: tier1(LOSER_SECTOR).id, cityId: 'avalon' });
  const b = applyCommand(g, 'bot', { type: 'biz.buy', defId: tier1(WINNER_SECTOR).id, cityId: 'nordhaven' });
  if (!a.ok || !b.ok) throw new Error('buy failed');
  const loser = (a.data as { id: string }).id;
  const winner = (b.data as { id: string }).id;
  for (const id of [loser, winner]) for (const c of wellRunCommands(id)) applyCommand(g, 'bot', c);
  return { g, loser, winner };
}

describe('the owner check-in sells a loser and keeps a winner (on a real game)', () => {
  it('the world keeps exactly the valuation window of net per shop, so the exit rule can fire', () => {
    const { g, loser, winner } = game();
    for (let d = 0; d < SHOP.value.window + 2; d++) for (let t = 0; t < TPD; t++) stepGame(g);
    expect(g.businesses[loser]!.shop.net).toHaveLength(SHOP.value.window);
    expect(g.businesses[winner]!.shop.net).toHaveLength(SHOP.value.window);
  });

  it('sells the shop whose window is negative and keeps the one whose window is positive', () => {
    const { g, loser, winner } = game();
    for (let d = 0; d < SHOP.value.window + 2; d++) for (let t = 0; t < TPD; t++) stepGame(g);
    // a window of losses for the loser (a shop that pays its costs with no customers); the winner keeps its real history
    g.businesses[loser]!.shop.net = new Array(SHOP.value.window).fill(-200);
    const winnerNet = g.businesses[winner]!.shop.net.reduce((a, x) => a + x, 0);
    expect(winnerNet).toBeGreaterThan(0);

    const sold = checkIn(g, 'average');

    expect(sold).toBe(1);
    expect(g.businesses[loser]).toBeUndefined();
    expect(g.businesses[winner]!.ownerId).toBe('bot');
    expect(bizDef(g.businesses[winner]!).sector).toBe(WINNER_SECTOR);
  });

  it('keeps a loser with less history than the window', () => {
    const { g, loser } = game();
    for (let t = 0; t < 3 * TPD; t++) stepGame(g);
    g.businesses[loser]!.shop.net = [-200, -200, -200];
    expect(checkIn(g, 'average')).toBe(0);
    expect(g.businesses[loser]!.ownerId).toBe('bot');
  });
});
