import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { translate } from './index';
import { RANKS } from '@/content/lifestyle';

describe('i18n', () => {
  it('the English rank names are the RANKS table the server reads, so a rename cannot desync the strings', () => {
    for (const r of RANKS) expect((en as Record<string, string>)[`rank.${r.id}`]).toBe(r.name);
  });

  it('interpolates variables and picks plural forms', () => {
    expect(translate('en', 'common.shares', { count: 1 })).toBe('1 share');
    expect(translate('en', 'common.shares', { count: 3 })).toBe('3 shares');
    expect(translate('fr', 'common.shares', { count: 3 })).toBe('3 actions');
  });

  it('falls back to English, then to the key', () => {
    expect(translate('fr', '__missing__')).toBe('__missing__');
  });

  it('every French key exists in English and keeps the same variables', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [k, v] of Object.entries(fr as Record<string, string>)) {
      expect(k in en, `fr key ${k} missing in en`).toBe(true);
      expect(vars(v), `variables differ for ${k}`).toBe(vars((en as Record<string, string>)[k]!));
    }
  });

  it('every literal t() key in the source exists in English and French', () => {
    const used = new Set<string>();
    for (const f of sourceFiles(fileURLToPath(new URL('..', import.meta.url)))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-z]\w*(?:\.\w+)+)'/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(500);
    // a plural key is stored as `key_one` / `key_other` (or `_many` in French), so any of those counts
    const has = (dict: Record<string, string>, k: string) => k in dict || Object.keys(dict).some((d) => d.startsWith(`${k}_`));
    const missing = [...used].filter((k) => !has(en as Record<string, string>, k) || !has(fr as Record<string, string>, k)).sort();
    expect(missing).toEqual([]);
  });
});

/** Every .ts and .tsx file under a folder, tests excluded. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}
