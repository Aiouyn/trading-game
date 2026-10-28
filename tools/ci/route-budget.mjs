// First-load JS budget of the Broker route (17-UX §682, 19 Rule 3.17.3) on the production build (`npm run build`, no e2e flags; the CI
// `checks` job's build). Counted the way S1-20 / BR-7-01 count it: every script /broker requests until the shell is ready and the network
// is idle, gzipped and summed, except the lazy lightweight-charts plot chunk (same rule and helper: tests/e2e/17b/plotChunk.ts), and that
// exclusion is capped at PLOT_EXCLUDE_CAP_KB. Budget: FIRST_LOAD_BUDGET_KB (plotChunk.ts), the one source S1-20 and BR-7-01 read.
// Usage: node tools/ci/route-budget.mjs [route]   (default /broker; after `npm run build`; starts `next start` itself on BUDGET_PORT)
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { FIRST_LOAD_BUDGET_KB, PLOT_EXCLUDE_CAP_KB, firstLoadBytes, watchScripts } from '../../tests/e2e/17b/plotChunk.ts';

const PROBE_MS = 2000;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const [route = '/broker'] = process.argv.slice(2);
const budget = Number(FIRST_LOAD_BUDGET_KB), port = Number(process.env.BUDGET_PORT ?? 3917), base = `http://127.0.0.1:${port}`;
let srv = null, browser = null;
try {
  if (!Number.isFinite(budget) || budget <= 0) throw new Error(`budget is not a positive number: ${FIRST_LOAD_BUDGET_KB}`);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`bad BUDGET_PORT: ${process.env.BUDGET_PORT}`);
  // The port must be free before our `next start`, so whatever answers on it afterwards is the server launched here.
  // A listener that accepts but never answers (probe timeout) counts as occupied too.
  if (await fetch(base + '/', { signal: AbortSignal.timeout(PROBE_MS) }).then(() => true, (e) => e?.name === 'TimeoutError')) throw new Error(`port ${port} already serves something; not ours`);
  srv = spawn('npx', ['next', 'start', '-p', String(port)], { stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  let up = false;
  for (let i = 0; i < 120 && !up && srv.exitCode === null; i++) {
    up = await fetch(base + route, { signal: AbortSignal.timeout(PROBE_MS) }).then((r) => r.ok, () => false);
    if (!up) await sleep(500);
  }
  if (srv.exitCode !== null) throw new Error(`next start exited with ${srv.exitCode} (port ${port} taken?)`);
  if (!up) throw new Error(`no 200 from ${route}`);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const scripts = new Set();
  page.on('response', (r) => { if (r.request().resourceType() === 'script') scripts.add(r.url()); });
  const seen = await watchScripts(page);
  await page.goto(base + route);
  await page.getByTestId('quay-ready').waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
  const html = await (await fetch(base + route)).text();
  let gz = 0, lazyPlot = 0;
  for (const url of scripts) {
    const size = gzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).length, s = seen.get(url);
    if (s && s.plot && !s.broker && s.afterMount && !html.includes(new URL(url).pathname)) lazyPlot += size; else gz += size;
  }
  if (!scripts.size) throw new Error('no scripts requested');
  const kb = firstLoadBytes(gz, lazyPlot) / 1024, excluded = gz + lazyPlot - kb * 1024;
  console.log(`route ${route} first-load JS: ${scripts.size} chunks, ${kb.toFixed(1)} KB gz (budget ${budget} KB; lazy plot chunk ${(lazyPlot / 1024).toFixed(1)} KB gz, ${(excluded / 1024).toFixed(1)} KB not counted, cap ${PLOT_EXCLUDE_CAP_KB} KB)`);
  if (kb > budget) { console.error(`over budget by ${(kb - budget).toFixed(1)} KB`); process.exitCode = 1; }
} catch (e) { console.error(String(e)); process.exitCode = 1; } finally {
  if (browser) await browser.close();
  if (srv) try { process.kill(-srv.pid, 'SIGTERM'); } catch { /* already gone */ }
}
