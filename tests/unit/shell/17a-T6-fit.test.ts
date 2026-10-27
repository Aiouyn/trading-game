import { describe, expect, it } from "vitest";
import { fitRect, minSize, moveWin, resizeWin, workArea } from "@/shell/wm";
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
  it("no banners → identity for windows that already fit", () => {
    for (const w of [win({}), win({ snap: "L1/2" })]) expect(fitRect(w, full, full)).toEqual({ x: w.x, y: w.y, w: w.w, h: w.h });
  });
  it("maximized window fits the shrunk area exactly (AC-WM-SHELF-CLAMP §5)", () => {
    for (const a of [full, shrunk]) {
      const r = fitRect(win({ snap: "FILL", x: full.x, y: full.y, w: full.w, h: full.h }), a, full);
      expect([r.y, r.y + r.h]).toEqual([a.y, a.y + a.h]);
    }
  });
  it("tiled window rescales vertically and stays inside the clamp", () => {
    const m = minSize("wire", full.w);
    const r = fitRect(win({ snap: "BR", y: full.y + full.h - m.h, h: m.h }), shrunk, full);
    expect(r.h).toBe(m.h);
    expect(r.y).toBeGreaterThanOrEqual(shrunk.y);
    expect(r.y + r.h).toBeLessThanOrEqual(shrunk.y + shrunk.h);
  });
});

describe("AC-WM-SHELF-CLAMP (Studio 09:10)", () => {
  // 1440×900: clampTop = 34 + 8 = 42, clampBottom = 900 − 52 − 8 = 840; with a 68 px banner stack clampTop = 110.
  const clampTop = (a: typeof full) => a.y, clampBottom = (a: typeof full) => a.y + a.h;
  it("edges are menu bar / banner stack + 8 and shelf top − 8", () => {
    expect([clampTop(full), clampBottom(full)]).toEqual([42, 840]);
    expect([clampTop(shrunk), clampBottom(shrunk)]).toEqual([110, 840]);
  });
  it("§1 drag stops at clampBottom / clampTop, ±1 px", () => {
    const w = win({ h: 400 });
    const bottomY = (y: number) => moveWin([w], w, 100, y, false, full, 1440)[0]!.y + 400;
    expect(bottomY(840 - 400 - 1)).toBe(839);
    expect(bottomY(840 - 400)).toBe(840);
    expect(bottomY(840 - 400 + 1)).toBe(840);
    expect(bottomY(5000)).toBe(840);
    const topY = (y: number, a = full) => moveWin([w], w, 100, y, false, a, 1440)[0]!.y;
    expect([topY(43), topY(42), topY(41), topY(-500)]).toEqual([43, 42, 42, 42]);
    expect([topY(111, shrunk), topY(110, shrunk), topY(109, shrunk)]).toEqual([111, 110, 110]);
  });
  it("§1 horizontally ≥ 96 px of the title bar stays in the viewport", () => {
    const w = win({ w: 600 });
    expect(moveWin([w], w, -10_000, 300, false, full, 1440)[0]!.x).toBe(96 - 600);
    expect(moveWin([w], w, 10_000, 300, false, full, 1440)[0]!.x).toBe(1440 - 96);
  });
  it("§2 resize handle stops at clampBottom (±1 px); the minimum still applies", () => {
    const w = win({ y: 300, h: 400 });
    const h = (hh: number) => resizeWin([w], w, 600, hh, full)[0]!.h;
    expect([h(539), h(540), h(541), h(5000)]).toEqual([539, 540, 540, 540]);
    const low = win({ y: 700, h: 300 });
    expect(resizeWin([low], low, 600, 5000, full)[0]!.h).toBe(minSize("wire", full.w).h); // min wins
  });
  it("§3 fit: move up first, keeping the size", () => {
    const r = fitRect(win({ y: 600, h: 400 }), full, full);
    expect([r.y, r.h, r.y + r.h]).toEqual([440, 400, 840]);
  });
  it("§3 fit: a banner pushes a top window down to clampTop; a low one moves up instead of overlapping the shelf", () => {
    expect(fitRect(win({ y: 42, h: 700 }), shrunk, full)).toMatchObject({ y: 110, h: 700 });
    const r = fitRect(win({ y: 139, h: 700 }), shrunk, full);
    expect([r.y, r.y + r.h, r.h]).toEqual([139, 839, 700]);
    const r2 = fitRect(win({ y: 141, h: 700 }), shrunk, full);
    expect([r2.y, r2.y + r2.h]).toEqual([140, 840]); // +1 px over → moved up 1 px
  });
  it("§3 fit: too tall → shrink to the area height (down to the minimum), stored rect untouched", () => {
    const w = win({ y: 42, h: 798 });
    const r = fitRect(w, shrunk, full);
    expect([r.y, r.h]).toEqual([110, 730]);
    expect(w.h).toBe(798);
    expect(fitRect(w, full, full)).toMatchObject({ y: 42, h: 798 }); // space comes back → original size
  });
  it("§3 fit: minimum doesn't fit → maximise into the work area; width follows the same steps", () => {
    const tiny = workArea(1440, 360); // h = 360 − 34 − 52 − 16 = 258 < wire min 280
    expect(fitRect(win({}), tiny, tiny)).toEqual(tiny);
    const narrow = workArea(780, 900);
    expect(fitRect(win({ w: 900, x: 8 }), narrow, narrow, 780)).toMatchObject({ w: narrow.w });
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

import { rowGlyph, sheetRows } from "@/components/shell/PhoneBanners";
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

describe("alerts sheet row glyphs (Studio 08:43)", () => {
  it("P0 alert, P1 bell, world world, load error", () => {
    const al = (id: string, priority: "P0" | "P1"): Alert => ({ id, priority, text: id, action: { label: "Open", href: "/risk" } });
    const w: WorldEvent = { name: "Crash", day: 3, index: "GX", sincePct: "-18.40", todayPct: "-2.10" };
    expect(sheetRows([al("b", "P1"), al("a", "P0")], { offline: false }, w).map(rowGlyph)).toEqual(["alert", "error", "world", "bell"]);
  });
});
