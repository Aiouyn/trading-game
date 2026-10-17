import { RIVAL_HIST_DAYS, rivalEquity } from '@/engine';
import { rankBasisOf } from './social';
import { ladderFunds } from './rivalLadder';
import { today } from './core';
import type { GameState } from './types';

/**
 * The Rivals board (velvet-rivals-board.md, M12): the NPC rival funds as the player may see them. Names and net worth
 * only. The rows carry no style, cash, units, targets, trades or rebalance dates, so no field here says how a rival
 * trades (the engine's rivalLeaderboard keeps the same rule). A rival's net worth is its engine equity at the last close.
 *
 * R-10-7: the board also carries the rival ladder (world/rivalLadder.ts): fictional funds, six per rank band. The board ranks
 * the player among every rival on the ladder and the engine's three, and shows the three engine funds plus the four ladder
 * funds just above and the four just below the player, so there are always rivals near them at any rank.
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
  /** the rivals on the board, highest net worth first: the engine's funds and the ladder funds nearest the player */
  rows: RivalRowView[];
  /** netWorth: the player's rank-basis net worth; sinceStart: the player's change since arrival (the Portfolio's figure) */
  you: { netWorth: number; rank: number; sinceStart: number };
  /** the rival directly above the player, and the gap in dollars (absent when the player leads or no rival is above) */
  nextUp: { id: string; name: string; gap: number } | null;
  /** the last quarter of closes per rival shown (day and net worth), for the profile card: never their positions */
  chart: Record<string, { day: number; equity: number }[]>;
}

/** The ladder funds shown above and below the player. */
export const LADDER_NEAR = 4;

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

/** One row before the ranks are set: the engine's funds and the ladder's, on the same footing. */
interface Candidate {
  id: string;
  name: string;
  equity: number;
  sinceStart: number;
  spark: number[];
  chart: { day: number; equity: number }[];
}

/**
 * The board for one player, or null when the world has no rivals. `arrival` is the player's arrival figure (the Portfolio's
 * "since you arrived"): its change is the player's own "since start", on the same base as the Portfolio and the day close.
 */
export function rivalsBoard(g: GameState, pid: string, arrival: { changePct: number }): RivalsBoardView | null {
  const p = g.players[pid];
  const defs = g.market.config.rivals ?? [];
  const books = g.market.ecology?.rivals ?? [];
  if (!p || defs.length === 0 || books.length === 0) return null;
  const you = rankBasisOf(g, p); // R-9-4: the rivals board ranks on the rank basis, as every board does
  const base = p.rivalBase ?? {};
  const engine: Candidate[] = [];
  for (const d of defs) {
    const book = books.find((b) => b.id === d.id);
    if (!book) continue;
    const equity = rivalEquity(g.market, d.id);
    const hist = (book.hist ?? []).slice(-RIVAL_HIST_DAYS);
    const day1 = base[d.id] ?? d.startingCash;
    engine.push({
      id: d.id, name: d.name, equity: round2(equity),
      sinceStart: day1 > 0 ? equity / day1 - 1 : 0,
      spark: hist.slice(-7).map((h) => round2(h.equity)),
      chart: hist.map((h) => ({ day: h.day, equity: round2(h.equity) })),
    });
  }
  const day = today(g);
  const joinDay = g.ledgers?.[pid]?.startDay ?? day;
  const ladder: Candidate[] = ladderFunds(g.seed, day, joinDay).map((f) => ({
    id: f.id, name: f.name, equity: round2(f.equity),
    sinceStart: f.joinEquity > 0 ? f.equity / f.joinEquity - 1 : 0,
    spark: f.hist.slice(-7).map((h) => round2(h.equity)),
    chart: f.hist.map((h) => ({ day: h.day, equity: round2(h.equity) })),
  }));
  // every rival, highest first: the ranks are over all of them (the board shows a window of them)
  const everyone = [...engine, ...ladder].sort((a, b) => b.equity - a.equity || a.id.localeCompare(b.id));
  const rankOf = new Map<string, number>();
  // unique ranks: a rival is above every rival below it in the sort, and above the player when its equity is strictly higher
  // (a tie with the player puts the player below it)
  everyone.forEach((r, i) => rankOf.set(r.id, 1 + i + (you > r.equity ? 1 : 0)));
  const youRank = 1 + everyone.filter((r) => r.equity >= you).length;
  // the ladder funds nearest the player: the LADDER_NEAR lowest above, and the LADDER_NEAR highest below
  const ladderDesc = [...ladder].sort((a, b) => b.equity - a.equity || a.id.localeCompare(b.id));
  const split = ladderDesc.filter((r) => r.equity > you).length;
  const near = [...ladderDesc.slice(Math.max(0, split - LADDER_NEAR), split), ...ladderDesc.slice(split, split + LADDER_NEAR)];
  const shown = [...engine, ...near].sort((a, b) => b.equity - a.equity || a.id.localeCompare(b.id));
  const rows: RivalRowView[] = shown.map((r) => ({
    id: r.id, name: r.name, rank: rankOf.get(r.id)!, equity: r.equity, sinceStart: r.sinceStart, spark: r.spark,
  }));
  const chart: RivalsBoardView['chart'] = {};
  for (const r of shown) chart[r.id] = r.chart;
  // the nearest rival above, of every rival (the engine's and the ladder's)
  const above = everyone.filter((r) => r.equity > you).sort((a, b) => a.equity - b.equity)[0];
  return {
    rows,
    you: { netWorth: round2(you), rank: youRank, sinceStart: arrival.changePct },
    nextUp: above ? { id: above.id, name: above.name, gap: round2(above.equity - you) } : null,
    chart,
  };
}
