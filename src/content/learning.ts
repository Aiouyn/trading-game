/**
 * Phase 3 learning and player-tool tunables (A2 world services). Every number the world layer uses for the analyst,
 * the Research Desk, the benchmark ghosts, the trade ledger, recurring buys, DRIP, block trades, the goal ladder, lessons
 * and the calendar lives here, so Ledger can tune it without touching logic. Rank ids refer to content/lifestyle.ts.
 */

export type AnalystTier = 'junior' | 'senior';

/** Hired analyst: one at a time. Salary is paid a game week ahead from the hire day, with no refund. */
export const ANALYST_TIERS: Record<AnalystTier, { weeklyCost: number; minRank: string; features: string[] }> = {
  junior: { weeklyCost: 300, minRank: 'R1', features: ['oneLiner', 'parts'] },
  senior: { weeklyCost: 2000, minRank: 'R1', features: ['oneLiner', 'parts', 'headlines', 'flow'] },
};

/** Research Desk: unlocked once at Operator, then paid a game week ahead. */
export const DESK = { minRank: 'R3', unlockCost: 50_000, weeklyUpkeep: 5_000, filesKeep: 40 };

/** A game week, in game days: the period for analyst salary, desk upkeep and recurring buys' default cadence. */
export const WEEK_DAYS = 7;

/** Benchmark ghosts (quant-ghosts.md): picks per portfolio, rebalance cadence, and the momentum lookback. */
export const GHOSTS = { picks: 5, rebalanceDays: 21, momentumDays: 63 };

/** Ledger retention: fills and closed round trips kept per player, closing cards kept, and the global day closes kept. */
export const LEDGER = { fillsKeep: 1000, tripsKeep: 500, closesKeep: 120, dayCloseKeep: 400 };

/**
 * Simple mode: buys are capped at this share of cash until a player reaches `untilRank`, whether or not onboarding was
 * skipped (the lead's ruling, Phase 3 section 3; DESIGN.md:109).
 */
export const SIMPLE_MODE = { capFraction: 0.2, untilRank: 'R1' };

/** Recurring buys: fixed-dollar buys of one asset every N game days, from cash only. */
export const RECURRING = { maxPlans: 5, minDollars: 10, minEveryDays: 1, maxEveryDays: 90 };

/** DRIP and block trades. A block is a TWAP over `slices` ticks, at the institutional license (R4). */
export const DRIP = { maxPositions: 40 };
export const BLOCK = { minRank: 'R4', minSlices: 2, maxSlices: 48, maxRetries: 3 };

/** The ten two-minute lessons (ids match the learn.lesson.<id>.title keys in en.json and fr.json). */
export const LESSON_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

/**
 * The goal ladder, in order (DESIGN.md:130 starter list, then the next rung after Hustler). Each rung is checked on the
 * server; `nw` is a net worth floor, `profit` is one closed profitable round trip, `positions` is held at once.
 */
export const GOAL_LADDER: { id: string; nw?: number; profit?: true; positions?: number }[] = [
  { id: 'goal-nw20k', nw: 20_000 },
  { id: 'goal-profit', profit: true },
  { id: 'goal-hold3', positions: 3 },
  { id: 'goal-nw250k', nw: 250_000 },
];

/** The journal's replay: the window pads the holding time by this share on each side (velvet-trade-journal-replay.md). */
export const JOURNAL = { replayPad: 0.2, listRows: 50 };

/** Always-busy calendar: the horizon in game days. */
export const CALENDAR_DAYS = 2;

/** Closing card: the most recent closed days kept per player's record. */
export const CLOSE_STORIES = 4;
