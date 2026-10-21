// T02-05: business-day functions (02 §3.2). `holidays` defaults OFF (D071); true applies the D016 table.
import { GAME_DAYS_PER_GAME_YEAR } from './constants';
import { HOLIDAYS_ENABLED_DEFAULT, holidayOn, type BlocCode } from './holidays';

export function isTradingDay(bloc: BlocCode, dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): boolean {
  return dayIndex % 7 < 5 && holidayOn(bloc, (dayIndex % GAME_DAYS_PER_GAME_YEAR) + 1, holidays) === undefined;
}
export const isBusinessDay: typeof isTradingDay = isTradingDay;

/** Smallest d > dayIndex with isTradingDay. */
export function nextTradingDay(bloc: BlocCode, dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number {
  let d = dayIndex + 1;
  while (!isTradingDay(bloc, d, holidays)) d++;
  return d;
}
const monthKey = (dayIndex: number): number => {
  const year = Math.floor(dayIndex / GAME_DAYS_PER_GAME_YEAR);
  const dIY = dayIndex % GAME_DAYS_PER_GAME_YEAR;
  const q = Math.floor(dIY / 91), dIQ = dIY % 91;
  return year * 12 + q * 3 + (dIQ < 28 ? 0 : dIQ < 56 ? 1 : 2);
};
/** Next trading day unless that crosses a month end, then the previous trading day before d. */
export function adjustModifiedFollowing(bloc: BlocCode, dayIndex: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number {
  if (isTradingDay(bloc, dayIndex, holidays)) return dayIndex;
  const n = nextTradingDay(bloc, dayIndex, holidays);
  if (monthKey(n) === monthKey(dayIndex)) return n;
  let p = dayIndex - 1;
  while (!isTradingDay(bloc, p, holidays)) p--;
  return p;
}
/** Count of trading days d with d0 <= d < d1. */
export function tradingDaysBetween(bloc: BlocCode, d0: number, d1: number, holidays: boolean = HOLIDAYS_ENABLED_DEFAULT): number {
  let n = 0;
  for (let d = d0; d < d1; d++) if (isTradingDay(bloc, d, holidays)) n++;
  return n;
}
