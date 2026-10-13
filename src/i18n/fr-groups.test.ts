import { afterEach, describe, expect, it } from 'vitest';
import { useLocale, translate } from './index';
import { formatToken } from './tokens';
import { money, moneyParts, signedMoney, fmtNumber, compactMoney } from '@/game/format';

// R-10-7 (French): the group separator is a no-break space (U+00A0). Intl prints U+202F, which the body and hero fonts draw
// with no gap, so "8 005 250,00 $" read "8005250,00 $" on screen. These tests read the French strings the screens render.
const NBSP = ' ';
const NNBSP = ' ';

function inFrench<T>(fn: () => T): T {
  useLocale.getState().setLocale('fr');
  try {
    return fn();
  } finally {
    useLocale.getState().setLocale('en');
  }
}

afterEach(() => useLocale.getState().setLocale('en'));

describe('French figures group with a no-break space (U+00A0)', () => {
  it('the Portfolio hero money reads 8 005 250,00 $ with a visible gap', () => {
    inFrench(() => {
      expect(money(8005250)).toBe(`8${NBSP}005${NBSP}250,00${NBSP}$`);
      const parts = moneyParts(8005250);
      expect(`${parts.whole},${parts.cents.slice(1)}`).toBe(`8${NBSP}005${NBSP}250,00`);
      expect(signedMoney(-1284.1)).toBe(`−1${NBSP}284,10${NBSP}$`);
    });
  });

  it('the Research Desk fee reads 20 000,00 $ in its copy', () => {
    inFrench(() => {
      expect(money(20000)).toBe(`20${NBSP}000,00${NBSP}$`);
      expect(translate('fr', 'desk.unlock.sub', { days: 7, fee: '#usd:20000' })).toContain(`20${NBSP}000,00${NBSP}$`);
      expect(translate('fr', 'work.desk.billed', { fee: '#usd:20000' })).toContain(`20${NBSP}000,00${NBSP}$`);
    });
  });

  it('number tokens and plain figures carry the no-break space too', () => {
    inFrench(() => {
      expect(formatToken('fr', '#usd:1234567.5')).toBe(`1${NBSP}234${NBSP}567,50${NBSP}$`);
      expect(formatToken('fr', '#n:1234567,0,0')).toBe(`1${NBSP}234${NBSP}567`);
      expect(fmtNumber(41000, 2, 2)).toBe(`41${NBSP}000,00`);
    });
  });

  it('no French figure carries the narrow no-break space, and none uses a decimal point between digits', () => {
    const samples: string[] = [];
    inFrench(() => {
      samples.push(money(8005250), signedMoney(-5248.99), compactMoney(8005250), fmtNumber(1234567.891, 2, 2));
      samples.push(formatToken('fr', '#usd:8005250'), formatToken('fr', '#n:8005250,0,0'), formatToken('fr', '#pct:0.0274'));
      samples.push(translate('fr', 'desk.unlock.sub', { days: 7, fee: '#usd:20000' }));
    });
    for (const s of samples) {
      expect(s, s).not.toContain(NNBSP);
      expect(s, s).not.toMatch(/\d\.\d/);
    }
  });
});
