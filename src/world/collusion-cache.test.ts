import { describe, expect, it } from 'vitest';
import type { Fill } from '@/engine';
import { Rng, seedStream } from '@/engine/rng';
import { applyCommand, createGame } from './game';
import { credit } from './core';
import { collusionDay, linkedAccounts, linkedAccountsUncached, MIRROR_MIN_MATCHES, MIRROR_PRUNE_TICKS, noteFills, recordGift, registerDevice } from './collusion';
import { createAlliance, allianceKick, joinAlliance, leaveAlliance } from './social';
import { createPlayer } from './players';
import type { GameState, Player } from './types';

// V1-PHASE9 9C.1: linkedAccounts reads a link index built once per change of the links (collusion.ts linkIndex). The index must give
// exactly the answer of the uncached reference (linkedAccountsUncached: the R-9-3 rules as written, computed on every call) for
// any sequence of link writes, and every link write must invalidate it. The equality is checked after every write, in a random order
// of queries, over seeded sequences; a stale index would show as a difference on the next query.

const HUMANS = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11'];
const DEVICES = ['dev-a', 'dev-b', 'dev-c'];

function world(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const id of HUMANS) {
    applyCommand(g, id, { type: 'join', handle: `t_${id}`, country: 'AV' });
    // a Hustler with cash, so it can found or join an alliance
    g.players[id]!.rankId = 'R1';
    credit(g, id, 100_000, 'test');
  }
  // one non-human account (an NPC) in the mix: a link to it must not count (isHuman)
  createPlayer(g, 'npc0', 'npc0', 'AV', { npc: 'npc' });
  return g;
}

function fill(pid: string, tick: number, side: 'buy' | 'sell', qty: number, assetId: string): Fill {
  return { orderId: `o${pid}${tick}${side}${assetId}`, playerId: pid, assetId, side, qty, price: 10, fee: 0, tick, mid: 10 };
}

/** every account the test can name, humans and the NPC, plus one that does not exist */
const ALL = [...HUMANS, 'npc0', 'ghost'];

/** the reads that found a linked account (more than one account in the answer): the sequences must link something, or they test nothing */
let linkedReads = 0;

function checkAll(g: GameState, rng: Rng): void {
  // query in a random order, so the index is reached from many states (a hit and a miss)
  const order = [...ALL];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.uniform() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  for (const pid of order) {
    const got = linkedAccounts(g, pid);
    if (got.length > 1) linkedReads++;
    expect(got).toEqual(linkedAccountsUncached(g, pid));
  }
}

