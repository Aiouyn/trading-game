import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { LESSONS } from '@/content/lessons';
import { GLOSSARY_IDS } from './glossary';

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

  it('gives every lesson a title, a read, a task and a done line in both languages', () => {
    expect(LESSONS.length).toBe(10);
    for (const l of LESSONS) {
      for (const suffix of ['title', 'read', 'task', 'done']) {
        const key = `learn.lesson.${l.id}.${suffix}`;
        expect(EN[key], `missing en ${key}`).toBeTruthy();
        expect(FR[key], `missing fr ${key}`).toBeTruthy();
      }
    }
  });
});
