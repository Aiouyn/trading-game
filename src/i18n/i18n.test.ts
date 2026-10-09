import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { translate } from './index';

describe('i18n', () => {
  it('interpolates variables and picks plural forms', () => {
    expect(translate('en', 'common.shares', { count: 1 })).toBe('1 share');
    expect(translate('en', 'common.shares', { count: 3 })).toBe('3 shares');
    expect(translate('fr', 'common.shares', { count: 3 })).toBe('3 actions');
  });

  it('falls back to English, then to the key', () => {
    expect(translate('fr', '__missing__')).toBe('__missing__');
  });

  it('every French key exists in English and keeps the same variables', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [k, v] of Object.entries(fr as Record<string, string>)) {
      expect(k in en, `fr key ${k} missing in en`).toBe(true);
      expect(vars(v), `variables differ for ${k}`).toBe(vars((en as Record<string, string>)[k]!));
    }
  });
});
