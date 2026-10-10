import { describe, expect, it } from 'vitest';
import type { WorldEventFrame } from '@/world/view';
import type { WireItem } from '@/world/types';
import { EVENT_BAND_H, bannerBand, selectEventBanner } from './eventSelect';

const TPD = 720;
const ev = (over: Partial<WorldEventFrame> = {}): WorldEventFrame => ({
  id: 'e1', kind: 'crash', headline: 'Markets in freefall.', phase: 'live', elapsedDays: 2, todayShare: {},
  gxSince: -0.18, gxToday: -0.02, ...over,
});
const endItem = (tick: number): WireItem => ({
  id: 'w9', tick, kind: 'world', tag: 'Crash', tone: 'info', text: 'Crash ended',
  ev: { type: 'world', id: 'e1', phase: 'end', kind: 'crash', lastedDays: 18, gxMove: -0.31 },
});

describe('selectEventBanner', () => {
  it('shows a live major, flash or storm', () => {
    expect(selectEventBanner(ev(), [], 2000, TPD)?.kind).toBe('live');
    expect(selectEventBanner(ev({ kind: 'flash' }), [], 2000, TPD)?.kind).toBe('live');
  });

  it('does not raise the banner for a major still announced (its precursors are news)', () => {
    expect(selectEventBanner(ev({ phase: 'announced', elapsedDays: 0 }), [], 2000, TPD)).toBeNull();
  });

  it('shows an announced crisis week', () => {
    expect(selectEventBanner(ev({ kind: 'crisis', phase: 'announced' }), [], 2000, TPD)?.kind).toBe('live');
  });

  it('keeps the aftermath for one game day after the end, then drops it', () => {
    const wire = [endItem(1000)];
    expect(selectEventBanner(null, wire, 1000 + TPD - 1, TPD)?.kind).toBe('aftermath');
    expect(selectEventBanner(null, wire, 1000 + TPD, TPD)).toBeNull();
  });

  it('a live event wins over an aftermath', () => {
    expect(selectEventBanner(ev({ id: 'e2' }), [endItem(1000)], 1100, TPD)?.kind).toBe('live');
  });
});

describe('bannerBand', () => {
  it('takes 34 px on the desktop only', () => {
    const b = selectEventBanner(ev(), [], 1, TPD);
    expect(bannerBand(b, 1440, 768)).toBe(EVENT_BAND_H);
    expect(bannerBand(b, 390, 768)).toBe(0);
    expect(bannerBand(null, 1440, 768)).toBe(0);
  });
});
