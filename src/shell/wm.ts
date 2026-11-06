// Window manager core: pure functions over WindowRect[] (Spec 1 §3, 17 §3.2.5). No React, no DOM.
import { APPS, type AppId } from "./registry";
import type { SnapSlot, WindowRect } from "./types";

export const STRIP_H = 34;
export const SHELF_H = 52;
export const GUTTER = 8; // [P] desktop gutter, same as compact (17 §3.2.2)

export type Viewport = "phone" | "compact" | "desktop";
export const viewportOf = (w: number): Viewport => (w < 768 ? "phone" : w < 1200 ? "compact" : "desktop");

/** The launcher's touch hit area sticks out this far below the strip; no window top may sit in that band. */
export const STRIP_HIT_BAND = 5;
/** Lowest allowed window top: strip bottom + the hit band (Studio T2 condition 2). */
export const minWindowTop = (focusMode = false) => (focusMode ? 24 : STRIP_H) + STRIP_HIT_BAND;

/** AC-WM-SHELF-CLAMP §1: at least this much of the title bar stays inside the viewport horizontally. */
export const TITLE_KEEP = 96;

/**
 * Move a window; its top is clamped below the strip's hit band so the title bar never sits under it. With the work
 * area `a` (desktop, banners included) the window stops at AC-WM-SHELF-CLAMP's edges: top ≥ clampTop (= a.y),
 * bottom ≤ clampBottom (= a.y + a.h), and ≥ 96 px of the title bar inside the viewport `vw`. It stops, never snaps back.
 */
export function moveWin(windows: WindowRect[], w: WindowRect, x: number, y: number, focusMode = false, a?: Area, vw?: number): WindowRect[] {
  if (!a) return updateWin(windows, w, { x, y: Math.max(y, minWindowTop(focusMode)), snap: null });
  const ny = Math.max(a.y, Math.min(y, a.y + a.h - w.h));
  const nx = vw === undefined ? x : Math.max(TITLE_KEEP - w.w, Math.min(x, vw - TITLE_KEEP));
  return updateWin(windows, w, { x: nx, y: ny, snap: null });
}

export interface Area { x: number; y: number; w: number; h: number }

/** Work area between strip (+ open banners, T6) and shelf, inset by the gutter. */
export function workArea(vw: number, vh: number, focusMode = false, bannerH = 0): Area {
  const top = (focusMode ? 24 : STRIP_H) + bannerH;
  const bottom = focusMode ? 0 : SHELF_H;
  return { x: GUTTER, y: top + GUTTER, w: vw - 2 * GUTTER, h: vh - top - bottom - 2 * GUTTER };
}

export const SNAP_SLOTS: readonly SnapSlot[] = ["L1/2", "R1/2", "L1/3", "C1/3", "R1/3", "L2/3", "R2/3", "TL", "TR", "BL", "BR", "FILL"];

/** Rect of a snap slot. Columns are split with a gutter between them. */
export function slotRect(slot: SnapSlot, a: Area): Area {
  const half = (a.w - GUTTER) / 2;
  const third = (a.w - 2 * GUTTER) / 3;
  const rowH = (a.h - GUTTER) / 2;
  const col = (x: number, w: number): Area => ({ x: a.x + x, y: a.y, w, h: a.h });
  const right = (w: number) => a.x + a.w - w;
  const r = (v: Area): Area => ({ x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h) });
  switch (slot) {
    case "FILL": return r(a);
    case "L1/2": return r(col(0, half));
    case "R1/2": return r({ ...col(0, half), x: right(half) });
    case "L1/3": return r(col(0, third));
    case "C1/3": return r(col(third + GUTTER, third));
    case "R1/3": return r({ ...col(0, third), x: right(third) });
    case "L2/3": return r(col(0, 2 * third + GUTTER));
    case "R2/3": return r({ ...col(0, 2 * third + GUTTER), x: right(2 * third + GUTTER) });
    case "TL": return r({ x: a.x, y: a.y, w: half, h: rowH });
    case "TR": return r({ x: right(half), y: a.y, w: half, h: rowH });
    case "BL": return r({ x: a.x, y: a.y + rowH + GUTTER, w: half, h: rowH });
    case "BR": return r({ x: right(half), y: a.y + rowH + GUTTER, w: half, h: rowH });
  }
}

/** Minimum size for an app given the work-area width (narrow Broker form under its 520 minimum, UI card 4). */
export function minSize(app: AppId, areaW: number): { w: number; h: number } {
  const d = APPS[app];
  const w = d.narrowMinW !== undefined && areaW < d.minW ? d.narrowMinW : d.minW;
  return { w, h: d.minH };
}

export function clampSize(app: AppId, w: number, h: number, areaW: number): { w: number; h: number } {
  const m = minSize(app, areaW);
  return { w: Math.max(m.w, w), h: Math.max(m.h, h) };
}

export interface OpenResult { windows: WindowRect[]; focused: WindowRect; opened: boolean }

/**
 * Open an app, or focus the existing instance when the cap is reached or a single-instance
 * app (or the same Broker context) is already open (Audit A-8). New windows go to workspace 1.
 */
