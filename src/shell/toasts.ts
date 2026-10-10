/**
 * Toast rules (P2-085..P2-090, V:137-143). Pure: which toasts show, how long, and which side of
 * the desktop the column sits on. The column itself is drawn by components/os/OsToasts.tsx.
 *
 * Focus mode (P2-069) shows only fills, margin warnings and world events; everything else waits
 * in the bell. A warning and a margin warning stay until they are read (P2-090).
 */

import type { Rect, Size } from './geometry';

export const TOAST_MAX = 3;
export const TOAST_HOLD_MS = 4000;
/** Column geometry from V:143: 332 px wide, 14 px from the right, 10 px under the strip. */
export const TOAST_W = 332;
export const TOAST_EDGE = 14;
export const TOAST_TOP = 10;
/** Height a toast takes in the column, used only to decide whether it covers a Broker. */
export const TOAST_ROW_H = 96;

export type ToastKind = 'fill' | 'margin' | 'world' | 'other';
export type ToastTone = 'gain' | 'loss' | 'warn' | 'info' | 'brass';

/** A toast as the desktop reads it. The game store holds the same shape with a few more fields. */
export interface ShellToast {
  id: string;
  tone: ToastTone;
  text: string;
  kind?: ToastKind;
  /** The app whose window a click opens (a window id is never stored here). */
  app?: string;
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

/** Sticky toasts stay until they are read, not for the hold time (P2-090). */
export function isSticky(t: Pick<ShellToast, 'tone' | 'kind'>): boolean {
  return t.tone === 'warn' || t.kind === 'margin';
}

/**
 * The column's side: the top-right by default, the top-left when a Broker's window sits under it
 * (P2-088). The check is on the column's full height, so a ticket below the top toasts still moves it.
 */
export function toastSide(vp: Size, broker: Rect | null, stripH: number): 'right' | 'left' {
  if (broker === null) return 'right';
  const colX0 = vp.w - TOAST_EDGE - TOAST_W;
  const colX1 = vp.w - TOAST_EDGE;
  const colY0 = stripH + TOAST_TOP;
  const colY1 = colY0 + TOAST_MAX * TOAST_ROW_H;
  // Rects are relative to the work area, which starts below the strip.
  const bx0 = broker.x;
  const bx1 = broker.x + broker.w;
  const by0 = stripH + broker.y;
  const by1 = by0 + broker.h;
  const hit = bx0 < colX1 && bx1 > colX0 && by0 < colY1 && by1 > colY0;
  return hit ? 'left' : 'right';
}
