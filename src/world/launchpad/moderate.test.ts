import { describe, expect, it } from 'vitest';
import { iconSpec, iconSvg, tickerHash } from './icon';
import { moderateName, nameFormatOk, normalizeName, tickerFormatOk } from './moderate';

describe('name normalisation (L2)', () => {
  it('folds case, accents and leetspeak, and drops spacing and punctuation', () => {
    expect(normalizeName('Frög  Coin!').joined).toBe('frogcoin');
    expect(normalizeName('B1tc0in').joined).toBe('bitcoin');
    expect(normalizeName('S0L').joined).toBe('sol');
    expect(normalizeName('Dog3coin').joined).toBe('dogecoin');
    expect(normalizeName('n1gger').joined).toBe('nigger');
    expect(normalizeName('Ap-ple').joined).toBe('apple');
    expect(normalizeName('@lpha $tar').joined).toBe('alphastar');
    expect(normalizeName('7ea').tokens).toEqual(['tea']);
  });
});

describe('moderation (L2)', () => {
  it('refuses real crypto names and tickers, including leetspeak and spacing', () => {
    expect(moderateName('B1tc0in')).toMatchObject({ ok: false, reason: 'crypto' });
    expect(moderateName('Dog3 Coin')).toMatchObject({ ok: false, reason: 'crypto' });
    expect(moderateName('S0L')).toMatchObject({ ok: false, reason: 'crypto' });
    expect(moderateName('bonk')).toMatchObject({ ok: false, reason: 'crypto' });
    expect(moderateName('pepe the frog')).toMatchObject({ ok: false, reason: 'crypto' });
  });

  it('refuses real brands and public figures', () => {
    expect(moderateName('Ap-ple Bites')).toMatchObject({ ok: false, reason: 'brand' });
    expect(moderateName('Tesla Moon')).toMatchObject({ ok: false, reason: 'brand' });
    expect(moderateName('Elon Pup')).toMatchObject({ ok: false, reason: 'figure' });
    expect(moderateName('Trump Cat')).toMatchObject({ ok: false, reason: 'figure' });
  });

  it('refuses slurs and abuse, also written with leetspeak', () => {
    expect(moderateName('n1gger coin')).toMatchObject({ ok: false, reason: 'abuse' });
    expect(moderateName('Hitler Dog')).toMatchObject({ ok: false, reason: 'abuse' });
  });

  it('refuses a name already in the world (live, delisted or a token), by its joined form', () => {
    const taken = new Set(['frogcoin']);
    expect(moderateName('Frog Coin', taken)).toMatchObject({ ok: false, reason: 'taken' });
    expect(moderateName('Frög-coin', taken)).toMatchObject({ ok: false, reason: 'taken' });
    expect(moderateName('Frog Cointo', taken).ok).toBe(true);
  });

  it('accepts fictional names, and does not refuse a word just because it contains a list term', () => {
    expect(moderateName('Pancake Pals').ok).toBe(true);
    expect(moderateName('Classic Cats').ok).toBe(true);
    expect(moderateName('Sunny Snail').ok).toBe(true);
  });

  it('checks the ticker format: three to five capital letters', () => {
    expect(tickerFormatOk('ABC')).toBe(true);
    expect(tickerFormatOk('ABCDE')).toBe(true);
    expect(tickerFormatOk('AB')).toBe(false);
    expect(tickerFormatOk('ABCDEF')).toBe(false);
    expect(tickerFormatOk('ab1')).toBe(false);
  });

  it('checks the name format: three to twenty-four characters of letters, digits, spaces and a few marks', () => {
    expect(nameFormatOk('Pancake Pals')).toBe(true);
    expect(nameFormatOk('Ab')).toBe(false);
    expect(nameFormatOk('x'.repeat(25))).toBe(false);
    expect(nameFormatOk('<b>bold</b>')).toBe(false);
  });
});

describe('icon (L2)', () => {
  it('is a pure function of the ticker, and differs between tickers', () => {
    expect(iconSvg('PANC')).toBe(iconSvg('PANC'));
    expect(tickerHash('PANC')).not.toBe(tickerHash('SNAL'));
    expect(iconSpec('PANC')).toEqual(iconSpec('PANC'));
  });

  it('is a standalone SVG with the ticker glyph', () => {
    const svg = iconSvg('MOON');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('>M<');
    expect(svg).toContain('viewBox="0 0 64 64"');
  });
});
