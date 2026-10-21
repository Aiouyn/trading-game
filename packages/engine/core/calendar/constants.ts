// T02-05: immutable clock constants (02 §2.1, §3.1.3).
import { EngineFault } from '../types';

export const TICK_REAL_SECONDS = 5, TICKS_PER_GAME_HOUR = 30, TICKS_PER_GAME_DAY = 720, GAME_DAYS_PER_WEEK = 7, GAME_DAYS_PER_QUARTER = 91,
  GAME_DAYS_PER_GAME_YEAR = 364, TICKS_PER_GAME_YEAR = 262_080, GAME_DAYS_PER_CHAPTER = 1_344, TICKS_PER_CHAPTER = 967_680, GAME_DAYS_PER_REAL_DAY = 24;
export const DT_YEARS = 1 / 262_080, DT_DAYS = 1 / 720;
export const TICKS_PER_REAL_HOUR = 720, TICKS_PER_REAL_DAY = 17_280, TICKS_PER_REAL_WEEK = 120_960;
export const MONTH_LENGTHS: readonly number[] = Object.freeze([28, 28, 35, 28, 28, 35, 28, 28, 35, 28, 28, 35]);

/** h real hours → ticks (h × 720); the result must be an integer. */
export function realHoursToTicks(h: number): number {
  const t = h * TICKS_PER_REAL_HOUR;
  if (!Number.isSafeInteger(t)) throw new EngineFault('I0.real_hours', `${h} real hours is not a whole number of ticks`);
  return t;
}
