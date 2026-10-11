import { RIVAL_HIST_DAYS, rivalEquity } from '@/engine';
import type { GameState } from './types';

/**
 * The Rivals board (velvet-rivals-board.md, M12): the NPC rival funds as the player may see them. Names and net worth
 * only. The rows carry no style, cash, units, targets, trades or rebalance dates, so no field here says how a rival
 * trades (the engine's rivalLeaderboard keeps the same rule). A rival's net worth is its engine equity at the last close.
 */
export interface RivalRowView {
  id: string;
  name: string;
  /** 1-based rank among the rivals and the player together (unique: a tie goes to the rival with the lower id, and the player sits below a tie) */
  rank: number;
  equity: number;
  /** change since the player's day 1: this rival's equity against its equity when the player joined, minus 1 */
  sinceStart: number;
  /** the last seven closes of net worth (the 1W sparkline) */
  spark: number[];
}

export interface RivalsBoardView {
  /** the rivals, highest net worth first */
  rows: RivalRowView[];
  /** sinceStart: the player's net worth against the player's starting cash (their day 1) */
  you: { netWorth: number; rank: number; sinceStart: number };
  /** the rival directly above the player, and the gap in dollars (absent when the player leads or no rival is above) */
  nextUp: { id: string; name: string; gap: number } | null;
  /** the last quarter of closes per rival (day and net worth), for the profile card: never their positions */
  chart: Record<string, { day: number; equity: number }[]>;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Each rival's equity at the moment `p` joined (the snapshot the player's account keeps, Player.rivalBase). A world built before
 * the snapshot existed falls back to the rival's starting cash, so the board still reads.
 */
export function rivalBaseline(g: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of g.market.ecology?.rivals ?? []) {
    try { out[b.id] = rivalEquity(g.market, b.id); } catch { /* a rival without a book is left out */ }
  }
  return out;
}

/**
 * The board for one player, or null when the world has no rivals. `startCash` is the player's starting cash (their day 1
 * net worth), so the player's own change is against day 1 too.
 */
export function rivalsBoard(g: GameState, pid: string, startCash: number): RivalsBoardView | null {
  const p = g.players[pid];
  const defs = g.market.config.rivals ?? [];
  const books = g.market.ecology?.rivals ?? [];
  if (!p || defs.length === 0 || books.length === 0) return null;
  const you = p.netWorth;
  const base = p.rivalBase ?? {};
  const rows: RivalRowView[] = [];
  const chart: RivalsBoardView['chart'] = {};
  for (const d of defs) {
    const book = books.find((b) => b.id === d.id);
    if (!book) continue;
    const equity = rivalEquity(g.market, d.id);
    const hist = (book.hist ?? []).slice(-RIVAL_HIST_DAYS);
    const day1 = base[d.id] ?? d.startingCash;
    rows.push({
      id: d.id, name: d.name, rank: 0, equity: round2(equity),
      sinceStart: day1 > 0 ? equity / day1 - 1 : 0,
      spark: hist.slice(-7).map((h) => round2(h.equity)),
    });
    chart[d.id] = hist.map((h) => ({ day: h.day, equity: round2(h.equity) }));
  }
  rows.sort((a, b) => b.equity - a.equity || a.id.localeCompare(b.id));
  // unique ranks: a rival is above every rival below it in the sort, and above the player when its equity is strictly higher
  // (a tie with the player puts the player below it)
  rows.forEach((r, i) => { r.rank = 1 + i + (you > r.equity ? 1 : 0); });
  const youRank = 1 + rows.filter((r) => r.equity >= you).length;
  // the nearest rival above: the lowest equity that still beats the player
  const above = rows.filter((r) => r.equity > you).sort((a, b) => a.equity - b.equity)[0];
  return {
    rows,
    you: { netWorth: round2(you), rank: youRank, sinceStart: startCash > 0 ? you / startCash - 1 : 0 },
    nextUp: above ? { id: above.id, name: above.name, gap: round2(above.equity - you) } : null,
    chart,
  };
}
