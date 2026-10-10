import { describe, expect, it } from 'vitest';
import { CEREMONY_IDLE_MS, ceremonyBeat, ceremonyMayStart } from './ceremony';

// The OS-update beats (velvet-desktop-os.md, P2-200, P2-201, P2-206).
describe('OS-update ceremony', () => {
  it('dims over 600 ms, then installs until 2600 ms', () => {
    expect(ceremonyBeat(0).dim).toBe(0);
    expect(ceremonyBeat(300).dim).toBeCloseTo(0.425, 3);
    expect(ceremonyBeat(600).dim).toBe(0.85);
    expect(ceremonyBeat(599).installing).toBe(false);
    expect(ceremonyBeat(600).installing).toBe(true);
    expect(ceremonyBeat(1000).progress).toBeCloseTo(0.5, 5);
    expect(ceremonyBeat(1400).progress).toBe(1);
    expect(ceremonyBeat(2600).installing).toBe(false);
  });

  it('the rank name shows from 1400 ms, the three cards from 2600 ms, Keep going from 4200 ms', () => {
    expect(ceremonyBeat(1399).rankShown).toBe(false);
    expect(ceremonyBeat(1400).rankShown).toBe(true);
    expect(ceremonyBeat(2599).cards).toBe(0);
    expect(ceremonyBeat(2600).cards).toBe(3);
    expect(ceremonyBeat(4199).keepGoing).toBe(false);
    expect(ceremonyBeat(4200).keepGoing).toBe(true);
    expect(ceremonyBeat(4200).done).toBe(true);
  });

  it('skippable from one second on', () => {
    expect(ceremonyBeat(999).skippable).toBe(false);
    expect(ceremonyBeat(1000).skippable).toBe(true);
  });

  it('reduced motion shows the last beat at once', () => {
    const b = ceremonyBeat(0, true);
    expect(b.keepGoing).toBe(true);
    expect(b.cards).toBe(3);
    expect(b.installing).toBe(false);
  });

  it('waits for no pending order, 10 s idle and no world takeover', () => {
    expect(ceremonyMayStart({ pendingOrder: false, idleMs: CEREMONY_IDLE_MS, worldTakeover: false })).toBe(true);
    expect(ceremonyMayStart({ pendingOrder: true, idleMs: 99_000, worldTakeover: false })).toBe(false);
    expect(ceremonyMayStart({ pendingOrder: false, idleMs: 9_999, worldTakeover: false })).toBe(false);
    expect(ceremonyMayStart({ pendingOrder: false, idleMs: 99_000, worldTakeover: true })).toBe(false);
  });
});
