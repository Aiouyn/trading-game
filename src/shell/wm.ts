// Window manager core: pure functions over WindowRect[] (Spec 1 §3, 17 §3.2.5). No React, no DOM.
import { APPS, type AppId } from "./registry";
import type { SnapSlot, WindowRect } from "./types";

export const STRIP_H = 34;
export const SHELF_H = 52;
export const GUTTER = 8; // [P] desktop gutter, same as compact (17 §3.2.2)

export type Viewport = "phone" | "compact" | "desktop";
/** Free (movable, resizable) windows from this width. Owner ruling 2026-11-07: a 1024 px desktop is a real desktop, so
 *  the compact single-window mode (velvet-desktop-os §Compact, decided at 768–1199) now covers 768–1023 only. */
export const DESKTOP_MIN_VW = 1024;
export const viewportOf = (w: number): Viewport => (w < 768 ? "phone" : w < DESKTOP_MIN_VW ? "compact" : "desktop");

/** The launcher's touch hit area sticks out this far below the strip; no window top may sit in that band. */
export const STRIP_HIT_BAND = 5;
/** Lowest allowed window top: strip bottom + the hit band (Studio T2 condition 2). */
export const minWindowTop = (focusMode = false) => (focusMode ? 24 : STRIP_H) + STRIP_HIT_BAND;

/** AC-WM-SHELF-CLAMP §1: at least this much of the title bar stays inside the viewport horizontally. */
export const TITLE_KEEP = 96;
/** Default height of a newly opened desktop window. */
export const DEFAULT_WINDOW_H = 560;
/** Broker is taller so the plot and the Trend line control stay in view together. The 560 px
 *  default left the tool under the fold once the overlay controls were added, and a click then
 *  scrolled the plot (tests/e2e/17b/broker-trendline.spec.ts). */
export const BROKER_WINDOW_H = 640;
/** Society holds the month, the rich list, and standing in one view. 560 left the list under the fold. */
export const SOCIETY_WINDOW_H = 720;

/** Opening size per app: room for the whole body on a 1366 x 768 screen. A window never opens above the work area. */
const OPEN_SIZE: Partial<Record<AppId, { w: number; h: number }>> = {
  broker: { w: 980, h: BROKER_WINDOW_H },
  portfolio: { w: 580, h: 660 },
  wire: { w: 560, h: 660 },
  messages: { w: 820, h: 620 },
  launchpad: { w: 1000, h: 660 },
  careers: { w: 760, h: 660 },
  citylife: { w: 760, h: 660 },
  people: { w: 600, h: 660 },
  city: { w: 820, h: 660 },
  society: { w: 820, h: SOCIETY_WINDOW_H },
  markets: { w: 900, h: 660 },
  property: { w: 800, h: 660 },
  bank: { w: 680, h: 640 },
  academy: { w: 760, h: 660 },
  profile: { w: 720, h: 660 },
  diary: { w: 760, h: 640 },
  settings: { w: 760, h: 640 },
  help: { w: 680, h: 640 },
};
const DEFAULT_OPEN = { w: 760, h: 640 };
export const openSize = (app: AppId, a: { w: number; h: number }): { w: number; h: number } => {
  const want = OPEN_SIZE[app] ?? DEFAULT_OPEN;
  return clampSize(app, Math.min(a.w, want.w), Math.min(a.h, want.h), a.w);
};

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
export function workArea(vw: number, vh: number, focusMode = false, bannerH = 0, consentH = 0): Area {
  const top = (focusMode ? 24 : STRIP_H) + bannerH;
  const bottom = (focusMode ? 0 : SHELF_H) + consentH;
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
  const fresh: WindowRect = { app, instance, workspace: 1, collapsed: false, snap: null, context, x: a.x, y: a.y, w: 0, h: 0 };
  const placed = placeNew(windows, fresh, a);
  return { windows: placed.windows, focused: placed.focused, opened: true };
}

const overlaps = (p: Area, q: Area) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

/**
 * Put a new window where it overlaps nothing. First choice is a free spot at its opening size, then at smaller sizes
 * (never below the app minimum). With no free spot, every open window is tiled into a grid with the new one when all
 * minimums fit. When they do not, the window that has waited longest is replaced by the new one.
 */
