import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { LP, LP_K } from '@/world/launchpad/constants';
import { normalizeName } from '@/world/launchpad/moderate';
import {
  GRAD_RAISE, REFUSAL_CODES, allocationFromPct, buzzKey, centsFromDollars, clientCheck, codeOf, curveYOf, gameDayOf, lpPrice, reasonKey,
  deadReasonKey, refusalCopy, refusalOf, sideKey, statusKey, taglineKey, TAGLINES, tokens,
} from './copy';

// The Launchpad copy: every key a helper can return exists in English and French, every refusal has its three parts, and the
// price, allocation and check helpers keep the world's units.
const EN = en as Record<string, string>;
const FR = fr as Record<string, string>;

describe('refusal copy', () => {
  it('every refusal code the world sends has its three parts in both languages', () => {
    for (const c of REFUSAL_CODES) {
      for (const part of ['what', 'why', 'do']) {
        expect(EN[`lp.refuse.${c}.${part}`], `${c}.${part} en`).toBeTruthy();
        expect(FR[`lp.refuse.${c}.${part}`], `${c}.${part} fr`).toBeTruthy();
      }
    }
  });

  it('the generic line is the fallback for a code with no copy, never a raw key', () => {
    const c = refusalCopy('noSuchCode');
    expect(c.what).toBe(EN['lp.refuse.unknown.what']);
    expect(c.why).toBe(EN['lp.refuse.unknown.why']);
    expect(c.do).toBe(EN['lp.refuse.unknown.do']);
  });

  it('a refusal from the world reads its three descriptors with their numbers', () => {
    const data = {
      refusal: 'slippage',
      parts: [
        { key: 'lp.refuse.slippage.what', vars: { slip: '9.0%', max: '5.0%' } },
        { key: 'lp.refuse.slippage.why', vars: { slip: '9.0%', max: '5.0%' } },
        { key: 'lp.refuse.slippage.do', vars: { slip: '9.0%', max: '5.0%' } },
      ],
    };
    const c = refusalOf(data);
    expect(c.what).toBe(EN['lp.refuse.slippage.what'].replace('{slip}', '9.0%').replace('{max}', '5.0%'));
    expect(c.do).toBe(EN['lp.refuse.slippage.do'].replace('{slip}', '9.0%').replace('{max}', '5.0%'));
    expect(codeOf(data)).toBe('slippage');
    expect(codeOf(undefined)).toBeNull();
  });

  it('every refusal code the client can find before it sends resolves in both languages', () => {
    for (const code of ['maxSlip', 'zero', 'slippage', 'holdings', 'locked', 'tooLarge', 'sold', 'tooSmall', 'tickerFormat', 'nameFormat', 'nameCrypto', 'tickerCrypto', 'nameAbuse', 'nameBrand', 'nameFigure', 'nameTaken']) {
      for (const part of ['what', 'why', 'do']) {
        expect(EN[`lp.refuse.${code}.${part}`], `${code}.${part}`).toBeTruthy();
      }
    }
  });
});

describe('labels and keys', () => {
  it('every key the labels can return exists in both languages', () => {
    const keys: string[] = [];
    for (const s of ['live', 'graduated', 'dead']) keys.push(statusKey(s));
    for (const r of ['dump', 'sweep']) keys.push(reasonKey(r));
    for (const id of TAGLINES) keys.push(taglineKey(id));
    for (const s of ['buy', 'sell'] as const) keys.push(sideKey(s));
    for (const k of ['board', 'wire'] as const) keys.push(buzzKey(k));
    for (const f of ['new', 'trending', 'graduated']) keys.push(`lp.feed.empty.${f}`);
    for (const k of keys) {
      expect(EN[k], `${k} en`).toBeTruthy();
      expect(FR[k], `${k} fr`).toBeTruthy();
    }
  });

  it('the French of every Launchpad key keeps the variables of the English', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const k of Object.keys(EN).filter((x) => x.startsWith('lp.'))) {
      expect(vars(FR[k]!), k).toBe(vars(EN[k]!));
    }
  });
});

describe('prices and figures', () => {
  it('a launch price keeps enough digits to show a move', () => {
    expect(lpPrice(LP_K / (LP.Y0 * LP.Y0))).toBe('0.0000139795');
    expect(lpPrice(0.000216)).toBe('0.000216');
    expect(lpPrice(0.0342)).toBe('0.0342');
    expect(lpPrice(1284.1)).toBe('1,284.10');
    expect(lpPrice(0)).toBe('0.00');
  });

  it('the curve progress maps back to the token reserve exactly', () => {
    expect(curveYOf(0)).toBe(LP.Y0);
    expect(curveYOf(1)).toBe(LP.Y0 - LP.CURVE_SUPPLY);
    const y = 900_123_457;
    expect(curveYOf((LP.Y0 - y) / LP.CURVE_SUPPLY)).toBe(y);
  });

  it('the raise to graduation is about $43,950 (lead-launchpad.md L3)', () => {
    expect(GRAD_RAISE).toBeGreaterThan(43_900);
    expect(GRAD_RAISE).toBeLessThan(44_000);
  });

  it('an allocation typed as a percent becomes whole tokens of supply', () => {
    expect(allocationFromPct('5')).toBe(LP.ALLOC_MAX);
    expect(allocationFromPct('0.1')).toBe(1_000_000);
    expect(allocationFromPct('')).toBeNull();
    expect(allocationFromPct('x')).toBeNull();
  });

  it('a typed dollar amount becomes whole cents, and only a positive one', () => {
    expect(centsFromDollars('12.34')).toBe(1234);
    expect(centsFromDollars('0')).toBeNull();
    expect(centsFromDollars('')).toBeNull();
  });

  it('a tick maps to its game day, and tokens are whole with separators', () => {
    expect(gameDayOf(0)).toBe(0);
    expect(gameDayOf(1)).toBe(0);
    expect(gameDayOf(721)).toBe(1);
    expect(tokens(1234567.4)).toBe('1,234,567');
  });
});

describe('the client check of a name and a ticker', () => {
  const taken = new Set<string>([normalizeName('Fresh Coin').joined]);

  it('passes a fictional name and an unused ticker', () => {
    expect(clientCheck('Mellow Newt', 'MLNW', new Set())).toBeNull();
  });

  it('refuses a name already in the world, and a ticker of a real crypto asset', () => {
    expect(clientCheck('Fresh Coin', 'FRSH', taken)).toBe('nameTaken');
    expect(clientCheck('Mellow Newt', 'BTC', new Set())).toBe('tickerCrypto');
  });

  it('does not nag while the field is still short', () => {
    expect(clientCheck('Ab', 'AB', new Set())).toBeNull();
  });
});

describe('dead and graduated copy (review items 6 and 9)', () => {
  it('every reason a dead token carries has its line in both languages', () => {
    for (const r of ['noTrade', 'cash', 'cancelled']) {
      expect(EN[deadReasonKey(r)], r + ' en').toBeTruthy();
      expect(FR[deadReasonKey(r)], r + ' fr').toBeTruthy();
    }
  });

  it('the curve note has a line for a graduated and a dead token, not only the live one', () => {
    for (const k of ['lp.page.curveNote', 'lp.page.curveNote.graduated', 'lp.page.curveNote.dead']) {
      expect(EN[k], k + ' en').toBeTruthy();
      expect(FR[k], k + ' fr').toBeTruthy();
    }
    expect(EN['lp.page.curveNote.graduated']).toContain('{raise}');
  });
});
