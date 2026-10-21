import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calendarOf, dateToTick, END_HOOK_ORDER, realHoursToTicks, runsThisTick, START_HOOK_ORDER, staggerSlot, tickToDate, ticksToGameDate,
  formatCanonical, formatChapter, formatRelative, formatTickCitation, displayParts, MONTH_LENGTHS, TICKS_PER_CHAPTER, TICKS_PER_GAME_YEAR } from './index';
import { fnv1a32 } from '../crypto/fnv';

describe('ticksToGameDate (02 §3.1.1)', () => {
  it('02#1', () => {
    expect(tickToDate(0)).toMatchObject({ year: 1, month: 1, dayOfMonth: 1, weekday: 0, t: 0, phase: 'PRE_MARKET', chapter: 1, dayOfYear: 1, quarter: 1, isWeekend: false });
    expect(tickToDate(262_079)).toMatchObject({ year: 1, month: 12, dayOfMonth: 35, weekday: 6, t: 719, isWeekend: true, phase: 'AFTER_HOURS' });
    expect(tickToDate(262_080)).toMatchObject({ year: 2, month: 1, dayOfMonth: 1, weekday: 0 });
  });
  it('02#2 dateToTick(tickToDate(x)) == x for 0..2×967,680', () => {
    for (let x = 0; x <= 2 * TICKS_PER_CHAPTER; x++) { const d = ticksToGameDate(x); if (dateToTick(d.year, d.dayOfYear, d.t) !== x) throw new Error(`x=${x}`); }
  });
  it('02#3 chapters start Monday t=0; chapter 2 at 967,680', () => {
    for (let c = 1; c <= 20; c++) {
      const d = ticksToGameDate((c - 1) * TICKS_PER_CHAPTER);
      expect([d.weekday, d.t, d.chapter, d.dayOfChapter]).toEqual([0, 0, c, 1]);
      if (c > 1) expect(ticksToGameDate((c - 1) * TICKS_PER_CHAPTER - 1).chapter).toBe(c - 1);
    }
    expect(ticksToGameDate(967_680).chapter).toBe(2);
  });
  it('months follow MONTH_LENGTHS; phases; minuteOfDay; weekOfYear; negative tick faults', () => {
    let doy = 1;
    for (let m = 1; m <= 12; m++) for (let dm = 1; dm <= MONTH_LENGTHS[m - 1]!; dm++, doy++) expect(ticksToGameDate((doy - 1) * 720)).toMatchObject({ month: m, dayOfMonth: dm });
    expect(doy - 1).toBe(364);
    expect([59, 60, 61, 539, 540, 541].map((t) => ticksToGameDate(t).phase)).toEqual(['PRE_MARKET', 'OPEN_AUCTION', 'CONTINUOUS', 'CONTINUOUS', 'CLOSE_AUCTION', 'AFTER_HOURS']);
    expect(ticksToGameDate(480).minuteOfDay).toBe(960);
    expect(ticksToGameDate(363 * 720).weekOfYear).toBe(52); expect(ticksToGameDate(7 * 720).weekOfYear).toBe(2);
    expect(ticksToGameDate(91 * 720).quarter).toBe(2); expect(ticksToGameDate(90 * 720).quarter).toBe(1);
    expect(() => ticksToGameDate(-1)).toThrow(/tick/); expect(() => ticksToGameDate(0.5)).toThrow(/tick/);
    expect(TICKS_PER_GAME_YEAR).toBe(364 * 720); expect(TICKS_PER_CHAPTER).toBe(1344 * 720);
    expect(realHoursToTicks(72)).toBe(51_840); expect(() => realHoursToTicks(1 / 7)).toThrow();
  });
  it('worked example tick 541,440 and the formatter', () => {
    expect(ticksToGameDate(541_440)).toMatchObject({ dayIndex: 752, year: 3, dayOfYear: 25, t: 0 });
    expect(formatCanonical(541_440)).toBe('G0003-01-25T00:00#541,440');
    expect(formatCanonical(541_440 + 480)).toBe('G0003-01-25T16:00#541,920');
    expect(formatCanonical(5)).toBe('G0001-01-01T00:10#5');
    expect(formatTickCitation(541_440)).toBe('T541440');
    expect(formatChapter(967_680 + 409 * 720)).toEqual({ chapter: 2, dayOfChapter: 410 });
  });
});

