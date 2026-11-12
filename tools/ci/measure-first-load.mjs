// Inventory of /broker first-load JS chunks (gzipped), plus a coarse label from surviving strings.
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { FIRST_LOAD_BUDGET_KB, PLOT_EXCLUDE_CAP_KB, firstLoadBytes, watchScripts } from '../../tests/e2e/17b/plotChunk.ts';

const PROBE_MS = 2000;
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const port = Number(process.env.BUDGET_PORT ?? 3974);
const base = `http://127.0.0.1:${port}`;
const route = '/broker';

const LABELS = [
  ['Failed to parse color', 'plot/lightweight-charts'],
  ['__core-js_shared__', 'core-js polyfills'],
  ['react-dom', 'react-dom / react'],
  ['addBasePath', 'next/router runtime'],
  ['quay-ready', 'shell chrome'],
  ['br-ticket', 'broker ticket'],
  ['br-chart', 'broker chart chrome'],
  ['wire-row', 'wire feed'],
  ['firstTradeGuide', 'first-trade / goal'],
  ['Appearance', 'settings'],
  ['sign-in-entry', 'shell auth chrome'],
  ['quay-feedback', 'feedback button'],
  ['Open in Broker', 'shared copy / launchpad-or-wire'],
];

function label(text) {
  const hits = LABELS.filter(([n]) => text.includes(n)).map(([, l]) => l);
  return hits.length ? hits.join(', ') : '(unlabelled)';
}

let srv = null, browser = null;
try {
  if (await fetch(base + '/', { signal: AbortSignal.timeout(PROBE_MS) }).then(() => true, (e) => e?.name === 'TimeoutError')) {
    throw new Error(`port ${port} already serves something`);
  }
  srv = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: '/workspace/avalon/broker-headroom', stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  let up = false;
  for (let i = 0; i < 120 && !up && srv.exitCode === null; i++) {
    up = await fetch(base + route, { signal: AbortSignal.timeout(PROBE_MS) }).then((r) => r.ok, () => false);
    if (!up) await sleep(500);
  }
  if (srv.exitCode !== null) throw new Error(`next start exited with ${srv.exitCode}`);
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
  const rows = [];
  let counted = 0, lazyPlot = 0;
  for (const url of scripts) {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const gz = gzipSync(buf).length;
    const s = seen.get(url);
    const excluded = !!(s && s.plot && !s.broker && s.afterMount && !html.includes(new URL(url).pathname));
    if (excluded) lazyPlot += gz; else counted += gz;
    const name = new URL(url).pathname.split('/').pop();
    rows.push({ name, url: new URL(url).pathname, raw: buf.length, gz, excluded, label: label(buf.toString('utf8')), plot: !!s?.plot, broker: !!s?.broker, afterMount: !!s?.afterMount });
  }
  rows.sort((a, b) => b.gz - a.gz);
  const kb = firstLoadBytes(counted, lazyPlot) / 1024;
  const lines = [];
  lines.push(`route ${route} first-load JS: ${scripts.size} chunks, counted ${kb.toFixed(1)} KB gz (budget ${FIRST_LOAD_BUDGET_KB}; lazy plot ${(lazyPlot/1024).toFixed(1)} KB gz, cap ${PLOT_EXCLUDE_CAP_KB})`);
  lines.push('name\traw\tgz\texcluded\tlabel');
  for (const r of rows) {
    lines.push(`${r.name}\t${r.raw}\t${r.gz}\t${r.excluded ? 'plot-excluded' : 'counted'}\t${r.label}`);
  }
  const out = lines.join('\n') + '\n';
  console.log(out);
  const outPath = process.env.MEASURE_OUT ?? '/workspace/avalon/evidence/launchpad/broker-headroom/after-chunks.tsv';
  writeFileSync(outPath, out);
  console.error('wrote', outPath);
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (srv) try { process.kill(-srv.pid, 'SIGTERM'); } catch {}
}
