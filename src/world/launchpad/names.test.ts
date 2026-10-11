import { describe, expect, it } from 'vitest';
import { PREFIX, SUFFIX } from './launch';
import { moderateName, normalizeName } from './moderate';

/**
 * The world's launch names (review item 7): coined words, so no locale reads a world name as its own language, and every pair
 * passes the moderator's filter with no taken names.
 */
describe('world launch names (L2, item 7)', () => {
  it('the word lists have the counts the name space is sized for (48 by 36 pairs)', () => {
    expect(PREFIX).toHaveLength(48);
    expect(SUFFIX).toHaveLength(36);
  });

  it('every word is one capitalised coined word (no space, no digits, no repeats within a list)', () => {
    for (const w of [...PREFIX, ...SUFFIX]) expect(w).toMatch(/^[A-Z][a-z]{3,6}$/);
    expect(new Set(PREFIX).size).toBe(PREFIX.length);
    expect(new Set(SUFFIX).size).toBe(SUFFIX.length);
  });

  it('every pair is a legal, unrefused name and the pairs are distinct once normalised', () => {
    const joined = new Set<string>();
    for (const p of PREFIX) {
      for (const s of SUFFIX) {
        const name = `${p} ${s}`;
        expect(moderateName(name).reason).toBeUndefined();
        joined.add(normalizeName(name).joined);
      }
    }
    expect(joined.size).toBe(PREFIX.length * SUFFIX.length);
  });
});
