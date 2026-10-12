import { describe, expect, it } from 'vitest';
import { DEFAULT_TAX_BRACKETS, TAX_RATE_MAX, TAX_SHIFT_MAX, parseTaxBrackets } from '@/content/tax';
import { bracketOf, rateOf, stabilizerTaxShift, taxOf } from './tax';

// R-9-10: the progressive business tax rules (pure). The default brackets: 0% to $250k, 10% to $2.5M, 20% to $25M,
// 30% to $250M, 40% above; the stabilizer's shift moves every rate by at most 5 points and keeps each within [0, 0.45].

const B = DEFAULT_TAX_BRACKETS;

describe('bracketOf: the bracket of a rank basis', () => {
  it('puts every basis in the bracket whose threshold it reaches, with the edges on the upper bracket', () => {
    expect(bracketOf(-1e9, B)).toBe(0);
    expect(bracketOf(0, B)).toBe(0);
    expect(bracketOf(249_999.99, B)).toBe(0);
    expect(bracketOf(250_000, B)).toBe(1);
    expect(bracketOf(2_499_999.99, B)).toBe(1);
    expect(bracketOf(2_500_000, B)).toBe(2);
    expect(bracketOf(25_000_000, B)).toBe(3);
    expect(bracketOf(250_000_000, B)).toBe(4);
    expect(bracketOf(1e15, B)).toBe(4);
  });

  it('a NaN basis falls in the bottom bracket (it never earns a rate it did not reach)', () => {
    expect(bracketOf(Number.NaN, B)).toBe(0);
  });
});

describe('rateOf: the bracket rate, shifted by the stabilizer and clamped', () => {
  it('is the bracket rate with no shift', () => {
    expect(rateOf(0, 0, B)).toBe(0);
    expect(rateOf(300_000, 0, B)).toBe(0.1);
    expect(rateOf(3_000_000, 0, B)).toBe(0.2);
    expect(rateOf(30_000_000, 0, B)).toBe(0.3);
    expect(rateOf(300_000_000, 0, B)).toBe(0.4);
  });

  it('shifts every bracket by the same amount, clamped to plus or minus 5 points', () => {
    expect(rateOf(300_000, 0.02, B)).toBeCloseTo(0.12, 12);
    expect(rateOf(300_000, 0.05, B)).toBeCloseTo(0.15, 12);
    expect(rateOf(300_000, 0.5, B)).toBeCloseTo(0.15, 12); // clamped to +5 points
    expect(rateOf(300_000, -0.5, B)).toBeCloseTo(0.05, 12); // clamped to -5 points
    expect(TAX_SHIFT_MAX).toBe(0.05);
  });

  it('keeps every rate within [0, 0.45], so the top bracket cannot pass 45% and no bracket goes below zero', () => {
    expect(rateOf(300_000_000, 0.05, B)).toBe(TAX_RATE_MAX); // 40% + 5 points
    expect(rateOf(300_000_000, -0.05, B)).toBeCloseTo(0.35, 12);
    expect(rateOf(0, -0.05, B)).toBe(0); // 0% - 5 points is still 0%
    expect(rateOf(0, 0.05, B)).toBeCloseTo(0.05, 12);
  });
});

describe('taxOf: the day tax on one business', () => {
  it('taxes a positive net at the owner bracket, to the cent', () => {
    expect(taxOf(1000, 300_000, 0, B)).toBe(100);
    expect(taxOf(1000, 3_000_000, 0, B)).toBe(200);
    expect(taxOf(333.335, 300_000, 0, B)).toBe(33.33);
  });

  it('a loss is not taxed and earns no credit, whatever the bracket', () => {
    expect(taxOf(-500, 300_000_000, 0, B)).toBe(0);
    expect(taxOf(-500, 0, 0.05, B)).toBe(0);
    expect(taxOf(0, 300_000_000, 0, B)).toBe(0);
    expect(taxOf(Number.NaN, 300_000_000, 0, B)).toBe(0);
  });

  it('taxes the whole day net at the one marginal rate (no slicing across brackets)', () => {
    // a owner just on the 250k edge pays 10% of the whole net, not 0% on the first 250k
    expect(taxOf(10_000, 250_000, 0, B)).toBe(1000);
    expect(taxOf(10_000, 249_999, 0, B)).toBe(0);
  });

  it('applies the stabilizer shift to the rate it taxes', () => {
    expect(taxOf(1000, 0, 0.05, B)).toBe(50); // a bottom-bracket owner pays the shift
    expect(taxOf(1000, 300_000, 0.05, B)).toBe(150);
    expect(taxOf(1000, 300_000, 0.5, B)).toBe(150); // the shift is clamped inside taxOf too
  });
});

describe('stabilizerTaxShift: the lever, only while the stabilizer is engaged', () => {
  it('is zero when the stabilizer is not engaged, whatever its error', () => {
    expect(stabilizerTaxShift(0.03, false)).toBe(0);
    expect(stabilizerTaxShift(-0.03, false)).toBe(0);
  });

  it('scales the error by the gain and clamps it to plus or minus 5 points when engaged', () => {
    expect(stabilizerTaxShift(0.02, true)).toBeCloseTo(0.02, 12);
    expect(stabilizerTaxShift(0.5, true)).toBe(TAX_SHIFT_MAX);
    expect(stabilizerTaxShift(-0.02, true)).toBeCloseTo(-0.02, 12);
    expect(stabilizerTaxShift(-0.5, true)).toBe(-TAX_SHIFT_MAX);
  });

  it('ignores a non-finite error', () => {
    expect(stabilizerTaxShift(Number.NaN, true)).toBe(0);
    expect(stabilizerTaxShift(Number.POSITIVE_INFINITY, true)).toBe(0);
  });
});

describe('parseTaxBrackets: the TAX_BRACKETS knob fails loudly, never silently', () => {
  it('reads a valid table as [threshold, rate] pairs', () => {
    expect(parseTaxBrackets('[[0,0],[100000,0.1],[1000000,0.25]]')).toEqual([[0, 0], [100000, 0.1], [1000000, 0.25]]);
  });

  it('rejects every malformed table with a message that names the problem', () => {
    expect(() => parseTaxBrackets('not json')).toThrow(/not JSON/);
    expect(() => parseTaxBrackets('[]')).toThrow(/non-empty/);
    expect(() => parseTaxBrackets('{"a":1}')).toThrow(/non-empty/);
    expect(() => parseTaxBrackets('[[1000,0.1]]')).toThrow(/start at threshold 0/);
    expect(() => parseTaxBrackets('[[0,0],[500,0.1],[500,0.2]]')).toThrow(/ascend/);
    expect(() => parseTaxBrackets('[[0,0],[500,0.5]]')).toThrow(/within \[0, 0.45\]/);
    expect(() => parseTaxBrackets('[[0,-0.1]]')).toThrow(/within/);
    expect(() => parseTaxBrackets('[[0]]')).toThrow(/two finite numbers/);
    expect(() => parseTaxBrackets('[[0,"0.1"]]')).toThrow(/two finite numbers/);
  });
});
