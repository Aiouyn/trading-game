import { describe, expect, it } from "vitest";
import { applyLayout, layoutFits, LAYOUTS } from "@/shell/layouts";
import { LAYOUT_RECTS_1440 } from "./layoutRects";
import type { WindowRect } from "@/shell/types";
import { bringToFront, clampSize, closeWin, EDGES, GUTTER, minSize, nextSnap, openApp, resizeEdgeRect, resizeEdgeWin, resizeWin, slotRect, SNAP_SLOTS, snapWin, TITLE_KEEP, viewportOf, workArea } from "@/shell/wm";
import { workspacesFor } from "@/shell/store";
import { RANKS } from "@/shell/registry";

const A = workArea(1440, 900);

describe("instances (S1-11)", () => {
  it("a 5th Broker focuses the existing window; count unchanged", () => {
    let w: WindowRect[] = [];
    for (let i = 0; i < 4; i++) w = openApp(w, "broker", A).windows;
    expect(w).toHaveLength(4);
    const r = openApp(w, "broker", A);
    expect(r.opened).toBe(false);
    expect(r.windows).toHaveLength(4);
    expect(r.windows.at(-1)).toEqual(r.focused);
  });
  it("same-ticker deep link focuses that Broker; single-instance apps never duplicate", () => {
    let w = openApp([], "broker", A, "HALC").windows;
    w = openApp(w, "broker", A, "NRON").windows;
    const r = openApp(w, "broker", A, "HALC");
    expect(r.opened).toBe(false);
    expect(r.focused.context).toBe("HALC");
    const p = openApp(openApp([], "wire", A).windows, "wire", A);
    expect(p.windows).toHaveLength(1);
  });
  it("new windows always open on workspace 1 (S1-09)", () => {
    expect(openApp([], "markets", A).focused.workspace).toBe(1);
  });
});

describe("minimum sizes (S1-12)", () => {
  it("Broker never below 520×420 (UI card 4: the 520 window); narrow 480 under a 520 work area", () => {
    expect(clampSize("broker", 100, 100, 1424)).toEqual({ w: 520, h: 420 });
    expect(minSize("broker", 600)).toEqual({ w: 520, h: 420 });
    expect(minSize("broker", 500)).toEqual({ w: 480, h: 420 });
    const w = openApp([], "broker", A).windows;
    expect(resizeWin(w, w[0], 10, 10, A)[0]).toMatchObject({ w: 520, h: 420 });
  });
  it("every app clamps to its §2 minimum", () => {
    expect(clampSize("wire", 1, 1, 1424)).toEqual({ w: 360, h: 280 });
    expect(clampSize("portfolio", 1, 1, 1424)).toEqual({ w: 520, h: 220 });
    expect(clampSize("city", 1, 1, 1424)).toEqual({ w: 560, h: 400 });
    expect(clampSize("markets", 1, 1, 1424)).toEqual({ w: 420, h: 300 });
  });
});

describe("workspaces by rank (S1-09)", () => {
  it("1 at R0/R1, 2 at R2, 3 at R3+", () => {
    expect(RANKS.map(workspacesFor)).toEqual([1, 1, 2, 3, 3, 3, 3]);
  });
});

describe("named layouts at 1440×900, minimums win (S1-10, PR #2 answer 2)", () => {
  const all = () => true;
  const rect = (w: WindowRect) => [w.app, w.x, w.y, w.w, w.h];
  it.each(LAYOUTS.map((l) => l.id))("%s", (id) => {
    expect(applyLayout(id, A, all).map(rect)).toEqual(LAYOUT_RECTS_1440[id]);
  });
  it("every window in every layout honours its minimum", () => {
    for (const l of LAYOUTS) for (const w of applyLayout(l.id, A, all)) {
      const m = minSize(w.app, A.w);
      expect(w.w >= m.w && w.h >= m.h, `${l.id}/${w.app}`).toBe(true);
    }
  });
  it("a layout that cannot fit is not offered (1200×700: only Review and Shadow fit)", () => {
    const small = workArea(1200, 700);
    expect(LAYOUTS.filter((l) => layoutFits(l.id, small)).map((l) => l.id)).toEqual(["review", "shadow"]);
    expect(applyLayout("research", small, all)).toEqual([]);
    // Trade needs Broker 720 + Portfolio 520 + gutter: offered from a 1264 px wide viewport.
    expect(layoutFits("trade", workArea(1263, 900))).toBe(false);
    expect(layoutFits("trade", workArea(1264, 900))).toBe(true);
  });
  it("locked apps leave their slot empty", () => {
    expect(applyLayout("shadow", A, (a) => a !== "ailab").map((w) => w.app)).toEqual(["security"]);
  });
  it("Review's Journal Portfolio is never the focus target of a normal open", () => {
    const w = applyLayout("review", A, all);
    const r = openApp(w, "portfolio", A);
    expect(r.opened).toBe(false);
    expect(r.focused.context).toBeUndefined();
  });
});

