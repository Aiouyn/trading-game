/**
 * Game clock. One game day is ticksPerDay ticks (720 by default, 1 tick = 5 real seconds),
 * shown as a 09:30 to 16:00 session so the clock reads like a trading day: tick 0 of each day is 09:30 and its last
 * tick (ticksPerDay - 1) reads 15:59; the next tick is the following day's 09:30.
 */
export const SESSION_OPEN_MIN = 9 * 60 + 30;
export const SESSION_MINUTES = 390;

export interface ClockParts {
  /** 1-based game day */
  day: number;
  /** tick within the day, 0..ticksPerDay - 1 */
  tickInDay: number;
  hhmm: string;
}

export function clockParts(tick: number, ticksPerDay: number): ClockParts {
  // Engine calendar (packages/engine/core/calendar/date.ts:15-16, ticksToGameDate): dayIndex = floor(tick / ticksPerDay),
  // t = tick % ticksPerDay, and its 1-based day counters are dayIndex + 1 (date.ts:18, :26). So ticks 0..ticksPerDay - 1
  // are Day 1 and tick ticksPerDay opens Day 2, the same rollover as the shell clockLabel (src/shell/mockChannels.ts).
  const d = dayIndex(tick, ticksPerDay);
  const tickInDay = Math.max(0, tick) - d * ticksPerDay;
  return { day: d + 1, tickInDay, hhmm: sessionTime(tickInDay, ticksPerDay) };
}

/** 0-based day a tick belongs to: the engine calendar's dayIndex (date.ts:15). Negative ticks clamp to day 0. */
export function dayIndex(tick: number, ticksPerDay: number): number {
  return tick <= 0 ? 0 : Math.floor(tick / ticksPerDay);
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
  return `Day ${c.day} \u00b7 ${c.hhmm}`;
}

export const SPEEDS = [1, 4, 20] as const;
export type Speed = (typeof SPEEDS)[number];

/** Real milliseconds per tick at a speed. */
export function tickMs(speed: number): number {
  return 5000 / speed;
}
