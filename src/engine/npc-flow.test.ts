import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import { depthByPool, ecologyLog, explainMove } from './ecology';
import { openAccount, placeOrder } from './trading';
import type { WorldState } from './types';

const TPD = 24;
const ASSET = 'OSTV';

interface Acct { id: string; npc?: boolean }

/** An NPC persona's account, as the world opens it (createPlayer): the same account with the npc flag set. */
function openNpc(s: WorldState, id: string): WorldState {
  const o = openAccount(s, id);
  return { ...o, accounts: { ...o.accounts, [id]: { ...o.accounts[id]!, npc: true } } };
}

/** Opens the accounts, then each of `days` game days every account buys `qty` of ASSET at the open. */
function trade(accts: Acct[], days: number, qty = 5, seed = 'npc'): WorldState {
  let s = createWorld(seed, universeConfig({ ticksPerDay: TPD }));
  for (const a of accts) s = a.npc ? openNpc(s, a.id) : openAccount(s, a.id);
  for (let d = 0; d < days; d++) {
    for (const a of accts) s = placeOrder(s, { playerId: a.id, assetId: ASSET, side: 'buy', type: 'market', qty }).state;
    s = stepMany(s, TPD).state;
  }
  return s;
}

const humans = (n: number): Acct[] => Array.from({ length: n }, (_, i) => ({ id: `h${i}` }));
const npcs = (n: number): Acct[] => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, npc: true }));

describe('NPC accounts (P1): their flow is Retail, never Players or You', () => {
  it('npc_funds_folded: five NPC accounts never show a Players row, and their flow is in Retail', () => {
    const s = trade(npcs(5), 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeUndefined();
    expect(e.parts.you).toBeUndefined();
    expect(e.foldedDays).toEqual([]);
    expect(Math.abs(e.flow.retail ?? 0)).toBeGreaterThan(0);
  });

  it('four humans and one NPC: the NPC does not count, so the humans fold to Retail (four is below five)', () => {
    const s = trade([...humans(4), ...npcs(1)], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays).toEqual([0, 1, 2]);
  });

  it('five humans and three NPCs still show Players, with the NPC flow in Retail beside it', () => {
    const s = trade([...humans(5), ...npcs(3)], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.players).toBeDefined();
    expect(e.foldedDays).toEqual([]);
  });

  it('solo_you_row: one human with NPCs present is You, never Players', () => {
    const s = trade([...humans(1), ...npcs(3)], 3);
    const e = explainMove(s, ASSET, 0, 2);
    expect(e.parts.you).toBeDefined();
    expect(e.parts.players).toBeUndefined();
    expect(e.foldedDays).toEqual([]);
  });

  it('the NPC flag never moves a price: the same trades with and without it give the same closes', () => {
    const flagged = trade(npcs(5), 6, 5, 'flag');
    const plain = trade(humans(5), 6, 5, 'flag');
    expect(JSON.stringify(flagged.assets.map((a) => a.lnP))).toBe(JSON.stringify(plain.assets.map((a) => a.lnP)));
    expect(JSON.stringify(flagged.ecology!.assets.map((a) => a.lnS))).toBe(JSON.stringify(plain.ecology!.assets.map((a) => a.lnS)));
  });
});

describe("depthByPool follows explainMove's fold (P2)", () => {
  const cases: [string, Acct[]][] = [
    ['shown: five humans', humans(5)],
    ['folded: four humans', humans(4)],
    ['solo: one human', humans(1)],
    ['NPC only', npcs(5)],
    ['mixed: three humans and two NPCs', [...humans(3), ...npcs(2)]],
  ];
  for (const [name, accts] of cases) {
    it(`${name}: Retail depth is the pool flow plus NPC flow, and the own flow exactly when Retail folds`, () => {
      const s = trade(accts, 3);
      const idx = s.config.assets.findIndex((a) => a.id === ASSET);
      for (const row of ecologyLog(s)) {
        const d = row.day;
        const a = row.assets[idx]!;
        const folded = explainMove(s, ASSET, d, d).foldedDays.includes(d);
        // a folded day with a human trade also carries the R1 blur draw (ecology.foldBlur), which is public
        const want = a.desired.retail + (a.desired.npc ?? 0) + (folded ? a.desired.own + (a.blur ?? 0) : 0);
        expect(depthByPool(s, ASSET, d).desired.retail).toBeCloseTo(want, 14);
      }
    });
  }

  it('a day the Players row shows carries no player flow in the depth Retail figure', () => {
    const s = trade(humans(5), 3);
    const idx = s.config.assets.findIndex((a) => a.id === ASSET);
    for (const row of ecologyLog(s)) {
      expect(depthByPool(s, ASSET, row.day).desired.retail).toBeCloseTo(row.assets[idx]!.desired.retail, 14);
    }
  });

  it("a folded lone account is inside the depth Retail figure, and inside explainMove's Retail row", () => {
    let s = createWorld('fold', universeConfig({ ticksPerDay: TPD }));
    for (const p of ['p0', 'p1', 'p2', 'p3', 'p4']) s = openAccount(s, p);
    for (let d = 0; d < 3; d++) {
      for (const p of d < 2 ? ['p0', 'p1', 'p2', 'p3', 'p4'] : ['p0']) s = placeOrder(s, { playerId: p, assetId: ASSET, side: 'buy', type: 'market', qty: 5 }).state;
      s = stepMany(s, TPD).state;
    }
    const idx = s.config.assets.findIndex((a) => a.id === ASSET);
    const row = ecologyLog(s).find((r) => r.day === 2)!;
    expect(depthByPool(s, ASSET, 2).desired.retail).toBeCloseTo(row.assets[idx]!.desired.retail + row.assets[idx]!.desired.own + (row.assets[idx]!.blur ?? 0), 14);
    expect(explainMove(s, ASSET, 2, 2).foldedDays).toEqual([2]);
    expect(explainMove(s, ASSET, 2, 2).parts.players).toBeUndefined();
  });
});
