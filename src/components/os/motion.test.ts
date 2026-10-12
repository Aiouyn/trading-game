import { afterEach, describe, expect, it, vi } from 'vitest';
import { finishRunningMotion, reducedMotion, systemReducesMotion } from './motion';

// The shared reduced-motion check reads <html data-motion> and the system query. Both are stubbed here (the suite runs in node).
function stubPage(opts: { motion?: string; system?: boolean }) {
  vi.stubGlobal('document', { documentElement: { dataset: opts.motion ? { motion: opts.motion } : {} } });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: opts.system === true }) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('one reduced-motion check (the Settings switch and the system setting)', () => {
  it('is off when neither the switch nor the system asks for less motion', () => {
    stubPage({});
    expect(reducedMotion()).toBe(false);
    expect(systemReducesMotion()).toBe(false);
  });

  it('is on when the Settings switch is on, with the system setting off', () => {
    stubPage({ motion: 'reduce' });
    expect(reducedMotion()).toBe(true);
    expect(systemReducesMotion()).toBe(false);
  });

  it('is on when only the system asks for it', () => {
    stubPage({ system: true });
    expect(reducedMotion()).toBe(true);
    expect(systemReducesMotion()).toBe(true);
  });
});

describe('finishRunningMotion', () => {
  it('finishes a finite running motion and leaves an infinite one running', () => {
    const finite = { playState: 'running', effect: { getComputedTiming: () => ({ endTime: 120 }) }, finish: vi.fn() };
    const infinite = { playState: 'running', effect: { getComputedTiming: () => ({ endTime: Infinity }) }, finish: vi.fn() };
    const done = { playState: 'finished', effect: { getComputedTiming: () => ({ endTime: 0 }) }, finish: vi.fn() };
    vi.stubGlobal('document', { getAnimations: () => [finite, infinite, done] });
    finishRunningMotion();
    expect(finite.finish).toHaveBeenCalledTimes(1);
    expect(infinite.finish).not.toHaveBeenCalled();
    expect(done.finish).not.toHaveBeenCalled();
  });
});
