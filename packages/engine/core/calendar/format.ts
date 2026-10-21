// T02-05: date formats (02 §3.1.2). Month/weekday names are i18n keys (L8).
import type { Tick } from '../types';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, TICKS_PER_REAL_HOUR } from './constants';
import { ticksToGameDate } from './date';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');
const group = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const hhmm = (minuteOfDay: number): string => `${pad(Math.floor(minuteOfDay / 60), 2)}:${pad(minuteOfDay % 60, 2)}`;

export function formatCanonical(t: Tick): string {
  const d = ticksToGameDate(t);
  return `G${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.dayOfMonth, 2)}T${hhmm(d.minuteOfDay)}#${group(t)}`;
}
export function formatTickCitation(t: Tick): string { return `T${t}`; }

export interface DisplayParts { weekdayKey: string; dayOfMonth: number; monthKey: string; year: number; hh: number; mm: number }
/** ET = canonical + offset (mod 1440); the displayed date rolls forward when that crosses midnight. Cosmetic only. */
export function displayParts(t: Tick, displayClockOffsetMin: number): DisplayParts {
  const d = ticksToGameDate(t);
  const total = d.minuteOfDay + displayClockOffsetMin;
  const roll = Math.floor(total / 1440);
  const m = total % 1440;
  const e = roll === 0 ? d : ticksToGameDate((d.dayIndex + roll) * TICKS_PER_GAME_DAY);
  return { weekdayKey: `weekday.${e.weekday}`, dayOfMonth: e.dayOfMonth, monthKey: `month.${e.month}`, year: e.year, hh: Math.floor(m / 60), mm: m % 60 };
}
export function formatChapter(t: Tick): { chapter: number; dayOfChapter: number } {
  const d = ticksToGameDate(t);
  return { chapter: d.chapter, dayOfChapter: d.dayOfChapter };
}
/** showReal when the duration is ≥ 1 game hour (30 ticks). */
export function formatRelative(ticks: number): { ticks: number; gameDays: number; realHours: number; showReal: boolean } {
  return { ticks, gameDays: ticks / TICKS_PER_GAME_DAY, realHours: ticks / TICKS_PER_REAL_HOUR, showReal: ticks >= TICKS_PER_GAME_HOUR };
}