describe("snap slots (17 §3.2.6)", () => {
  const W = workArea(1440, 900); // x 8, y 42, w 1424, h 798
  it("halves, thirds and quarters tile the work area with one gutter between neighbours", () => {
    const L = slotRect("L1/2", W), R = slotRect("R1/2", W);
    expect(L).toEqual({ x: 8, y: 42, w: 708, h: 798 });
    expect(R).toEqual({ x: 724, y: 42, w: 708, h: 798 });
    const [a, b, c] = (["L1/3", "C1/3", "R1/3"] as const).map((s) => slotRect(s, W));
    // Thirds are rounded to whole pixels, so a gutter may be off by one.
    expect(Math.abs(b.x - (a.x + a.w) - GUTTER)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.x - (b.x + b.w) - GUTTER)).toBeLessThanOrEqual(1);
    expect(c.x + c.w).toBe(W.x + W.w);
    expect(Math.abs(slotRect("L2/3", W).w - (a.w + GUTTER + b.w))).toBeLessThanOrEqual(1);
    expect(slotRect("R2/3", W).x + slotRect("R2/3", W).w).toBe(W.x + W.w);
    const TL = slotRect("TL", W), BL = slotRect("BL", W), TR = slotRect("TR", W), BR = slotRect("BR", W);
    expect(BL.y - (TL.y + TL.h)).toBe(GUTTER);
    expect([TR.x, BR.x]).toEqual([R.x, R.x]);
    expect(BR.y + BR.h).toBe(W.y + W.h);
    expect(slotRect("FILL", W)).toEqual(W);
  });
  it("every slot stays inside the work area at 1200, 1440 and 1920", () => {
    for (const vw of [1200, 1440, 1920]) {
      const a = workArea(vw, 900);
      for (const s of SNAP_SLOTS) {
        const r = slotRect(s, a);
        expect(r.x).toBeGreaterThanOrEqual(a.x);
        expect(r.y).toBeGreaterThanOrEqual(a.y);
        expect(r.x + r.w).toBeLessThanOrEqual(a.x + a.w);
        expect(r.y + r.h).toBeLessThanOrEqual(a.y + a.h);
      }
    }
  });
  it("snapping fills the slot but never goes below the app minimum, and uncollapses", () => {
    const wire = { ...openApp([], "wire", W).focused, collapsed: true };
    const [half] = snapWin([wire], wire, "L1/2", W);
    const w = openApp([], "broker", W).focused;
    expect([half.x, half.w, half.snap, half.collapsed]).toEqual([8, 708, "L1/2", false]);
    const [q] = snapWin([w], w, "TL", W); // TL is 708×395; Broker min is 520×420: width fills, height clamps
    expect([q.w, q.h]).toEqual([708, 420]);
  });
  it("resizing clears the snap slot", () => {
    const w = snapWin([openApp([], "wire", W).focused], openApp([], "wire", W).focused, "R1/2", W)[0];
    expect(resizeWin([w], w, 900, 500, W)[0].snap).toBeNull();
  });
  it("Ctrl ←/→ cycles halves then thirds on that side; ↑ fills; ↓ collapses", () => {
    expect(nextSnap(null, "left")).toBe("L1/2");
    expect(nextSnap("L1/2", "left")).toBe("L1/3");
    expect(nextSnap("L1/3", "left")).toBe("L2/3");
    expect(nextSnap("L2/3", "left")).toBe("L1/2");
    expect(nextSnap("L1/2", "right")).toBe("R1/2");
    expect(nextSnap("R2/3", "right")).toBe("R1/2");
    expect(nextSnap("TL", "up")).toBe("FILL");
    expect(nextSnap("FILL", "down")).toBe("collapse");
  });
});

describe("window list operations", () => {
  const W = workArea(1440, 900);
  it("close removes only that instance; focus moves it to the top; unknown windows are ignored", () => {
    let w = openApp([], "broker", W).windows;
    w = openApp(w, "broker", W).windows;
    w = openApp(w, "wire", W).windows;
    const [b1, b2] = w;
    expect(closeWin(w, b1).map((x) => `${x.app}${x.instance}`)).toEqual(["broker2", "wire1"]);
    expect(bringToFront(w, b1).at(-1)).toEqual(b1);
    expect(bringToFront(w, { ...b2, instance: 9 })).toBe(w);
  });
  it("new windows cascade and stay inside a small work area", () => {
    const small = workArea(1000, 700);
    let w: WindowRect[] = [];
    for (const app of ["wire", "portfolio", "messages"] as const) w = openApp(w, app, small).windows;
    expect(w[1].x - w[0].x).toBe(28);
    for (const r of w) expect(r.w).toBeLessThanOrEqual(small.w);
  });
  it("viewport breakpoints and focus-mode work area", () => {
    // Owner ruling 2026-11-07: 1024 px is a desktop (free, resizable windows); compact is 768–1023.
    expect([viewportOf(767), viewportOf(768), viewportOf(1023), viewportOf(1024), viewportOf(1200)]).toEqual(["phone", "compact", "compact", "desktop", "desktop"]);
    expect(workArea(1440, 900, true)).toEqual({ x: 8, y: 32, w: 1424, h: 860 });
  });
});

