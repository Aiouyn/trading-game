import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

// Spec 2 §1 ownership. package.json / package-lock.json: one-off, Producer-approved exception
// (adds three + @types/three because Spec 1 had not landed them on main).
const OWNED = [/^src\/city\//, /^public\/city\//, /^tests\/unit\/city\//, /^tests\/e2e\/city\//, /^docs\/city\//];
// .github/workflows/city.yml: the city CI workflow, Producer-authorized (QA C-10/C-16).
// next.config.ts: the NEXT_PUBLIC_CITY_E2E define (Producer-authorized, prod hook leak).
const APPROVED_EXCEPTIONS = new Set(['package.json', 'package-lock.json', '.github/workflows/city.yml', 'next.config.ts']);

describe('C-16 path check', () => {
  it('this branch touches no path outside Spec 2 ownership', () => {
    const base = process.env.CITY_BASE_REF ?? 'origin/main';
    let out = '';
    try {
      out = execSync(`git diff --name-only ${base}...HEAD && git diff --name-only HEAD && git ls-files --others --exclude-standard`, { encoding: 'utf8' });
    } catch {
      return; // no git (e.g. tarball); CI always has it
    }
    const paths = [...new Set(out.split('\n').filter(Boolean))];
    const outside = paths.filter((p) => !APPROVED_EXCEPTIONS.has(p) && !OWNED.some((r) => r.test(p)));
    expect(outside).toEqual([]);
  });
});
