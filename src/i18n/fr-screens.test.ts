import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// R-10-7 (French, screens): the French audit in fr-realism.test.ts reads the dictionaries, and a rank or licence name a screen
// reads straight from the content tables (RANKS[...].name, LICENSES[...].name, a view's rank.name) would pass it. This audit
// reads the screens' source and fails on any such read, so an English rank or licence name cannot reach a French screen.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

/**
 * A screen reads a rank or licence display name: the content table's entry's .name (RANKS[i].name, RANKS.find(..)?.name), the
 * view's rank.name or next.name. A table named with a key or a find is the read; a translation key such as
 * `license.name.${id}` on the same line is not (it is the French name).
 */
const NAME_READ = /(\bRANKS(\[|\.find\()[^\n]*\.name\b)|(\bLICENSES(\[|\.find\()[^\n]*\.name\b)|(\bnext\??\.name\b)|(\brank\??\.name\b)/;

describe('French screens never read an English rank or licence name (R-10-7)', () => {
  it('the audit pattern catches the English reads and passes the translated ones (controls)', () => {
    expect(NAME_READ.test('const n = RANKS[i].name;')).toBe(true);
    expect(NAME_READ.test('RANKS.find((x) => x.id === id)?.name ?? id')).toBe(true);
    expect(NAME_READ.test('LICENSES.find((l) => l.id === id)?.name')).toBe(true);
    expect(NAME_READ.test('next ? t(`rank.${next.id}`) : null, next.name')).toBe(true);
    expect(NAME_READ.test('{t(`license.name.${l.id}`)} ${l.maxLeverage}')).toBe(false);
    expect(NAME_READ.test('LICENSES.map((l) => t(`license.name.${l.id}`))')).toBe(false);
  });

  it('no component reads a rank or licence display name from the content tables or the view', () => {
    const root = fileURLToPath(new URL('../components', import.meta.url));
    const hits: string[] = [];
    for (const f of sourceFiles(root)) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (NAME_READ.test(line)) hits.push(`${relative(root, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
