import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, stepGame } from './game';
import { advanceGhosts, beatenCount, ghostReport, gxMembers, percentileOf, ghostValues } from './ghosts';
import { ledgerOf } from './ledger';
import { GHOSTS } from '@/content/learning';
import type { GameState, Command } from './types';
import type { DayClose } from './ledger-types';

const TPD = 720;

function cmd(g: GameState, pid: string, c: Command) {
  return applyCommand(g, pid, c);
}

/** A world one game day in, with a player who joins a few ticks into day 1 (so the first close is day 1's). */
function joined(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 1, npcs: false });
  for (let k = 0; k < 10; k++) stepGame(g);
  const r = cmd(g, 'u1', { type: 'join', handle: 'trader_u1', country: 'AV' });
  if (!r.ok) throw new Error(r.error);
  g.players.u1!.onboarding.skipped = true;
  return g;
}

/** Step until the tick is at or past `tick`. */
function runTo(g: GameState, tick: number) {
  while (g.market.tick < tick) stepGame(g);
}

describe('benchmark ghosts (D-4 to D-6)', () => {
  it('start at the player day 1 close with the starting cash, with no haircut and no fees', () => {
    const g = joined('ghost-start');
    const start = g.market.accounts.u1!.startingCash;
    runTo(g, 2 * TPD); // day 1 closes at tick 1440
    const rep = ghostReport(g, 'u1')!;
    expect(rep.day).toBe(1);
    expect(rep.startCash).toBe(start);
    expect(rep.basket).toBeCloseTo(start, 6);
    expect(rep.random).toBeCloseTo(start, 6);
    expect(rep.momentum).toBeCloseTo(start, 6); // no 63-day history from the join: stays in cash
    expect(rep.noTrades).toBe(true);
    expect(rep.percentile).toBeNull();
  });

  it('a grant shifts every ghost by the same amount (adjustCash-shifted)', () => {
    const g = joined('ghost-grant');
    runTo(g, 2 * TPD);
    const L = ledgerOf(g, 'u1')!;
    const before = { b: L.ghosts!.basket.cash, r: L.ghosts!.random.cash, m: L.ghosts!.momentum.cash };
    expect(cmd(g, 'u1', { type: 'admin.grant', amount: 1000 }).ok).toBe(true);
    expect(L.ghosts!.basket.cash - before.b).toBeCloseTo(1000, 9);
    expect(L.ghosts!.random.cash - before.r).toBeCloseTo(1000, 9);
    expect(L.ghosts!.momentum.cash - before.m).toBeCloseTo(1000, 9);
    expect(g.market.accounts.u1!.startingCash).toBeGreaterThan(0);
  });

  it('forms the basket on cap weights over the GX members, at the day close', () => {
    const g = joined('ghost-basket');
    runTo(g, 2 * TPD);
    const L = ledgerOf(g, 'u1')!;
    const members = gxMembers(g);
    expect(members.length).toBeGreaterThan(5);
    const day = 1;
    const px = (id: string) => g.dayCloses![day]!.px[id]!;
    const cap = (id: string) => (g.market.config.assets.find((a) => a.id === id)!.sharesOutstanding ?? 1) * px(id);
    const [a, b] = members;
    const va = L.ghosts!.basket.qty[a!]! * px(a!);
    const vb = L.ghosts!.basket.qty[b!]! * px(b!);
    expect(va / vb).toBeCloseTo(cap(a!) / cap(b!), 6);
    // fully invested: the basket's value is the starting cash, and nothing is left in cash
    expect(L.ghosts!.basket.cash).toBeCloseTo(0, 6);
  });

  it('settles a delisted holding at its frozen price, so the ghost keeps its value', () => {
    const g = joined('ghost-delist');
    runTo(g, 2 * TPD);
    const L = ledgerOf(g, 'u1')!;
    const id = Object.keys(L.ghosts!.basket.qty)[0]!;
    const before = ghostValues(g, L, 1).basket;
    // a private copy of the config: the universe definitions are shared across the whole test file
    g.market = { ...g.market, config: { ...g.market.config, assets: g.market.config.assets.map((x) => (x.id === id ? { ...x, delisted: true } : x)) } };
    advanceGhosts(g, 'u1', 1);
    expect(L.ghosts!.basket.qty[id]).toBeUndefined();
    expect(ghostValues(g, L, 1).basket).toBeCloseTo(before, 6);
  });

  it('the momentum ghost buys the trailing 63-day leaders, using only closes up to the day', () => {
    const g = joined('ghost-momentum');
    runTo(g, 2 * TPD);
    // synthetic closes: 120 flat days, then one asset rises 1% a day over the last 63 days
    const ids = g.market.config.assets.map((a) => a.id);
    const base: Record<string, number> = {};
    for (const id of ids) base[id] = g.dayCloses![1]!.px[id]!;
    const mover = 'HLCN';
    g.dayCloses = {};
    for (let d = 0; d <= 120; d++) {
      const px: Record<string, number> = { ...base };
      const k = Math.max(0, d - 57);
      px[mover] = base[mover]! * Math.pow(1.01, k);
      const rec: DayClose = { day: d, tick: (d + 1) * TPD, gx: 1000, px };
      g.dayCloses[d] = rec;
    }
    const L = ledgerOf(g, 'u1')!;
    L.ghosts = null;
    advanceGhosts(g, 'u1', 120);
    expect(L.ghosts!.momentum.qty[mover]).toBeGreaterThan(0);
    expect(Object.keys(L.ghosts!.momentum.qty).length).toBe(GHOSTS.picks);
    expect(L.ghosts!.momentum.cash).toBeLessThan(1e-6);
  });

  it('the random ghost is seeded per player: the same world gives the same picks', () => {
    const a = joined('ghost-seed');
    const b = joined('ghost-seed');
    runTo(a, 2 * TPD);
    runTo(b, 2 * TPD);
    expect(ledgerOf(a, 'u1')!.ghosts!.random.qty).toEqual(ledgerOf(b, 'u1')!.ghosts!.random.qty);
    expect(Object.keys(ledgerOf(a, 'u1')!.ghosts!.random.qty).length).toBe(GHOSTS.picks);
  });

  it('a tie ranks the ghost ahead of the player, and percentiles are discrete', () => {
    expect(beatenCount(100, { basket: 100, random: 99, momentum: 101 })).toBe(1);
    expect(beatenCount(100, { basket: 99, random: 98, momentum: 97 })).toBe(3);
    expect([0, 1, 2, 3].map(percentileOf)).toEqual([0, 33, 67, 100]);
  });
});
