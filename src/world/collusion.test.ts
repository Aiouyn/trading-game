import { describe, expect, it } from 'vitest';
import type { Fill } from '@/engine';
import { applyCommand, createGame } from './game';
import { isLinkedAccount, linkedAccounts, MIRROR_MIN_MATCHES, noteFills, recordGift, registerDevice, syncGroupSellCap } from './collusion';
import type { GameState } from './types';

// The collusion graph (lead-phase6 6C, Phase 4 O-5): owner groups from alliances, devices (hashed), gifts and mirrored fills.
// An unlinked account is alone, and a refusal that uses the graph names nobody (the API returns ids to the server only).

function world(seed: string, ids: string[]): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const id of ids) applyCommand(g, id, { type: 'join', handle: `t_${id}`, country: 'AV' });
  return g;
}

function fill(pid: string, tick: number, side: 'buy' | 'sell', qty: number, assetId = 'ACME'): Fill {
  return { orderId: `o${pid}${tick}${side}`, playerId: pid, assetId, side, qty, price: 10, fee: 0, tick, mid: 10 };
}

describe('the collusion graph (6C)', () => {
  it('an account with no link is alone, and it is linked to itself', () => {
    const g = world('col-alone', ['a', 'b']);
    expect(linkedAccounts(g, 'a')).toEqual(['a']);
    expect(isLinkedAccount(g, 'a', 'a')).toBe(true);
    expect(isLinkedAccount(g, 'a', 'b')).toBe(false);
  });

  it('alliance members are one group (the Phase 4 owner link, unchanged)', () => {
    const g = world('col-ally', ['a', 'b', 'c']);
    g.players.a!.allianceId = 'al1';
    g.players.b!.allianceId = 'al1';
    expect(linkedAccounts(g, 'a')).toEqual(['a', 'b']);
    expect(linkedAccounts(g, 'c')).toEqual(['c']);
  });

  it('a shared registration device links two accounts; the device is kept only as a hash', () => {
    const g = world('col-device', ['a', 'b', 'c']);
    registerDevice(g, 'a', 'device-token-1');
    registerDevice(g, 'b', 'device-token-1');
    registerDevice(g, 'c', 'device-token-2');
    expect(isLinkedAccount(g, 'a', 'b')).toBe(true);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(false);
    const stored = g.collusion!.devices!.a!;
    expect(stored).not.toContain('device-token-1');
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it('one gift is not a link; two completed gifts between the pair are', () => {
    const g = world('col-gift', ['a', 'b']);
    recordGift(g, 'a', 'b');
    expect(isLinkedAccount(g, 'a', 'b')).toBe(false);
    recordGift(g, 'b', 'a');
    expect(isLinkedAccount(g, 'a', 'b')).toBe(true);
  });

  it('links are transitive: a gift pair and a device pair make one group', () => {
    const g = world('col-trans', ['a', 'b', 'c']);
    recordGift(g, 'a', 'b');
    recordGift(g, 'a', 'b');
    registerDevice(g, 'b', 'd');
    registerDevice(g, 'c', 'd');
    expect(linkedAccounts(g, 'c')).toEqual(['a', 'b', 'c']);
  });

  it('mirrored fills link a pair at the match minimum; a few coincidences do not', () => {
    const g = world('col-mirror', ['a', 'b', 'c']);
    // a and b trade the same quantity, side and asset within the window, eight times
    const fills: Fill[] = [];
    for (let k = 0; k < MIRROR_MIN_MATCHES; k++) {
      const t = 100 + k * 10;
      fills.push(fill('a', t, 'buy', 3));
      fills.push(fill('b', t + 1, 'buy', 3));
    }
    noteFills(g, fills);
    expect(isLinkedAccount(g, 'a', 'b')).toBe(true);
    expect(isLinkedAccount(g, 'a', 'c')).toBe(false);

    const h = world('col-coincide', ['x', 'y']);
    const few: Fill[] = [];
    for (let k = 0; k < MIRROR_MIN_MATCHES - 2; k++) {
      few.push(fill('x', 100 + k * 10, 'buy', 3));
      few.push(fill('y', 101 + k * 10, 'buy', 3));
    }
    noteFills(h, few);
    expect(isLinkedAccount(h, 'x', 'y')).toBe(false);
  });

  it('a different quantity or a later tick does not mirror', () => {
    const g = world('col-noqty', ['a', 'b']);
    const fills: Fill[] = [];
    for (let k = 0; k < 12; k++) {
      fills.push(fill('a', 100 + k * 10, 'buy', 3));
      fills.push(fill('b', 101 + k * 10, 'buy', 4));
    }
    noteFills(g, fills);
    expect(isLinkedAccount(g, 'a', 'b')).toBe(false);
  });

  it('the founder sell cap is shared by the owner group in equal parts, and a group of one keeps it whole', () => {
    const g = world('col-cap', ['f', 'm', 'z']);
    g.players.f!.allianceId = 'al2';
    g.players.m!.allianceId = 'al2';
    const caps = syncGroupSellCap(g, 'ACME', 'f', 100, { sellCaps: {} });
    expect(caps.ACME).toEqual({ f: 50, m: 50 });
    const solo = syncGroupSellCap(g, 'ACME', 'z', 100, { sellCaps: {} });
    expect(solo.ACME).toEqual({ z: 100 });
  });
});
