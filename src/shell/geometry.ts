/**
 * Quay geometry (F:15, V:23-47, V:60-68, DECISIONS C-04, C-08, C-26). Pure: no React, no DOM.
 *
 * Rects are in CSS px relative to the work area: the area under the status strip and above the
 * shelf. Slots are fractions of that area, so a snapped window is exact at any size.
 */

import type { AppDef } from './apps';

export const STRIP_H = 34;
export const STRIP_H_FOCUS = 24;
export const SHELF_H = 52;
export const GUTTER = 8;
export const GUTTER_FOCUS = 1;
export const TITLE_H = 32;
/** Viewport breakpoints (V:23-47): phone < 768, compact 768-1199, desktop >= 1200. */
export const BP_PHONE = 768;
export const BP_HALVES = 1000;
export const BP_FULL = 1200;
/** Broker below this width uses the narrow layout (V:41). It is presentation only. */
export const BROKER_NARROW_W = 720;
/** Broker at or above this width is the terminal (chart, watchlist, ticket column, bottom dock). Below it: the phone layout (spec 1.1). */
export const BROKER_TERMINAL_W = 900;
/** Broker shorter than this shows the Chart / Ticket toggle instead of both panes (V:41, C-37). */
export const BROKER_SHORT_H = 560;

/** How a Broker window of this size lays out. Presentation only; the reducer never reads it. */
export function brokerView(size: Size): { narrow: boolean; short: boolean; terminal: boolean } {
  return { narrow: size.w < BROKER_NARROW_W, short: size.h < BROKER_SHORT_H, terminal: size.w >= BROKER_TERMINAL_W };
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fractions of the work area: x0..x1 and y0..y1, each in [0, 1]. */
export interface FracRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Named slots (C-04, C-05, C-06). L3 is the left third, L23 the left 70% (the Broker beside a side panel), R3 the right
 * 30% (a side panel; R3 is kept as its name), R23 the right two-thirds, R3T and R3B the halves of that right 30%. Fill is not a slot: it is `filled`.
 */
export const SLOT_NAMES = [
  'L2', 'R2', 'L3', 'L23', 'R3', 'R23', 'R3T', 'R3B', 'TL', 'TR', 'BL', 'BR',
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

/** A named slot, or a custom split stored as fractions (P2-025: shared-edge drag). */
export type Slot = SlotName | { custom: FracRect };

export type ViewportClass = 'phone' | 'compact' | 'desktop';
/** Layout mode from width (F:98): phone has no layout, single fills, halves allows two, full allows all. */
export type LayoutMode = 'phone' | 'single' | 'halves' | 'full';

const THIRD = 1 / 3;
/** The Broker's share of a Trade side layout: a side panel takes the other 30% (UX fix: the panel never takes more). */
const BROKER_SHARE = 0.7;

export const SLOT_FRAC: Readonly<Record<SlotName, FracRect>> = {
  L2: { x0: 0, y0: 0, x1: 0.5, y1: 1 },
  R2: { x0: 0.5, y0: 0, x1: 1, y1: 1 },
  L3: { x0: 0, y0: 0, x1: THIRD, y1: 1 },
  L23: { x0: 0, y0: 0, x1: BROKER_SHARE, y1: 1 },
  R3: { x0: BROKER_SHARE, y0: 0, x1: 1, y1: 1 },
  R23: { x0: THIRD, y0: 0, x1: 1, y1: 1 },
  R3T: { x0: BROKER_SHARE, y0: 0, x1: 1, y1: 0.5 },
  R3B: { x0: BROKER_SHARE, y0: 0.5, x1: 1, y1: 1 },
  TL: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 },
  TR: { x0: 0.5, y0: 0, x1: 1, y1: 0.5 },
  BL: { x0: 0, y0: 0.5, x1: 0.5, y1: 1 },
  BR: { x0: 0.5, y0: 0.5, x1: 1, y1: 1 },
};

export const FULL_FRAC: FracRect = { x0: 0, y0: 0, x1: 1, y1: 1 };

export function isSlotName(x: unknown): x is SlotName {
  return typeof x === 'string' && (SLOT_NAMES as readonly string[]).includes(x);
}

export function slotFrac(slot: Slot): FracRect {
  return typeof slot === 'string' ? SLOT_FRAC[slot] : slot.custom;
}

export function viewportClass(w: number): ViewportClass {
  if (w < BP_PHONE) return 'phone';
  if (w < BP_FULL) return 'compact';
  return 'desktop';
}

export function layoutMode(w: number): LayoutMode {
  if (w < BP_PHONE) return 'phone';
  if (w < BP_HALVES) return 'single';
  if (w < BP_FULL) return 'halves';
  return 'full';
}

/** Which named slots a layout mode may use (V:39-44, T:81-82). Custom splits need full. */
export function slotAllowedInMode(slot: SlotName, mode: LayoutMode): boolean {
  if (mode === 'full') return true;
  if (mode === 'halves') return slot === 'L2' || slot === 'R2';
  return false;
}

export function stripHeight(focus: boolean): number {
  return focus ? STRIP_H_FOCUS : STRIP_H;
}

/** Work area for a viewport. Focus mode hides the shelf and shrinks the strip (V:105). */
export function workArea(vp: Size, focus: boolean): Size {
  const shelf = focus ? 0 : SHELF_H;
  return { w: vp.w, h: Math.max(0, vp.h - stripHeight(focus) - shelf) };
}

export function gutterFor(focus: boolean): number {
  return focus ? GUTTER_FOCUS : GUTTER;
}

function axisEdges(f0: number, f1: number, len: number, g: number): { pos: number; size: number } {
  // The outer edge keeps one gutter of margin. An inner boundary splits the gutter between the
  // two neighbours, so gaps are exactly g px and the outer margin is g px.
  const a = f0 <= 0 ? g : Math.round(f0 * len) + Math.ceil(g / 2);
  const b = f1 >= 1 ? len - g : Math.round(f1 * len) - Math.floor(g / 2);
  return { pos: a, size: Math.max(0, b - a) };
}

export function fracToRect(f: FracRect, wa: Size, g: number): Rect {
  const x = axisEdges(f.x0, f.x1, wa.w, g);
  const y = axisEdges(f.y0, f.y1, wa.h, g);
  return { x: x.pos, y: y.pos, w: x.size, h: y.size };
}

export function slotRect(slot: Slot, vp: Size, focus: boolean): Rect {
  return fracToRect(slotFrac(slot), workArea(vp, focus), gutterFor(focus));
}

export function fitsMin(def: Pick<AppDef, 'minW' | 'minH'>, rect: Rect): boolean {
  return rect.w >= def.minW && rect.h >= def.minH;
}

/** Offset of each cascaded window on a workspace (defect A, Velvet window rules). */
export const CASCADE_STEP = 24;
/** The cascade wraps after this many steps, so a crowded workspace never drifts off screen. */
export const CASCADE_WRAP = 5;

/**
 * Default free rect for a window opened on a workspace that already has `openCount` open windows.
 * Size: the app's preferred fraction of the work area, at least its minimum and at most the work area.
 * Position: centred for the first window (openCount 0); each next window is offset by CASCADE_STEP,
 * wrapping after CASCADE_WRAP steps. The rect is clamped inside the work area, so it is never off screen.
 */
export function openRect(def: Pick<AppDef, 'minW' | 'minH' | 'pref'>, wa: Size, openCount: number): Rect {
  const w = Math.min(wa.w, Math.max(def.minW, Math.round(wa.w * def.pref.w)));
  const h = Math.min(wa.h, Math.max(def.minH, Math.round(wa.h * def.pref.h)));
  const off = (Math.max(0, openCount) % CASCADE_WRAP) * CASCADE_STEP;
  const cx = Math.round((wa.w - w) / 2) + off;
  const cy = Math.round((wa.h - h) / 2) + off;
  return clampRect({ x: cx, y: cy, w, h }, wa);
}

/** Side of a fractional rect: left when its centre is left of the middle. */
export function sideOfFrac(f: FracRect): 'L' | 'R' {
  return (f.x0 + f.x1) / 2 < 0.5 ? 'L' : 'R';
}

/** Fractions of a free rect inside a work area. */
export function fracOfRect(r: Rect, wa: Size): FracRect {
  const ww = wa.w || 1;
  const wh = wa.h || 1;
  return { x0: r.x / ww, y0: r.y / wh, x1: (r.x + r.w) / ww, y1: (r.y + r.h) / wh };
}

/** Moves a rect so it lies inside the work area. Size is kept; an oversize rect is pinned to 0. */
export function clampRect(r: Rect, wa: Size): Rect {
  const x = Math.min(Math.max(r.x, 0), Math.max(0, wa.w - r.w));
  const y = Math.min(Math.max(r.y, 0), Math.max(0, wa.h - r.h));
  return { x, y, w: r.w, h: r.h };
}

/**
 * Nearest named slot to a free rect that the mode allows and the app's minimum fits (F rule 4).
 * Ties keep SLOT_NAMES order. Returns null when no slot fits.
 */
export function nearestSlot(
  r: Rect,
  wa: Size,
  g: number,
  def: Pick<AppDef, 'minW' | 'minH'>,
  mode: LayoutMode,
): SlotName | null {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  let best: SlotName | null = null;
  let bestD = Infinity;
  for (const name of SLOT_NAMES) {
    if (!slotAllowedInMode(name, mode)) continue;
    const s = fracToRect(SLOT_FRAC[name], wa, g);
    if (!fitsMin(def, s)) continue;
    const d = (s.x + s.w / 2 - cx) ** 2 + (s.y + s.h / 2 - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/**
 * Tiles for n windows on a workspace (UX stage 2): 2 = halves, 3 = one large plus two stacked on the right,
 * 4 = quarters, 5 and more = a grid whose last row takes the leftover cells at equal width. The first tile is the
 * main one (the newest window). Pure: wm.ts checks each tile against its app's minimum size.
 */
export function tileSlots(n: number): Slot[] {
  if (n <= 0) return [];
  if (n === 1) return ['L23'];
  if (n === 2) return ['L2', 'R2'];
  if (n === 3) return ['L23', 'R3T', 'R3B'];
  if (n === 4) return ['TL', 'TR', 'BL', 'BR'];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const out: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - (rows - 1) * cols : cols;
    const col = i - row * cols;
    out.push({
      custom: { x0: col / inRow, y0: row / rows, x1: (col + 1) / inRow, y1: (row + 1) / rows },
    });
  }
  return out;
}
