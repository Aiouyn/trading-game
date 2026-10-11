import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';

/**
 * The French completeness audit (Phase 8, P8-4). Every French value is checked for the four ways a French screen falls back
 * to English: a key missing in fr, a value left identical to English, straight apostrophes (the copy uses ’), and English
 * stopwords. The reviewed allowlist below names the keys whose English-looking text is a proper name, a brand-like fictional
 * name or a command, so the audit passes on them by design.
 */

type Dict = Record<string, string>;
const EN = en as Dict;
const FR = fr as Dict;

/** Keys whose value is a proper name, a fictional brand or a literal command (reviewed). Their French is the English. */
export const FR_AUDIT_ALLOWLIST: readonly string[] = [
  'os.hw.sticker', // "Port Avalon Electronics": a fictional company name
  'sponsor.brand.fennick.name', // "Fennick Coffee Roasters": a fictional sponsor
  'sponsor.brand.marlow.name', // "Marlow Harbour Ltd": a fictional sponsor
  'sponsor.brand.pelican.name', // "Pelican Quay Tea": a fictional sponsor
  'loading.command', // "npm run world": a terminal command
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

/** The letter-words of a value, with the {placeholders} removed (a number or a name in braces is not a word of English). */
function words(s: string): string[] {
  return s.replace(/\{\w+\}/g, ' ').match(/\p{L}+/gu) ?? [];
}

/** The stopwords in a value, as found (all-caps acronyms such as "IT" are not counted). */
function stopwordsIn(s: string): string[] {
  return words(s).filter((w) => w !== w.toUpperCase() && FR_AUDIT_STOPWORDS.includes(w.toLowerCase())).map((w) => w.toLowerCase());
}

describe('French completeness audit', () => {
  it('every English key has a French value, and fr has no key en lacks', () => {
    const missing = Object.keys(EN).filter((k) => !(k in FR));
    const extra = Object.keys(FR).filter((k) => !(k in EN));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('no French value is identical to the English when the English has three or more words', () => {
    const same = Object.keys(EN)
      .filter((k) => k in FR && FR[k] === EN[k] && words(EN[k]!).length >= 3 && !FR_AUDIT_ALLOWLIST.includes(k))
      .map((k) => `${k}: ${FR[k]}`);
    expect(same).toEqual([]);
  });

  it('the allowlist names only keys that exist and are still identical (a stale entry fails)', () => {
    for (const k of FR_AUDIT_ALLOWLIST) {
      expect(k in FR, `allowlist key ${k} is not in fr`).toBe(true);
      expect(FR[k], `allowlist key ${k} is no longer identical to en`).toBe(EN[k]);
    }
  });

  it('French values use typographic apostrophes (’), never straight ones', () => {
    const straight = Object.entries(FR).filter(([, v]) => v.includes("'")).map(([k, v]) => `${k}: ${v}`);
    expect(straight).toEqual([]);
  });

  it('French values contain no English stopwords', () => {
    const hits = Object.entries(FR)
      .filter(([, v]) => stopwordsIn(v).length > 0)
      .map(([k, v]) => `${k} [${stopwordsIn(v).join(', ')}]: ${v}`);
    expect(hits).toEqual([]);
  });
});
