import { afterEach, describe, expect, it } from 'vitest';
import { useLocale } from '@/i18n';
import type { AssetClass } from '@/engine';
import { assetPrice, sharePrice, signedChange } from './format';

// R-10-3: one formatter (assetPrice) writes every price, with the asset's own precision; the French form uses the decimal
// comma and the DEX form counts its zeros in a subscript in either language. Every class is covered in both locales.

function inLocale<T>(loc: 'en' | 'fr', fn: () => T): T {
  useLocale.getState().setLocale(loc);
  try {
    return fn();
  } finally {
    useLocale.getState().setLocale('en');
  }
}

afterEach(() => {
  useLocale.getState().setLocale('en');
});

const def = (assetClass: AssetClass) => ({ assetClass });

describe('assetPrice: every class, English', () => {
  const cases: [AssetClass, number, string][] = [
    ['stock', 182.4, '182.40'],
    ['stock', 0.4213, '0.4213'],
    ['bond', 100.5, '100.50'],
    ['realestate', 104.25, '104.25'],
    ['commodity', 2100, '2,100.00'],
    ['forex', 1.08123, '1.08123'],
    ['forex', 0.66123, '0.66123'],
    ['forex', 149.123, '149.123'],
    ['forex', 0.0068, '0.006800'],
    ['forex', 0.006671, '0.006671'],
    ['forex', 0.00068, '0.0006800'],
    ['crypto', 41000.5, '41,000.50'],
    ['crypto', 2.5, '2.50'],
    ['crypto', 0.5123, '0.5123'],
    ['crypto', 0.0342, '0.03420'],
    ['crypto', 0.0021, '0.002100'],
    ['crypto', 0.0000082, '0.0₅82'],
    ['crypto', 0.0000410, '0.0₄41'],
    ['crypto', 0.00004123, '0.0₄4123'],
  ];
  for (const [cls, n, want] of cases) {
    it(`${cls} ${n} reads ${want}`, () => {
      expect(assetPrice(def(cls), n)).toBe(want);
    });
  }

  it('a sub-dollar yen-in-dollars quote keeps its tick (0.00667 is not 0.00)', () => {
    expect(assetPrice(def('forex'), 0.00667)).toBe('0.006670');
  });

  it('the share price (a company or exchange stock) uses the stock rule', () => {
    expect(sharePrice(141.89)).toBe('141.89');
    expect(sharePrice(0.034)).toBe('0.0340');
  });
});

describe('assetPrice: every class, French', () => {
  it('the decimal comma everywhere, and the DEX subscript keeps its zeros', () => {
    inLocale('fr', () => {
      expect(assetPrice(def('stock'), 182.4)).toBe('182,40');
      expect(assetPrice(def('stock'), 0.4213)).toBe('0,4213');
      expect(assetPrice(def('forex'), 1.08123)).toBe('1,08123');
      expect(assetPrice(def('forex'), 149.123)).toBe('149,123');
      expect(assetPrice(def('forex'), 0.0068)).toBe('0,006800');
      expect(assetPrice(def('commodity'), 2100)).toMatch(/^2\s?100,00$/);
      expect(assetPrice(def('crypto'), 0.0342)).toBe('0,03420');
      expect(assetPrice(def('crypto'), 0.0000082)).toBe('0,0₅82');
      expect(sharePrice(0.034)).toBe('0,0340');
    });
  });

  it('no dot decimal appears in any French price', () => {
    inLocale('fr', () => {
      const all: AssetClass[] = ['stock', 'crypto', 'commodity', 'forex', 'bond', 'realestate'];
      for (const cls of all) {
        for (const n of [0.0000082, 0.0068, 0.4213, 1.08123, 182.4, 41000.5]) {
          expect(assetPrice(def(cls), n)).not.toContain('.');
        }
      }
    });
  });
});

describe('signedChange follows the class precision (R-10-3)', () => {
  it('a stock change is shown to the cent; an FX change to the pip fraction', () => {
    expect(signedChange(0.0394, 141.89, 'stock')).toBe('+0.04');
    expect(signedChange(0.00012, 1.08, 'forex')).toBe('+0.00012');
    expect(signedChange(-0.00012, 1.08, 'forex')).toBe('−0.00012');
  });
});
