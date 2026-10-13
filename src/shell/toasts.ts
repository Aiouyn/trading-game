/**
 * Toast rules (P2-085..P2-090, V:137-143). Pure: which toasts show, how long, and which side of
 * the desktop the column sits on. The column itself is drawn by components/os/OsToasts.tsx.
 *
 * Focus mode (P2-069) shows only fills, margin warnings and world events; everything else waits
 * in the bell. A warning and a margin warning stay until they are read (P2-090).
 */

import { BROKER_TERMINAL_W, SHELF_H, type Rect, type Size } from './geometry';

/** At most two notices draw at once (UX stage 6, weakness 3): a third would cover the positions table or the watchlist. */
export const TOAST_MAX = 2;
/** The queue keeps this many notices, so a long run of sticky warnings cannot grow without bound. Only TOAST_MAX draw. */
export const TOAST_QUEUE_MAX = 12;
export const TOAST_HOLD_MS = 4000;
/** Column geometry from V:143: 332 px wide, 14 px from the right, 10 px under the strip. */
export const TOAST_W = 332;
export const TOAST_EDGE = 14;
/** The column sits this far above the shelf (UX 3: bottom-right, above the dock). */
export const TOAST_BOTTOM = 12;
/** Height a toast takes in the column, used only to decide whether it covers a Broker. */
export const TOAST_ROW_H = 96;
/** The gap between the column's rows (tokens.css --os-toast-gap). */
export const TOAST_GAP = 10;
/** The tallest notice (a label and two lines of text), and the "more" row under the notices (os.css .os-toast-more). */
export const NOTICE_MAX_H = 80;
export const MORE_ROW_H = 28;
/**
 * The least a Broker's dock may be, so the notices over a maximized Broker fit inside its dock and never reach its plot: two
 * tallest notices, a gap under each row (the second notice and the "more" row) and the column's bottom inset. TerminalLayout
 * clamps its dock to it, and starts a short screen's dock at it.
 */
export const DOCK_NOTICE_H = TOAST_MAX * NOTICE_MAX_H + TOAST_MAX * TOAST_GAP + MORE_ROW_H + TOAST_BOTTOM;

export type ToastKind = 'fill' | 'margin' | 'world' | 'close' | 'coach' | 'pending' | 'other';
export type ToastTone = 'gain' | 'loss' | 'warn' | 'info' | 'brass';

/** A toast as the desktop reads it. The game store holds the same shape with a few more fields. */
export interface ShellToast {
  id: string;
  tone: ToastTone;
  text: string;
  kind?: ToastKind;
  /** The asset an order notice is about: a pending notice is replaced by the fill of the same asset (one toast per order). */
  ref?: string;
  /** The app whose window a click opens (a window id is never stored here). */
  app?: string;
  /** What a click does besides dismissing (a coach tip performs its action). Not stored in the shell. */
  run?: () => void;
}

const FOCUS_KINDS: readonly ToastKind[] = ['fill', 'margin', 'world'];

/** Whether a toast shows while focus mode is on (P2-069). */
export function allowedInFocus(t: Pick<ShellToast, 'kind'>): boolean {
  return t.kind !== undefined && FOCUS_KINDS.includes(t.kind);
}

/** The toasts to draw, oldest first. At most TOAST_MAX; the oldest leaves first (V:143). */
export function visibleToasts<T extends Pick<ShellToast, 'kind'>>(list: readonly T[], focusMode: boolean): T[] {
  const pool = focusMode ? list.filter(allowedInFocus) : list.slice();
  return pool.slice(-TOAST_MAX);
}

/**
 * Sticky toasts stay until they are read, not for the hold time (P2-090): warnings, margin calls, and the day-close notice (its
 * tap opens the Wire, which reads it; a newer close replaces it, see withoutSuperseded).
 */
export function isSticky(t: Pick<ShellToast, 'tone' | 'kind'>): boolean {
  return t.tone === 'warn' || t.kind === 'margin' || t.kind === 'close';
}

/**
 * One toast per order (UX stage 6, weakness 3): a pending notice ("fills at the next tick", "order working") leaves the queue when
 * the fill of its asset arrives, so the order shows as one filled notice. Pure: returns the queue without those pending notices.
 */
