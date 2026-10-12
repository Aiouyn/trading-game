import { describe, expect, it } from 'vitest';
import { shareFactorFor, shouldExit, siteScore, startAppeal } from './wealth-rules';

describe('the share factor a new business earns (the world share formula)', () => {
  it('a business alone in its pool earns the full factor of 1, at the neutral appeal', () => {
    expect(shareFactorFor(1, { count: 0, expAppeal: 0 })).toBeCloseTo(1, 9);
  });

  it('falls as the pool fills, and reaches the 0.35 floor when the pool is crowded', () => {
    const sf = [0, 2, 5, 10, 20].map((n) => shareFactorFor(1, { count: n, expAppeal: n }));
    for (let k = 1; k < sf.length; k++) expect(sf[k]!).toBeLessThan(sf[k - 1]!);
    expect(shareFactorFor(1, { count: 40, expAppeal: 40 })).toBeCloseTo(0.35, 9);
  });

  it('marketing lifts the share a business earns in the same pool', () => {
    const pool = { count: 10, expAppeal: 10 };
    expect(shareFactorFor(startAppeal(2), pool)).toBeGreaterThan(shareFactorFor(startAppeal(0), pool));
  });
});

describe('site choice: the bot prices the competition, not only the income per dollar', () => {
  it('the same business scores higher in an empty pool than in one already crowded with the bot and NPCs', () => {
    const empty = siteScore(324, 3000, 1, { count: 0, expAppeal: 0 });
    const crowded = siteScore(324, 3000, 1, { count: 17, expAppeal: 19 });
    expect(empty).toBeGreaterThan(crowded);
  });

  it('a business with a better income per dollar still loses to an empty pool when the crowded pool cuts its share', () => {
    // a 10% better return per dollar in a pool with 20 competitors earns less than the plain return in an empty pool
    const crowded = siteScore(1.1 * 324, 3000, 1, { count: 20, expAppeal: 22 });
    const empty = siteScore(324, 3000, 1, { count: 0, expAppeal: 0 });
    expect(empty).toBeGreaterThan(crowded);
  });
});

describe('exit: a checked-in owner sells a shop that has lost money over the window', () => {
  it('keeps a shop with less history than the window', () => {
    expect(shouldExit(new Array(13).fill(-100))).toBe(false);
  });

  it('sells a shop whose net over the last 14 days is negative', () => {
    expect(shouldExit(new Array(14).fill(-5))).toBe(true);
  });

  it('keeps a shop whose recent net is not negative in total, even with one bad day', () => {
    const net = [...new Array(13).fill(10), -30];
    expect(shouldExit(net)).toBe(false);
  });

  it('judges only the window: old losses do not sell a shop that has earned for two weeks', () => {
    const net = [...new Array(30).fill(-50), ...new Array(14).fill(20)];
    expect(shouldExit(net)).toBe(false);
  });
});
