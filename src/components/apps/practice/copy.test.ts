import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { LESSONS } from '@/content/lessons';
import { bannedIn, BANNED_WORDS_FR } from '@/world/text/banned';

const EN = en as Record<string, string>;
const FR = fr as Record<string, string>;

/**
 * The copy the Phase 3 help and sandbox screens add. Each lesson has its four lines and a hint for its check, in both
 * languages. The banned-word rule (forecast and advice language) covers the new English and French text. The order-side
 * words "buy" and "sell" (and their French forms) are the form's own labels, so they are not counted here.
 */
const NEW_PREFIXES = ['practice.', 'challenge.', 'files.', 'sandbox.reason.', 'learn.lesson.', 'learn.tab.', 'goals.', 'settings.goals', 'calendar.busy', 'calendar.section.next', 'calendar.day.', 'portfolio.'];
const SIDE_WORDS = new Set(['buy', 'sell']);
const SIDE_WORDS_FR = new Set(['acheter', 'vendre', 'achat', 'vente', 'achetez', 'vendez']);

describe('Phase 3 help and sandbox copy', () => {
  it('gives every lesson its title, read, task and done line in both languages', () => {
    for (const l of LESSONS) {
      for (const s of ['title', 'read', 'task', 'done']) {
        expect(EN[`learn.lesson.${l.id}.${s}`], `en lesson ${l.id} ${s}`).toBeTruthy();
        expect(FR[`learn.lesson.${l.id}.${s}`], `fr lesson ${l.id} ${s}`).toBeTruthy();
      }
    }
  });

  it('gives every lesson check a hint in both languages', () => {
    for (const check of new Set(LESSONS.map((l) => l.check))) {
      expect(EN[`learn.lesson.hint.${check}`], `en hint ${check}`).toBeTruthy();
      expect(FR[`learn.lesson.hint.${check}`], `fr hint ${check}`).toBeTruthy();
    }
  });

  it('keeps the banned words out of the new English copy', () => {
    const offenders: string[] = [];
    for (const [key, text] of Object.entries(EN)) {
      if (!NEW_PREFIXES.some((p) => key.startsWith(p))) continue;
      const hits = bannedIn(text).filter((w) => !SIDE_WORDS.has(w));
      if (hits.length) offenders.push(`${key}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the banned words out of the new French copy', () => {
    const offenders: string[] = [];
    for (const [key, text] of Object.entries(FR)) {
      if (!NEW_PREFIXES.some((p) => key.startsWith(p))) continue;
      const hits = bannedIn(text, BANNED_WORDS_FR).filter((w) => !SIDE_WORDS_FR.has(w));
      if (hits.length) offenders.push(`${key}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the same placeholders in English and French for every new key', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const key of Object.keys(EN)) {
      if (!NEW_PREFIXES.some((p) => key.startsWith(p))) continue;
      expect(FR[key], `fr ${key}`).toBeTruthy();
      expect(vars(FR[key]!), `vars ${key}`).toBe(vars(EN[key]!));
    }
  });
});
