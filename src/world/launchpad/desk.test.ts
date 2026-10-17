import { describe, expect, it } from 'vitest';
import { CREATOR, HOLDER, TRADER, launch, lpWorld, run } from './fixture';
import { lpTick } from './flow';
import { followerCount } from './desk';
import { launchpadView } from './view';
import { anonOf } from './anon';
import { spotAt } from './curve';
import { computeBoards } from '../boards';
import { flagNpcAccounts } from '../players';
import type { GameState } from '../types';
import { MICROFLOW, spendableCents } from './microflow';
import { tickerHash } from './icon';
import type { LpToken } from './types';
import { cohortsOf } from './cohorts';

function step(g: GameState, n = 1): void {
  for (let k = 0; k < n; k++) {
    g.market = { ...g.market, tick: g.market.tick + 1 };
    lpTick(g, null);
  }
}

function fundedCopyIds(g: GameState, t: LpToken, n: number, pid: string): string[] {
  const start = tickerHash(pid) % MICROFLOW.population;
  const active = new Map(t.micro!.traders.map(w => [w.id, w]));
  const ids: string[] = [];
  for (let k = 0; k < MICROFLOW.population && ids.length < n; k++) {
    const id = `lp:npc:trader:${(start + k * 7) % MICROFLOW.population}`;
    const wallet = active.get(id);
    const inventory = cohortsOf(t).some(c => c.wallet === id && c.tokens > 0);
    if (wallet ? spendableCents(g, wallet) >= 100 || inventory : (g.market.accounts[id]?.cash ?? 0) >= 1) ids.push(id);
  }
  return ids;
}