describe('the link index answers exactly what the uncached rules answer (9C.1)', () => {
  it('seeded random sequences of link writes: cached equals uncached after every write', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = world(`cache-seq-${seed}`);
      const rng = new Rng(seedStream(`cache-seq-${seed}`, 'writes'));
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng.uniform() * xs.length)]!;
      const alliances: string[] = [];
      for (let step = 0; step < 220; step++) {
        const op = rng.uniform();
        if (op < 0.14) {
          registerDevice(g, pick(HUMANS), pick(DEVICES));
        } else if (op < 0.30) {
          const a = pick(HUMANS);
          const b = pick([...HUMANS, 'npc0']);
          recordGift(g, a, b);
        } else if (op < 0.50) {
          // trade bursts: several accounts fill the same asset, side and quantity within the mirror window
          const fills: Fill[] = [];
          const tick = 1000 + step * 3;
          const ids = HUMANS.filter(() => rng.uniform() < 0.4);
          const qty = 1 + Math.floor(rng.uniform() * 3);
          for (const id of ids) for (let k = 0; k < MIRROR_MIN_MATCHES / 2; k++) fills.push(fill(id, tick + k, 'buy', qty, 'ACME'));
          if (rng.uniform() < 0.3) fills.push(fill('npc0', tick, 'buy', qty, 'ACME'));
          noteFills(g, fills);
        } else if (op < 0.66) {
          const id = pick(HUMANS);
          const al = alliances.length > 0 && rng.uniform() < 0.5 ? pick(alliances) : null;
          const p: Player = g.players[id]!;
          if (al && g.alliances[al] && p.allianceId === null) {
            joinAlliance(g, p, al, null);
          } else if (p.allianceId && rng.uniform() < 0.5) {
            leaveAlliance(g, p);
          } else if (p.allianceId === null) {
            const founder = g.players[pick(HUMANS)]!;
            if (founder.allianceId === null) {
              const made = createAlliance(g, founder, `Ally ${seed} ${step}`, `T${step}`, '', null);
              if (made.ok) alliances.push((made.data as { id: string }).id);
            }
          }
        } else if (op < 0.72) {
          const owner = g.players[pick(HUMANS)]!;
          const victim = pick(HUMANS);
          if (owner.allianceId) {
            // the owner-kick path, through the social command (it touches the links)
            allianceKick(g, owner, victim);
          }
        } else if (op < 0.76) {
          // the day close: the mirror prune (drops quiet, unlinked pairs)
          g.market.tick += MIRROR_PRUNE_TICKS + 1;
          collusionDay(g);
        } else {
          // no write: a plain re-read (the cache must answer the same again)
        }
        checkAll(g, rng);
      }
    }
    expect(linkedReads).toBeGreaterThan(1000);
  });

  it('a link write invalidates the index: each source changes the answer on the next read', () => {
    const g = world('cache-invalidate');
    // warm the index with the empty graph
    expect(linkedAccounts(g, 'h0')).toEqual(['h0']);
    // device
    registerDevice(g, 'h0', 'd1');
    expect(linkedAccounts(g, 'h0')).toEqual(['h0']);
    registerDevice(g, 'h1', 'd1');
    expect(linkedAccounts(g, 'h0')).toEqual(['h0', 'h1']);
    // funding: two gifts make a direct link, one does not
    recordGift(g, 'h2', 'h3');
    expect(linkedAccounts(g, 'h2')).toEqual(['h2']);
    recordGift(g, 'h2', 'h3');
    expect(linkedAccounts(g, 'h2')).toEqual(['h2', 'h3']);
    // alliance join and leave (the social path)
    const owner = g.players.h4!;
    const made = createAlliance(g, owner, 'Four', 'FOUR', '', null);
    expect(made.ok).toBe(true);
    const id = (made.data as { id: string }).id;
    expect(linkedAccounts(g, 'h4')).toEqual(['h4']);
    joinAlliance(g, g.players.h5!, id, null);
    expect(linkedAccounts(g, 'h5')).toEqual(['h4', 'h5']);
    leaveAlliance(g, g.players.h5!);
    expect(linkedAccounts(g, 'h5')).toEqual(['h5']);
    // mirror: a pair of fills makes the link once it reaches the match minimum
    const fills: Fill[] = [];
    for (let k = 0; k < MIRROR_MIN_MATCHES; k++) {
      fills.push(fill('h6', 100 + k * 10, 'buy', 3, 'ACME'));
      fills.push(fill('h7', 101 + k * 10, 'buy', 3, 'ACME'));
    }
    noteFills(g, fills.slice(0, 2 * MIRROR_MIN_MATCHES - 2));
    expect(linkedAccounts(g, 'h6')).toEqual(['h6']);
    noteFills(g, fills.slice(2 * MIRROR_MIN_MATCHES - 2));
    expect(linkedAccounts(g, 'h6')).toEqual(['h6', 'h7']);
    // a new account joins: a later read sees it (a new account with a device links at once)
    createPlayer(g, 'h20', 'h20', 'AV');
    registerDevice(g, 'h20', 'd1');
    expect(linkedAccounts(g, 'h0')).toEqual(['h0', 'h1', 'h20']);
    expect(linkedAccounts(g, 'h20')).toEqual(['h0', 'h1', 'h20']);
    expect(linkedAccounts(g, 'h0')).toEqual(linkedAccountsUncached(g, 'h0'));
  });

  it('the index is not reused across states: a replaced collusion record or player map is read fresh', () => {
    const g = world('cache-replace');
    expect(linkedAccounts(g, 'h0')).toEqual(['h0']);
    // a restored or copied world carries its own links: the same g object with a new players map is a new state
    const alt = world('cache-replace-alt');
    registerDevice(alt, 'h0', 'shared');
    registerDevice(alt, 'h1', 'shared');
    g.collusion = alt.collusion;
    g.players = alt.players;
    expect(linkedAccounts(g, 'h0')).toEqual(['h0', 'h1']);
    expect(linkedAccounts(g, 'h0')).toEqual(linkedAccountsUncached(g, 'h0'));
  });

  it('the mirror prune changes the answer only where the links changed', () => {
    const g = world('cache-prune');
    const fills: Fill[] = [];
    for (let k = 0; k < MIRROR_MIN_MATCHES; k++) {
      fills.push(fill('h8', 100 + k * 10, 'buy', 2, 'ZZZ'));
      fills.push(fill('h9', 101 + k * 10, 'buy', 2, 'ZZZ'));
    }
    noteFills(g, fills);
    expect(linkedAccounts(g, 'h8')).toEqual(['h8', 'h9']);
    // the pair is linked, so the prune keeps it (a linked pair is part of the graph)
    g.market.tick = 100 + 10 * MIRROR_MIN_MATCHES + MIRROR_PRUNE_TICKS * 3;
    collusionDay(g);
    expect(linkedAccounts(g, 'h8')).toEqual(['h8', 'h9']);
    expect(linkedAccounts(g, 'h8')).toEqual(linkedAccountsUncached(g, 'h8'));
  });
});
