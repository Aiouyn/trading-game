// Studio T2 condition 2: no window top may sit in the 5 px band below the strip (the launcher's touch hit area),
// whether placed by drag, snap, layout, open (initial position) or restore.
import { describe, expect, it } from "vitest";
import { LAYOUTS, applyLayout } from "@/shell/layouts";
import type { SnapSlot } from "@/shell/types";
import { STRIP_H, STRIP_HIT_BAND, minWindowTop, moveWin, openApp, snapWin, updateWin, workArea } from "@/shell/wm";

const SLOTS: SnapSlot[] = ["L1/2", "R1/2", "L1/3", "C1/3", "R1/3", "L2/3", "R2/3", "TL", "TR", "BL", "BR", "FILL"];
const area = workArea(1440, 900);

describe("strip hit band", () => {
  it("is strip bottom + 5 (and focus strip + 5)", () => {
    expect(minWindowTop()).toBe(STRIP_H + STRIP_HIT_BAND);
    expect(minWindowTop(true)).toBe(24 + STRIP_HIT_BAND);
  });

  it("drag: moving a window up into or past the band clamps its top to strip bottom + 5", () => {
    const [w] = openApp([], "wire", area).windows;
    for (const y of [-200, 0, STRIP_H, STRIP_H + 4]) expect(moveWin([w], w, 100, y)[0].y).toBe(minWindowTop());
    expect(moveWin([w], w, 100, 300)[0].y).toBe(300);
    expect(moveWin([w], w, 100, 0, true)[0].y).toBe(minWindowTop(true));
  });

  it("initial position, every snap slot, every layout and restore all stay below the band", () => {
    let ws = openApp([], "wire", area).windows;
    for (let i = 0; i < 6; i++) ws = openApp(ws, (["broker", "portfolio", "bank", "research", "legal", "messages"] as const)[i], area).windows;
    for (const w of ws) expect(w.y).toBeGreaterThanOrEqual(minWindowTop());
    for (const s of SLOTS) expect([s, snapWin(ws, ws[0], s, area)[0].y >= minWindowTop()]).toEqual([s, true]);
    for (const l of LAYOUTS) for (const w of applyLayout(l.id, area, () => true)) expect(w.y).toBeGreaterThanOrEqual(minWindowTop());
    const collapsed = updateWin(ws, ws[0], { collapsed: true });
    expect(updateWin(collapsed, collapsed[0], { collapsed: false })[0].y).toBeGreaterThanOrEqual(minWindowTop());
  });
});
