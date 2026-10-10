import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { flagNpcAccounts } from './players';
import type { GameState } from './types';

describe('NPC accounts are flagged in the engine (P1)', () => {
  it('every NPC persona has a flagged account, and a save written before the flag is repaired on load', () => {
    const g = createGame('npc-flag', { warmupDays: 1 });
    const npcIds = Object.values(g.players).filter((p) => p.npc).map((p) => p.id);
    expect(npcIds.length).toBeGreaterThan(0);
    for (const id of npcIds) expect(g.market.accounts[id]!.npc).toBe(true);

    const old = JSON.parse(JSON.stringify(g)) as GameState;
    for (const a of Object.values(old.market.accounts)) delete a.npc;
    expect(Object.values(old.market.accounts).some((a) => a.npc)).toBe(false);
    flagNpcAccounts(old);
    expect(Object.values(old.market.accounts).filter((a) => a.npc).map((a) => a.playerId).sort()).toEqual([...npcIds].sort());
    flagNpcAccounts(old);
    expect(Object.values(old.market.accounts).filter((a) => a.npc).length).toBe(npcIds.length);
  });
});
