/**
 * Hold timers for toasts (P2-086). The game store owns them, not the toast component, so every
 * queued notice expires on its own schedule whether or not it is on screen. A notice queued behind
 * three others still leaves after its hold and never resurfaces stale.
 *
 * Pausing (the pointer or focus is on the toast) stops the count. The time left resumes when every
 * pause has ended, so a toast held by both the pointer and the keyboard waits for both to leave.
 * The clock and the timers are injected, so the rules test without real time.
 */

export interface HoldClock {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface Holds {
  /** Starts the hold for a toast. A second start for the same id replaces the first. */
  start(id: string, ms: number): void;
  /** Adds one pause. Each pause needs its own resume. A pause on an unknown id does nothing. */
  pause(id: string): void;
  resume(id: string): void;
  /** Drops the hold without firing it (the toast was dismissed or trimmed). */
  cancel(id: string): void;
  /** Ids that still hold (for tests and debugging). */
  pending(): string[];
}

interface Hold {
  left: number;
  /** When the running count began, or null while paused. */
  since: number | null;
  handle: unknown;
  pauses: number;
}

export function createHolds(clock: HoldClock, onExpire: (id: string) => void): Holds {
  const holds = new Map<string, Hold>();

  const disarm = (h: Hold): void => {
    if (h.since === null) return;
    h.left = Math.max(0, h.left - (clock.now() - h.since));
    clock.clear(h.handle);
    h.handle = null;
    h.since = null;
  };

  const arm = (id: string, h: Hold): void => {
    if (h.pauses > 0) return;
    h.since = clock.now();
    h.handle = clock.set(() => {
      if (holds.get(id) !== h) return;
      holds.delete(id);
      onExpire(id);
    }, h.left);
  };

  const cancel = (id: string): void => {
    const h = holds.get(id);
    if (!h) return;
    if (h.since !== null) clock.clear(h.handle);
    holds.delete(id);
  };

  return {
    start(id, ms) {
      cancel(id);
      const h: Hold = { left: Math.max(0, ms), since: null, handle: null, pauses: 0 };
      holds.set(id, h);
      arm(id, h);
    },
    pause(id) {
      const h = holds.get(id);
      if (!h) return;
      if (h.pauses === 0) disarm(h);
      h.pauses += 1;
    },
    resume(id) {
      const h = holds.get(id);
      if (!h || h.pauses === 0) return;
      h.pauses -= 1;
      if (h.pauses === 0) arm(id, h);
    },
    cancel,
    pending() {
      return [...holds.keys()];
    },
  };
}
