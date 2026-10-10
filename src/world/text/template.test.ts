import { describe, expect, it } from 'vitest';
import { usd } from './template';

// usd uses one cached formatter. Its text must match the per-call toLocaleString it replaced, for every sign and size.
describe('usd', () => {
  const legacy = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  it('prints the same text as the per-call formatter it replaced', () => {
    for (const x of [0, 0.004, -0.004, 1, -1.5, 12.345, 999.999, 1234.5, -98765.4321, 1_234_567.891, 9_876_543_210.5, 1e12 + 0.125]) {
      expect(usd(x)).toBe(legacy(x));
    }
  });

  it('groups thousands and keeps two decimals', () => {
    expect(usd(154321)).toBe('$154,321.00');
    expect(usd(-50)).toBe('-$50.00');
  });
});
