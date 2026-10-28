#!/usr/bin/env node
// AC (spec §9): a production `next build` WITHOUT NEXT_PUBLIC_CITY_E2E ships 0 city e2e-hook strings in
// the client bundles (.next/static). Positive control: the same build WITH the flag contains them, so
// the check cannot pass vacuously. Run: node tests/e2e/city/prod-hook-check.mjs  (~1 min, two builds)
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_STRINGS = ['__city', /labelBackground(?!Color)/, 'samplePerfNow', 'brassCheck', 'partsOfEntity', 't0Picture', 'projectGround', 'NEXT_PUBLIC_CITY_E2E'];
const STATIC = '.next/static';

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(js|mjs)$/.test(n) ? [p] : [];
  });
}

function build(flag) {
  rmSync('.next', { recursive: true, force: true });
  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.NEXT_PUBLIC_CITY_E2E;
  if (flag) env.NEXT_PUBLIC_CITY_E2E = '1';
  execSync('npx next build', { env, stdio: ['ignore', 'ignore', 'inherit'] });
  const counts = Object.fromEntries(HOOK_STRINGS.map((s) => [s, 0]));
  for (const f of files(STATIC)) {
    const src = readFileSync(f, 'utf8');
    for (const s of HOOK_STRINGS) counts[s] += src.split(s).length - 1;
  }
  return counts;
}

const off = build(false);
const on = build(true);
const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);
console.log('no flag  ', JSON.stringify(off), 'total', total(off));
console.log('flag = 1 ', JSON.stringify(on), 'total', total(on));
rmSync('.next', { recursive: true, force: true });
let ok = true;
if (total(off) !== 0) { console.error('FAIL: the prod build without the flag ships e2e hook strings'); ok = false; }
if (on.__city === 0) { console.error('FAIL (control): the flag=1 build has no window.__city hook'); ok = false; }
// card 1 (decision 4): the coverage / projectGround hooks are e2e-only too
if (on.projectGround === 0) { console.error('FAIL (control): the flag=1 build has no projectGround hook'); ok = false; }
console.log(ok ? 'PASS' : 'FAILED');
process.exit(ok ? 0 : 1);
