import { describe, expect, it } from 'vitest';
import { DEFAULT_ECOLOGY, PENSION_KNEE_ADV, PENSION_MAX_ADV, pensionCapAtKnee } from './ecology';

/**
 * The pension cap over consecutive quarters (V1-PHASE1 F16). The recursion below is the pool's own daily update in ecologyDay:
 * pos = pos x d + order, with order = cap / (1 + capacity |pos| / size) on the last pensionDays days of each quarter, and 0 on
 * the other days. The cap is hit on every trading day, the worst case.
 */
function maxPositionOverQuarters(cap: number, quarters: number, start = 0): number {
  const { halfLives, quarterDays, pensionDays, capacity, sizes } = DEFAULT_ECOLOGY;
  const d = Math.pow(0.5, 1 / halfLives.pension);
  let pos = start, max = 0;
  for (let q = 0; q < quarters; q++) {
    for (let day = 0; day < quarterDays; day++) {
      const order = (day >= quarterDays - pensionDays ? cap : 0) / (1 + (capacity * Math.abs(pos)) / sizes.pension);
      pos = pos * d + order;
      max = Math.max(max, Math.abs(pos));
    }
  }
  return max;
}

describe('pension cap over consecutive quarters (V1-PHASE1 F16)', () => {
  it('keeps the position at or below the capacity knee over 60 consecutive quarters', () => {
    const peak = maxPositionOverQuarters(PENSION_MAX_ADV, 60);
    expect(peak).toBeLessThanOrEqual(PENSION_KNEE_ADV + 1e-9);
    // the cap is the largest one that does this: it reaches the knee, and a 0.5% larger cap breaks it
    expect(peak).toBeGreaterThan(0.99 * PENSION_KNEE_ADV);
    expect(maxPositionOverQuarters(PENSION_MAX_ADV * 1.005, 60)).toBeGreaterThan(PENSION_KNEE_ADV);
  });

  it('keeps the bound from a position already at the knee (the next quarter starts there, not at zero)', () => {
    expect(maxPositionOverQuarters(PENSION_MAX_ADV, 20, PENSION_KNEE_ADV)).toBeLessThanOrEqual(PENSION_KNEE_ADV + 1e-9);
  });

  it('a cap of 1 ADV a day (the round-3 pick) breaks the knee over consecutive quarters', () => {
    expect(maxPositionOverQuarters(1, 60)).toBeGreaterThan(PENSION_KNEE_ADV);
  });

  it('is the bisection result, and the config carries it', () => {
    expect(PENSION_MAX_ADV).toBeCloseTo(pensionCapAtKnee(), 12);
    expect(DEFAULT_ECOLOGY.pensionMaxAdv).toBe(PENSION_MAX_ADV);
    expect(PENSION_MAX_ADV).toBeLessThan(DEFAULT_ECOLOGY.sizes.pension / DEFAULT_ECOLOGY.capacity / DEFAULT_ECOLOGY.pensionDays);
  });
});
