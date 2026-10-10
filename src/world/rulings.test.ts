import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { newOutput } from './core';
import { filings, newsFromEvents } from './news';
import type { GameState } from './types';

/** R4 (public boards and filing rules), pinned on the code that carries them. See docs/V1-PRIVACY.md section 7. */

const ASSET = 'HLCN';

function world(seed: string): GameState {
  return createGame(seed, { warmupDays: 1, npcs: false });
}

/** An NPC persona account holding `frac` of the asset's shares (NPC filings use the players' rule, R4). */
function npcHolding(g: GameState, frac: number): string {
  const id = 'npc_trader';
  const j = applyCommand(g, id, { type: 'join', handle: 'persona_one', country: 'AV' });
  if (!j.ok) throw new Error('join refused: ' + j.error);
  g.players[id]!.npc = 'persona_one';
  g.market.accounts[id]!.npc = true;
  const def = g.market.config.assets.find((a) => a.id === ASSET)!;
  g.market.accounts[id]!.positions[ASSET] = { qty: frac * def.sharesOutstanding!, avgCost: 1, realizedPnl: 0 };
  return id;
}

describe('R4: the filing rules and the squeeze line', () => {
  it('an NPC persona holding 0.5% or more is filed exactly as a player is, and one below 0.5% is not', () => {
    const g = world('r4-npc-filing');
    const id = npcHolding(g, 0.005);
    const out = newOutput();
    filings(g, id, out);
    const filed = out.wire.filter((w) => w.kind === 'filing');
    expect(filed.length).toBe(1);
    expect(filed[0]!.text).toMatch(/discloses a stake of 0\.5% in/);

    const h = world('r4-npc-below');
    const low = npcHolding(h, 0.0049);
    const out2 = newOutput();
    filings(h, low, out2);
    expect(out2.wire.filter((w) => w.kind === 'filing')).toHaveLength(0);
  });

  it('a squeeze story carries only the aggregate cover share of the day, never a holder', () => {
    const g = world('r4-squeeze');
    const out = newOutput();
    newsFromEvents(g, [{ type: 'squeeze', tick: g.market.tick, assetId: ASSET, cover: 0.35 }], out);
    const sq = out.wire.filter((w) => w.kind === 'squeeze');
    expect(sq).toHaveLength(1);
    expect(sq[0]!.text).toContain('35%');
    expect(sq[0]!.playerId).toBeUndefined();
    expect(sq[0]!.text).not.toMatch(/persona|trader|handle/i);
  });
});
