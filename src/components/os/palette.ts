// Quay palettes (P2-175..P2-184). Pure helpers: no React, no DOM at import time.
// The palette changes token values only. Forge sets data-palette on <html> and never on body or a
// subtree (the derived --os-* tokens resolve on <html>). Components never branch on palette.
// The palette is per device, free, and never switches by itself (P2-184).

export const PALETTE_SLUGS = ['ink-brass', 'broadsheet', 'phosphor', 'riviera'] as const;
export type PaletteSlug = (typeof PALETTE_SLUGS)[number];

/** Ink & Brass is the default for every player and device (P2-183). Absent data-palette also means this. */
export const DEFAULT_PALETTE: PaletteSlug = 'ink-brass';

/** localStorage key for preferences. Shared with the i18n layer, which spreads it so palette is not lost. */
export const PREFS_KEY = 'tg-prefs';

/** i18n keys for each palette's display name and one-line character (names are in en.json and fr.json). */
export const PALETTE_KEYS: Record<PaletteSlug, { name: string; line: string }> = {
  'ink-brass': { name: 'palette.ink-brass', line: 'palette.ink-brass.line' },
  broadsheet: { name: 'palette.broadsheet', line: 'palette.broadsheet.line' },
  phosphor: { name: 'palette.phosphor', line: 'palette.phosphor.line' },
  riviera: { name: 'palette.riviera', line: 'palette.riviera.line' },
};

export function isPaletteSlug(v: unknown): v is PaletteSlug {
  return typeof v === 'string' && (PALETTE_SLUGS as readonly string[]).includes(v);
}

/**
 * The palette stored in a raw tg-prefs string. A missing, corrupt or unknown value gives the default,
 * so a bad save never breaks the shell.
 */
export function paletteFromPrefs(raw: string | null | undefined): PaletteSlug {
  if (!raw) return DEFAULT_PALETTE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'palette' in parsed) {
      const v = (parsed as { palette: unknown }).palette;
      if (isPaletteSlug(v)) return v;
    }
  } catch {
    // corrupt JSON falls through to the default
  }
  return DEFAULT_PALETTE;
}

/** The palette saved on this device. Storage can be blocked or throw (private mode), so it never throws. */
export function readPalette(): PaletteSlug {
  try {
    return paletteFromPrefs(globalThis.localStorage?.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PALETTE;
  }
}

/** Anything with a dataset, so the function is testable without a DOM. */
export interface PaletteTarget {
  dataset: Record<string, string | undefined>;
}

/** Sets data-palette on the target (<html> in the app). The default is written explicitly too. */
export function applyPalette(slug: PaletteSlug, target: PaletteTarget): void {
  target.dataset.palette = slug;
}
