import type { WireItem } from '@/world/types';

/** A game hour in ticks (720 ticks a day, 24 hours). Launchpad listings group by it. */
export const HOUR = 30;
/** The feed's line cap: groups and single headlines each count as one line. "Show earlier" adds a page. */
export const PAGE = 60;

export type Entry = { kind: 'row'; item: WireItem } | { kind: 'group'; key: number; start: number; items: WireItem[] };

/**
 * The feed as lines: each headline is one line, and the Launchpad listings of one game hour fold into one collapsible line,
 * so a busy launch cannot flood the feed. Newest first, as the feed holds them. An hour is one line even when a headline of
 * another kind sits between its listings: the group keeps the place of its newest listing, and its key stays unique.
 */
export function feedLines(items: WireItem[]): Entry[] {
  const out: Entry[] = [];
  const groups = new Map<number, Extract<Entry, { kind: 'group' }>>();
  for (const w of items) {
    if (w.kind !== 'launchpad') {
      out.push({ kind: 'row', item: w });
      continue;
    }
    const key = Math.floor((w.tick - 1) / HOUR);
    const open = groups.get(key);
    if (open) {
      open.items.push(w);
      continue;
    }
    const group: Extract<Entry, { kind: 'group' }> = { kind: 'group', key, start: key * HOUR + 1, items: [w] };
    groups.set(key, group);
    out.push(group);
  }
  return out;
}
