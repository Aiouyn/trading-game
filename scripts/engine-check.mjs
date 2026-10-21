// Runs typecheck, lint and tests for each engine package that exists (packages/engine/core is skipped when absent).
// Usage: node scripts/engine-check.mjs [core|ledger|macro|content ...]   (default: all present). Each package is isolated (own lockfile).
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const all = ['core', 'ledger', 'macro', 'content'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : all;
for (const p of want) {
  const dir = p === 'content' ? 'packages/content' : `packages/engine/${p}`; // T22A-01: content lives outside engine (22 §0.1)
  if (!existsSync(`${dir}/package.json`)) { console.log(`skip ${dir} (absent)`); continue; }
  for (const cmd of [existsSync(`${dir}/node_modules`) ? null : 'npm ci', 'npm run typecheck', 'npm run lint', 'npm test']) {
    if (!cmd) continue;
    console.log(`\n> ${dir}: ${cmd}`);
    execSync(cmd, { cwd: dir, stdio: 'inherit' });
  }
}
