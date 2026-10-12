/**
 * The French completeness audit (Phase 8, P8-4), shared by the vitest audit (fr-audit.test.ts) and the Playwright sweep
 * (tests/e2e/frSweep.spec.ts). Pure data and string functions: no React, no DOM, no engine imports.
 *
 * The audit fails on the four ways a French screen falls back to English: a key missing in fr, a French value identical to
 * the English at three or more words, straight apostrophes (the copy uses ’), and English stopwords in French text.
 */

/** Keys whose value is a proper name, a fictional brand or a literal command (reviewed). Their French is the English. */
export const FR_AUDIT_ALLOWLIST: readonly string[] = [
  'os.hw.sticker', // "Port Avalon Electronics": a fictional company name
  'sponsor.brand.fennick.name', // "Fennick Coffee Roasters": a fictional sponsor
  'sponsor.brand.marlow.name', // "Marlow Harbour Ltd": a fictional sponsor
  'sponsor.brand.pelican.name', // "Pelican Quay Tea": a fictional sponsor
  'loading.command', // "npm run world": a terminal command
];

/**
 * Fictional proper names that keep their English form on screen and read as English to the sweep (a line with "of" in a
 * name). Reviewed: they are names of places and institutions in the game's world, not English sentences.
 */
export const FR_SWEEP_NAMES: readonly string[] = [
  'Bank of Port Avalon', // the Avalon bank (asset AVBK): a fictional institution's name
];

/**
 * English stopwords that never occur in French running text. "a", "an", "on", "or", "for", "in", "de" are left out because
 * they are French words too (a = has, an = year, on = one, or = gold, de = of).
 */
export const FR_AUDIT_STOPWORDS: readonly string[] = [
  'the', 'and', 'with', 'your', 'you', 'are', 'this', 'that', 'from', 'have', 'has', 'of', 'to', 'not', 'it', 'its', 'by',
  'at', 'be', 'was', 'were', 'will', 'which', 'when', 'what', 'into', 'their', 'there', 'they', 'them', 'our', 'is', 'can',
  'just', 'more', 'all', 'only', 'each', 'every', 'any', 'about', 'after', 'before', 'over', 'under', 'down', 'does', 'do',
  'if', 'but', 'so',
];

/** The letter-words of a text, with the {placeholders} removed (a number or a name in braces is not a word of English). */
export function letterWords(s: string): string[] {
  return s.replace(/\{\w+\}/g, ' ').match(/\p{L}+/gu) ?? [];
}

/** The stopwords in a text, lowercased, as found (all-caps acronyms such as "IT" are not counted). */
export function stopwordsIn(s: string): string[] {
  return letterWords(s).filter((w) => w !== w.toUpperCase() && FR_AUDIT_STOPWORDS.includes(w.toLowerCase())).map((w) => w.toLowerCase());
}

/**
 * The lines of a rendered text that read as English: three or more words with at least one stopword. A line that contains
 * an allowlisted French value (a proper name, a command) is not English by design and is skipped.
 */
export function englishLines(text: string, allowed: readonly string[] = []): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => letterWords(l).length >= 3 && stopwordsIn(l).length > 0)
    .filter((l) => !allowed.some((a) => a && l.includes(a)));
}
