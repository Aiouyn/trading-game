// How the game writes dates and money in plain words. A leaf file: it imports nothing.
// Day 0 is Monday 1 January of year 1; months have 30 days and years 360.
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const weekdayName = (day: number): string => WEEK[((day % 7) + 7) % 7];
export const monthOfDay = (day: number): string => MONTH[Math.floor((((day % 360) + 360) % 360) / 30)];

/** "Monday 15 January", or "15 January" without the weekday. */
export function dateText(day: number, weekday = true): string {
  const doy = ((day % 360) + 360) % 360;
  const core = `${(doy % 30) + 1} ${MONTH[Math.floor(doy / 30)]}`;
  return weekday ? `${weekdayName(day)} ${core}` : core;
}
/** "Monday 15 January, year 2": for a place that needs the year too. */
export function dateYear(day: number): string { return `${dateText(day)}, year ${Math.floor(day / 360) + 1}`; }

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

/** Turn "Y2 M3 D4" into the words the game uses for a date. */
export function tidyDates(text: string): string {
  return text.replace(/\bY(\d+) M(\d+) D(\d+)\b/g, (_m, y: string, mo: string, d: string) => `${Number(d)} ${MONTH[(Number(mo) - 1 + 12) % 12]}, year ${Number(y)}`);
}
