import { describe, expect, it } from 'vitest';
import { type HoldClock, createHolds } from './holds';

/** A manual clock: time moves only when the test advances it, and due timers fire in order. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: HoldClock = {
    now: () => now,
    set: (fn, ms) => {
      const h = ++seq;
      timers.set(h, { at: now + ms, fn });
      return h;
    },
    clear: (h) => {
      timers.delete(h as number);
    },
  };
  const advance = (ms: number): void => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    now = end;
  };
  return { clock, advance, armed: () => timers.size };
}

describe('toast holds (P2-086)', () => {
  it('expires each notice after its own hold, counted from when it was queued', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    const holds = createHolds(clock, (id) => fired.push(id));
    holds.start('a', 4000);
    advance(1000);
    holds.start('b', 4000);
    advance(3000);
    expect(fired).toEqual(['a']);
    advance(1000);
    expect(fired).toEqual(['a', 'b']);
    expect(holds.pending()).toEqual([]);
  });

  it('a notice queued behind others still expires on time, even when it was never on screen', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    const holds = createHolds(clock, (id) => fired.push(id));
    for (const id of ['t1', 't2', 't3', 't4', 't5']) holds.start(id, 4000);
    advance(4000);
    expect(fired).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('a pause stops the count and the remaining time resumes', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    const holds = createHolds(clock, (id) => fired.push(id));
    holds.start('a', 4000);
    advance(1000);
    holds.pause('a');
    advance(10_000);
    expect(fired).toEqual([]);
    holds.resume('a');
    advance(2999);
    expect(fired).toEqual([]);
    advance(1);
    expect(fired).toEqual(['a']);
  });

  it('two pauses (pointer and focus) need two resumes before the count runs again', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    const holds = createHolds(clock, (id) => fired.push(id));
    holds.start('a', 4000);
    holds.pause('a');
    holds.pause('a');
    holds.resume('a');
    advance(5000);
    expect(fired).toEqual([]);
    holds.resume('a');
    advance(4000);
    expect(fired).toEqual(['a']);
  });

  it('cancel drops a hold without firing it, and a pause or resume on an unknown id does nothing', () => {
    const { clock, advance, armed } = fakeClock();
    const fired: string[] = [];
    const holds = createHolds(clock, (id) => fired.push(id));
    holds.start('a', 4000);
    holds.cancel('a');
    holds.pause('ghost');
    holds.resume('ghost');
    advance(10_000);
    expect(fired).toEqual([]);
    expect(armed()).toBe(0);
  });

  it('starting again for the same id replaces the old hold', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    const holds = createHolds(clock, (id) => fired.push(id));
    holds.start('a', 1000);
    holds.start('a', 4000);
    advance(3999);
    expect(fired).toEqual([]);
    advance(1);
    expect(fired).toEqual(['a']);
  });
});
