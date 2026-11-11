import { TICKS_PER_DAY, TICKS_PER_HOUR } from "../meme";

/** One real-time map for this module. 02:1024 `scheduled(N) = genesisUtcMs + N·5000 + reanchorOffsetMs`; 02:245-246 anchor. */
export const TICK_MS = 5000;
export const GAME_HOURS_PER_DAY = 24;
export const TICKS_PER_GAME_HOUR = TICKS_PER_HOUR;
export const UTC_BAND_HOURS = 8;
/** 04:1007: bands 00–08, 08–16, 16–24 UTC. */
export type UtcBand = 0 | 1 | 2;
export const UTC_BANDS: readonly { band: UtcBand; fromUtcHour: number; toUtcHour: number }[] = [
  { band: 0, fromUtcHour: 0, toUtcHour: 8 }, { band: 1, fromUtcHour: 8, toUtcHour: 16 }, { band: 2, fromUtcHour: 16, toUtcHour: 24 },
];
/** 02:§2.11 WorldClockAnchor. Each REANCHOR adds `deltaMs` to every tick at or after `atTick` (02:1043). */
export interface WorldClockAnchor { genesisUtcMs: number; reanchors: readonly { atTick: number; deltaMs: number }[] }

const safe = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export function assertAnchor(a: WorldClockAnchor): void {
  if (!safe(a.genesisUtcMs) || !Array.isArray(a.reanchors)) throw new Error("INVALID_CLOCK_ANCHOR");
  let last = -1;
  for (const r of a.reanchors) {
    if (!safe(r.atTick) || !safe(r.deltaMs) || r.deltaMs === 0 || r.atTick <= last) throw new Error("INVALID_CLOCK_ANCHOR");
    last = r.atTick;
  }
}
/** Real UTC instant (ms) at which tick N is scheduled. */
export function utcMsOfTick(a: WorldClockAnchor, tick: number): number {
  assertAnchor(a);
  if (!safe(tick)) throw new Error("INVALID_TICK");
  const offset = a.reanchors.reduce((n, r) => n + (r.atTick <= tick ? r.deltaMs : 0), 0), ms = a.genesisUtcMs + tick * TICK_MS + offset;
  if (!Number.isSafeInteger(ms)) throw new Error("UTC_OVERFLOW");
  return ms;
}
export const utcHourOfMs = (ms: number): number => Math.floor((ms % 86400000) / 3600000);
export const utcBandOfMs = (ms: number): UtcBand => Math.floor(utcHourOfMs(ms) / UTC_BAND_HOURS) as UtcBand;
export const utcBandOfTick = (a: WorldClockAnchor, tick: number): UtcBand => utcBandOfMs(utcMsOfTick(a, tick));
export const nextUtcBand = (band: UtcBand): UtcBand => ((band + 1) % 3) as UtcBand;
/**
 * 04:1007: the first tick at or after `fromTick` whose real UTC hour lies in `band`. Tick-granular, never rounded to
 * engine hours. A band is reached within 16 real hours (11,520 ticks) plus any reanchor delay that the anchor holds.
 */
export function firstTickInUtcBand(a: WorldClockAnchor, fromTick: number, band: UtcBand): number {
  assertAnchor(a);
  if (!safe(fromTick) || (band !== 0 && band !== 1 && band !== 2)) throw new Error("INVALID_BAND_QUERY");
  const limit = fromTick + 2 * UTC_BAND_HOURS * 3600000 / TICK_MS + 1;
  for (let t = fromTick; t <= limit; t++) if (utcBandOfTick(a, t) === band) return t;
  throw new Error("UTC_BAND_UNREACHABLE");
}
/** Engine hour h covers ticks [30h, 30h+29]; tick t belongs to hour floor(t/30). 720 ticks per game day. */
export const hourOfTick = (tick: number): number => { if (!safe(tick)) throw new Error("INVALID_TICK"); return Math.floor(tick / TICKS_PER_GAME_HOUR); };
export const ticksOfHour = (hour: number): { first: number; last: number } => {
  if (!safe(hour)) throw new Error("INVALID_HOUR");
  return { first: hour * TICKS_PER_GAME_HOUR, last: hour * TICKS_PER_GAME_HOUR + TICKS_PER_GAME_HOUR - 1 };
};
/** Mon–Fri trading calendar (02 core calendar/business-days.ts:5-6): day d is weekday d mod 7, 0–4 trading, 5–6 weekend. */
export const isTradingDay = (day: number): boolean => day % 7 < 5;
/** Elapsed trading hours since hour 0; weekend hours do not advance (weekend hours map to the next Monday 00). */
export function tradingHour(hour: number): number {
  const day = Math.floor(hour / GAME_HOURS_PER_DAY), weekday = day % 7;
  return (Math.floor(day / 7) * 5 + Math.min(weekday, 5)) * GAME_HOURS_PER_DAY + (weekday < 5 ? hour % GAME_HOURS_PER_DAY : 0);
}
if (TICKS_PER_GAME_HOUR * GAME_HOURS_PER_DAY !== TICKS_PER_DAY) throw new Error("HOUR_MAP_MISMATCH");
