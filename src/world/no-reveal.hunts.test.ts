import { describe, expect, it } from 'vitest';
import { LIFE_ITEMS } from '@/content/lifestyle';
import { cashOf, TPD } from './core';
import { applyCommand, createGame, stepGame } from './game';
import { filings } from './news';
import type { Command, GameState, StepOutput } from './types';

/**
 * Tape's no-reveal checks at the Wire (docs/V1-PRIVACY.md sections 1 and 2, tape-acceptance.md section 12, L3 and L4). A
 * public record is listed in section 1; a market position, an order or a style is never on the Wire.
 */

function game(seed: string, npcs = false): GameState {
  return createGame(seed, { warmupDays: 0, npcs });
}

const cmd = (g: GameState, pid: string, c: Command) => applyCommand(g, pid, c);

function join(g: GameState, pid: string, handle: string) {
  const j = cmd(g, pid, { type: 'join', handle, country: 'AV' });
  if (!j.ok) throw new Error('join refused: ' + j.error);
  g.players[pid]!.onboarding.skipped = true;
}

const emptyOut = (): StepOutput => ({ wire: [], inbox: {} }) as unknown as StepOutput;

describe('the Wire: a short is never filed, a long stake of 0.5% or more is (section 1 item 1, section 2)', () => {
  it('a short of 2% of a company prints no filing and no word about a short position', () => {
    const g = game('no-reveal-short');
    join(g, 'u1', 'short_seller');
    const id = g.market.config.assets.find((a) => a.assetClass === 'stock' && a.sharesOutstanding)!.id;
    const def = g.market.config.assets.find((a) => a.id === id)!;
    const acct = g.market.accounts.u1!;
    acct.positions[id] = { qty: -0.02 * def.sharesOutstanding!, avgCost: 1 } as typeof acct.positions[string];
    const out = emptyOut();
    filings(g, 'u1', out);
    const mine = g.wire.filter((w) => w.playerId === 'u1' && w.kind === 'filing');
    expect(mine).toEqual([]);
    expect(out.wire.some((w) => /short/i.test(w.text))).toBe(false);
  });

  it('a long stake of 1% prints one filing of the stake, and only that', () => {
    const g = game('no-reveal-long');
    join(g, 'u1', 'long_holder');
    const id = g.market.config.assets.find((a) => a.assetClass === 'stock' && a.sharesOutstanding)!.id;
    const def = g.market.config.assets.find((a) => a.id === id)!;
    const acct = g.market.accounts.u1!;
    acct.positions[id] = { qty: 0.01 * def.sharesOutstanding!, avgCost: 1 } as typeof acct.positions[string];
    const out = emptyOut();
    filings(g, 'u1', out);
    const mine = g.wire.filter((w) => w.playerId === 'u1' && w.kind === 'filing');
    expect(mine.length).toBe(1);
    expect(mine[0]!.text).toMatch(/discloses a stake of 1\.0% in/);
  });
});

describe('the Wire: a lifestyle purchase is not announced (section 1 lists business and property purchases only)', () => {
  it('buying a lifestyle item that costs $250k or more prints no purchase line', () => {
    const item = LIFE_ITEMS.find((i) => i.price >= 250_000 && i.cls !== 'unique');
    expect(item).toBeDefined();
    const g = game('no-reveal-life');
    join(g, 'u1', 'luxury_buyer');
    const grant = cmd(g, 'u1', { type: 'admin.grant', amount: item!.price * 2 + 6_000_000 });
    expect(grant.ok).toBe(true);
    const cashBefore = cashOf(g, 'u1');
    const r = cmd(g, 'u1', { type: 'life.buy', itemId: item!.id });
    expect(r.ok, r.ok ? '' : (r as { error: string }).error).toBe(true);
    expect(g.wire.filter((w) => w.playerId === 'u1' && w.kind === 'purchase')).toEqual([]);
    expect(cashOf(g, 'u1')).toBeLessThan(cashBefore);
    // the item shows on the buyer's own profile, the public holdings list (section 1 item 3)
    expect(g.players.u1!.lifestyle.some((l) => l.itemId === item!.id)).toBe(true);
    for (let k = 0; k < TPD / 4; k++) stepGame(g);
  });
});
