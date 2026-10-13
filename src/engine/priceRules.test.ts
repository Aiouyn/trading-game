import { describe, expect, it } from 'vitest';
import { dexDigits, priceRule } from './priceRules';

/** R-10-3: each asset class has its own tick and display precision; every price display reads these rules. */
describe('price precision by asset class (R-10-3)', () => {
  it('stocks, bonds, property and commodities: 2 decimals, 4 below a dollar', () => {
    expect(priceRule('stock', 182.4)).toEqual({ decimals: 2, tick: 0.01 });
    expect(priceRule('stock', 0.4213)).toEqual({ decimals: 4, tick: 0.0001 });
    expect(priceRule('bond', 100.5)).toEqual({ decimals: 2, tick: 0.01 });
    expect(priceRule('realestate', 104.25).decimals).toBe(2);
    expect(priceRule('commodity', 2100).decimals).toBe(2);
  });

  it('FX: 5 decimals below 10, 3 near 100 (the JPY-like pairs)', () => {
    expect(priceRule('forex', 1.08123).decimals).toBe(5);
    expect(priceRule('forex', 1.08123).tick).toBeCloseTo(1e-5, 12);
    expect(priceRule('forex', 149.123).decimals).toBe(3);
    expect(priceRule('forex', 0.66123).decimals).toBe(5);
    expect(priceRule('forex', 0.0068).decimals).toBe(5);
  });

  it('crypto: 2 decimals from a dollar up, 4 significant digits below it', () => {
    expect(priceRule('crypto', 41000.5).decimals).toBe(2);
    expect(priceRule('crypto', 2.5).decimals).toBe(2);
    expect(priceRule('crypto', 0.5123)).toEqual({ decimals: 4, tick: 0.0001 });
    expect(priceRule('crypto', 0.0342).decimals).toBe(5);
    expect(priceRule('crypto', 0.0021).decimals).toBe(6);
  });

  it('memecoins below a tenth of a cent take the DEX subscript form, with the tick on the last digit', () => {
    const r = priceRule('crypto', 0.0000082);
    expect(r.dex).toEqual({ zeros: 5, digits: 4 });
    expect(r.tick).toBeCloseTo(1e-9, 15);
    expect(priceRule('crypto', 0.0009).dex).toBeDefined();
    expect(priceRule('crypto', 0.001).dex).toBeUndefined();
  });

  it('a zero or non-finite price falls back to 2 decimals (never a NaN precision)', () => {
    expect(priceRule('stock', 0)).toEqual({ decimals: 2, tick: 0.01 });
    expect(priceRule('forex', Number.NaN)).toEqual({ decimals: 2, tick: 0.01 });
  });
});

describe('DEX digits (the subscript form counts its zeros, then 4 significant digits)', () => {
  it('0.0000082 is five zeros then 82, and 0.0000410 is four zeros then 41', () => {
    expect(dexDigits(0.0000082, 5, 4)).toBe('82');
    expect(dexDigits(0.000041, 4, 4)).toBe('41');
  });
  it('a full four-digit mantissa keeps its digits: 0.0000 4123 is 4123', () => {
    expect(dexDigits(0.00004123, 4, 4)).toBe('4123');
  });
});
