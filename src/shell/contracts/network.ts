// M2-05 known-offline boundary. The browser's own online/offline signal (the same one src/shell/loader.ts turns into
// the shell's offline pill) is read here for the channel layer and the order door, which may not import shell state.
// "Known offline" = the browser says so. Anything else (a request that fails while the browser still says online) is
// an ordinary network error and keeps the existing behaviour.

export function knownOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Calls fn on every browser online/offline change; returns the unsubscribe. No-op outside a browser.
 *  The event is the same object for every listener of that dispatch, so a feed can dedupe on it. */
export function onNetworkChange(fn: (ev: Event) => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => { window.removeEventListener("online", fn); window.removeEventListener("offline", fn); };
}

/** An order/cancel was not sent at all: the browser was offline before the request left. Nothing reached the server. */
export class IntentNotSentOffline extends Error {
  constructor() { super("not sent: offline"); this.name = "IntentNotSentOffline"; }
}

/** A request left but no answer came back (network lost in flight). The server may or may not have committed it; the
 *  existing idempotency key and the `me` sync settle it. Never reported as cancelled, never re-sent automatically. */
export class IntentOutcomeUnknown extends Error {
  constructor() { super("outcome unknown: network lost in flight"); this.name = "IntentOutcomeUnknown"; }
}

/** Kill switch: the server refused the mutation. Nothing was committed. */
export class GamePaused extends Error {
  constructor(message = "The game is paused.") { super(message); this.name = "GamePaused"; }
}
