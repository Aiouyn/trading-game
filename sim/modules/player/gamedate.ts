// How the game writes dates and money in plain words. Dates come from the one calendar in sim/kernel/calendar.ts.
import { calDate, dateText, dateYear, monthName, weekdayName, MONTHS } from '../../kernel/calendar.ts';

export { dateText, dateYear, weekdayName };
export const monthOfDay = monthName;

/** The clock as 24-hour time. */
export function clockText(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Whole dollars with a thousands separator: $1,234. Cents only for small amounts that have them. */
export function usd(cents: number): string {
  const neg = cents < 0;
  const a = Math.abs(Math.round(cents));
  const whole = Math.floor(a / 100), frac = a % 100;
  const body = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const tail = frac && whole < 100 ? `.${String(frac).padStart(2, '0')}` : '';
  return `${neg ? '-' : ''}$${body}${tail}`;
}

/** Whole dollars from cents, with the sign and separators: $1,235. Used where a headline wants no cents. */
export function whole(cents: number): string {
  const a = Math.abs(Math.round(cents / 100));
  return `${cents < 0 ? '-' : ''}$${String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Turn "Y2 M3 D4" (a sim day written as its 30-day month) into the calendar's words for that day. */
export function tidyDates(text: string): string {
  return text.replace(/\bY(\d+) M(\d+) D(\d+)\b/g, (_m, y: string, mo: string, d: string) => {
    const day = (Number(y) - 1) * 360 + (Number(mo) - 1) * 30 + Number(d) - 1;
    const c = calDate(day);
    return `${c.day} ${MONTHS[c.month - 1]}, year ${c.year}`;
  });
}
