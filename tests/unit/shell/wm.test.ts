import { describe, expect, it } from "vitest";
import { applyLayout, layoutFits, LAYOUTS } from "@/shell/layouts";
import { LAYOUT_RECTS_1440 } from "./layoutRects";
import type { WindowRect } from "@/shell/types";
import { clampSize, minSize, openApp, resizeWin, workArea } from "@/shell/wm";
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
  it("Broker never below 720×420; narrow 480 under a 720 work area", () => {
    expect(clampSize("broker", 100, 100, 1424)).toEqual({ w: 720, h: 420 });
    expect(minSize("broker", 600)).toEqual({ w: 480, h: 420 });
    const w = openApp([], "broker", A).windows;
    expect(resizeWin(w, w[0], 10, 10, A)[0]).toMatchObject({ w: 720, h: 420 });
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
