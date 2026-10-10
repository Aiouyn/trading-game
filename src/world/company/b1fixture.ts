/**
 * Test fixture for the B1 market path: a world with one founder (rank R2, then R3 for an IPO), two old buyers, one young
 * account, and a founded tech company. Days are advanced with the company day step (no engine ticks), which is exact for
 * everything that is a day-boundary action. Tests that need fills step the engine explicitly.
 */

import { COMPANY } from '@/content/company';
import { applyCommand, createGame } from '../game';
import { credit, today, TPD } from '../core';
import type { GameState } from '../types';
import { companyDay } from './bridge';
import type { Company, IpoBook } from './types';

export const FOUNDER = 'f';
export const BUYER_A = 'a';
export const BUYER_B = 'b';
export const YOUNG = 'y';

/** The world before the company is founded: the four accounts, the founder at R2, old buyers and a young account. Tick 1 is day 0. */
export function unfounded(seed: string): GameState {
  const g = createGame(seed, { warmupDays: 0, npcs: false });
  for (const [id, handle] of [[FOUNDER, 'founder_one'], [BUYER_A, 'buyer_a'], [BUYER_B, 'buyer_b'], [YOUNG, 'young_one']] as const) {
    const r = applyCommand(g, id, { type: 'join', handle, country: 'AV' });
    if (!r.ok) throw new Error(r.error);
  }
  g.market = { ...g.market, tick: 1 };
  for (const id of [FOUNDER, BUYER_A, BUYER_B]) g.players[id]!.joinedTick = -1000 * TPD;
  g.players[FOUNDER]!.rankId = 'R2';
  g.players[YOUNG]!.joinedTick = 1;
  credit(g, FOUNDER, 2_000_000, 'test');
  credit(g, BUYER_A, 5_000_000, 'test');
  credit(g, BUYER_B, 5_000_000, 'test');
  credit(g, YOUNG, 5_000_000, 'test');
  return g;
}

/** A world with one founded company, the founder at R2, old buyers, and a young account. Tick 1 is day 0. */
export function founded(seed: string): { g: GameState; c: Company } {
  const g = unfounded(seed);
  const r = applyCommand(g, FOUNDER, { type: 'company.found', name: 'Acme', sector: 'tech', cityId: 'av', capital: COMPANY.founding.capital });
  if (!r.ok) throw new Error(r.error);
  const c = Object.values(g.companies!.companies)[0]!;
  return { g, c };
}

/** Advance the world to the first tick of `toDay` (the company day step runs on each day boundary in between). */
export function advanceTo(g: GameState, toDay: number): void {
  for (let d = today(g) + 1; d <= toDay; d++) {
    g.market = { ...g.market, tick: d * TPD + 1 };
    companyDay(g, null);
  }
  g.market = { ...g.market, tick: toDay * TPD + 1 };
}

/** The company object by its id (the world keeps companies by id). */
export function companyOf(g: GameState): Company {
  return Object.values(g.companies!.companies)[0]!;
}

/** Total money in the world: every account's cash, every company's cash and the investor pools (the conservation identity). */
export function totalMoney(g: GameState): number {
  let t = 0;
  for (const a of Object.values(g.market.accounts)) t += a.cash;
  for (const c of Object.values(g.companies?.companies ?? {})) t += c.cash;
  for (const p of Object.values(g.companies?.investors ?? {})) t += p.cash;
  return t;
}

/** Three filed quarters: closes on days 63, 126 and 189, filed three days later (66, 129, 192). Day 200 is past the third. */
export const THREE_FILINGS_DAY = 200;

/** A listed company: the IPO done with the founder and buyer A at R3, advanced to the listing day. */
export function listedWorld(seed: string): { g: GameState; c: Company; assetId: string } {
  const { g } = founded(seed);
  advanceTo(g, THREE_FILINGS_DAY);
  const c = companyOf(g);
  c.filedV = 100_000_000;
  g.players[FOUNDER]!.rankId = 'R3';
  g.players[BUYER_A]!.rankId = 'R3';
  g.players[BUYER_B]!.rankId = 'R3';
  applyCommand(g, FOUNDER, { type: 'company.ipo', companyId: c.id, floatPct: 0.2 });
  applyCommand(g, BUYER_A, { type: 'company.ipoOrder', companyId: c.id, shares: 10_000 });
  advanceTo(g, (c.ipo as IpoBook).listDay);
  return { g, c, assetId: c.listed!.assetId };
}
