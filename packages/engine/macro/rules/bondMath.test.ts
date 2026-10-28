// T04-11 local price fallback.
import { describe, expect, it } from 'vitest';
import { priceFromYieldLocal } from './bondMath';

describe('priceFromYieldLocal', () => {
  it('zero coupon: 100·e^(−yT)', () => { expect(priceFromYieldLocal(0.05, 0.25, 0.04, 0)).toBeCloseTo(100 * Math.exp(-0.01), 12); });
  it('on a coupon date: no accrued; 2 coupons at 0.5 and 1.0', () => {
    expect(priceFromYieldLocal(0.04, 1, 0.03, 2)).toBeCloseTo(102 * Math.exp(-0.03) + 2 * Math.exp(-0.015), 12);
    expect(priceFromYieldLocal(0.04, 0, 0.03, 2)).toBeCloseTo(100, 12);
  });
  it('between coupons: accrued c/f·100·(1 − t₁·f) is subtracted', () => {
    expect(priceFromYieldLocal(0.04, 0.75, 0.03, 2)).toBeCloseTo(102 * Math.exp(-0.0225) + 2 * Math.exp(-0.0075) - 2 * 0.5, 12);
    expect(priceFromYieldLocal(0.04, 0.25, 0.03, 4)).toBeCloseTo(101 * Math.exp(-0.0075), 12);
  });
  it('negative time to maturity is treated as 0', () => { expect(priceFromYieldLocal(0.04, -1, 0.03, 0)).toBe(100); });
});