describe("edge and corner resize (owner 2026-11-07; p10 resizeRect rule)", () => {
  const a1024 = workArea(1024, 768);
  const r0 = { x: 200, y: 120, w: 600, h: 450 };
  it("each edge moves only its own side; corners move two", () => {
    expect(resizeEdgeRect("broker", r0, "e", 50, 99, A)).toEqual({ ...r0, w: 650 });
    expect(resizeEdgeRect("broker", r0, "s", 99, 40, A)).toEqual({ ...r0, h: 490 });
    expect(resizeEdgeRect("broker", r0, "w", -50, 99, A)).toEqual({ ...r0, x: 150, w: 650 });
    expect(resizeEdgeRect("broker", r0, "n", 99, -30, A)).toEqual({ ...r0, y: 90, h: 480 });
    expect(resizeEdgeRect("broker", r0, "se", 10, 20, A)).toEqual({ ...r0, w: 610, h: 470 });
    expect(resizeEdgeRect("broker", r0, "nw", -10, -20, A)).toEqual({ x: 190, y: 100, w: 610, h: 470 });
    expect(resizeEdgeRect("broker", r0, "ne", 10, -20, A)).toEqual({ x: 200, y: 100, w: 610, h: 470 });
    expect(resizeEdgeRect("broker", r0, "sw", -10, 20, A)).toEqual({ x: 190, y: 120, w: 610, h: 470 });
  });
  it("the app minimum wins, and the opposite edge stays put when the west or north edge hits it", () => {
    const m = minSize("broker", A.w);
    expect(resizeEdgeRect("broker", r0, "se", -900, -900, A)).toMatchObject({ x: 200, y: 120, w: m.w, h: m.h });
    const w = resizeEdgeRect("broker", r0, "nw", 900, 900, A);
    expect(w).toEqual({ x: r0.x + r0.w - m.w, y: r0.y + r0.h - m.h, w: m.w, h: m.h });
  });
  it("stays inside the work area: never above clampTop (title bar reachable), past the right, left or bottom edge", () => {
    for (const a of [A, a1024]) {
      for (const edge of EDGES) {
        const r = resizeEdgeRect("wire", { x: 100, y: 100, w: 400, h: 300 }, edge, edge.includes("w") ? -5000 : 5000, edge.includes("n") ? -5000 : 5000, a);
        expect(r.y, edge).toBeGreaterThanOrEqual(a.y);
        expect(r.x, edge).toBeGreaterThanOrEqual(a.x);
        expect(r.x + r.w, edge).toBeLessThanOrEqual(a.x + a.w);
        expect(r.y + r.h, edge).toBeLessThanOrEqual(a.y + a.h);
      }
    }
  });
  it("a window hanging off the left keeps TITLE_KEEP px of title bar on screen when its east edge shrinks", () => {
    const off = { x: 100 - 560, y: 100, w: 560, h: 420 };
    const r = resizeEdgeRect("portfolio", off, "e", -400, 0, A);
    expect(r.x + r.w).toBeGreaterThanOrEqual(TITLE_KEEP);
    expect(r.x).toBe(off.x);
  });
  it("a minimum larger than the work area is capped to it (no window taller than the screen)", () => {
    const tiny = workArea(1024, 480);
    const r = resizeEdgeRect("broker", { x: tiny.x, y: tiny.y, w: 600, h: tiny.h }, "s", 0, 400, tiny);
    expect(r.h).toBe(tiny.h);
  });
  it("the result is floating (snap null) and other windows are untouched", () => {
    const w0: WindowRect = { app: "broker", instance: 1, x: 8, y: 50, w: 940, h: 806, snap: "L2/3", workspace: 1, collapsed: false };
    const other: WindowRect = { ...w0, app: "wire", snap: "TR" };
    const out = resizeEdgeWin([w0, other], w0, { x: w0.x, y: w0.y, w: w0.w, h: w0.h }, "e", -100, 0, A);
    expect(out[0]).toMatchObject({ w: 840, snap: null });
    expect(out[1]).toBe(other);
  });
});
