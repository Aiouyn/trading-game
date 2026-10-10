import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { GLOSSARY_IDS, LESSON_SLOTS } from './glossary';

const EN = en as Record<string, string>;
const FR = fr as Record<string, string>;

describe('Learn glossary', () => {
  it('holds about forty distinct terms', () => {
    expect(GLOSSARY_IDS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(GLOSSARY_IDS).size).toBe(GLOSSARY_IDS.length);
  });

  it('gives every term a name and a definition in English and French', () => {
    for (const id of GLOSSARY_IDS) {
      for (const suffix of ['name', 'def']) {
        const key = `learn.term.${id}.${suffix}`;
        expect(EN[key], `missing en ${key}`).toBeTruthy();
        expect(FR[key], `missing fr ${key}`).toBeTruthy();
      }
    }
  });

  it('gives every lesson slot a title in both languages, and the Phase 3 wait line', () => {
    expect(LESSON_SLOTS.length).toBe(4);
    for (const s of LESSON_SLOTS) {
      expect(EN[s.title]).toBeTruthy();
      expect(FR[s.title]).toBeTruthy();
    }
    expect(EN['learn.soon']).toBe('Coming in a later release');
  });
});
