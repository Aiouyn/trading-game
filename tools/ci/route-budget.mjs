// First-load JS budget for a route of the production build (`npm run build`, no e2e flags; the CI `checks` job's build).
// Counted the way S1-20 / BR-7-01 count it: every script the page requests until network idle, gzipped and summed,
// except the lazy lightweight-charts plot chunk (same rule and helper as S1-20: tests/e2e/17b/plotChunk.ts).
// Usage: node tools/ci/route-budget.mjs <route> <budgetKB>   (after `npm run build`; starts `next start` itself)
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { watchScripts } from '../../tests/e2e/17b/plotChunk.ts';

const [route = '/', budgetArg = '215'] = process.argv.slice(2);
const budget = Number(budgetArg), port = Number(process.env.BUDGET_PORT ?? 3917), base = `http://127.0.0.1:${port}`;
const srv = spawn('npx', ['next', 'start', '-p', String(port)], { stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const browser = await chromium.launch();
try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(base + route)).ok; } catch { await new Promise((s) => setTimeout(s, 500)); } }
  if (!up) throw new Error(`no 200 from ${route}`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const scripts = new Set();
  page.on('response', (r) => { if (r.request().resourceType() === 'script') scripts.add(r.url()); });
  const seen = await watchScripts(page);
  await page.goto(base + route);
  await page.waitForLoadState('networkidle');
  const html = await (await fetch(base + route)).text();
  let gz = 0, lazyPlot = 0;
  for (const url of scripts) {
    const size = gzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).length, s = seen.get(url);
    if (s && s.plot && !s.broker && s.afterMount && !html.includes(new URL(url).pathname)) lazyPlot += size; else gz += size;
  }
  if (!scripts.size) throw new Error('no scripts requested');
  const kb = gz / 1024;
  console.log(`route ${route} first-load JS: ${scripts.size} chunks, ${kb.toFixed(1)} KB gz (budget ${budget} KB; lazy plot chunk ${(lazyPlot / 1024).toFixed(1)} KB gz not counted)`);
  if (kb > budget) { console.error(`over budget by ${(kb - budget).toFixed(1)} KB`); process.exitCode = 1; }
} catch (e) { console.error(String(e)); process.exitCode = 1; } finally {
  await browser.close();
  try { process.kill(-srv.pid, 'SIGTERM'); } catch { /* already gone */ }
}