describe('desks, the pit, and a delayed copy', () => {
  it('a fresh trader is not copied, and one lucky close is not a following', () => {
    expect(followerCount(8_000, 1)).toBe(0);
    expect(followerCount(-400, 6)).toBe(0);
    expect(followerCount(500, 3)).toBe(12);
    expect(followerCount(2_000, 3)).toBe(37);
    expect(followerCount(6_500, 3)).toBe(108);
    const g = lpWorld('nobody');
    expect(launch(g, CREATOR, 'NONE').ok).toBe(true);
    step(g, 1);
    const t = g.launchpad!.tokens.NONE!;
    const desks = t.micro!.traders.filter(w => w.id.startsWith('lp:npc:trader:')).length;
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'NONE', spendCents: 40_000, maxSlip: 0.5 }).ok).toBe(true);
    expect(t.follow?.due).toBe(g.market.tick + 1);
    step(g, 1);
    expect(t.follow).toBeUndefined();
    expect(t.micro!.traders.filter(w => w.id.startsWith('lp:npc:trader:')).length).toBe(desks);
    const view = launchpadView(g, TRADER);
    expect(view.desks[0]?.you).toBe(true);
    expect(view.desks[0]?.followers).toBe(0);
  });

  it('a strong record is copied on the next tick by dozens of wallets, and not on the fill itself', () => {
    const g = lpWorld('famous');
    expect(launch(g, CREATOR, 'FAME').ok).toBe(true);
    step(g, 1);
    const t = g.launchpad!.tokens.FAME!;
    // $2,000 closed profit is a typical eligible record: 37 funded wallets, not just a higher ceiling.
    t.realized[TRADER] = 2_000;
    g.launchpad!.desks = { [TRADER]: { closes: 3 } };
    const expectedActors = fundedCopyIds(g, t, 37, TRADER).map(id => anonOf('FAME', id));
    expect(expectedActors).toHaveLength(37);
    const before = t.tradeSeq ?? 0;
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'FAME', spendCents: 50_000, maxSlip: 0.5 }).ok).toBe(true);
    // The fill itself is the only new print. The copy waits for the next tick.
    expect((t.tradeSeq ?? 0) - before).toBe(1);
    expect(t.tape[t.tape.length - 1]?.npc).toBe(false);
    step(g, 1);
    const ids = new Set(t.micro!.traders.filter(w => w.id.startsWith('lp:npc:trader:')).map(w => anonOf('FAME', w.id)));
    const copies = t.tape.filter(tr => tr.tick === g.market.tick && tr.side === 'buy' && tr.anon && ids.has(tr.anon));
    const copiedActors = new Set(copies.map(tr => tr.anon));
    for (const anon of expectedActors) expect(copiedActors.has(anon)).toBe(true);
    expect(copiedActors.size).toBeGreaterThanOrEqual(26);
    for (const w of t.micro!.traders) expect(g.market.accounts[w.id]!.cash).toBeGreaterThanOrEqual(0);
    expect(launchpadView(g, TRADER).desks[0]?.followers).toBe(37);
    expect(t.micro!.traders.filter(w => w.id.startsWith('lp:npc:trader:')).length - 64).toBeGreaterThanOrEqual(30);
  });

  it('a $500 eligible record gets real funded followers, not just a larger desk label', () => {
    const g = lpWorld('moderate-followers');
    expect(launch(g, CREATOR, 'MODF').ok).toBe(true);
    step(g, 1);
    const t = g.launchpad!.tokens.MODF!;
    t.realized[TRADER] = 500;
    g.launchpad!.desks = { [TRADER]: { closes: 3 } };
    const expectedActors = fundedCopyIds(g, t, 12, TRADER).map(id => anonOf('MODF', id));
    expect(expectedActors).toHaveLength(12);
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'MODF', spendCents: 50_000, maxSlip: 0.5 }).ok).toBe(true);
    step(g, 1);

    const traderIds = new Set(t.micro!.traders.filter(w => w.id.startsWith('lp:npc:trader:')).map(w => anonOf('MODF', w.id)));
    const copied = new Set(t.tape.filter(tr => tr.tick === g.market.tick && tr.side === 'buy' && tr.anon && traderIds.has(tr.anon)).map(tr => tr.anon));
    for (const anon of expectedActors) expect(copied.has(anon)).toBe(true);
    expect(launchpadView(g, TRADER).desks[0]?.followers).toBe(12);
  });

  it('a moving coin keeps printing, and the spectator echo stays inside its cap', () => {
    const g = lpWorld('pit');
    expect(launch(g, CREATOR, 'PITX').ok).toBe(true);
    const t = g.launchpad!.tokens.PITX!;
    const perMin: number[] = [];
    const names = new Set<string>();
    for (let m = 0; m < 20 && t.status === 'live'; m++) {
      const tick0 = g.market.tick;
      const seq0 = t.tradeSeq ?? 0;
      step(g, 12);
      perMin.push((t.tradeSeq ?? 0) - seq0);
      for (const tr of t.tape) if (tr.tick > tick0 && tr.anon) names.add(tr.anon);
    }
    const quiet = perMin.filter(n => n === 0).length;
    expect(quiet).toBeLessThanOrEqual(2);
    expect(names.size).toBeGreaterThanOrEqual(8);
    expect(t.micro?.episode?.echo ?? 0).toBeLessThanOrEqual(2_500);
    expect(Number.isFinite(spotAt(t.y))).toBe(true);
  });

  it('launchpad curve buys and sells update player trade stats, win rate, best/worst trade and the Trader board', () => {
    const g = lpWorld('stats-lp');
    expect(launch(g, CREATOR, 'STAT').ok).toBe(true);
    const p = g.players[TRADER]!;
    expect(p.stats.trades).toBe(0);
    expect(p.stats.winningTrades).toBe(0);
    expect(p.stats.closedTrades ?? 0).toBe(0);

    // Trader buys $500 of STAT
    expect(run(g, TRADER, { type: 'lp.buy', ticker: 'STAT', spendCents: 50_000, maxSlip: 0.5 }).ok).toBe(true);
    expect(p.stats.trades).toBe(1);
    expect(p.stats.closedTrades ?? 0).toBe(0);

    // Another player buys heavily, lifting the curve price above Trader's entry
    expect(run(g, HOLDER, { type: 'lp.buy', ticker: 'STAT', spendCents: 200_000, maxSlip: 0.5 }).ok).toBe(true);

    // Trader sells for a profit
    const t = g.launchpad!.tokens.STAT!;
    const have = t.bal[TRADER]!;
    expect(run(g, TRADER, { type: 'lp.sell', ticker: 'STAT', tokens: have, maxSlip: 0.5 }).ok).toBe(true);
    expect(p.stats.trades).toBe(2);
    expect(p.stats.closedTrades).toBe(1);
    expect(p.stats.winningTrades).toBe(1);
    expect(p.stats.bestTrade).toBeGreaterThan(0);
    expect(t.realized[TRADER]).toBeGreaterThan(0);
  computeBoards(g);
  const row = g.boards.trader.find(r => r.id === TRADER);
  expect(row?.value).toBeCloseTo(t.realized[TRADER]!, 6);

  // the migration of an older save that traded on the Launchpad before curve stats were recorded
  const legacy = lpWorld('legacy-stats');
  expect(launch(legacy, CREATOR, 'LEGC').ok).toBe(true);
  const legToken = legacy.launchpad!.tokens.LEGC!;
  legToken.realized[TRADER] = 420;
  legToken.lots[TRADER] = [{ qty: 1000, cost: 0.01, tick: 1 }];
  legacy.players[TRADER]!.stats.trades = 4;
  legacy.players[TRADER]!.stats.winningTrades = 1;
  delete legacy.players[TRADER]!.stats.closedTrades;
  flagNpcAccounts(legacy);
  expect(legacy.players[TRADER]!.stats.winningTrades).toBe(2);
  expect(legacy.players[TRADER]!.stats.bestTrade).toBe(420);
  expect(legacy.players[TRADER]!.stats.closedTrades).toBeGreaterThan(0);
});

it('a large player sell triggers immediate panic selling from NPC holders', () => {
  const g = lpWorld('panic-dump');
  expect(launch(g, CREATOR, 'DMPX').ok).toBe(true);
  step(g, 6);
  // Trader buys a large bag ($3,000)
  expect(run(g, TRADER, { type: 'lp.buy', ticker: 'DMPX', spendCents: 300_000, maxSlip: 0.5 }).ok).toBe(true);
  const t = g.launchpad!.tokens.DMPX!;
  const have = t.bal[TRADER]!;
  expect(have).toBeGreaterThan(0);

  // Trader dumps the entire bag in one chunk
  expect(run(g, TRADER, { type: 'lp.sell', ticker: 'DMPX', tokens: have, maxSlip: 0.5 }).ok).toBe(true);
  const npcSellBefore = t.flows.npcSell;
  step(g, 1);
  // NPC holders panic and sell into the dump on that tick
  expect(t.flows.npcSell).toBeGreaterThan(npcSellBefore + 50);
  expect(t.micro!.panic).toBeGreaterThan(0.1);
});
});
