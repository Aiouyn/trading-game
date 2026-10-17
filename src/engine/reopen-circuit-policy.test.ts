import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config';
import { createWorld, shockPrice, step, stepMany } from './sim';
import { halfSpread, haltWidening } from './trading';
import type { WorldState } from './types';

// A deterministic, order-free reopening across midnight. The halt began yesterday.
function reopened(): WorldState {
  const stock = { ...defaultConfig().assets[0]!, vol: 0, drift: 0, cycleBeta: 0, jumpsPerYear: 0, halfLifeDays: 1e12 };
  const cfg = defaultConfig({ ticksPerDay: 24, assets: [stock], indices: [] });
  const fresh = createWorld('reopen-circuit-policy', cfg);
  const start = { ...fresh, tick: 24, assets: fresh.assets.map(a => ({ ...a, haltUntil: 26, haltedToday: true })) };
  const waiting = step(start);
  expect(waiting.state.assets[0]!.haltUntil).toBe(26);
  const done = step(waiting.state);
  expect(done.events.some(e => e.type === 'reopen')).toBe(true);
  return done.state;
}

describe('reopening spread state does not change the bare circuit-breaker policy', () => {
  it('a cross-day reopening still allows a new threshold halt that day, without orders', () => {
    const s = reopened();
    const next = step(shockPrice(s, s.assets[0]!.id, 0.2));
    expect(next.events.some(e => e.type === 'halt')).toBe(true);
    expect(next.state.assets[0]!.haltUntil).toBe(27 + s.config.haltTicks);
    expect(next.state.orders).toEqual([]);
    expect(next.state.accounts).toEqual({});
  });

  it('retains 1.5x reopening spreads while leaving circuit-breaker eligibility available', () => {
    const s = reopened();
    expect(s.assets[0]!.haltedToday).toBe(false);
    expect(s.assets[0]!.reopenedToday).toBe(true);
    expect(haltWidening(s, 0)).toBe(1.5);
    const normal = { ...s, assets: s.assets.map(a => ({ ...a, reopenedToday: false })) };
    expect(halfSpread(s, 0)).toBeCloseTo(1.5 * halfSpread(normal, 0), 12);
    expect(haltWidening(stepMany(s, 49 - s.tick).state, 0)).toBe(1);
  });

  it('persists spread widening through JSON saves and accepts saves without the optional flag', () => {
    const loaded: WorldState = JSON.parse(JSON.stringify(reopened()));
    expect(haltWidening(loaded, 0)).toBe(1.5);
    expect(step(shockPrice(loaded, loaded.assets[0]!.id, 0.2)).events.some(e => e.type === 'halt')).toBe(true);
    const old = { ...loaded, assets: loaded.assets.map(a => { const copy = { ...a }; delete copy.reopenedToday; return copy; }) };
    expect(haltWidening(old, 0)).toBe(1);
    expect(step(shockPrice(old, old.assets[0]!.id, 0.2)).events.some(e => e.type === 'halt')).toBe(true);
  });
});
