import { describe, expect, it } from "vitest";
import { fitRect, minSize, workArea } from "@/shell/wm";
import { parseDeepLink } from "@/shell/feed";
import { phoneStack } from "@/components/shell/PhoneBanners";
import type { WindowRect } from "@/shell/types";
import type { Alert, WorldEvent } from "@/components/shell/Banner";

const full = workArea(1440, 900);
const shrunk = workArea(1440, 900, false, 68);
const win = (p: Partial<WindowRect>): WindowRect => ({ app: "wire", instance: 1, workspace: 1, collapsed: false, snap: null, x: 100, y: full.y, w: 600, h: 400, ...p });

describe("17A T6 workspace shrinks by the banners (fitRect)", () => {
  it("work area top moves down by the banner height, bottom stays at the shelf", () => {
    expect(shrunk.y - full.y).toBe(68);
    expect(shrunk.y + shrunk.h).toBe(full.y + full.h);
  });
  it("no banners → identity for every kind of window", () => {
    for (const w of [win({}), win({ snap: "FILL", y: full.y, h: full.h }), win({ snap: "L1/2" })]) expect(fitRect(w, full, full)).toEqual({ x: w.x, y: w.y, w: w.w, h: w.h });
  });
  it("maximized window fits the shrunk area exactly", () => {
    const r = fitRect(win({ snap: "FILL", x: full.x, y: full.y, w: full.w, h: full.h }), shrunk, full);
    expect([r.y, r.y + r.h]).toEqual([shrunk.y, shrunk.y + shrunk.h]);
  });
  it("tiled window rescales vertically but never below its minimum height", () => {
    const m = minSize("wire", full.w);
    const r = fitRect(win({ snap: "BR", y: full.y + full.h - m.h, h: m.h }), shrunk, full);
    expect(r.h).toBe(m.h);
    expect(r.y).toBeGreaterThanOrEqual(34 + 68);
  });
  it("floating window keeps its size and moves down only as far as needed", () => {
    expect(fitRect(win({ y: full.y }), shrunk, full)).toEqual({ x: 100, y: 34 + 5 + 68, w: 600, h: 400 });
    expect(fitRect(win({ y: 300 }), shrunk, full).y).toBe(300);
    const tall = fitRect(win({ y: full.y, h: full.h }), shrunk, full);
    expect([tall.h, tall.y + tall.h > shrunk.y + shrunk.h]).toEqual([full.h, true]); // overlaps the shelf edge, never shrinks
  });
});

describe("17A T6 deep links + phone stack", () => {
  it("parses in-app links", () => {
    expect(parseDeepLink("/risk")).toEqual({ app: "risk", context: undefined });
    expect(parseDeepLink("/broker?asset=GX")).toEqual({ app: "broker", context: "GX" });
    expect(parseDeepLink("/nope")).toBeNull();
    expect(parseDeepLink("https://x.example/risk")).toBeNull();
  });
  const a = (id: string, priority: "P0" | "P1"): Alert => ({ id, priority, text: id, action: { label: "Open", href: "/risk" } });
  const w: WorldEvent = { name: "Crash", day: 3, index: "GX", sincePct: "-1", todayPct: "-1" };
  it("orders P0 alert → offline/error → world; max 2; the rest collapse into +N (queued alerts count)", () => {
    expect(phoneStack([a("x", "P0")], true, w)).toEqual({ shown: ["alert", "load"], extra: 1 });
    expect(phoneStack([a("x", "P0"), a("y", "P1")], true, w)).toEqual({ shown: ["alert", "load"], extra: 2 });
    expect(phoneStack([], true, w)).toEqual({ shown: ["load", "world"], extra: 0 });
    expect(phoneStack([], false, null)).toEqual({ shown: [], extra: 0 });
  });
});

import { sheetRows } from "@/components/shell/PhoneBanners";
describe("17A T6 alerts-sheet order (Studio 08:31)", () => {
  const al = (id: string, priority: "P0" | "P1"): Alert => ({ id, priority, text: id, action: { label: "Open", href: "/risk" } });
  const w: WorldEvent = { name: "Crash", day: 3, index: "GX", sincePct: "-1", todayPct: "-1" };
  const key = (r: ReturnType<typeof sheetRows>[number]) => (r.kind === "alert" ? r.alert.id : r.kind);
  it("P0s, then offline/error, then world, then the rest by arrival time", () => {
    const rows = sheetRows([al("p1-early", "P1"), al("p0-a", "P0"), al("p1-late", "P1"), al("p0-b", "P0")], { offline: false }, w);
    expect(rows.map(key)).toEqual(["p0-a", "p0-b", "load", "world", "p1-early", "p1-late"]);
  });
  it("'Order partly filled' (P1) comes after 'Couldn't load'", () => {
    expect(sheetRows([al("order-partly-filled", "P1")], { offline: false }, null).map(key)).toEqual(["load", "order-partly-filled"]);
  });
  it("omits absent sections", () => expect(sheetRows([], null, null)).toEqual([]));
});
