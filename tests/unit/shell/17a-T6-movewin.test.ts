import { describe, expect, it } from "vitest";
import type { WindowRect } from "@/shell/types";
import { moveWin, TITLE_KEEP } from "@/shell/wm";

// moveWin's own clamp, tested without fitRect (which would clamp again and hide a regression).
const area = { x: 8, y: 50, w: 1424, h: 760 };
const w: WindowRect = { app: "ticket" as WindowRect["app"], instance: 1, x: 100, y: 100, w: 400, h: 300, snap: null, workspace: 1, collapsed: false };
const at = (x: number, y: number) => moveWin([w], w, x, y, false, area, 1440)[0];

describe("moveWin clamps on its own (no fitRect)", () => {
  it("keeps the title bar below the work-area top", () => { expect(at(100, -200).y).toBe(area.y); });
  it("keeps the window bottom inside the work area", () => { expect(at(100, 5000).y).toBe(area.y + area.h - w.h); });
  it("keeps TITLE_KEEP px of title on screen horizontally", () => {
    expect(at(-5000, 100).x).toBe(TITLE_KEEP - w.w);
    expect(at(5000, 100).x).toBe(1440 - TITLE_KEEP);
  });
  it("passes an in-range move through unchanged and clears snap", () => {
    const r = at(300, 200); expect([r.x, r.y, r.snap]).toEqual([300, 200, null]);
  });
});
