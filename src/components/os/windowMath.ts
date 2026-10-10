// Pointer geometry for windows (P2-040..P2-043, P2-032): which snap a drag point picks, the rect a
// snap or a resize produces. Pure, so the frame component only handles pointers and dispatches the
// result. The reducer still checks every rect; these helpers only choose what to ask for.
import { FULL_FRAC, SLOT_FRAC, type FracRect, type LayoutMode, type Rect, type Size, type SlotName, fitsMin, fracToRect } from '@/shell/geometry';

/** Distance from a work-area edge, in px, that counts as touching it. */
export const SNAP_EDGE = 12;

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type SnapTarget = SlotName | 'fill';

/**
 * The snap a pointer over the work area picks (V:63-66). In the full mode corners give quarters, the
 * top edge fills, the left and right edges give halves. The halves mode (1000-1199 px, C-26) gives
 * only halves and fill. Null is a free position.
 */
export function snapTargetAt(x: number, y: number, w: number, h: number, mode: LayoutMode = 'full'): SnapTarget | null {
  const left = x <= SNAP_EDGE;
  const right = x >= w - SNAP_EDGE;
  const top = y <= SNAP_EDGE;
  const bottom = y >= h - SNAP_EDGE;
  if (mode === 'halves') {
    if (left) return 'L2';
    if (right) return 'R2';
    if (top) return 'fill';
    return null;
  }
  if (top && left) return 'TL';
  if (top && right) return 'TR';
  if (bottom && left) return 'BL';
  if (bottom && right) return 'BR';
  if (top) return 'fill';
  if (left) return 'L2';
  if (right) return 'R2';
  return null;
}

/** The rect a snap target covers, relative to the work area. */
export function targetRect(target: SnapTarget, wa: Size, gutter: number): Rect {
  return fracToRect(target === 'fill' ? FULL_FRAC : SLOT_FRAC[target], wa, gutter);
}

/**
 * The rect after dragging one edge by (dx, dy). The opposite edge stays put, the minimum size holds,
 * and the result stays inside the work area.
 */
export function resizeRect(
  r0: Rect,
  edge: Edge,
  dx: number,
  dy: number,
  min: { minW: number; minH: number },
  wa: Size,
): Rect {
  let x = r0.x;
  let y = r0.y;
  let w = r0.w;
  let h = r0.h;
  if (edge.includes('e')) w = r0.w + dx;
  if (edge.includes('w')) {
    x = r0.x + dx;
    w = r0.w - dx;
  }
  if (edge.includes('s')) h = r0.h + dy;
  if (edge.includes('n')) {
    y = r0.y + dy;
    h = r0.h - dy;
  }
  if (w < min.minW) {
    if (edge.includes('w')) x = r0.x + r0.w - min.minW;
    w = min.minW;
  }
  if (h < min.minH) {
    if (edge.includes('n')) y = r0.y + r0.h - min.minH;
    h = min.minH;
  }
  x = clamp(Math.round(x), 0, Math.max(0, wa.w - min.minW));
  y = clamp(Math.round(y), 0, Math.max(0, wa.h - min.minH));
  w = clamp(Math.round(w), min.minW, Math.max(min.minW, wa.w - x));
  h = clamp(Math.round(h), min.minH, Math.max(min.minH, wa.h - y));
  return { x, y, w, h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** A snap is offered only when the app's minimum fits the slot it would take (P2-031, C-26). */
export function snapFits(target: SnapTarget, def: { minW: number; minH: number }, wa: Size, gutter: number): boolean {
  return fitsMin(def, targetRect(target, wa, gutter));
}

/** A window's place as fractions of the work area, for the shared-edge handles. */
export interface Tile {
  id: string;
  f: FracRect;
}

/** A boundary two tiles share. `pos` is the fraction of the boundary; `lo`..`hi` is the span on the other axis. */
export interface SharedEdge {
  a: string;
  b: string;
  axis: 'x' | 'y';
  pos: number;
  lo: number;
  hi: number;
}

/**
 * The boundaries between tiles that touch (P2-025). A vertical edge runs between a right edge and a
 * left edge that overlap in y; a horizontal edge the same way with y. Each pair is listed once, with
 * `a` on the left or top.
 */
export function sharedEdges(tiles: readonly Tile[]): SharedEdge[] {
  const out: SharedEdge[] = [];
  for (const p of tiles) {
    for (const q of tiles) {
      if (p.id === q.id) continue;
      if (p.f.x1 === q.f.x0 && p.f.x1 < 1) {
        const lo = Math.max(p.f.y0, q.f.y0);
        const hi = Math.min(p.f.y1, q.f.y1);
        if (hi > lo) out.push({ a: p.id, b: q.id, axis: 'x', pos: p.f.x1, lo, hi });
      }
      if (p.f.y1 === q.f.y0 && p.f.y1 < 1) {
        const lo = Math.max(p.f.x0, q.f.x0);
        const hi = Math.min(p.f.x1, q.f.x1);
        if (hi > lo) out.push({ a: p.id, b: q.id, axis: 'y', pos: p.f.y1, lo, hi });
      }
    }
  }
  return out;
}
