// T02-05: tick → game date (02 §3.1.1), boundaries (02 §3.4 hooks), stagger rule (02#10).
import { EngineFault, type Tick } from '../types';
import { fnv1a32 } from '../crypto/fnv';
import { GAME_DAYS_PER_CHAPTER, GAME_DAYS_PER_GAME_YEAR, TICKS_PER_GAME_DAY } from './constants';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DayPhase = 'PRE_MARKET' | 'OPEN_AUCTION' | 'CONTINUOUS' | 'CLOSE_AUCTION' | 'AFTER_HOURS';
export interface GameDate { tick: Tick; dayIndex: number; t: number; year: number; dayOfYear: number; quarter: 1 | 2 | 3 | 4; month: number; dayOfMonth: number;
  weekOfYear: number; weekday: Weekday; chapter: number; dayOfChapter: number; minuteOfDay: number; phase: DayPhase; isWeekend: boolean }

const MONTH_OFFSETS = [0, 28, 56] as const;

export function ticksToGameDate(tick: Tick): GameDate {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new EngineFault('I0.tick', `invalid tick ${tick}`);
  const dayIndex = Math.floor(tick / TICKS_PER_GAME_DAY);
  const t = tick % TICKS_PER_GAME_DAY;
  const year = Math.floor(dayIndex / GAME_DAYS_PER_GAME_YEAR) + 1;
  const dayOfYear = (dayIndex % GAME_DAYS_PER_GAME_YEAR) + 1;
  const weekday = (dayIndex % 7) as Weekday;
  const quarter = (Math.floor((dayOfYear - 1) / 91) + 1) as 1 | 2 | 3 | 4;
  const dIQ = (dayOfYear - 1) % 91;
  const monthInQ = dIQ < 28 ? 1 : dIQ < 56 ? 2 : 3;
  const phase: DayPhase = t < 60 ? 'PRE_MARKET' : t === 60 ? 'OPEN_AUCTION' : t < 540 ? 'CONTINUOUS' : t === 540 ? 'CLOSE_AUCTION' : 'AFTER_HOURS';
  return { tick, dayIndex, t, year, dayOfYear, quarter, month: (quarter - 1) * 3 + monthInQ, dayOfMonth: dIQ - MONTH_OFFSETS[monthInQ - 1]! + 1,
    weekOfYear: Math.floor((dayOfYear - 1) / 7) + 1, weekday, chapter: Math.floor(dayIndex / GAME_DAYS_PER_CHAPTER) + 1,
    dayOfChapter: (dayIndex % GAME_DAYS_PER_CHAPTER) + 1, minuteOfDay: 2 * t, phase, isWeekend: weekday >= 5 };
}
export const tickToDate: typeof ticksToGameDate = ticksToGameDate;

export function dateToTick(year: number, dayOfYear: number, t: number): Tick {
  return ((year - 1) * GAME_DAYS_PER_GAME_YEAR + (dayOfYear - 1)) * TICKS_PER_GAME_DAY + t;
}

export type Boundary = 'HOUR' | 'DAY_OPEN' | 'DAY_CLOSE' | 'WEEK_CLOSE' | 'MONTH_CLOSE' | 'QUARTER_CLOSE' | 'YEAR_CLOSE' | 'CHAPTER_CLOSE'
  | 'WEEK_OPEN' | 'MONTH_OPEN' | 'QUARTER_OPEN' | 'YEAR_OPEN' | 'CHAPTER_OPEN' | 'PHASE_CHANGE';
export const END_HOOK_ORDER: readonly Boundary[] = Object.freeze(['DAY_CLOSE', 'WEEK_CLOSE', 'MONTH_CLOSE', 'QUARTER_CLOSE', 'YEAR_CLOSE', 'CHAPTER_CLOSE'] as const);
export const START_HOOK_ORDER: readonly Boundary[] = Object.freeze(['CHAPTER_OPEN', 'YEAR_OPEN', 'QUARTER_OPEN', 'MONTH_OPEN', 'WEEK_OPEN', 'DAY_OPEN', 'HOUR'] as const);

/** Immutable ReadonlySet over a fixed list (G8 forbids the global Set); iteration follows the list order. */
class FixedSet<K> implements ReadonlySet<K> {
  constructor(private readonly items: readonly K[]) {}
  get size(): number { return this.items.length; }
  has(k: K): boolean { return this.items.includes(k); }
  forEach(cb: (v: K, k: K, s: ReadonlySet<K>) => void): void { for (const x of this.items) cb(x, x, this); }
  *entries(): SetIterator<[K, K]> { for (const x of this.items) yield [x, x]; }
  *keys(): SetIterator<K> { yield* this.items; }
  *values(): SetIterator<K> { yield* this.items; }
  [Symbol.iterator](): SetIterator<K> { return this.values(); }
}

export interface CalendarInfo { tick: Tick; tickOfDay: number; gameDay: number; weekday: Weekday; isTradingDay: boolean; gameHour: number;
  boundaries: ReadonlySet<Boundary>; quarter: number; year: number; chapter: number;
  date: GameDate; month: number; dayOfMonth: number; phase: DayPhase }

const PHASE_TICKS = [0, 60, 61, 540, 541];
const MONTH_LAST_DAY = [28, 28, 35, 28, 28, 35, 28, 28, 35, 28, 28, 35];

export function calendarOf(tick: Tick): CalendarInfo {
  const d = ticksToGameDate(tick);
  const b: Boundary[] = [];
  const dIQ = (d.dayOfYear - 1) % 91;
  if (d.t === 0) {   // start hooks, outermost first
    if (d.dayOfChapter === 1) b.push('CHAPTER_OPEN');
    if (d.dayOfYear === 1) b.push('YEAR_OPEN');
    if (dIQ === 0) b.push('QUARTER_OPEN');
    if (d.dayOfMonth === 1) b.push('MONTH_OPEN');
    if (d.weekday === 0) b.push('WEEK_OPEN');
    b.push('DAY_OPEN');
  }
  if (d.t % 30 === 0) b.push('HOUR');
  if (PHASE_TICKS.includes(d.t)) b.push('PHASE_CHANGE');
  if (d.t === TICKS_PER_GAME_DAY - 1) {   // end hooks, innermost first
    b.push('DAY_CLOSE');
    if (d.weekday === 6) b.push('WEEK_CLOSE');
    if (d.dayOfMonth === MONTH_LAST_DAY[d.month - 1]) b.push('MONTH_CLOSE');
    if (dIQ === 90) b.push('QUARTER_CLOSE');
    if (d.dayOfYear === GAME_DAYS_PER_GAME_YEAR) b.push('YEAR_CLOSE');
    if (d.dayOfChapter === GAME_DAYS_PER_CHAPTER) b.push('CHAPTER_CLOSE');
  }
  return { tick, tickOfDay: d.t, gameDay: d.dayIndex, weekday: d.weekday, isTradingDay: d.weekday < 5, gameHour: Math.floor(d.t / 30),
    boundaries: new FixedSet(b), quarter: d.quarter, year: d.year, chapter: d.chapter, date: d, month: d.month, dayOfMonth: d.dayOfMonth, phase: d.phase };
}

export function staggerSlot(entityId: string): number { return fnv1a32(entityId) % 30; }
export function runsThisTick(entityId: string, t: Tick): boolean { return (t % TICKS_PER_GAME_DAY) % 30 === staggerSlot(entityId); }
