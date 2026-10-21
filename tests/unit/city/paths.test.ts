import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { c16Verdict, currentBranch, isCityBranch } from './paths';

const sh = (cmd: string): string | null => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

describe('C-16 path check', () => {
  const branch = currentBranch(process.env, () => sh('git rev-parse --abbrev-ref HEAD'));
  const city = branch !== null && isCityBranch(branch);
  it.skipIf(!city)(`this City Dev branch touches no path outside Spec 2 ownership (${branch ?? 'unknown branch'})`, () => {
    const base = process.env.CITY_BASE_REF ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');
    const out = sh(`git diff --name-only ${base}...HEAD && git diff --name-only HEAD && git ls-files --others --exclude-standard`);
    if (out === null) return; // no git history (e.g. tarball)
    const v = c16Verdict(branch, out.split('\n'));
    expect(v).toEqual({ status: 'pass' });
  });
  if (!city) it('skips on branches City Dev does not own', () => {
    const v = c16Verdict(branch, []);
    console.log(v.status === 'skip' ? v.reason : v);
    expect(v.status).toBe('skip');
  });
});

describe('C-16 scope (AC)', () => {
  const engine = ['packages/engine/src/core.ts', 'src/engine/catalysts.ts'];
  const cityOnly = ['src/city/renderer/picture.ts', 'tests/unit/city/paths.ts', 'tests/e2e/city/legibility.spec.ts', 'docs/city/README.md'];

  it('a city branch touching packages/engine/** or src/engine/** fails', () => {
    for (const b of ['v3/city-renderer', 'city/c16-scope']) {
      expect(c16Verdict(b, [...cityOnly, engine[0]])).toEqual({ status: 'fail', outside: [engine[0]] });
      expect(c16Verdict(b, [engine[1]])).toEqual({ status: 'fail', outside: [engine[1]] });
    }
  });
  it('an engine (or any non-city) branch touching the same files is never flagged', () => {
    for (const b of ['v3/engine-catalysts', 'v3/ledger-core', 'v3/quay-shell', 'ui/citywindow-hardening', 'main', 'refs/heads/v3/engine-x', 'cityscape/x', 'v3/cityish']) {
      const v = c16Verdict(b, [...engine, 'src/app/page.tsx']);
      expect(v.status, b).toBe('skip');
    }
  });
  it('a city branch touching only city paths (and the approved exceptions) passes', () => {
    expect(c16Verdict('city/industrial-basin-label', cityOnly)).toEqual({ status: 'pass' });
    expect(c16Verdict('v3/city-renderer', [...cityOnly, 'package.json', '.github/workflows/city.yml'])).toEqual({ status: 'pass' });
  });
  it('branch comes from GITHUB_HEAD_REF first, then GITHUB_REF_NAME, then git; detached HEAD is unknown → skip', () => {
    expect(currentBranch({ GITHUB_HEAD_REF: 'v3/engine-x', GITHUB_REF_NAME: '6/merge' }, () => 'city/x')).toBe('v3/engine-x');
    expect(currentBranch({ GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'city/x' }, () => null)).toBe('city/x');
    expect(currentBranch({}, () => 'v3/city-renderer')).toBe('v3/city-renderer');
    expect(currentBranch({}, () => 'HEAD')).toBeNull();
    expect(c16Verdict(null, ['packages/engine/a.ts']).status).toBe('skip');
  });
});
