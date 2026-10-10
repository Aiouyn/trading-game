import { SANDBOX } from './config';

/**
 * ISO 8601 week of a calendar date, as a key like "2026-W41". Pure: the caller passes the date (the UI passes
 * the real clock; tests pass fixed dates). The week comes from the calendar, never from the engine.
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const year = d.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The week number of a key ("2026-W41" -> 41). */
export function weekNumberOf(weekKey: string): number {
  return Number(weekKey.slice(-2));
}

/**
 * The weekly challenge's seed: the ISO week and the public salt. It is never the live world's seed. Everyone who
 * plays that week gets the same market.
 */
export function challengeSeed(weekKey: string): string {
  return `${SANDBOX.seedPrefix}challenge:${weekKey}:${SANDBOX.challengeSalt}`;
}
