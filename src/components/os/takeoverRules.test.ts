import { describe, expect, it } from 'vitest';
import type { WorldEventFrame } from '@/world/view';
import {
  FULL_SCREEN_GAP_MS, TAKEOVER_END_MS, TAKEOVER_SKIP_MS, TAKEOVER_WAIT_MAX_MS, isTakeoverKind, takeoverDue, takeoverGate,
  takeoverStage,
} from './takeoverRules';

function ev(over: Partial<WorldEventFrame> = {}): WorldEventFrame {
  return {
    id: 'ev1', kind: 'crash', headline: 'Markets in freefall.', headlineKey: 'event.headline.crash.0', phase: 'live', elapsedDays: 0, todayShare: {},
    gxSince: null, gxToday: -0.062, ...over,
  };
}

describe('the takeover is for a major onset only (velvet-world-events.md section 2)', () => {
  it('takes over for a crash or a bubble on its first live day', () => {
    expect(takeoverDue(ev(), new Set())).not.toBeNull();
    expect(takeoverDue(ev({ kind: 'bubble' }), new Set())).not.toBeNull();
  });

  it('never for a ripple-sized storm, a flash, a crisis week, an announcement or a later day', () => {
    expect(takeoverDue(ev({ kind: 'flash' }), new Set())).toBeNull();
    expect(takeoverDue(ev({ kind: 'crisis' }), new Set())).toBeNull();
    expect(takeoverDue(ev({ phase: 'announced' }), new Set())).toBeNull();
    expect(takeoverDue(ev({ elapsedDays: 3 }), new Set())).toBeNull();
    expect(takeoverDue(null, new Set())).toBeNull();
    expect(isTakeoverKind('flash')).toBe(false);
    expect(isTakeoverKind('crash')).toBe(true);
  });

  it('shows once per event', () => {
    expect(takeoverDue(ev(), new Set(['ev1']))).toBeNull();
    expect(takeoverDue(ev({ id: 'ev2' }), new Set(['ev1']))).not.toBeNull();
  });

  it('is skippable from one second in and ends by itself after three', () => {
    expect(TAKEOVER_SKIP_MS).toBe(1000);
    expect(TAKEOVER_END_MS).toBe(3000);
    expect(takeoverStage(0)).toEqual({ skippable: false, done: false });
    expect(takeoverStage(999)).toEqual({ skippable: false, done: false });
    expect(takeoverStage(1000)).toEqual({ skippable: true, done: false });
    expect(takeoverStage(3000)).toEqual({ skippable: true, done: true });
  });

  it('waits behind a rank-up or an open ticket, never more than ten seconds, and never inside the gap after another moment', () => {
    expect(takeoverGate(0, false, Infinity)).toBe('show');
    expect(takeoverGate(0, true, Infinity)).toBe('wait');
    expect(takeoverGate(TAKEOVER_WAIT_MAX_MS - 1, true, Infinity)).toBe('wait');
    expect(takeoverGate(TAKEOVER_WAIT_MAX_MS, true, Infinity)).toBe('skip');
    expect(takeoverGate(0, false, FULL_SCREEN_GAP_MS - 1)).toBe('wait');
    expect(takeoverGate(0, false, FULL_SCREEN_GAP_MS)).toBe('show');
  });
});