export function openApp(windows: WindowRect[], app: AppId, a: Area, context?: string): OpenResult {
  const mine = windows.filter((w) => w.app === app);
  const same = context ? mine.find((w) => w.context === context) : undefined;
  const cap = APPS[app].maxInstances;
  // At the cap, focus the main instance (the Review layout's "Journal" Portfolio is never the target).
  const existing = same ?? (mine.length >= cap ? (mine.find((w) => w.context !== "Journal") ?? mine[0]) : undefined);
  if (existing) {
    // UI card 10: a single-instance app opened on another context (Wire on a story id) focuses with that context, so
    // the app sees it; the window keeps its place and size.
    if (context === undefined || cap !== 1 || existing.context === context) return { windows: bringToFront(windows, existing), focused: existing, opened: false };
    const moved = { ...existing, context };
    return { windows: [...windows.filter((x) => !sameWin(x, existing)), moved], focused: moved, opened: false };
  }
  const instance = mine.reduce((m, w) => Math.max(m, w.instance), 0) + 1;
  const size = clampSize(app, Math.min(a.w, 840), Math.min(a.h, 560), a.w);
  const n = windows.length % 6;
  const rect: WindowRect = {
    app, instance, workspace: 1, collapsed: false, snap: null, context,
    x: a.x + 24 + n * 28, y: a.y + 16 + n * 28, w: Math.min(size.w, a.w), h: Math.min(size.h, a.h),
  };
  return { windows: [...windows, rect], focused: rect, opened: true };
}

export const sameWin = (a: WindowRect, b: WindowRect) => a.app === b.app && a.instance === b.instance;

/** Focus order = array order; the last window is on top. */
export function bringToFront(windows: WindowRect[], w: WindowRect): WindowRect[] {
  const hit = windows.find((x) => sameWin(x, w));
  if (!hit) return windows;
  return [...windows.filter((x) => !sameWin(x, w)), hit];
}

export function closeWin(windows: WindowRect[], w: WindowRect): WindowRect[] {
  return windows.filter((x) => !sameWin(x, w));
}

export function updateWin(windows: WindowRect[], w: WindowRect, patch: Partial<WindowRect>): WindowRect[] {
  return windows.map((x) => (sameWin(x, w) ? { ...x, ...patch } : x));
}

/**
 * Resize honouring the §2 minimums. AC-WM-SHELF-CLAMP §2: the bottom / corner handle stops at clampBottom
 * (a.y + a.h); the minimum size still wins over the clamp.
 */
export function resizeWin(windows: WindowRect[], w: WindowRect, width: number, height: number, a: Area): WindowRect[] {
  const s = clampSize(w.app, width, Math.min(height, a.y + a.h - w.y), a.w);
  return updateWin(windows, w, { w: s.w, h: s.h, snap: null });
}

export function snapWin(windows: WindowRect[], w: WindowRect, slot: SnapSlot, a: Area): WindowRect[] {
  const r = slotRect(slot, a);
  const s = clampSize(w.app, r.w, r.h, a.w);
  return updateWin(windows, w, { ...r, w: s.w, h: s.h, snap: slot, collapsed: false });
}

/** Ctrl ←/→ cycles halves then thirds on that side; ↑ fills; ↓ collapses (17 §3.2.6). */
export function nextSnap(current: SnapSlot | null, dir: "left" | "right" | "up" | "down"): SnapSlot | "collapse" {
  if (dir === "up") return "FILL";
  if (dir === "down") return "collapse";
  const cycle: SnapSlot[] = dir === "left" ? ["L1/2", "L1/3", "L2/3"] : ["R1/2", "R1/3", "R2/3"];
  const i = current ? cycle.indexOf(current) : -1;
  return cycle[(i + 1) % cycle.length];
}

/**
 * AC-WM-SHELF-CLAMP §3–§5: the displayed rect of a desktop window inside the work area `a` (clampTop = menu bar or
 * banner stack bottom + 8, clampBottom = shelf top − 8; `full` = the same area without banners). Runs at display
 * time (before first paint, also on restore / session load, §4); the stored (pre-clamp) rect is never modified, so a
 * window returns to its size when space comes back.
 * - Maximised (FILL) fills exactly clampTop..clampBottom (§5).
 * - Tiled (other snaps / layout panes) rescale vertically from `full` into `a`, then go through the clamp steps.
 * - Floating: per axis, first move it in, then shrink it (down to the minimum), and if the minimum still doesn't fit,
 *   maximise into the work area (§3). Horizontally a floating window may hang off-screen as far as drag allows (§1).
 * Phone (< 768) never calls this: apps fill the screen there (§6).
 */
export function fitRect(w: WindowRect, a: Area, full: Area = a, vw = a.x * 2 + a.w): Area {
  if (w.snap === "FILL") return { ...a };
  const m = minSize(w.app, a.w);
  let r: Area = { x: w.x, y: w.y, w: w.w, h: w.h };
  if (w.snap && !(a.y === full.y && a.h === full.h)) {
    const k = a.h / full.h;
    r = { ...r, y: Math.round(a.y + (w.y - full.y) * k), h: Math.max(m.h, Math.round(w.h * k)) };
  }
  // Width: shrink to the area (not below the minimum), else maximise; x keeps ≥ 96 px of title bar on screen.
  if (r.w > a.w) {
    if (m.w > a.w) return { ...a };
    r.w = a.w;
  }
  r.x = w.snap ? Math.max(a.x, Math.min(r.x, a.x + a.w - r.w)) : Math.max(TITLE_KEEP - r.w, Math.min(r.x, vw - TITLE_KEEP));
  // Height: move up (then down below clampTop), then shrink to the minimum, then maximise.
  if (r.h > a.h) {
    if (m.h > a.h) return { ...a };
    r.h = a.h;
  }
  r.y = Math.max(a.y, Math.min(r.y, a.y + a.h - r.h));
  return r;
}
