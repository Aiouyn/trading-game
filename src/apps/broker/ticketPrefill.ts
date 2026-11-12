// Pure UI pre-fill for Positions Close (card 27). Records the side and qty the ticket
// should show when it next opens or when it is already open on that asset.
// This is not an order: nothing here previews or places. The ticket stays in edit.
import type { Side } from "@/shell/contracts/channels";

export type TicketPrefill = { assetId: string; side: Side; qtyText: string };

let pending: TicketPrefill | null = null;
const listeners = new Set<(p: TicketPrefill) => void>();

/** Remember a Close (or similar) pre-fill. If a ticket is already subscribed, it consumes it now. */
export function offerTicketPrefill(p: TicketPrefill): void {
  pending = p;
  if (listeners.size > 0) {
    for (const l of listeners) l(p);
    pending = null;
  }
}

/** One-shot read for a ticket that is just mounting. */
export function takeTicketPrefill(): TicketPrefill | null {
  const p = pending;
  pending = null;
  return p;
}

export function subscribeTicketPrefill(fn: (p: TicketPrefill) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function resetTicketPrefill(): void {
  pending = null;
}
