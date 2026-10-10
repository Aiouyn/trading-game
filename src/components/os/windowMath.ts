// Pointer geometry for windows (P2-040..P2-043, P2-032): which snap a drag point picks, the rect a
// snap or a resize produces. Pure, so the frame component only handles pointers and dispatches the
// result. The reducer still checks every rect; these helpers only choose what to ask for.
import { FULL_FRAC, SLOT_FRAC, type Rect, type Size, type SlotName, fracToRect } from '@/shell/geometry';

/** Distance from a work-area edge, in px, that counts as touching it. */
export const SNAP_EDGE = 12;

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type SnapTarget = SlotName | 'fill';

/**
 * The snap a pointer over the work area picks (V:63-66). Corners give quarters, the top edge fills,
 * the left and right edges give halves. Null is a free position.
 */
export function snapTargetAt(x: number, y: number, w: number, h: number): SnapTarget | null {
  const left = x <= SNAP_EDGE;
  const right = x >= w - SNAP_EDGE;
  const top = y <= SNAP_EDGE;
  const bottom = y >= h - SNAP_EDGE;
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
