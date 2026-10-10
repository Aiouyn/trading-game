// What the world event banner shows (velvet-world-events.md sections 3 and 5). Pure: no React, no store, so
// the desktop's window area and the tests read the same rule. The banner never reads an end tick or a
// remaining length: a live event shows its elapsed days only, and the aftermath comes from the Wire's end story.
import type { WorldEventFrame } from '@/world/view';
import type { WireItem } from '@/world/types';

/** The strip under the status strip (34 px on desktop, under the phone status bar on phone). */
export const EVENT_BAND_H = 34;

export type EventBanner =
  | { kind: 'live'; ev: WorldEventFrame }
  | { kind: 'aftermath'; item: WireItem };

/**
 * The banner now. Live for a major, a flash or a storm in its live phase, and for an announced crisis week.
 * A major's precursors are news on the Wire and do not raise the banner. The aftermath line stays for one
 * game day after the engine ends the event (`tick - endedAt < ticksPerDay`).
 */
export function selectEventBanner(
  ev: WorldEventFrame | null,
  wire: readonly WireItem[],
  tick: number,
  ticksPerDay: number,
): EventBanner | null {
  if (ev && (ev.phase === 'live' || ev.kind === 'crisis')) return { kind: 'live', ev };
  const item = wire.find((w) => w.ev?.type === 'world' && w.ev.phase === 'end' && tick >= w.tick && tick - w.tick < ticksPerDay);
  return item ? { kind: 'aftermath', item } : null;
}

/** The height the banner takes on the desktop now: 0 on the phone (it sits under the phone bar, not the desk). */
export function bannerBand(banner: EventBanner | null, viewportW: number, phoneBp: number): number {
  return banner !== null && viewportW >= phoneBp ? EVENT_BAND_H : 0;
}
