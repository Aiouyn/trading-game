// Producer: the shell clock label is 24-hour HH:MM (720 ticks per game day, 2 game minutes per tick), zero-padded, and
// the day is 1-based like the engine calendar (Producer, #70 round 2). Wire and the top bar both format through
// clockLabel(clockAt(tick)), so these pin both. The expected day is the engine calendar's mapping, restated here
// because the client may not import packages/engine (it does not type-check under the client tsconfig):
// packages/engine/core/calendar/date.ts ticksToGameDate: dayIndex = floor(tick / TICKS_PER_GAME_DAY (720)); its
// 1-based counters (dayOfYear, dayOfChapter, ...) are dayIndex + 1.
import { describe, expect, it } from "vitest";
import { clockAt, clockLabel } from "@/shell/mockChannels";

const TICKS_PER_GAME_DAY = 720;
const engineDay = (tick: number) => Math.floor(tick / TICKS_PER_GAME_DAY) + 1;

describe("clockLabel (24 h, 1-based day)", () => {
  it.each([
    [2, 1, "00:04"],
    [273, 1, "09:06"],
    [390, 1, "13:00"],
  ])("tick %i -> Day %i · %s (engine mapping)", (tick, day, hhmm) => {
    expect(engineDay(tick)).toBe(day);
    expect(clockLabel(clockAt(tick))).toEqual({ day: engineDay(tick), hhmm });
  });
  it("day boundary: tick 719 is Day 1 · 23:58, tick 720 is Day 2 · 00:00", () => {
    expect(clockLabel(clockAt(719))).toEqual({ day: engineDay(719), hhmm: "23:58" });
    expect(clockLabel(clockAt(720))).toEqual({ day: 2, hhmm: "00:00" });
    expect(engineDay(720)).toBe(2);
  });
  it("the shell's start tick (game day index 38) reads Day 39 · 11:20", () => {
    expect(clockLabel(clockAt(38 * 720 + 340))).toEqual({ day: 39, hhmm: "11:20" });
    expect(engineDay(38 * 720 + 340)).toBe(39);
  });
});
