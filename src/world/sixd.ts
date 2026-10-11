import { homeView, type HomeView } from './home';
import { insuranceBlock, insuredValue, INSURANCE } from './insurance';
import { auctionsView, type AuctionLotView } from './auctions';
import { streakView, type StreakView } from './streak';
import { stressBook, type StressBookResult } from './stress';
import { TOURNAMENT_WEEK_TICKS, tournamentView, type TournamentLeaderRow } from './tournamentWeek';
import type { GameState } from './types';

/**
 * The 6D views a player's own client shows (the rank shell's Security, Boutique, AI Lab and Portfolio apps), carried on the
 * player view. Every field here is the viewer's own or public: the auction lots of the current week (public figures only, see
 * auctions.ts), the tournament board (rows only; the trade logs are counted, never sent here), the stress test of the viewer's
 * own book, and the viewer's own home room. Nothing about another player's holdings appears.
 */
export interface SixdView {
  insurance: {
    on: boolean;
    /** the refusal code the switch would give now, or null when it can go on (or is on) */
    block: { code: string; hours?: number } | null;
    insuredValue: number;
    premiumRate: number;
    premiums: number;
    paidOut: number;
  };
  streak: StreakView | null;
  auctions: { week: number; lots: AuctionLotView[] };
  tournament: {
    entering: { week: number; lockTick: number; commitment: string; entries: number; mine: string | null };
    latest: { week: number; seeds: string[]; settledTick: number; board: TournamentLeaderRow[]; logCount: number } | null;
  };
  stress: StressBookResult | null;
  home: HomeView | null;
}

export function sixdView(g: GameState, pid: string): SixdView | null {
  const p = g.players[pid];
  if (!p || p.npc) return null;
  const block = insuranceBlock(g, pid);
  const tv = tournamentView(g, pid);
  const latest = tv.latest;
  const week = Math.floor(g.market.tick / TOURNAMENT_WEEK_TICKS);
  return {
    insurance: {
      on: !!p.insurance?.on,
      block: block ? { code: block.code, ...(block.hours !== undefined ? { hours: block.hours } : {}) } : null,
      insuredValue: insuredValue(g, pid),
      premiumRate: INSURANCE.premiumRate,
      premiums: p.insurance?.premiums ?? 0,
      paidOut: p.insurance?.paidOut ?? 0,
    },
    streak: streakView(g, pid),
    auctions: { week, lots: auctionsView(g, pid, week) },
    tournament: {
      entering: tv.entering,
      latest: latest ? {
        week: latest.week,
        seeds: latest.seeds,
        settledTick: latest.settledTick,
        board: latest.board,
        logCount: latest.logs.length,
      } : null,
    },
    stress: stressBook(g, pid),
    home: homeView(g, pid, pid),
  };
}
