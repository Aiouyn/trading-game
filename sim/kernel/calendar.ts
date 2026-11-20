// The one calendar a player reads. The simulation keeps its own 30-day months and 360-day years for its cycles;
// this file only turns a sim day into a real date. Day 0 is Monday 1 January of year 1 (the Gregorian calendar,
// run back to year 1), so weekdays, month lengths and leap years are the real ones. A leaf file: it imports nothing.
// The screens use the same rules from src/shell/calendar.ts.

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const CYCLE = 146097; // days in 400 Gregorian years
const LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInYear = (y: number): number => (isLeap(y) ? 366 : 365);
export function daysInMonth(year: number, month: number): number { return month === 2 && isLeap(year) ? 29 : LEN[month - 1] ?? 30; }

export interface CalDate {
  /** Calendar year, 1 for the year the game opens. */
  year: number;
  /** 1 to 12. */
  month: number;
  /** Day of the month, 1 to 31. */
  day: number;
  /** 0 is Monday. */
  weekday: number;
  /** Day of the year, 0-based. */
  doy: number;
}

const memo = new Map<number, CalDate>();

/** The real date of a sim day. */
export function calDate(simDay: number): CalDate {
  const d0 = Math.floor(simDay);
  const hit = memo.get(d0);
  if (hit) return hit;
  const cycles = Math.floor(d0 / CYCLE);
  let rest = d0 - cycles * CYCLE;
  let year = 1 + cycles * 400;
  while (rest >= daysInYear(year)) { rest -= daysInYear(year); year++; }
  const doy = rest;
  let month = 1;
  while (rest >= daysInMonth(year, month)) { rest -= daysInMonth(year, month); month++; }
  const out: CalDate = { year, month, day: rest + 1, weekday: ((d0 % 7) + 7) % 7, doy };
  if (memo.size > 4000) memo.clear();
  memo.set(d0, out);
  return out;
}

/** The sim day of a calendar date (the inverse of calDate). */
export function simDayOf(year: number, month: number, day: number): number {
  const cycles = Math.floor((year - 1) / 400);
  let n = cycles * CYCLE;
  for (let y = 1 + cycles * 400; y < year; y++) n += daysInYear(y);
  for (let m = 1; m < month; m++) n += daysInMonth(year, m);
  return n + day - 1;
}

/** The sim day on which this day's calendar month began. */
export function monthStartDay(simDay: number): number { const c = calDate(simDay); return Math.floor(simDay) - (c.day - 1); }
/** The sim day on which this day's calendar year began. */
export function yearStartDay(simDay: number): number { return Math.floor(simDay) - calDate(simDay).doy; }
/** The calendar year a sim day falls in. */
export function calYear(simDay: number): number { return calDate(simDay).year; }

export const weekdayName = (simDay: number): string => WEEKDAYS[((Math.floor(simDay) % 7) + 7) % 7];
export const weekdayShort = (simDay: number): string => WEEKDAYS_SHORT[((Math.floor(simDay) % 7) + 7) % 7];
export const monthName = (simDay: number): string => MONTHS[calDate(simDay).month - 1];

/** "Monday 15 January", or "15 January" without the weekday. */
export function dateText(simDay: number, weekday = true): string {
  const c = calDate(simDay);
  const core = `${c.day} ${MONTHS[c.month - 1]}`;
  return weekday ? `${WEEKDAYS[c.weekday]} ${core}` : core;
}
/** "Monday 15 January, year 2". */
export function dateYear(simDay: number, weekday = true): string { return `${dateText(simDay, weekday)}, year ${calDate(simDay).year}`; }
/** "Mon 15 Jan". */
export function shortDate(simDay: number, weekday = true): string {
  const c = calDate(simDay);
  return `${weekday ? `${WEEKDAYS_SHORT[c.weekday]} ` : ''}${c.day} ${MONTHS_SHORT[c.month - 1]}`;
}
/** "Mon 15 Jan, 09:30". */
export function stampText(simDay: number, minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${shortDate(simDay)}, ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
