import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #41: every state wait in the city e2e goes through helpers.ts waitState (bounded, named).
// Only helpers.ts (waitState itself) and waits.spec.ts (which spies on it) may call waitForFunction.
const DIR = join(__dirname, '../../e2e/city');
const ALLOWED = new Set(['helpers.ts', 'waits.spec.ts']);

describe('city e2e state waits', () => {
  it('no page.waitForFunction outside waitState', () => {
    const offenders = readdirSync(DIR)
      .filter((f) => f.endsWith('.ts') && !ALLOWED.has(f))
      .flatMap((f) => readFileSync(join(DIR, f), 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const))
      .filter(([, , l]) => /\bwaitFor(Function|Selector)\s*\(/.test(l))
      .map(([f, n]) => `${f}:${n}`);
    expect(offenders).toEqual([]);
  });
});
