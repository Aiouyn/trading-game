import { afterEach, describe, expect, it } from 'vitest';
import { useLocale } from '@/i18n';
import fr from '@/i18n/fr.json';
import en from '@/i18n/en.json';
import { SECTORS, sectorName } from '@/engine';
import { BIZ_SECTORS } from '@/content/businesses';
import { compactMoney, dec, fmtNumber, money, moneyParts, price, pctUnit, signedMoney, signedPct, MINUS } from './format';
import { bizSectorLabel, sectorLabel } from './sectorLabel';

// The formatter follows the viewer's locale (src/i18n). The French figures use a decimal comma, a space before the
// dollar sign and the percent (a no-break space, U+00A0), and the group separator Intl prints (a narrow no-break space).
const NBSP = ' ';
const GROUP = /\s/; // the group separator is a space-like character (U+202F in current ICU)

function inFrench<T>(fn: () => T): T {
  const store = useLocale.getState();
  store.setLocale('fr');
  try {
    return fn();
  } finally {
    store.setLocale('en');
  }
}

afterEach(() => {
  useLocale.getState().setLocale('en');
});

describe('format in French', () => {
  it('money reads the number first and the dollar sign after it', () => {
    inFrench(() => {
      expect(money(183.26)).toBe(`183,26${NBSP}$`);
      expect(money(-12.5)).toBe(`${MINUS}12,50${NBSP}$`);
      expect(money(5248.99)).toMatch(new RegExp(`^5${GROUP.source}248,99${NBSP}\\$$`));
      expect(signedMoney(1284.1)).toMatch(new RegExp(`^\\+1${GROUP.source}284,10${NBSP}\\$$`));
      expect(signedMoney(-292.8)).toBe(`${MINUS}292,80${NBSP}$`);
      expect(signedMoney(0.001)).toBe(`0,00${NBSP}$`);
    });
  });

  it('percent takes a no-break space before the sign and a decimal comma', () => {
    inFrench(() => {
      expect(signedPct(0.0274)).toBe(`+2,74${NBSP}%`);
      expect(signedPct(-0.0105)).toBe(`${MINUS}1,05${NBSP}%`);
      expect(pctUnit()).toBe(`${NBSP}%`);
    });
  });

  it('prices and decimals use the decimal comma', () => {
    inFrench(() => {
      expect(price(0.034)).toBe('0,0340');
      expect(price(41000)).toMatch(new RegExp(`^41${GROUP.source}000,00$`));
      expect(dec(2.5, 1)).toBe('2,5');
      expect(dec(1234.5, 2)).toBe('1234,50'); // no group separator, as toFixed printed it
      expect(fmtNumber(0.5, 2, 2)).toBe('0,50');
    });
  });

  it('compact money keeps the French short forms (k$, M$, Md$)', () => {
    inFrench(() => {
      expect(compactMoney(5000)).toBe(`5${NBSP}k$`);
      expect(compactMoney(5200)).toBe(`5,2${NBSP}k$`);
      expect(compactMoney(20000)).toBe(`20${NBSP}k$`);
      expect(compactMoney(1_400_000)).toBe(`1,4${NBSP}M$`);
      expect(compactMoney(2_000_000_000)).toBe(`2${NBSP}Md$`);
      expect(compactMoney(-250)).toBe(`${MINUS}250${NBSP}$`);
    });
  });

  it('the hero net worth splits into a sign, the whole part, the cents and the dollar sign', () => {
    inFrench(() => {
      const p = moneyParts(-5248.99);
      expect(p.prefix).toBe(MINUS);
      expect(p.whole).toMatch(new RegExp(`^5${GROUP.source}248$`));
      expect(p.cents).toBe(',99');
      expect(p.suffix).toBe(`${NBSP}$`);
    });
  });

  it('the English figures are unchanged after the locale is back to en', () => {
    expect(money(183.26)).toBe('$183.26');
    expect(moneyParts(5248.99)).toEqual({ prefix: '$', whole: '5,248', cents: '.99', suffix: '' });
    expect(compactMoney(5200)).toBe('$5.2k');
  });
});

describe('sector names in the viewer language', () => {
  it('a market sector reads in French and in English', () => {
    expect(inFrench(() => sectorLabel('tech'))).toBe('Technologie');
    expect(sectorLabel('tech')).toBe('Technology');
    expect(sectorLabel('tech')).toBe(sectorName('tech'));
  });

  it('every engine sector has a French name (none falls back to English)', () => {
    const ids = [...SECTORS.map((s) => s.id), 'crypto', 'metals', 'basemetals', 'agri', 'fx', 'rates', 'property'];
    for (const id of ids) {
      expect((fr as Record<string, string>)[`sector.${id}`], `fr sector.${id}`).toBeTruthy();
      expect((en as Record<string, string>)[`sector.${id}`], `en sector.${id}`).toBe(sectorName(id));
    }
  });

  it('every business sector has a French name, and English keeps the content name', () => {
    for (const s of BIZ_SECTORS) {
      expect((fr as Record<string, string>)[`biz.sectorName.${s.id}`], `fr biz.sectorName.${s.id}`).toBeTruthy();
      expect(inFrench(() => bizSectorLabel(s.id, s.name))).toBe((fr as Record<string, string>)[`biz.sectorName.${s.id}`]);
      expect(bizSectorLabel(s.id, s.name)).toBe((en as Record<string, string>)[`biz.sectorName.${s.id}`]);
    }
  });
});
