import { indexMembers } from '@/engine';
import { GHOSTS } from '@/content/learning';
import { keyedRng } from './core';
import { ensureLedger, hasTrades, ledgerOf } from './ledger';
import type { GhostPortfolio, PlayerLedger } from './ledger-types';
import type { GameState } from './types';

/**
 * The three benchmark ghosts (quant-ghosts.md, D-4 to D-6). Each starts at the player's own day 1 with the player's
 * starting cash, and is priced on the recorded daily closes: no spread, no commission, no impact, and no trading of its
 * own in the market. So a ghost is a counterfactual price path, not a copy of the player's fills. Shifts to the trading
 * baseline (adjustCash grants, non-trading cash moves) move the ghosts by the same amount (core.ts bump).
 *
 *   basket    buy-and-hold GX: weighted by cap (shares x close) over the index membership, re-formed at each review.
 *   random    a seeded random draw of picks every rebalance period, equal weight (seeded per player and day).
 *   momentum  the top picks by the trailing 63-day return, equal weight, rebalanced every period. Closes only up to today.
 */

export interface GhostReport {
  day: number;
  /** the player's mark-to-market equity at that close (cash plus positions at closes) */
  player: number;
  basket: number;
  random: number;
  momentum: number;
  /** ghosts strictly below the player; a tie ranks the ghost ahead of the player */
  beaten: number;
  /** the player's rank among the player and the three ghosts, as a percentile; null with no trades yet */
  percentile: number | null;
  noTrades: boolean;
  startCash: number;
  /** each equity's change since the start cash, as a fraction (0.05 is +5%), so the UI never does the arithmetic */
  change: { player: number; basket: number; random: number; momentum: number };
}

/** A value's change against the start cash, as a fraction (0 with no start cash). */
export function changeOf(value: number, startCash: number): number {
  return startCash > 0 ? value / startCash - 1 : 0;
}

function fresh(cash: number): GhostPortfolio {
  return { cash, qty: {}, nextDay: 0, members: [] };
}

/** Listed stocks in config order, tradable now (not delisted). */
export function listedStocks(g: GameState): string[] {
  return g.market.config.assets.filter((a) => a.assetClass === 'stock' && a.listed !== false && !a.delisted).map((a) => a.id);
}

function pxOf(g: GameState, day: number, id: string): number | undefined {
  return g.dayCloses?.[day]?.px[id];
}

function valueOf(g: GameState, gp: GhostPortfolio, day: number): number {
  let v = gp.cash;
  for (const [id, q] of Object.entries(gp.qty)) v += q * (pxOf(g, day, id) ?? 0);
  return v;
}

function sellAll(g: GameState, gp: GhostPortfolio, day: number): void {
  for (const [id, q] of Object.entries(gp.qty)) gp.cash += q * (pxOf(g, day, id) ?? 0);
  gp.qty = {};
}

/** Invest all cash by weight at the day's closes (no fee). Weights need not sum to one. */
function buyWeights(g: GameState, gp: GhostPortfolio, day: number, w: Record<string, number>): void {
  const total = Object.values(w).reduce((s, x) => s + x, 0);
  if (!(total > 0) || !(gp.cash > 0)) return;
  let spent = 0;
  for (const [id, wi] of Object.entries(w)) {
    const px = pxOf(g, day, id);
    if (!(px && px > 0) || !(wi > 0)) continue;
    const alloc = (gp.cash * wi) / total;
    gp.qty[id] = (gp.qty[id] ?? 0) + alloc / px;
    spent += alloc;
  }
  gp.cash -= spent;
}

/** A delisted holding settles in cash at its frozen price (engine settleAsset), so the ghost follows the player. */
function settleDelisted(g: GameState, gp: GhostPortfolio, day: number): void {
  for (const [id, q] of Object.entries(gp.qty)) {
    const def = g.market.config.assets.find((a) => a.id === id);
    if (!def?.delisted) continue;
    gp.cash += q * (pxOf(g, day, id) ?? 0);
    delete gp.qty[id];
  }
}

/** GX membership now (the reviewed list once a review has run), tradable stocks only. */
export function gxMembers(g: GameState): string[] {
  const idx = g.market.config.indices.find((i) => i.id === 'GX') ?? g.market.config.indices[0];
  if (!idx) return listedStocks(g);
  const tradable = new Set(listedStocks(g));
  return indexMembers(g.market, idx).filter((id) => tradable.has(id));
}

/** Cap weights at a day's closes: shares outstanding times the close. */
function capWeights(g: GameState, day: number, ids: string[]): Record<string, number> {
  const w: Record<string, number> = {};
  for (const id of ids) {
    const def = g.market.config.assets.find((a) => a.id === id);
    const px = pxOf(g, day, id);
    if (!def || !(px && px > 0)) continue;
    w[id] = (def.sharesOutstanding ?? 1) * px;
  }
  return w;
}

function randomPicks(g: GameState, pid: string, day: number): string[] {
  const pool = listedStocks(g);
  const n = Math.min(GHOSTS.picks, pool.length);
  const rng = keyedRng(g, `ghost:random:${pid}:${day}`);
  const picks: string[] = [];
  while (picks.length < n) {
    const id = pool[Math.floor(rng.uniform() * pool.length)]!;
    if (!picks.includes(id)) picks.push(id);
  }
  return picks;
}

