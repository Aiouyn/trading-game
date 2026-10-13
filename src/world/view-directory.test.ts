import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from './game';
import { credit } from './core';
import { createAlliance, joinAlliance, offerDeal } from './social';
import { directory, directoryFor, directoryWire, topDirectory } from './view';
import type { GameState } from './types';

// V1-PHASE9 9C.1: on a public tick the server sends each socket its directory. A big world (more than the top 500) used to
// serialize the top list and scan every row once per socket. directoryWire builds the same text from a top list serialized once and
// an index of the rows, so it must equal JSON.stringify(directoryFor(...)) byte for byte for every viewer.

function bigWorld(n: number): GameState {
  const g = createGame('dir-wire', { warmupDays: 0, npcs: false });
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `d${i}`;
    ids.push(id);
    applyCommand(g, id, { type: 'join', handle: `dir${i}`, country: 'AV' });
    g.players[id]!.netWorth = (i * 7919) % 100_003; // a spread of net worths, so the top list is not the join order
    g.players[id]!.rankId = 'R1';
    credit(g, id, 100_000, 'test');
  }
  // an alliance of the last few (outside the top list, most likely), with a founder
  const founder = g.players[ids[0]!]!;
  const made = createAlliance(g, founder, 'Dir Ally', 'DA', '', null);
  const aid = (made.data as { id: string }).id;
  for (const id of ids.slice(n - 4)) joinAlliance(g, g.players[id]!, aid, null);
  // deals between a few low-ranked accounts (their parties must appear in each other's directory)
  offerDeal(g, g.players[ids[n - 1]!]!, 'loan', ids[n - 2]!, 500, 0.05, 10, '', null);
  offerDeal(g, g.players[ids[n - 3]!]!, 'loan', ids[5]!, 500, 0.05, 10, '', null);
  // a DM channel between two accounts
  g.chat[`dm:${ids[7]}:${ids[n - 6]}`] = [];
  return g;
}

describe('the public-tick directory text equals directoryFor (9C.1)', () => {
  it('every viewer of a world above the top list gets the same JSON as before', () => {
    const g = bigWorld(620);
    const all = directory(g);
    const top = topDirectory(all);
    expect(all.length).toBeGreaterThan(top.length);
    const topBody = JSON.stringify(top).slice(1, -1);
    const pos = new Map(all.map((r, i) => [r.id, i] as const));
    let withExtras = 0;
    for (const pid of Object.keys(g.players)) {
      const want = JSON.stringify(directoryFor(g, all, top, pid));
      const got = directoryWire(g, all, top, topBody, pos, pid);
      expect(got).toBe(want);
      if (want.length > topBody.length + 2) withExtras++;
    }
    // the viewers the test is about (alliance, deal parties, DM partner) do get extra rows
    expect(withExtras).toBeGreaterThan(5);
  });

  it('a viewer who is not in the world gets the whole list, as directoryFor does', () => {
    const g = bigWorld(520);
    const all = directory(g);
    const top = topDirectory(all);
    const topBody = JSON.stringify(top).slice(1, -1);
    const pos = new Map(all.map((r, i) => [r.id, i] as const));
    expect(directoryWire(g, all, top, topBody, pos, 'nobody')).toBe(JSON.stringify(directoryFor(g, all, top, 'nobody')));
  });
});
