import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { FR_AUDIT_ALLOWLIST, letterWords, stopwordsIn } from './frAudit';

/**
 * The French completeness audit (Phase 8, P8-4). Every French value is checked for the four ways a French screen falls back
 * to English: a key missing in fr, a value left identical to English, straight apostrophes, and English stopwords. The
 * reviewed allowlist (frAudit.ts) names the keys whose English-looking text is a proper name, a brand or a command.
 */

type Dict = Record<string, string>;
const EN = en as Dict;
const FR = fr as Dict;

describe('French completeness audit', () => {
  it('every English key has a French value, and fr has no key en lacks', () => {
    const missing = Object.keys(EN).filter((k) => !(k in FR));
    const extra = Object.keys(FR).filter((k) => !(k in EN));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('no French value is identical to the English when the English has three or more words', () => {
    const same = Object.keys(EN)
      .filter((k) => k in FR && FR[k] === EN[k] && letterWords(EN[k]!).length >= 3 && !FR_AUDIT_ALLOWLIST.includes(k))
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