/** Top picks by the trailing return from the closes `momentumDays` ago to today's close. Uses no future prices. */
function momentumPicks(g: GameState, day: number): string[] {
  const back = g.dayCloses?.[day - GHOSTS.momentumDays];
  if (!back) return [];
  const scored: { id: string; r: number }[] = [];
  for (const id of listedStocks(g)) {
    const p0 = back.px[id];
    const p1 = pxOf(g, day, id);
    if (p0 && p0 > 0 && p1 && p1 > 0) scored.push({ id, r: p1 / p0 - 1 });
  }
  scored.sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  return scored.slice(0, GHOSTS.picks).map((x) => x.id);
}

/**
 * Advance one player's ghosts to the close of `day`: settle delisted holdings, re-form the basket on a membership change,
 * and rebalance the random and momentum ghosts when their period is due. Called once per closed day, after the closes
 * are recorded. Creates the ghost book on first call, starting at the player's trading baseline.
 */
export function advanceGhosts(g: GameState, pid: string, day: number): void {
  const L = ensureLedger(g, pid);
  const acct = g.market.accounts[pid];
  if (!L || !acct) return;
  L.ghosts ??= { basket: fresh(acct.startingCash), random: fresh(acct.startingCash), momentum: fresh(acct.startingCash) };
  const { basket, random, momentum } = L.ghosts;
  for (const gp of [basket, random, momentum]) settleDelisted(g, gp, day);

  const members = gxMembers(g);
  if (basket.members.join(',') !== members.join(',')) {
    sellAll(g, basket, day);
    buyWeights(g, basket, day, capWeights(g, day, members));
    basket.members = members;
  }
  if (day >= random.nextDay) {
    sellAll(g, random, day);
    const picks = randomPicks(g, pid, day);
    buyWeights(g, random, day, Object.fromEntries(picks.map((id) => [id, 1])));
    random.nextDay = day + GHOSTS.rebalanceDays;
  }
  if (day >= momentum.nextDay) {
    sellAll(g, momentum, day);
    const picks = momentumPicks(g, day);
    buyWeights(g, momentum, day, Object.fromEntries(picks.map((id) => [id, 1])));
    momentum.nextDay = day + GHOSTS.rebalanceDays;
  }
}

/** The three ghost values at a day's close, from the ghost book as it stands after `advanceGhosts`. */
export function ghostValues(g: GameState, L: PlayerLedger, day: number): { basket: number; random: number; momentum: number } {
  const gb = L.ghosts;
  if (!gb) return { basket: 0, random: 0, momentum: 0 };
  return { basket: valueOf(g, gb.basket, day), random: valueOf(g, gb.random, day), momentum: valueOf(g, gb.momentum, day) };
}

/** Whether a ghost value ranks ahead of the player: strictly above, so a tie counts for the ghost (ties rank against the player). */
export function beatenCount(player: number, ghosts: { basket: number; random: number; momentum: number }): number {
  return [ghosts.basket, ghosts.random, ghosts.momentum].filter((v) => v < player).length;
}

/** The percentile among the player and three ghosts; a discrete step of 100/3 (0, 33, 67 or 100). */
export function percentileOf(beaten: number): number {
  return Math.round((100 * beaten) / 3);
}

/**
 * The benchmark report as of the last closed day (never a live price): the player's equity and the three ghosts at that
 * close, how many ghosts the player beat, and the percentile (null with no trades yet). Null before the first close.
 */
export function ghostReport(g: GameState, pid: string): GhostReport | null {
  const L = ledgerOf(g, pid);
  if (!L?.ghosts) return null;
  const days = Object.keys(L.days).map(Number).filter((d) => d >= L.startDay).sort((a, b) => a - b);
  const day = days[days.length - 1];
  if (day === undefined) return null;
  const rec = L.days[day]!;
  const beaten = beatenCount(rec.equity, rec.ghosts);
  const noTrades = !hasTrades(g, pid);
  return {
    day, player: rec.equity, basket: rec.ghosts.basket, random: rec.ghosts.random, momentum: rec.ghosts.momentum,
    beaten, percentile: noTrades ? null : percentileOf(beaten), noTrades, startCash: L.startCash,
    change: {
      player: changeOf(rec.equity, L.startCash), basket: changeOf(rec.ghosts.basket, L.startCash),
      random: changeOf(rec.ghosts.random, L.startCash), momentum: changeOf(rec.ghosts.momentum, L.startCash),
    },
  };
}

/** One closed day's equity and the three ghosts, the points of the chart lines. */
export interface GhostPoint { day: number; player: number; basket: number; random: number; momentum: number }

/** The ghosts and the player's equity for the last `n` closed days, oldest first (for the chart lines). */
export function ghostSeries(g: GameState, pid: string, n: number): GhostPoint[] {
  const L = ledgerOf(g, pid);
  if (!L) return [];
  return Object.keys(L.days).map(Number).filter((d) => d >= L.startDay).sort((a, b) => a - b).slice(-n).map((d) => {
    const r = L.days[d]!;
    return { day: d, player: r.equity, basket: r.ghosts.basket, random: r.ghosts.random, momentum: r.ghosts.momentum };
  });
}
