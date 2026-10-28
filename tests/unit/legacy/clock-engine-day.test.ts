// Legacy game clock (src/game/clock.ts) on the engine calendar's day boundary. The client may not import
// packages/engine (it does not type-check under the client tsconfig), so the mapping is restated here from
// packages/engine/core/calendar/date.ts:15 `dayIndex = Math.floor(tick / TICKS_PER_GAME_DAY)` (720, constants.ts:4);
// its 1-based counters are dayIndex + 1 (date.ts:18 dayOfYear, :26 dayOfChapter). The shell clockLabel
// (src/shell/mockChannels.ts clockAt + clockLabel) uses the same day, so the legacy day must equal the shell day at every
// tick. HH:MM stays the legacy 09:30-16:00 session (the shell shows 24 h); only the day partition is shared.
import { describe, expect, it } from "vitest";
import { clockLabel, clockParts, dayIndex } from "@/game/clock";
import { barTimeLabel } from "@/game/history";
import { clockAt, clockLabel as shellClockLabel } from "@/shell/mockChannels";

const TPD = 720;
const engineDay = (tick: number) => Math.floor(tick / TPD) + 1;
const shellDay = (tick: number) => shellClockLabel(clockAt(tick)).day;

describe("legacy clock: engine calendar day (1-based, dayIndex + 1)", () => {
  it.each([
    [0, 1, 0, "09:30"],
    [2, 1, 2, "09:31"],
    [273, 1, 273, "11:57"],
    [390, 1, 390, "13:01"],
  ])("tick %i -> Day %i (tick in day %i, %s), same day as the engine and the shell", (tick, day, tickInDay, hhmm) => {
    expect(clockParts(tick, TPD)).toEqual({ day, tickInDay, hhmm });
    expect(clockLabel(tick, TPD)).toBe(`Day ${day} \u00b7 ${hhmm}`);
    expect(day).toBe(engineDay(tick));
    expect(day).toBe(shellDay(tick));
  });

  it("day rollover: tick 719 is the last tick of Day 1 (15:59), tick 720 opens Day 2 at 09:30, as in the engine and shell", () => {
    expect(clockParts(719, TPD)).toEqual({ day: 1, tickInDay: 719, hhmm: "15:59" });
    expect(clockParts(720, TPD)).toEqual({ day: 2, tickInDay: 0, hhmm: "09:30" });
    expect(clockParts(721, TPD)).toEqual({ day: 2, tickInDay: 1, hhmm: "09:30" });
    expect(clockLabel(720, TPD)).toBe("Day 2 \u00b7 09:30");
    for (const t of [719, 720, 721, 1439, 1440]) {
      expect(clockParts(t, TPD).day).toBe(engineDay(t));
      expect(clockParts(t, TPD).day).toBe(shellDay(t));
    }
    expect(clockParts(1439, TPD).day).toBe(2);
    expect(clockParts(1440, TPD).day).toBe(3);
  });

  it("dayIndex is the engine's 0-based dayIndex; negative ticks clamp to day 0 (the engine throws on them)", () => {
    expect([0, 1, 719, 720, 721, 1439, 1440].map((t) => dayIndex(t, TPD))).toEqual([0, 0, 0, 1, 1, 1, 2]);
    expect(dayIndex(-5, TPD)).toBe(0);
    expect(clockParts(-5, TPD)).toEqual({ day: 1, tickInDay: 0, hhmm: "09:30" });
  });

  it("agrees with the engine and the shell on every tick of the first three days", () => {
    for (let t = 0; t < 3 * TPD; t++) {
      const c = clockParts(t, TPD);
      if (c.day !== engineDay(t) || c.day !== shellDay(t) || c.tickInDay !== t % TPD) throw new Error(`tick ${t}: ${JSON.stringify(c)}`);
    }
  });

  it("works for any ticksPerDay (legacy worlds can configure it)", () => {
    expect([0, 9, 10, 19, 20].map((t) => clockParts(t, 10).day)).toEqual([1, 1, 2, 2, 3]);
    expect(clockParts(9, 10).hhmm).toBe("15:21");
  });

  it("chart labels: a daily bar starting at d * ticksPerDay is labelled Day d + 1", () => {
    expect(barTimeLabel(0, TPD, true)).toBe("Day 1");
    expect(barTimeLabel(720, TPD, true)).toBe("Day 2");
    expect(barTimeLabel(720, TPD, false)).toBe("D2 09:30");
    expect(barTimeLabel(719, TPD, false)).toBe("D1 15:59");
  });
});