export function withoutPending<T extends Pick<ShellToast, 'kind' | 'ref'>>(list: readonly T[], incoming: readonly T[]): T[] {
  const filled = new Set(incoming.filter((t) => t.kind === 'fill' && t.ref !== undefined).map((t) => t.ref));
  if (filled.size === 0) return list.slice();
  return list.filter((t) => !(t.kind === 'pending' && t.ref !== undefined && filled.has(t.ref)));
}

/**
 * The queue after `incoming` arrives: a fill drops its order's pending notice (withoutPending), and a new day-close notice replaces
 * the one still queued (a close is news about the latest day only). Pure: returns the surviving notices, by reference.
 */
export function withoutSuperseded<T extends Pick<ShellToast, 'kind' | 'ref'>>(list: readonly T[], incoming: readonly T[]): T[] {
  const newClose = incoming.some((t) => t.kind === 'close');
  return withoutPending(list, incoming).filter((t) => !(newClose && t.kind === 'close'));
}

/** The Broker's ticket column (TerminalLayout: w-[344px]). */
export const BROKER_TICKET_W = 344;
/** The narrow banner's inset from the Broker's left and right edges (the phone banner's 12 px side gutter). */
export const TOAST_BAR_INSET = 12;
/** The gap between the narrow banner and the trade bar's top edge (the phone banner's 6 px). */
export const TOAST_BAR_GAP = 6;

/**
 * Where the toast column sits. `right`: the default bottom-right corner. `at`: a point in a terminal Broker's dock (left and bottom
 * in px). `bar`: a narrow Broker's trade bar (UX stage 6, narrow notices): one slim notice above the bar, spanning the Broker's
 * width. `left` and `right` are its insets; `bottom` is the gap above the Broker's bottom edge, to which the bar's height is added
 * in CSS (--phone-trade-h, published by TerminalNarrow).
 */
export type ToastPlace =
  | { side: 'right' }
  | { side: 'at'; left: number; bottom: number }
  | { side: 'bar'; left: number; right: number; bottom: number };

/**
 * The column's place (P2-088, UX stage 6). The default is the bottom-right corner above the shelf. When the focused Broker sits
 * under that corner, the column moves: a terminal Broker (TerminalLayout, 900 px and wider) takes the column into its dock, at its
 * bottom-right and clear of the ticket, with the same two notices as the corner (OsToasts). The plot is never covered, so no
 * notice sits over a draggable level (a stop-loss or take-profit pill) or a price line; the dock (at least DOCK_NOTICE_H tall,
 * TerminalLayout) holds the column. A narrow Broker (under 900 px, its trade bar at the foot) takes one slim notice above that bar,
 * so the bar is never covered (the phone's banner rule). A terminal Broker too narrow for a clear chart keeps the corner.
 * Rects are relative to the work area, which starts below the strip.
 */
export function toastPlace(vp: Size, broker: Rect | null, stripH: number, shelfH: number = SHELF_H, watchlistOpenW = 1100): ToastPlace {
  if (broker === null) return { side: 'right' };
  const colX0 = vp.w - TOAST_EDGE - TOAST_W;
  const colX1 = vp.w - TOAST_EDGE;
  const colY1 = vp.h - shelfH - TOAST_BOTTOM;
  const colY0 = colY1 - TOAST_MAX * TOAST_ROW_H;
  const bx0 = broker.x;
  const bx1 = broker.x + broker.w;
  const by0 = stripH + broker.y;
  const by1 = by0 + broker.h;
  const hit = bx0 < colX1 && bx1 > colX0 && by0 < colY1 && by1 > colY0;
  if (!hit) return { side: 'right' };
  // A narrow Broker has no dock: its trade bar holds the notices (one at a time, above the bar, never over it).
  if (broker.w < BROKER_TERMINAL_W) {
    return { side: 'bar', left: bx0 + TOAST_BAR_INSET, right: vp.w - bx1 + TOAST_BAR_INSET, bottom: vp.h - by1 + TOAST_BAR_GAP };
  }
  // The chart's right edge is the ticket's left edge; the chart's left edge is the watchlist (open) or its rail.
  const left = bx1 - BROKER_TICKET_W - TOAST_EDGE - TOAST_W;
  const chartLeft = bx0 + (broker.w >= watchlistOpenW ? 256 : 32) + TOAST_EDGE;
  if (left < chartLeft) return { side: 'right' };
  // The dock is the Broker's bottom band: the column sits TOAST_BOTTOM above the window's bottom edge, inside the dock.
  return { side: 'at', left, bottom: vp.h - by1 + TOAST_BOTTOM };
}
