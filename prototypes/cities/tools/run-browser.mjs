import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');
const r = spawnSync(process.execPath, [
  cli, 'test', '--config', 'prototypes/cities/playwright.config.mjs',
  ...process.argv.slice(2),
], { stdio: 'inherit' });
process.exit(r.status ?? 1);
