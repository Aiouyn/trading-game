// The central bank's schedule. It reads the same calendar the exchange does (kernel/calendar.ts):
// real weekdays, and the holidays society closes, keyed month * 100 + day.
import { calDate } from '../../kernel/calendar.ts';

const CLOSED = new Set([101, 501, 716, 901, 1225, 1231]);

function exchangeDay(day: number): boolean {
  const c = calDate(day);
  return c.weekday < 5 && !CLOSED.has(c.month * 100 + c.day);
}

/** The central bank meets on the first trading day after the first of each month; it announces at 14:00. */
export function cbMeetingDay(month: number): number {
  let d = month * 30 + 1;
  while (!exchangeDay(d) && d < month * 30 + 29) d++;
  return d;
}
/** The tick of the session the decision lands in: 14:00 of eight ticks from 09:30. */
export const CB_TICK = 6;
export const CB_MINUTE = 840;
