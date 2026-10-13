import { describe, expect, it } from 'vitest';
import { Rng, seedStream } from '@/engine/rng';
import { applyCommand, createGame } from './game';
import { credit, newOutput } from './core';
import { linkedAccountsUncached, registerDevice } from './collusion';
import { createAlliance, dealsDay, joinAlliance, leaveAlliance, offerDeal, repayDeal, respondDeal, taxBasisOf } from './social';
import type { GameState } from './types';

// V1-PHASE9 9C.1: taxBasisOf reads the receivables of the deal book through an index built once per change of the deal book
// (social.ts receivableIndex). It must give exactly the answer of the scan it replaces, bit for bit (the same terms in the same
// order), after every loan write, the day close and a change of the owner group. The owner group is changed here too: an
// alliance join or leave and a registration device (each through the same path the game uses, which touches the links).

const HUMANS = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];

function world(seed: string): { g: GameState; alliance: string } {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const id of HUMANS) {
    applyCommand(g, id, { type: 'join', handle: `t_${id}`, country: 'AV' });
    g.players[id]!.rankId = 'R1';
    credit(g, id, 200_000, 'test');
  }
  const made = createAlliance(g, g.players.u0!, 'Tax Ally', 'TAX', '', null);
  if (!made.ok) throw new Error('the test alliance must found');
  return { g, alliance: (made.data as { id: string }).id };
}

/** The scan taxBasisOf replaced: the group's marks, then every active loan leaving the group, in the deal book's order. */
function taxBasisScan(g: GameState, pid: string): number {
  const group = linkedAccountsUncached(g, pid);
  const inside = new Set(group);
  let basis = 0;
  for (const id of group) {
    const p = g.players[id];
    if (p) basis += p.markNetWorth ?? p.netWorth;
  }
  for (const d of Object.values(g.deals)) {
    if (d.kind !== 'loan' || d.status !== 'active') continue;
    if (inside.has(d.fromId) && !inside.has(d.toId)) basis += d.outstanding ?? d.amount;
  }
  return basis;
}

describe('the tax basis index equals the deal-book scan (9C.1)', () => {
  it('seeded random loans, repayments, defaults and marks: indexed equals scanned after every step', () => {
    let leavingReads = 0;
    let groupChanges = 0;
    let groupedReads = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { g, alliance } = world(`tax-basis-${seed}`);
      const rng = new Rng(seedStream(`tax-basis-${seed}`, 'deals'));
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng.uniform() * xs.length)]!;
      const out = newOutput();
      for (let step = 0; step < 160; step++) {
        const op = rng.uniform();
        if (op < 0.05) {
          // a change of the owner group: a device, or an alliance join or leave (the social path touches the links)
          const p = g.players[pick(HUMANS)]!;
          registerDevice(g, p.id, `dev-${Math.floor(rng.uniform() * 3)}`);
          groupChanges++;
        } else if (op < 0.1) {
          const p = g.players[pick(HUMANS.slice(1))]!;
          if (p.allianceId) leaveAlliance(g, p); else joinAlliance(g, p, alliance, null);
          groupChanges++;
        } else if (op < 0.35) {
          const from = g.players[pick(HUMANS)]!;
          const to = pick(HUMANS);
          if (to !== from.id) offerDeal(g, from, 'loan', to, 100 + Math.floor(rng.uniform() * 20_000), rng.uniform() * 0.3, 1 + Math.floor(rng.uniform() * 40), '', null);
        } else if (op < 0.6) {
          // answer an open offer: accept or decline
          const open = Object.values(g.deals).filter((d) => d.status === 'offered');
          if (open.length) {
            const d = pick(open);
            respondDeal(g, g.players[d.toId]!, d.id, rng.uniform() < 0.8, null);
          }
        } else if (op < 0.7) {
          // repay part of an active loan
          const act = Object.values(g.deals).filter((d) => d.status === 'active');
          if (act.length) {
            const d = pick(act);
            repayDeal(g, g.players[d.toId]!, d.id, Math.floor(rng.uniform() * 5_000), null);
          }
        } else if (op < 0.8) {
          // the day close: interest accrues, due loans are collected or default
          g.market.tick += 720;
          dealsDay(g, out);
        } else if (op < 0.9) {
          // a mark moves (the basis reads it at call time, never from a cache)
          const p = g.players[pick(HUMANS)]!;
          p.markNetWorth = Math.floor(rng.uniform() * 500_000);
        } else {
          // a repeat read with no write in between
        }
        for (const h of HUMANS) {
          const want = taxBasisScan(g, h);
          const got = taxBasisOf(g, h);
          if (Object.values(g.deals).some((d) => d.status === 'active' && d.fromId === h)) leavingReads++;
          if (linkedAccountsUncached(g, h).length > 1) groupedReads++;
          expect(got).toBe(want);
        }
      }
    }
    // the sequences must lend something out of a group, change groups, and read grouped accounts, or the index is untested
    expect(leavingReads).toBeGreaterThan(200);
    expect(groupChanges).toBeGreaterThan(50);
    expect(groupedReads).toBeGreaterThan(200);
  });
});
