import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { isLinkedAccount, linkedAccounts, recordGift } from './collusion';
import type { GameState } from './types';

/**
 * The collusion graph is a union-find over every link (collusion.ts groupRoots): a device, an alliance, a funding link (two
 * gifts or accepted loans) and a mirror link join whole components, not only the pair that is linked. So an honest chain (A lends
 * to B twice, B lends to C twice) puts A and C in one owner group: they share the sponsor cap (sponsor.ts adsUsedToday), the
 * founder sell cap and the tip flags. Phase 9B review item 7. This test pins the current rule. It is a ruling for the lead
 * (transitive groups or direct links only); the rule is not changed here.
 */
function world(): GameState {
  const g = createGame('collusion-chain', { warmupDays: 0, npcs: false });
  for (const [id, handle] of [['a', 'alpha_one'], ['b', 'bravo_two'], ['c', 'charlie_3']] as const) {
    expect(applyCommand(g, id, { type: 'join', handle, country: 'AV' }).ok).toBe(true);
  }
  return g;
}

describe('collusion groups are transitive (ruling pending, 9B review item 7)', () => {
  it('a chain of two funding links joins the two ends, who never traded with each other', () => {
    const g = world();
    recordGift(g, 'a', 'b');
    recordGift(g, 'a', 'b');
    expect(linkedAccounts(g, 'a')).toEqual(['a', 'b']);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(false);
    recordGift(g, 'b', 'c');
    recordGift(g, 'b', 'c');
    expect(linkedAccounts(g, 'a')).toEqual(['a', 'b', 'c']);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(true);
  });

  it('a single gift is not a funding link (below FUNDING_MIN_GIFTS), so the chain does not form', () => {
    const g = world();
    recordGift(g, 'a', 'b');
    recordGift(g, 'b', 'c');
    recordGift(g, 'b', 'c');
    expect(isLinkedAccount(g, 'a', 'b')).toBe(false);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(false);
  });
});
