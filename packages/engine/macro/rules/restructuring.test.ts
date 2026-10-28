import { describe, expect, it } from 'vitest';
import { priceFromYieldLocal } from './bondMath';
import { facePer100, haircut, newBondCoupon, npcAcceptProbability } from './restructuring';

describe('T04-13 restructuring terms (worked example)', () => {
  it('haircut, coupon, prices and face per 100', () => {
    const h = haircut(1.2, 0.6);
    expect(h.toFixed(6)).toBe('0.333333');
    expect(newBondCoupon(0.05).toFixed(6)).toBe('0.030000');
    expect(newBondCoupon(0.02)).toBe(0.02);
    expect(priceFromYieldLocal(0.03, 8, 0.08, 2).toFixed(6)).toBe('70.103609');
    expect(priceFromYieldLocal(0.03, 15, 0.08, 2).toFixed(6)).toBe('55.804028');
    expect(facePer100(h, 0.03, 0.08).toFixed(6)).toBe('105.897733');
    expect(facePer100(h - 0.05, 0.03, 0.08).toFixed(6)).toBe('113.840063');
  });
  it('haircut clamps at 0.20 and 0.60', () => {
    expect(haircut(1.0, 0.7)).toBe(0.20);
    expect(haircut(3.0, 0.6)).toBe(0.60);
    expect(haircut(0.5, 0.6)).toBe(0.20);
  });
  it('NPC acceptance', () => {
    expect(npcAcceptProbability(0.666667, 55).toFixed(6)).toBe('0.965555');
    expect(npcAcceptProbability(0.666667, 70).toFixed(6)).toBe('0.582572');
    expect(npcAcceptProbability(0.5, 55)).toBeCloseTo(0.5, 12);
  });
});
