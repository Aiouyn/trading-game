/**
 * The court's fine scale (bible 03 section 8, lead-launchpad.md L5): six levels, each a share of net worth with a floor and a
 * cap. court.ts picks the level by case kind; the Launchpad's rug verdict picks its level from constants.ts (RUG_SEVERITY).
 * Kept in its own module so both read one table without an import cycle.
 */
export const SEVERITY = [
  { pct: 0.001, floor: 1_000, cap: 5_000_000 },
  { pct: 0.005, floor: 5_000, cap: 25_000_000 },
  { pct: 0.01, floor: 10_000, cap: 100_000_000 },
  { pct: 0.03, floor: 50_000, cap: Infinity },
  { pct: 0.08, floor: 100_000, cap: Infinity },
  { pct: 0.15, floor: 250_000, cap: Infinity },
];