export function placeNew(windows: WindowRect[], fresh: WindowRect, a: Area): { windows: WindowRect[]; focused: WindowRect } {
  const live = windows.filter((w) => w.workspace === 1);
  const taken: Area[] = live.map((w) => {
    const r = fitRect(w, a);
    return w.collapsed ? { ...r, h: 32 } : r;
  });
  const want = openSize(fresh.app, a);
  const min = minSize(fresh.app, a.w);
  const sizes: { w: number; h: number }[] = [want];
  for (const k of [0.88, 0.76]) sizes.push({ w: Math.max(min.w, Math.round(want.w * k)), h: Math.max(min.h, Math.round(want.h * k)) });
  sizes.push({ w: min.w, h: min.h });
  for (const s of sizes) {
    if (s.w > a.w || s.h > a.h) continue;
    const xs = [...new Set([a.x, ...taken.map((t) => t.x + t.w + GUTTER)])].sort((p, q) => p - q);
    const ys = [...new Set([a.y, ...taken.map((t) => t.y + t.h + GUTTER)])].sort((p, q) => p - q);
    for (const y of ys) for (const x of xs) {
      const r = { x, y, w: s.w, h: s.h };
      if (x + s.w > a.x + a.w || y + s.h > a.y + a.h) continue;
      if (taken.some((t) => overlaps(r, t))) continue;
      const rect: WindowRect = { ...fresh, x: r.x, y: r.y, w: r.w, h: r.h };
      return { windows: [...windows, rect], focused: rect };
    }
  }
  const tiled = tileAll(windows, fresh, a);
  if (tiled) return tiled;
  // No room: the window that has waited longest, and whose place is big enough, gives it up. The trading desk and the
  // wallet are the last to go.
  const keep = (w: WindowRect) => w.app === "broker" || w.app === "portfolio";
  const fits = live.filter((w) => { const r = fitRect(w, a); return r.w >= min.w && r.h >= min.h; });
  const victim = fits.find((w) => !keep(w)) ?? fits[0];
  if (victim) {
    const v = fitRect(victim, a);
    const rect: WindowRect = { ...fresh, x: v.x, y: v.y, w: v.w, h: v.h };
    return { windows: [...windows.filter((w) => !sameWin(w, victim)), rect], focused: rect };
  }
  // Two neighbours that line up (one column, or one row) give their joint place to the new window.
  const order = [...live.filter((w) => !keep(w)), ...live.filter(keep)];
  for (const v of order) {
    const r = fitRect(v, a);
    for (const p of live) {
      if (p === v) continue;
      const q = fitRect(p, a);
      const column = Math.abs(q.x - r.x) <= 2 && Math.abs(q.w - r.w) <= 2 && (Math.abs(q.y - (r.y + r.h)) <= GUTTER + 2 || Math.abs(r.y - (q.y + q.h)) <= GUTTER + 2);
      const row = Math.abs(q.y - r.y) <= 2 && Math.abs(q.h - r.h) <= 2 && (Math.abs(q.x - (r.x + r.w)) <= GUTTER + 2 || Math.abs(r.x - (q.x + q.w)) <= GUTTER + 2);
      if (!column && !row) continue;
      const joint = { x: Math.min(r.x, q.x), y: Math.min(r.y, q.y), w: Math.max(r.x + r.w, q.x + q.w) - Math.min(r.x, q.x), h: Math.max(r.y + r.h, q.y + q.h) - Math.min(r.y, q.y) };
      if (joint.w < min.w || joint.h < min.h) continue;
      const rect: WindowRect = { ...fresh, ...joint };
      return { windows: [...windows.filter((w) => w !== v && w !== p), rect], focused: rect };
    }
  }
  const rect: WindowRect = { ...fresh, x: a.x, y: a.y, w: Math.min(a.w, want.w), h: Math.min(a.h, want.h) };
  return { windows: [...windows, rect], focused: rect };
}

