import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { isLinkedAccount, linkedAccounts, recordGift, registerDevice } from './collusion';
import type { GameState } from './types';

/**
 * Phase 9 ruling R-9-3: device and alliance links are transitive (a union-find over owner links), and funding links (gifts, loans,
 * fund deposits) and mirror links join the two accounts they name, directly only. A third party is not pooled through a funding
 * link, so a chain of gifts (A to B, B to C) leaves A and C apart. This pins the rule (Phase 9B review item 7, now decided).
 */
function world(): GameState {
  const g = createGame('collusion-chain', { warmupDays: 0, npcs: false });
  for (const [id, handle] of [['a', 'alpha_one'], ['b', 'bravo_two'], ['c', 'charlie_3']] as const) {
    expect(applyCommand(g, id, { type: 'join', handle, country: 'AV' }).ok).toBe(true);
  }
  return g;
}

describe('funding links are direct, owner links are transitive (R-9-3)', () => {
  it('a chain of two funding links does not join the two ends: A and C stay apart', () => {
    const g = world();
    recordGift(g, 'a', 'b');
    recordGift(g, 'a', 'b');
    expect(linkedAccounts(g, 'a')).toEqual(['a', 'b']);
    recordGift(g, 'b', 'c');
    recordGift(g, 'b', 'c');
    expect(linkedAccounts(g, 'b')).toEqual(['a', 'b', 'c']);
    expect(linkedAccounts(g, 'a')).toEqual(['a', 'b']);
    expect(linkedAccounts(g, 'c')).toEqual(['b', 'c']);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(false);
  });

  it('a single gift is not a funding link (below FUNDING_MIN_GIFTS), so the chain does not form', () => {
    const g = world();
    recordGift(g, 'a', 'b');
    recordGift(g, 'b', 'c');
    recordGift(g, 'b', 'c');
    expect(isLinkedAccount(g, 'a', 'b')).toBe(false);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(false);
  });

  it('an owner chain is transitive: A and B share a device, B and C share an alliance, so A and C are one owner group', () => {
    const g = world();
    registerDevice(g, 'a', 'dev-1');
    registerDevice(g, 'b', 'dev-1');
    g.players.b!.allianceId = 'al-chain';
    g.players.c!.allianceId = 'al-chain';
    expect(linkedAccounts(g, 'a')).toEqual(['a', 'b', 'c']);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(true);
  });

  it('a gift between a device-mate and an outsider does not pool the outsider with the device group', () => {
    const g = world();
    registerDevice(g, 'a', 'dev-2');
    registerDevice(g, 'b', 'dev-2');
    recordGift(g, 'b', 'c');
    recordGift(g, 'b', 'c');
    expect(linkedAccounts(g, 'a')).toEqual(['a', 'b']);
    expect(linkedAccounts(g, 'c')).toEqual(['b', 'c']);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(false);
  });
});
