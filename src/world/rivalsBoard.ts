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
  /** 1-based rank among the rivals and the player together */
  rank: number;
  equity: number;
  /** change since its start (its own starting cash), as a ratio minus 1 */
  sinceStart: number;
  /** the last seven closes of net worth (the 1W sparkline) */
  spark: number[];
}

export interface RivalsBoardView {
  /** the rivals, highest net worth first */
  rows: RivalRowView[];
  /** sinceStart: against the player's starting cash (the arrival baseline) */
  you: { netWorth: number; rank: number; sinceStart: number };
  /** the rival directly above the player, and the gap in dollars (absent when the player leads or no rival is above) */
  nextUp: { id: string; name: string; gap: number } | null;
  /** the last quarter of closes per rival (day and net worth), for the profile card: never their positions */
  chart: Record<string, { day: number; equity: number }[]>;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * The board for one player, or null when the world has no rivals. `startCash` is the player's starting cash (the arrival
 * baseline), so the "since day 1" change is comparable across the board.
 */
export function rivalsBoard(g: GameState, pid: string, startCash: number): RivalsBoardView | null {
  const p = g.players[pid];
  const defs = g.market.config.rivals ?? [];
  const books = g.market.ecology?.rivals ?? [];
  if (!p || defs.length === 0 || books.length === 0) return null;
  const you = p.netWorth;
  const rows: RivalRowView[] = [];
  const chart: RivalsBoardView['chart'] = {};
  for (const d of defs) {
    const book = books.find((b) => b.id === d.id);
    if (!book) continue;
    const equity = rivalEquity(g.market, d.id);
    const hist = (book.hist ?? []).slice(-RIVAL_HIST_DAYS);
    rows.push({
      id: d.id, name: d.name, rank: 0, equity: round2(equity),
      sinceStart: d.startingCash > 0 ? equity / d.startingCash - 1 : 0,
      spark: hist.slice(-7).map((h) => round2(h.equity)),
    });
    chart[d.id] = hist.map((h) => ({ day: h.day, equity: round2(h.equity) }));
  }
  rows.sort((a, b) => b.equity - a.equity || a.id.localeCompare(b.id));
  // a rival's rank counts the rivals above it and the player when the player is above it
  for (const r of rows) r.rank = 1 + rows.filter((x) => x.equity > r.equity).length + (you > r.equity ? 1 : 0);
  const youRank = 1 + rows.filter((r) => r.equity > you).length;
  // the nearest rival above: the lowest equity that still beats the player
  const above = rows.filter((r) => r.equity > you).sort((a, b) => a.equity - b.equity)[0];
  return {
    rows,
    you: { netWorth: round2(you), rank: youRank, sinceStart: startCash > 0 ? you / startCash - 1 : 0 },
    nextUp: above ? { id: above.id, name: above.name, gap: round2(above.equity - you) } : null,
    chart,
  };
}
