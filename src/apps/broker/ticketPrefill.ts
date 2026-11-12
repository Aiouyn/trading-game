// Pure UI pre-fill for Positions Close (card 27). Records the side and qty the ticket
// should show when it next opens or when it is already open on that asset.
// This is not an order: nothing here previews or places. The ticket stays in edit.
import type { Side } from "@/shell/contracts/channels";

export type TicketPrefill = { assetId: string; side: Side; qtyText: string };

let pending: TicketPrefill | null = null;
const listeners = new Set<(p: TicketPrefill) => boolean>();

/** Remember a Close (or similar) pre-fill. Pending is only consumed by a listener that
 *  actually applies it (same assetId). Otherwise it stays for the next mount's take. */
export function offerTicketPrefill(p: TicketPrefill): void {
  pending = p;
  let applied = false;
  for (const l of listeners) {
    if (l(p)) applied = true;
  }
  if (applied) pending = null;
}

/** One-shot read for a ticket that is just mounting. */
export function takeTicketPrefill(): TicketPrefill | null {
  const p = pending;
  pending = null;
  return p;
}

export function subscribeTicketPrefill(fn: (p: TicketPrefill) => boolean): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Drops the held prefill only. Mid-Place busy belongs to the tickets themselves (card 40). */
export function resetTicketPrefill(): void {
  pending = null;
}

/** Card 40: per asset, the ticket instances that are mid-Place. Close stays off while any is left. */
const submitting = new Map<string, Set<object>>();
const busyListeners = new Set<() => void>();

function notifyBusy(): void {
  for (const l of busyListeners) l();
}

/** Mark (or clear) one ticket instance as mid-Place on an asset. Clearing touches only that instance. */
export function setTicketSubmitting(assetId: string, instance: object, busy: boolean): void {
  const set = submitting.get(assetId);
  if (busy) {
    if (set?.has(instance)) return;
    if (set) set.add(instance);
    else submitting.set(assetId, new Set([instance]));
  } else {
    if (!set?.delete(instance)) return;
    if (set.size === 0) submitting.delete(assetId);
  }
  notifyBusy();
}

/** Account boundary: the next account starts with no ticket mid-Place. */
export function clearTicketSubmitting(): void {
  if (submitting.size === 0) return;
  submitting.clear();
  notifyBusy();
}

export function isTicketSubmitting(assetId: string): boolean {
  return submitting.has(assetId);
}

export function subscribeTicketSubmitting(fn: () => void): () => void {
  busyListeners.add(fn);
  return () => { busyListeners.delete(fn); };
}
