// The idle clock for the rank-up ceremony (P2-201): the ceremony waits for 10 s with no pointer, key or
// touch. A drag counts as activity, so it resets the clock. Session memory only; never in a save.
let last = Date.now();

export function markActive(): void {
  last = Date.now();
}

/** Milliseconds since the last pointer, key or touch. */
export function idleMs(): number {
  return Date.now() - last;
}

/** The e2e hook's "10 s ago" (tape-e2e-conventions.md section 3). Changes no rule, only the clock. */
export function backdateIdle(ms: number): void {
  last = Date.now() - ms;
}

const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/** Starts counting activity on the window. Returns the stop function. */
export function listenActivity(): () => void {
  for (const e of EVENTS) window.addEventListener(e, markActive, { passive: true, capture: true });
  return () => {
    for (const e of EVENTS) window.removeEventListener(e, markActive, { capture: true });
  };
}
