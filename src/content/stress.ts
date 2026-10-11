/**
 * The Portfolio stress test (lead-phase6.md 6D, ROADMAP N1): the player's current book under the four world-event kinds,
 * using each kind's typical move by asset class. These are the moves the public rules give (quant-world-events.md, "Rules and
 * numbers"), not the hidden schedule of any world: a real event draws its own size and timing from the seed.
 *
 * Published figures: crash stocks −25% to −40% (midpoint −32.5%), tech, semis and discretionary ×1.4, staples ×0.4, gold +10%,
 * crypto −30%; bubble stocks +20% to +35%, crypto +50%, and the −15% give-back; flash −8% in the first sixth of the day and
 * crypto −10% (the engine's flash shock). Two rows have no published percentage and use round figures, and the view says so:
 * the crisis week (its moves are ×1.5 for the week, with no fixed size), and the bubble pop's stock and crypto give-back is
 * taken as published, −15%.
 *
 * Illustrative only. The view labels every number so, and never states a probability or a forecast.
 */

export type StressKind = 'crash' | 'bubble' | 'crisis' | 'flash';

export const STRESS_KINDS: StressKind[] = ['crash', 'bubble', 'crisis', 'flash'];

export interface StressRow {
  id: StressKind;
  /** the label the view shows: a crash, a bubble pop (the give-back), a crisis week, a flash crash */
  label: string;
  /** whether the row's figures are published as given, or round figures chosen for the table */
  source: 'published' | 'round';
}

export const STRESS_ROWS: Record<StressKind, StressRow> = {
  crash: { id: 'crash', label: 'Crash', source: 'published' },
  bubble: { id: 'bubble', label: 'Bubble pop', source: 'published' },
  crisis: { id: 'crisis', label: 'Crisis week', source: 'round' },
  flash: { id: 'flash', label: 'Flash crash', source: 'published' },
};

/** The move of one asset class under one kind, as a fraction of its value (−0.3 = −30%). */
export interface StressMove {
  stock: number;
  crypto: number;
  commodity: number;
  gold: number;
  bond: number;
  realestate: number;
  forex: number;
}

export const STRESS_MOVES: Record<StressKind, StressMove> = {
  crash: { stock: -0.325, crypto: -0.3, commodity: -0.12, gold: 0.1, bond: 0.04, realestate: -0.195, forex: 0 },
  bubble: { stock: -0.15, crypto: -0.15, commodity: 0, gold: 0, bond: 0, realestate: 0, forex: 0 },
  crisis: { stock: -0.1, crypto: -0.2, commodity: -0.05, gold: 0, bond: 0.02, realestate: -0.05, forex: 0 },
  flash: { stock: -0.08, crypto: -0.1, commodity: 0, gold: 0, bond: 0, realestate: 0, forex: 0 },
};

/** Sector multipliers on a stock's move in a crash (published: tech and discretionary ×1.4, staples ×0.4). */
export const CRASH_SECTOR_MULT: Record<string, number> = { tech: 1.4, semis: 1.4, discretionary: 1.4, staples: 0.4 };
