import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { translate } from './index';

// R-10-7 (French): the rank and licence names are French, the numbers in French text use a decimal comma, and no English
// rank or licence name leaks into French copy. The audit reads every French value, and the text the server builds for the
// French reader (rank-up notes, licence names, the wire's market moves, the portfolio's since-arrival line).

type Dict = Record<string, string>;
const FR = fr as Dict;
const EN = en as Dict;

/** English rank and licence names that must never appear in French copy (the same words are fine in French: Pro, Titan). */
const ENGLISH_RANK_LICENCE = ['Broke', 'Hustler', 'Owner', 'Operator', 'Mogul', 'Dynasty', 'Retail', 'Derivatives', 'Institutional'];
const ENGLISH_NAME_RE = new RegExp(`\\b(${ENGLISH_RANK_LICENCE.join('|')})\\b`);

/** A decimal point between two digits (a French number reads 3,5). Version and licence numbers are the only exception. */
const DECIMAL_RE = /\d\.\d/;
const DECIMAL_ALLOWED_PREFIX = 'shell.credits.';

describe('French realism audit (R-10-7)', () => {
  it('no French value names an English rank or licence', () => {
    const leaks = Object.entries(FR)
      .filter(([, v]) => ENGLISH_NAME_RE.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    expect(leaks).toEqual([]);
  });

  it('no French value uses a decimal point between digits (apart from licence and version numbers)', () => {
    const hits = Object.entries(FR)
      .filter(([k, v]) => DECIMAL_RE.test(v) && !k.startsWith(DECIMAL_ALLOWED_PREFIX))
      .map(([k, v]) => `${k}: ${v}`);
    expect(hits).toEqual([]);
  });

  it('every rank and licence name has a French value', () => {
    for (const id of ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']) expect(FR[`rank.${id}`], `rank.${id}`).toBeTruthy();
    for (const id of ['retail', 'pro', 'derivatives', 'institutional']) expect(FR[`license.name.${id}`], `license.name.${id}`).toBeTruthy();
    expect(Object.keys(EN).filter((k) => k.startsWith('license.name.')).sort()).toEqual(Object.keys(FR).filter((k) => k.startsWith('license.name.')).sort());
  });
});

describe('French generated text (R-10-7)', () => {
  it('the rank-up notes name the rank in French and carry no English rank name', () => {
    for (const id of ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']) {
      const out = translate('fr', `rank.note.up.${id}`, { name: `@rank.${id}` });
      expect(out, id).not.toMatch(ENGLISH_NAME_RE);
      expect(out, id).not.toMatch(DECIMAL_RE);
    }
    expect(translate('fr', 'rank.note.up.R3', { name: '@rank.R3' })).toContain('Opérateur');
  });

  it('the licence names are French', () => {
    expect(translate('fr', 'license.name.derivatives')).toBe('Dérivés');
    expect(translate('fr', 'license.name.institutional')).toBe('Institutionnelle');
    expect(translate('fr', 'license.name.retail')).toBe('Particulier');
  });

  it('a wire end line with a market move reads with a decimal comma', () => {
    const out = translate('fr', 'event.wire.end', { kind: '@event.kind.crash', count: 3, days: 3, move: '#spct:-0.0345' });
    expect(out).not.toMatch(DECIMAL_RE);
    expect(out).toMatch(/3,45\s?%|3,4\s?%|3,5\s?%/);
  });

  it('the since-arrival line formats its money and percentage in French', () => {
    const out = translate('fr', 'portfolio.sinceArrival', { delta: '#susd:250.25', pct: '#spct:0.0005', start: '#usd:10250' });
    expect(out).not.toMatch(DECIMAL_RE);
  });
});
