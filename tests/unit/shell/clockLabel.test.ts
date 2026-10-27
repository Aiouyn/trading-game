// Producer: the shell clock label is 24-hour HH:MM (720 ticks per game day, 2 game minutes per tick), zero-padded.
// Wire and the top bar both format through clockLabel(clockAt(tick)), so these pin both.
import { describe, expect, it } from "vitest";
import { clockAt, clockLabel } from "@/shell/mockChannels";

describe("clockLabel (24 h)", () => {
  it.each([
    [2, "00:04"],
    [273, "09:06"],
    [390, "13:00"],
  ])("tick %i -> %s", (tick, hhmm) => {
    expect(clockLabel(clockAt(tick))).toEqual({ day: 0, hhmm });
  });
  it("the shell's default tick reads Day 38 · 11:20 (day index as the top bar shows it today)", () => {
    expect(clockLabel(clockAt(38 * 720 + 340))).toEqual({ day: 38, hhmm: "11:20" });
  });
});
