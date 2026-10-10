import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import {
  DEFAULT_PALETTE,
  PALETTE_KEYS,
  PALETTE_SLUGS,
  applyPalette,
  isPaletteSlug,
  paletteFromPrefs,
  readPalette,
} from './palette';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('palette list and default', () => {
  it('lists the four palettes in spec order, with Ink & Brass first and as the default', () => {
    expect([...PALETTE_SLUGS]).toEqual(['ink-brass', 'broadsheet', 'phosphor', 'riviera']);
    expect(DEFAULT_PALETTE).toBe('ink-brass');
  });

  it('has an en and fr name and line for every palette', () => {
    for (const slug of PALETTE_SLUGS) {
      for (const key of [PALETTE_KEYS[slug].name, PALETTE_KEYS[slug].line]) {
        expect(key in en, `en ${key}`).toBe(true);
        expect(key in fr, `fr ${key}`).toBe(true);
      }
    }
  });

  it('recognises only the four slugs', () => {
    expect(isPaletteSlug('riviera')).toBe(true);
    expect(isPaletteSlug('neon')).toBe(false);
    expect(isPaletteSlug(undefined)).toBe(false);
  });
});

describe('paletteFromPrefs', () => {
  it('reads the palette from the tg-prefs JSON and ignores the other keys', () => {
    expect(paletteFromPrefs('{"palette":"phosphor","lang":"fr"}')).toBe('phosphor');
  });

  it('falls back to Ink & Brass for missing, corrupt or unknown values', () => {
    expect(paletteFromPrefs(null)).toBe('ink-brass');
    expect(paletteFromPrefs(undefined)).toBe('ink-brass');
    expect(paletteFromPrefs('')).toBe('ink-brass');
    expect(paletteFromPrefs('{"lang":"fr"}')).toBe('ink-brass');
    expect(paletteFromPrefs('{"palette":"neon"}')).toBe('ink-brass');
    expect(paletteFromPrefs('{"palette":')).toBe('ink-brass');
    expect(paletteFromPrefs('[1,2]')).toBe('ink-brass');
    expect(paletteFromPrefs('null')).toBe('ink-brass');
  });
});

describe('readPalette', () => {
  it('reads localStorage tg-prefs', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'tg-prefs' ? '{"palette":"broadsheet"}' : null) });
    expect(readPalette()).toBe('broadsheet');
  });

  it('never throws when storage is blocked or missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(readPalette()).toBe('ink-brass');
  });

  it('returns the default when there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readPalette()).toBe('ink-brass');
  });
});

describe('applyPalette', () => {
  it('sets data-palette on the target for each palette, the default included', () => {
    const target = { dataset: {} as Record<string, string | undefined> };
    for (const slug of PALETTE_SLUGS) {
      applyPalette(slug, target);
      expect(target.dataset.palette).toBe(slug);
    }
  });

  it('touches only data-palette (no other attribute, no classes)', () => {
    const target = { dataset: { game: 'ready' } as Record<string, string | undefined> };
    applyPalette('phosphor', target);
    expect(target.dataset).toEqual({ game: 'ready', palette: 'phosphor' });
  });
});
