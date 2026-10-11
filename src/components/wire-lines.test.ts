import { describe, expect, it } from 'vitest';
import { HOUR, feedLines } from './wire-lines';
import type { WireItem } from '@/world/types';

function item(id: string, tick: number, kind: WireItem['kind']): WireItem {
  return { id, tick, kind, tag: kind, text: id, tone: 'info' };
}

describe('the Wire feed as lines (Stage 3)', () => {
  it('folds the Launchpad listings of one game hour into one group line, and keeps other headlines as rows', () => {
    const feed = [
      item('l3', HOUR * 5 + 2, 'launchpad'),
      item('l2', HOUR * 5 + 1, 'launchpad'),
      item('m1', HOUR * 5, 'move'),
      item('l1', 1, 'launchpad'),
    ];
    const lines = feedLines(feed);
    expect(lines.map((e) => e.kind)).toEqual(['group', 'row', 'group']);
    const first = lines[0]!;
    expect(first.kind === 'group' && first.items.map((w) => w.id)).toEqual(['l3', 'l2']);
  });

  it('a busy launch becomes one line per hour, whatever the number of listings', () => {
    const feed = Array.from({ length: 40 }, (_, k) => item(`x${k}`, 100 + (k % 3), 'launchpad'));
    const lines = feedLines(feed);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.kind === 'group' && lines[0]!.items).toHaveLength(40);
  });
});

describe('the Wire feed: one Launchpad line per hour', () => {
  it('a headline between two listings of one hour does not split the hour into two lines with the same key', () => {
    const feed = [
      item('l2', HOUR * 5 + 2, 'launchpad'),
      item('m1', HOUR * 5 + 1, 'move'),
      item('l1', HOUR * 5 + 1, 'launchpad'),
    ];
    const lines = feedLines(feed);
    expect(lines.map((e) => e.kind)).toEqual(['group', 'row']);
    const group = lines[0]!;
    expect(group.kind === 'group' && group.items.map((w) => w.id)).toEqual(['l2', 'l1']);
  });
});
