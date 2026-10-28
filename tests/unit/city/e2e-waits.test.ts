import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #41: every state wait in the city e2e goes through helpers.ts waitState (bounded, named).
// Only helpers.ts (waitState itself) and waits.spec.ts (which spies on it) may name a raw wait.
// Scans every .ts/.tsx/.mts/.cts file under tests/e2e/city (the city testMatch /\.spec\.tsx?$/
// also runs .spec.tsx), subfolders included (Playwright's testMatch
// is recursive). It matches the bare identifiers waitForFunction, waitForSelector and waitFor, so a
// call, an alias, .bind(), a destructure, page['waitForFunction'], a generic call or a call split
// over lines are all caught; waitForTimeout, waitForLoadState and waitForEvent are different words.
// A name built at runtime (e.g. 'waitFor' + 'Function') is not caught.
const DIR = join(__dirname, '../../e2e/city');
const ALLOWED = new Set(['helpers.ts', 'waits.spec.ts']);
const RAW_WAIT = /\bwaitFor(?:Function|Selector)?\b/;

function rawWaits(dir: string, allowed: ReadonlySet<string>): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((f) => f.split('\\').join('/'))
    .filter((f) => /\.[mc]?tsx?$/.test(f) && !allowed.has(f))
    .sort()
    .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const))
    .filter(([, , l]) => RAW_WAIT.test(l))
    .map(([f, n]) => `${f}:${n}`);
}

describe('city e2e state waits', () => {
  it('no raw waitForFunction / waitForSelector / locator.waitFor outside waitState', () => {
    expect(rawWaits(DIR, ALLOWED)).toEqual([]);
  });
  it('catches an unbounded wait in a .spec.tsx file (QA #41 escape)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'city-waits-'));
    try {
      writeFileSync(join(dir, 'zz-probe.spec.tsx'), "test('x', async ({ page }) => { await page.locator('canvas').waitFor(); });\n");
      expect(rawWaits(dir, ALLOWED)).toEqual(['zz-probe.spec.tsx:1']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
