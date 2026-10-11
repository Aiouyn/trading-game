// The world event takeover's rules (velvet-world-events.md section 2). Pure: no React, no store, so the tests read the same
// rule the screen does. A takeover is for the onset of a major (a crash or a bubble) only: never a ripple, a storm, a flash
// or a crisis week. It shows once per event, is skippable from one second in, and never runs later than ten seconds after it
// was due (a late takeover is worse than none: prices keep moving), so a busy moment falls back to the banner.
import type { WorldEventFrame } from '@/world/view';

/** The Close control is live from this many ms into the takeover. */
export const TAKEOVER_SKIP_MS = 1000;
/** The takeover ends by itself after this long (the banner stays). */
export const TAKEOVER_END_MS = 3000;
/** Due-to-show waits at most this long; after it the takeover is skipped for the banner. */
export const TAKEOVER_WAIT_MAX_MS = 10_000;
/** At least this long between two full-screen moments. */
export const FULL_SCREEN_GAP_MS = 8000;

export type TakeoverKind = 'crash' | 'bubble';

/** The kinds that take over: majors only. */
export function isTakeoverKind(kind: WorldEventFrame['kind']): kind is TakeoverKind {
  return kind === 'crash' || kind === 'bubble';
}

/**
 * The event a takeover is due for: a major, live, on its first day, and not shown yet. An event first seen already past its
 * first day (the page opened mid-crash) is never due: the onset has passed.
 */
export function takeoverDue(ev: WorldEventFrame | null, shown: ReadonlySet<string>): WorldEventFrame | null {
  if (!ev || ev.phase !== 'live' || ev.elapsedDays !== 0) return null;
  if (!isTakeoverKind(ev.kind) || shown.has(ev.id)) return null;
  return ev;
}

export type TakeoverGate = 'show' | 'wait' | 'skip';

/**
 * Whether a due takeover may show now. It waits while a rank-up ceremony or an open phone ticket is in front, and within the
 * gap after the last full-screen moment. After ten seconds of waiting it gives up (skip), so the banner carries the news.
 */
export function takeoverGate(waitedMs: number, busy: boolean, sinceLastMs: number): TakeoverGate {
  if (!busy && sinceLastMs >= FULL_SCREEN_GAP_MS) return 'show';
  return waitedMs >= TAKEOVER_WAIT_MAX_MS ? 'skip' : 'wait';
}

/** The stage of a running takeover: whether Close is live and whether it is over. */
export function takeoverStage(elapsedMs: number): { skippable: boolean; done: boolean } {
  return { skippable: elapsedMs >= TAKEOVER_SKIP_MS, done: elapsedMs >= TAKEOVER_END_MS };
}

