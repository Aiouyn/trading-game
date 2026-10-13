import { describe, expect, it } from 'vitest';
import { formatToken, isNumberToken } from './tokens';
import { translate } from './index';

describe('number tokens in message descriptors (the reader locale formats them)', () => {
  it('money reads $1,500.00 in English and 1 500,00 $ in French, with the sign only when asked', () => {
    expect(formatToken('en', '#usd:1500')).toBe('$1,500.00');
    expect(formatToken('fr', '#usd:1500')).toMatch(/^1\s500,00\s\$$/);
    expect(formatToken('en', '#usd:-1500')).toBe('-$1,500.00');
    expect(formatToken('en', '#susd:12.5')).toBe('+$12.50');
    expect(formatToken('en', '#susd:-3.51')).toBe('-$3.51');
    expect(formatToken('fr', '#susd:-3.51')).toBe('-3,51\u00a0$');
  });

  it('percent reads 1.23% in English and 1,23 % in French; the signed form adds a plus', () => {
    expect(formatToken('en', '#pct:0.0123')).toBe('1.23%');
    expect(formatToken('en', '#spct:0.0123')).toBe('+1.23%');
    expect(formatToken('en', '#spct:-0.0123')).toBe('-1.23%');
    expect(formatToken('fr', '#spct:0.0123')).toBe('+1,23\u00a0%');
  });

  it('a plain number keeps its decimals and recognizes its own forms', () => {
    expect(formatToken('en', '#n:1284.1,2,2')).toBe('1,284.10');
    expect(formatToken('fr', '#n:1284.1,2,2')).toMatch(/^1\s284,10$/);
    expect(isNumberToken('#usd:1')).toBe(true);
    expect(isNumberToken('@key')).toBe(false);
    expect(isNumberToken('#hashtag')).toBe(false);
  });

  it('the client renders a money token in the viewer locale through t()', () => {
    expect(translate('en', 'txt.narr.head.down.2', { amount: '#usd:1500' })).toBe('A rough day: down $1,500.00.');
    expect(translate('fr', 'txt.narr.head.down.2', { amount: '#usd:1500' })).toMatch(/^Journée difficile\s:\sen recul de 1\s500,00\s\$\.$/);
  });
});
