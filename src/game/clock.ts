import { t } from '@/i18n';

/**
 * Game clock. One game day is ticksPerDay ticks (720 by default, 1 tick = 5 real seconds),
 * shown as a 09:30 to 16:00 session so the clock reads like a trading day.
 */
export const SESSION_OPEN_MIN = 9 * 60 + 30;
export const SESSION_MINUTES = 390;

export interface ClockParts {
  /** 1-based game day */
  day: number;
  /** tick within the day, 0..ticksPerDay (ticksPerDay is the close) */
  tickInDay: number;
  hhmm: string;
}

export function clockParts(tick: number, ticksPerDay: number): ClockParts {
  // Matches the engine's day partition: the step after a multiple of ticksPerDay opens a new day,
  // so ticks 1..ticksPerDay are day 1 and tick ticksPerDay itself is that day's 16:00 close.
  const d = dayIndex(tick, ticksPerDay);
  const tickInDay = Math.max(0, tick) - d * ticksPerDay;
  return { day: d + 1, tickInDay, hhmm: sessionTime(tickInDay, ticksPerDay) };
}

/** 0-based day a tick's price belongs to. */
export function dayIndex(tick: number, ticksPerDay: number): number {
  return tick <= 0 ? 0 : Math.floor((tick - 1) / ticksPerDay);
}

export function sessionTime(tickInDay: number, ticksPerDay: number): string {
  const minutes = SESSION_OPEN_MIN + Math.floor((tickInDay * SESSION_MINUTES) / ticksPerDay);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "Day 12 · 14:35" */
export function clockLabel(tick: number, ticksPerDay: number): string {
  const c = clockParts(tick, ticksPerDay);
  return `${t('clock.day', { day: c.day })} \u00b7 ${c.hhmm}`;
}

export const SPEEDS = [1, 4, 20, 60] as const;
export type Speed = (typeof SPEEDS)[number];

/** Real milliseconds per tick at a speed. One game day is one real hour at 1×, fifteen minutes at 4×, one minute at 60×. */
export function tickMs(speed: number): number {
  return 5000 / speed;
}

/** The speed button that matches a live tick length (the nearest of SPEEDS). */
export function speedOf(ms: number): Speed {
  const raw = ms > 0 ? 5000 / ms : 1;
  let best: Speed = SPEEDS[0];
  let gap = Infinity;
  for (const s of SPEEDS) {
    const d = Math.abs(s - raw);
    if (d < gap) { gap = d; best = s; }
  }
  return best;
}
