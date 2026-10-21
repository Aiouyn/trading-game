import { describe, expect, it } from 'vitest';
import { adjustModifiedFollowing, calendarOf, HOLIDAYS, HOLIDAYS_ENABLED_DEFAULT, holidayOn, holidaysOnDay, isBusinessDay, isTradingDay, nextTradingDay,
  tradingDaysBetween, validateHolidayTable, type BlocCode, type CalendarInfo } from './index';

const BLOCS: BlocCode[] = ['FDL', 'EUN', 'PYN', 'NKR', 'SRL'];
// 05's rule (T05-02, 05 §3.2.1, D071): isTradingDay(cal) = weekday 0..4, no holidays. Fixture copy; 05 is not built yet.
const isTradingDay05 = (cal: CalendarInfo): boolean => cal.weekday <= 4;

// 02 §3.2 table (D016), transcribed independently: [id, blocs, dayOfYear]
const D016: [string, BlocCode[], number][] = [['hol_GENESIS', BLOCS, 1], ['hol_PYN_TIDE', ['PYN'], 39], ['hol_SRL_CARNIVAL', ['SRL'], 50],
  ['hol_FDL_CHARTER', ['FDL'], 60], ['hol_NKR_ICEBREAK', ['NKR'], 95], ['hol_EUN_COMPACT', ['EUN'], 129], ['hol_NKR_ALLIANCE', ['NKR'], 156],
  ['hol_EUN_MIDSUMMER', ['EUN'], 177], ['hol_PYN_LEAGUE', ['PYN'], 186], ['hol_SRL_COALITION', ['SRL'], 213], ['hol_FDL_HARVEST', ['FDL'], 236],
  ['hol_PYN_MOON', ['PYN'], 271], ['hol_SRL_SUNFEAST', ['SRL'], 299], ['hol_EUN_LANTERN', ['EUN'], 318], ['hol_NKR_LONGNIGHT', ['NKR'], 344],
  ['hol_FDL_FOUNDERS', ['FDL'], 352]];

describe('D071: holidays OFF by default (launch)', () => {
  it('default flag is off', () => expect(HOLIDAYS_ENABLED_DEFAULT).toBe(false));
  it('260 trading days per bloc per year (years 1..3)', () => {
    for (const b of BLOCS) for (let y = 0; y < 3; y++) expect(tradingDaysBetween(b, y * 364, (y + 1) * 364)).toBe(260);
  });
  it('flag-off isTradingDay equals 05 isTradingDay on every day of 3 years, every bloc', () => {
    for (let d = 0; d < 3 * 364; d++) {
      const cal = calendarOf(d * 720 + 300);
      for (const b of BLOCS) if (isTradingDay(b, d) !== isTradingDay05(cal)) throw new Error(`${b} day ${d}`);
      if (cal.isTradingDay !== isTradingDay05(cal)) throw new Error(`calendarOf day ${d}`);
    }
  });
  it('no holiday is seen; Mar 4 Y1 (Thu, day 59) is a trading day', () => {
    expect(holidayOn('FDL', 60)).toBeUndefined(); expect(holidaysOnDay(0)).toEqual([]);
    expect(isTradingDay('FDL', 59)).toBe(true); expect(adjustModifiedFollowing('FDL', 59)).toBe(59);
    expect(isBusinessDay).toBe(isTradingDay);
  });
  it('weekend handling', () => {
    expect(nextTradingDay('FDL', 4)).toBe(7);                // Fri → Mon
    expect(adjustModifiedFollowing('FDL', 5)).toBe(7);       // Sat → Mon same month
    expect(adjustModifiedFollowing('EUN', 27 + 28 + 35 - 1)).toBe(88);   // Sat Mar 34 (day 89): next Mon Apr 1 (91) crosses the month → Fri day 88
  });
});

describe('D016 table (flag ON)', () => {
  it('HOLIDAYS = 02 §3.2 verbatim (ids, blocs, day of year, nameKey)', () => {
    expect(HOLIDAYS.map((h) => [h.id, h.blocs, h.dayOfYear])).toEqual(D016);
    expect(HOLIDAYS.every((h) => h.scope === 'EXCHANGE_CLOSED')).toBe(true);
    expect(HOLIDAYS[0]!.nameKey).toBe('holiday.all.genesis'); expect(HOLIDAYS[3]!.nameKey).toBe('holiday.fdl.charter');
  });
  it('02#4 256 trading days per bloc per year; no holiday on a weekend; validateHolidayTable = []', () => {
    for (const b of BLOCS) for (let y = 0; y < 3; y++) expect(tradingDaysBetween(b, y * 364, (y + 1) * 364, true)).toBe(256);
    expect(validateHolidayTable(HOLIDAYS)).toEqual([]);
    for (const h of HOLIDAYS) expect((h.dayOfYear - 1) % 7).toBeLessThan(5);
  });
  it('validateHolidayTable errors', () => {
    const base = HOLIDAYS[1]!;
    expect(validateHolidayTable([{ ...base, dayOfYear: 6 }])).toEqual(['hol_PYN_TIDE: weekend']);
    expect(validateHolidayTable([{ ...base, dayOfYear: 92 }])).toEqual(['hol_PYN_TIDE: quarter first/last day']);
    expect(validateHolidayTable([{ ...base, dayOfYear: 91 }])).toEqual(['hol_PYN_TIDE: weekend', 'hol_PYN_TIDE: quarter first/last day']);
    expect(validateHolidayTable([{ ...base, blocs: ['XXX' as BlocCode] }])).toEqual(['hol_PYN_TIDE: unknown bloc XXX']);
    expect(validateHolidayTable([{ ...base, dayOfYear: 365 }])).toEqual(['hol_PYN_TIDE: dayOfYear 365 out of range']);
  });
  it('lookup', () => {
    expect(holidayOn('FDL', 60, true)?.id).toBe('hol_FDL_CHARTER'); expect(holidayOn('EUN', 60, true)).toBeUndefined();
    expect(holidayOn('NKR', 1, true)?.id).toBe('hol_GENESIS');
    expect(holidaysOnDay(364 + 59, true).map((h) => h.id)).toEqual(['hol_FDL_CHARTER']);
    expect(isTradingDay('FDL', 59, true)).toBe(false); expect(isTradingDay('EUN', 59, true)).toBe(true);
    expect(nextTradingDay('PYN', 0, true)).toBe(1);
  });
  it('02#5 adjustModifiedFollowing(FDL, Mar 4 Y1) = Mar 5 Y1', () => expect(adjustModifiedFollowing('FDL', 59, true)).toBe(60));
  it('modified following crossing a month end: SRL Oct 26 (day 298) → Thu Oct 25 (297)', () => {
    expect(nextTradingDay('SRL', 298, true)).toBe(301);
    expect(adjustModifiedFollowing('SRL', 298, true)).toBe(297);
  });
  it('tradingDaysBetween is half-open', () => {
    expect(tradingDaysBetween('FDL', 0, 7, true)).toBe(4); expect(tradingDaysBetween('FDL', 1, 7, true)).toBe(4);
    expect(tradingDaysBetween('FDL', 0, 0)).toBe(0); expect(tradingDaysBetween('FDL', 0, 1)).toBe(1);
  });
});
