import { describe, expect, it } from "vitest";
import { pickAlert, worldEventText, type Alert, type WorldEvent } from "@/components/shell/Banner";

const a = (id: string, priority: "P0" | "P1"): Alert => ({ id, priority, text: id, action: { label: "Open", href: "/x" } });

describe("17A T5 alert queue (T5-03)", () => {
  it("shows one banner when two P0s arrive; the second stays queued", () => {
    const r = pickAlert([a("first", "P0"), a("second", "P0")]);
    expect(r.shown?.id).toBe("first");
    expect(r.queued.map((x) => x.id)).toEqual(["second"]);
  });
  it("P0 jumps ahead of an earlier P1", () => expect(pickAlert([a("p1", "P1"), a("p0", "P0")]).shown?.id).toBe("p0"));
  it("empty queue → nothing shown", () => expect(pickAlert([]).shown).toBeNull());
});

describe("17A T5 world-event banner (T5-04, 17-AT-20)", () => {
  const ev: WorldEvent = { name: "Crash", day: 3, index: "GX", sincePct: "-18.40", todayPct: "-2.10" };
  it("formats elapsed only", () => expect(worldEventText(ev)).toBe("CRASH · DAY 3 · GX \u221218.40% since it began · Today \u22122.10%"));
  it("3-day and 30-day events on day 3 give identical strings with no remaining-duration token", () => {
    const three = worldEventText({ ...ev, durationDays: 3 } as WorldEvent & { durationDays: number });
    const thirty = worldEventText({ ...ev, durationDays: 30 } as WorldEvent & { durationDays: number });
    expect(three).toBe(thirty);
    expect(three).not.toMatch(/left|remain|until|ends|\b(27|30)\b/i);
  });
});

import { orderEntryLock } from "@/components/shell/SystemOverlays";
describe("17A T5 order entry lock while halted", () => {
  it("disabled with the halt reason (Studio final copy)", () => {
    const l = orderEntryLock(true, "market integrity review");
    expect(l).toEqual({ disabled: true, reason: "Orders are paused while trading is halted. Reason: market integrity review." });
  });
  it("no reason: only the first sentence", () => {
    for (const r of [undefined, null, "", "  "]) expect(orderEntryLock(true, r)).toEqual({ disabled: true, reason: "Orders are paused while trading is halted." });
  });
  it("enabled otherwise", () => expect(orderEntryLock(false)).toEqual({ disabled: false, reason: null }));
});

import { UI_GLYPHS } from "@/components/shell/glyphs/ui";
describe("Studio T5 glyphs: alert, world, error", () => {
  it("are in the UI set (7 → 10 UI glyphs), distinct, on the 24-unit grid", () => {
    expect(Object.keys(UI_GLYPHS)).toHaveLength(10);
    const keys = (["alert", "world", "error", "bell"] as const).map((k) => UI_GLYPHS[k].join("|"));
    expect(new Set(keys).size).toBe(4);
    for (const k of ["alert", "world", "error"] as const)
      for (const d of UI_GLYPHS[k]) for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) expect(Math.abs(n)).toBeLessThanOrEqual(24);
  });
});