describe('calendarOf boundaries', () => {
  const B = (t: number): string[] => [...calendarOf(t).boundaries];
  it('tick 0 has every OPEN + HOUR + DAY_OPEN + PHASE_CHANGE', () => {
    expect(B(0)).toEqual(['CHAPTER_OPEN', 'YEAR_OPEN', 'QUARTER_OPEN', 'MONTH_OPEN', 'WEEK_OPEN', 'DAY_OPEN', 'HOUR', 'PHASE_CHANGE']);
  });
  it('closes', () => {
    expect(B(719)).toEqual(['DAY_CLOSE']);
    expect(B(262_079)).toEqual(['DAY_CLOSE', 'WEEK_CLOSE', 'MONTH_CLOSE', 'QUARTER_CLOSE', 'YEAR_CLOSE']);
    expect(B(967_679)).toContain('CHAPTER_CLOSE');
    expect(B(27 * 720 + 719)).toEqual(['DAY_CLOSE', 'WEEK_CLOSE', 'MONTH_CLOSE']);   // Jan 28 is a Sunday
    expect(B(4 * 720 + 719)).toEqual(['DAY_CLOSE']);
    expect(B(90 * 720 + 719)).toEqual(['DAY_CLOSE', 'WEEK_CLOSE', 'MONTH_CLOSE', 'QUARTER_CLOSE']);
  });
  it('mid-period ticks', () => {
    expect(B(30)).toEqual(['HOUR']); expect(B(60)).toEqual(['HOUR', 'PHASE_CHANGE']); expect(B(61)).toEqual(['PHASE_CHANGE']);
    expect(B(540)).toEqual(['HOUR', 'PHASE_CHANGE']); expect(B(541)).toEqual(['PHASE_CHANGE']); expect(B(31)).toEqual([]);
    expect(B(720)).toEqual(['DAY_OPEN', 'HOUR', 'PHASE_CHANGE']);
    expect(B(7 * 720)).toEqual(['WEEK_OPEN', 'DAY_OPEN', 'HOUR', 'PHASE_CHANGE']);
    expect(B(28 * 720)).toEqual(['MONTH_OPEN', 'WEEK_OPEN', 'DAY_OPEN', 'HOUR', 'PHASE_CHANGE']);
    expect(B(91 * 720)).toEqual(['QUARTER_OPEN', 'MONTH_OPEN', 'WEEK_OPEN', 'DAY_OPEN', 'HOUR', 'PHASE_CHANGE']);
    expect(B(364 * 720)).toEqual(['YEAR_OPEN', 'QUARTER_OPEN', 'MONTH_OPEN', 'WEEK_OPEN', 'DAY_OPEN', 'HOUR', 'PHASE_CHANGE']);
    expect(B(967_680)[0]).toBe('CHAPTER_OPEN');
  });
  it('fields; set API', () => {
    const c = calendarOf(5 * 720 + 95);
    expect([c.weekday, c.isTradingDay, c.gameHour, c.tickOfDay, c.gameDay]).toEqual([5, false, 3, 95, 5]);
    expect(calendarOf(4 * 720).isTradingDay).toBe(true);
    const s = calendarOf(0).boundaries; expect(s.size).toBe(8); expect(s.has('YEAR_OPEN')).toBe(true); expect(s.has('DAY_CLOSE')).toBe(false);
    expect(END_HOOK_ORDER).toEqual(['DAY_CLOSE', 'WEEK_CLOSE', 'MONTH_CLOSE', 'QUARTER_CLOSE', 'YEAR_CLOSE', 'CHAPTER_CLOSE']);
    expect(START_HOOK_ORDER).toEqual(['CHAPTER_OPEN', 'YEAR_OPEN', 'QUARTER_OPEN', 'MONTH_OPEN', 'WEEK_OPEN', 'DAY_OPEN', 'HOUR']);
  });
});

describe('stagger', () => {
  it('02#10 over any 30 consecutive ticks each business runs exactly once at t mod 30 == fnv1a32(id) mod 30', () => {
    fc.assert(fc.property(fc.array(fc.string({ minLength: 1, maxLength: 24 }), { minLength: 1000, maxLength: 1000 }), fc.integer({ min: 0, max: 749 }), (ids, start) => {
      for (const id of ids) {
        let runs = 0, at = -1;
        for (let t = start; t < start + 30; t++) if (runsThisTick(id, t)) { runs++; at = t; }
        if (runs !== 1 || at % 30 !== fnv1a32(id) % 30 || staggerSlot(id) !== fnv1a32(id) % 30) return false;
      }
      return true;
    }), { numRuns: 50, seed: 42 });
  });
});

describe('display', () => {
  it('ET offset 360 and midnight roll', () => {
    expect(displayParts(60, 360)).toMatchObject({ hh: 8, mm: 0, dayOfMonth: 1, weekdayKey: 'weekday.0', monthKey: 'month.1', year: 1 });
    expect(displayParts(540, 360)).toMatchObject({ hh: 0, mm: 0, dayOfMonth: 2, weekdayKey: 'weekday.1' });
    expect(displayParts(262_079, 360)).toMatchObject({ year: 2, monthKey: 'month.1', dayOfMonth: 1, hh: 5, mm: 58 });
    expect(displayParts(0, 0)).toMatchObject({ hh: 0, mm: 0, dayOfMonth: 1 });
  });
  it('relative', () => {
    expect(formatRelative(2)).toEqual({ ticks: 2, gameDays: 2 / 720, realHours: 2 / 720, showReal: false });
    expect(formatRelative(30).showReal).toBe(true); expect(formatRelative(29).showReal).toBe(false);
    expect(formatRelative(3 * 720)).toMatchObject({ gameDays: 3, realHours: 3 });
  });
});
