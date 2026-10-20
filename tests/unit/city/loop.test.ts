import { describe, expect, it } from 'vitest';
import { RenderLoop, BACKGROUND_UNSUBSCRIBE_MS, type Scheduler } from '@/city/renderer/loop';

function fakeScheduler() {
  let now = 0;
  let id = 0;
  let hidden = false;
  const rafs = new Map<number, (t: number) => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  const s: Scheduler = {
    raf: (cb) => (rafs.set(++id, cb), id),
    cancelRaf: (i) => void rafs.delete(i),
    setTimeout: (cb, ms) => (timers.set(++id, { at: now + ms, cb }), id),
    clearTimeout: (i) => void timers.delete(i),
    now: () => now,
    docHidden: () => hidden,
  };
  const frame = () => {
    now += 16;
    const due = [...rafs.entries()];
    rafs.clear();
    for (const [, cb] of due) cb(now);
    runTimers();
  };
  const runTimers = () => {
    for (const [i, t] of [...timers.entries()]) if (t.at <= now) {
      timers.delete(i);
      t.cb();
    }
  };
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) frame();
  };
  return { s, frame, advance, rafs, setHidden: (h: boolean) => (hidden = h) };
}

function setup(animating = () => false) {
  const f = fakeScheduler();
  const log = { bgLong: 0, visible: 0 };
  const loop = new RenderLoop(f.s, {
    draw: () => undefined,
    animate: animating,
    onBackgroundLong: () => log.bgLong++,
    onVisible: () => log.visible++,
    onIdle: () => undefined,
  });
  return { f, loop, log };
}

describe('C-06 render on demand', () => {
  it('draws once per invalidation, then no rAF is pending and renders stay constant for 5 s', () => {
    const { f, loop } = setup();
    loop.invalidate();
    loop.invalidate();
    f.frame();
    expect(loop.renders).toBe(1);
    expect(loop.pending).toBe(false);
    f.advance(5000);
    expect(loop.renders).toBe(1);
    expect(f.rafs.size).toBe(0);
  });
  it('forced continuous window renders every frame, then stops', () => {
    const { f, loop } = setup();
    loop.forceContinuous(2000);
    f.advance(2100);
    expect(loop.renders).toBeGreaterThan(100);
    const r = loop.renders;
    f.advance(1000);
    expect(loop.renders).toBe(r);
    expect(loop.pending).toBe(false);
  });
  it('document.hidden or hidden visibility → zero frames over 60 s', () => {
    const { f, loop } = setup(() => true);
    f.setHidden(true);
    loop.docVisibilityChanged();
    for (let i = 0; i < 100; i++) loop.invalidate();
    f.advance(60_000);
    expect(loop.renders).toBe(0);
    expect(loop.framesWhileHidden).toBe(0);
    f.setHidden(false);
    loop.setVisibility('hidden');
    loop.invalidate();
    f.advance(60_000);
    expect(loop.renders).toBe(0);
  });
});

describe('C-07 background', () => {
  it('unsubscribes at 30 s, not before; visible → onVisible and exactly one frame', () => {
    const { f, loop, log } = setup();
    loop.setVisibility('background');
    loop.invalidate();
    f.advance(BACKGROUND_UNSUBSCRIBE_MS - 1000);
    expect(log.bgLong).toBe(0);
    f.advance(2000);
    expect(log.bgLong).toBe(1);
    expect(loop.renders).toBe(0);
    loop.setVisibility('visible');
    expect(log.visible).toBe(1);
    f.advance(1000);
    expect(loop.renders).toBe(1);
  });
  it('returning to visible before 30 s cancels the unsubscribe', () => {
    const { f, loop, log } = setup();
    loop.setVisibility('background');
    f.advance(10_000);
    loop.setVisibility('visible');
    f.advance(40_000);
    expect(log.bgLong).toBe(0);
  });
});