/** A grid of rows and columns over the work area for the open windows and the new one, or null when a minimum does not fit. */
function tileAll(windows: WindowRect[], fresh: WindowRect, a: Area): { windows: WindowRect[]; focused: WindowRect } | null {
  const rest = windows.filter((w) => w.workspace !== 1 || w.collapsed);
  const order = windows.filter((w) => w.workspace === 1 && !w.collapsed)
    .map((w) => ({ w, r: fitRect(w, a) }))
    .sort((p, q) => Math.round(p.r.y / 40) - Math.round(q.r.y / 40) || p.r.x - q.r.x)
    .map((p) => p.w);
  const items = [...order, fresh];
  const n = items.length;
  for (let cols = Math.min(n, Math.max(1, Math.round(Math.sqrt(n * (a.w / a.h))))); cols >= 1; cols--) {
    const rows = Math.ceil(n / cols);
    const cellH = Math.floor((a.h - (rows - 1) * GUTTER) / rows);
    const placed: WindowRect[] = [];
    let ok = true;
    for (let row = 0; row < rows && ok; row++) {
      const slice = items.slice(row * cols, row * cols + cols);
      const cellW = Math.floor((a.w - (slice.length - 1) * GUTTER) / slice.length);
      slice.forEach((w, i) => {
        const m = minSize(w.app, a.w);
        if (cellW < m.w || cellH < m.h) ok = false;
        placed.push({ ...w, x: a.x + i * (cellW + GUTTER), y: a.y + row * (cellH + GUTTER), w: cellW, h: cellH, snap: null, collapsed: false });
      });
    }
    if (ok) {
      const focused = placed[placed.length - 1];
      return { windows: [...rest, ...placed], focused };
    }
  }
  for (let cols = Math.min(n, Math.round(Math.sqrt(n * (a.w / a.h))) + 1); cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = Math.floor((a.w - (cols - 1) * GUTTER) / cols);
    const cellH = Math.floor((a.h - (rows - 1) * GUTTER) / rows);
    if (items.every((w) => cellW >= minSize(w.app, a.w).w && cellH >= minSize(w.app, a.w).h)) {
      const placed = items.map((w, i) => ({ ...w, x: a.x + (i % cols) * (cellW + GUTTER), y: a.y + Math.floor(i / cols) * (cellH + GUTTER), w: cellW, h: cellH, snap: null, collapsed: false }));
      return { windows: [...rest, ...placed], focused: placed[placed.length - 1] };
    }
  }
  return null;
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

/** A window edge or corner a resize drags (compass points; "se" is the bottom-right corner). */
export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const EDGES: readonly Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/**
 * Drag edge `edge` of a window that started at `r0` (its displayed rect) by (dx, dy). The opposite edges stay put
 * (the p10 windowMath.resizeRect rule). Limits: the app minimum (capped to the work area), the work area's top
 * (clampTop, so the title bar stays reachable), left, right and bottom (clampBottom); a window already hanging off the
 * left keeps its x and ≥ TITLE_KEEP px of title bar stay on screen. The result is floating (snap null).
 */
export function resizeEdgeRect(app: AppId, r0: Area, edge: Edge, dx: number, dy: number, a: Area): Area {
  const m = minSize(app, a.w);
  const minW = Math.min(m.w, a.w);
  const minH = Math.min(m.h, a.h);
  const right0 = r0.x + r0.w;
  const bottom0 = r0.y + r0.h;
  let { x, y, w, h } = r0;
  if (edge.includes("e")) w = Math.min(Math.max(r0.w + dx, minW, TITLE_KEEP - r0.x), Math.max(r0.w, a.x + a.w - r0.x));
  if (edge.includes("w")) {
    x = Math.max(Math.min(r0.x + dx, right0 - minW), Math.min(a.x, r0.x));
    w = right0 - x;
  }
  if (edge.includes("s")) h = Math.min(Math.max(r0.h + dy, minH), Math.max(minH, a.y + a.h - r0.y));
  if (edge.includes("n")) {
    y = Math.max(Math.min(r0.y + dy, bottom0 - minH), a.y);
    h = bottom0 - y;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export function resizeEdgeWin(windows: WindowRect[], w: WindowRect, r0: Area, edge: Edge, dx: number, dy: number, a: Area): WindowRect[] {
  return updateWin(windows, w, { ...resizeEdgeRect(w.app, r0, edge, dx, dy, a), snap: null });
}

export function snapWin(windows: WindowRect[], w: WindowRect, slot: SnapSlot, a: Area): WindowRect[] {
  // Maximising twice restores: the size and place it had before, or its opening size in the middle of the work area.
  if (slot === "FILL" && w.snap === "FILL") {
    const r = w.restore ?? (() => {
      const s = openSize(w.app, a);
      return { x: Math.round(a.x + (a.w - s.w) / 2), y: Math.round(a.y + (a.h - s.h) / 2), w: s.w, h: s.h, snap: null };
    })();
    return updateWin(windows, w, { x: r.x, y: r.y, w: r.w, h: r.h, snap: r.snap, restore: undefined, collapsed: false });
  }
  const r = slotRect(slot, a);
  const s = clampSize(w.app, r.w, r.h, a.w);
  const restore = slot === "FILL" ? { x: w.x, y: w.y, w: w.w, h: w.h, snap: w.snap } : undefined;
  return updateWin(windows, w, { ...r, w: s.w, h: s.h, snap: slot, collapsed: false, restore });
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
