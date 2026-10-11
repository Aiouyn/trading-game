import type { WireItem } from '@/world/types';

/** A game hour in ticks (720 ticks a day, 24 hours). Launchpad listings group by it. */
export const HOUR = 30;
/** The feed's line cap: groups and single headlines each count as one line. "Show earlier" adds a page. */
export const PAGE = 60;

export type Entry = { kind: 'row'; item: WireItem } | { kind: 'group'; key: number; start: number; items: WireItem[] };

/**
 * The feed as lines: each headline is one line, and the Launchpad listings of one game hour fold into one collapsible line,
 * so a busy launch cannot flood the feed. Newest first, as the feed holds them.
 */
export function feedLines(items: WireItem[]): Entry[] {
  const out: Entry[] = [];
  for (const w of items) {
    if (w.kind !== 'launchpad') {
      out.push({ kind: 'row', item: w });
      continue;
    }
    const key = Math.floor((w.tick - 1) / HOUR);
    const last = out[out.length - 1];
    if (last && last.kind === 'group' && last.key === key) last.items.push(w);
    else out.push({ kind: 'group', key, start: key * HOUR + 1, items: [w] });
  }
  return out;
}

