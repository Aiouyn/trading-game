// node sim/worldgen.ts --years 100 --seed 7 --out worlds/7
// node sim/worldgen.ts --world 1
// Runs the years, proves that saving and loading continues with the same ledger hash, and writes the chronicle.
// --world <name> uses seed <name> and writes <PA_WORLDS or app/worlds>/<name>. A snapshot already there is read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAYS_PER_YEAR } from './kernel/index.ts';
import { openWorld } from './run.ts';
import { simulate } from './modules/history/boot.ts';
import { finishHistory } from './modules/history/index.ts';
import { writeHistory } from './modules/history/chronicle.ts';
import { applySnapshot, snapshotSeed, writeSnapshot } from './modules/history/save.ts';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const worldName = arg('world', '');
const years = +arg('years', '100'), seed = arg('seed', worldName || '7');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheRoot = process.env.PA_WORLDS || path.join(repoRoot, 'app', 'worlds');
const out = arg('out', worldName ? path.join(cacheRoot, worldName) : 'worlds/7');
const checkEvery = +arg('check-every', String(+(process.env.SIM_POP ?? 20000) > 20000 ? 7 : 1));
const without = new Set<string>();

function cacheHead(dir: string): { seed: string; years: number } | undefined {
  const json = path.join(dir, 'world.json');
  if (!fs.existsSync(json) || !fs.existsSync(path.join(dir, 'world.bin'))) return;
  const fd = fs.openSync(json, 'r');
  const buf = Buffer.alloc(256);
  const n = fs.readSync(fd, buf, 0, 256, 0);
  fs.closeSync(fd);
  const text = buf.toString('utf8', 0, n);
  const seedM = text.match(/"seed":"([^"]*)"/);
  const dayM = text.match(/"day":(\d+)/);
  if (!seedM || !dayM) return;
  return { seed: seedM[1], years: Math.floor(+dayM[1] / DAYS_PER_YEAR) };
}

function readCache(dir: string): boolean {
  if (!worldName) return false;
  const head = cacheHead(dir);
  if (!head || head.seed !== seed || head.years !== years) return false;
  const t0 = Date.now();
  const w = openWorld(seed, without);
  try { applySnapshot(w, dir); }
  catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error(`cache ${dir} unreadable (${why}); building it`);
    return false;
  }
  const bad = w.ledger.check();
  if (bad.length) {
    console.error(`cached world ${dir} does not balance:\n  ${bad.slice(0, 8).join('\n  ')}`);
    process.exit(1);
  }
  console.log(`cache ${dir} read in ${Date.now() - t0} ms. ${years} years, ${w.day} days. Books balanced. State hash ${w.ledger.hash()}`);
  return true;
}

if (readCache(out)) process.exit(0);

const t0 = Date.now();
const w = openWorld(seed, without);
const tail = years >= 2 ? Math.min(5, Math.floor(years / 2)) : 0;
const head = years - tail;
simulate(w, head, checkEvery, true);
if (tail) {
  const tmp = path.join(path.dirname(out) || '.', '.prove-' + path.basename(out));
  fs.rmSync(tmp, { recursive: true, force: true });
  const day = w.day, ev = w.events.count, saved = w.ledger.hash();
  const tSave = Date.now();
  writeSnapshot(tmp, w);
  console.log(`checkpoint ${head} years saved in ${Date.now() - tSave} ms, hash ${saved}`);
  simulate(w, tail, checkEvery, true);
  const h1 = w.ledger.hash();
  const w2 = openWorld(snapshotSeed(tmp), without);
  applySnapshot(w2, tmp);
  const loaded = w2.ledger.hash();
  if (w2.day !== day || w2.events.count !== ev || loaded !== saved) {
    console.error(`reload drifted: day ${w2.day} vs ${day}, events ${w2.events.count} vs ${ev}, hash ${loaded} vs ${saved}`);
    process.exit(1);
  }
  simulate(w2, tail, checkEvery, false);
  const h2 = w2.ledger.hash();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (h1 !== h2) {
    console.error(`save/load hash ${h2} != continuous ${h1}`);
    process.exit(1);
  }
  console.log(`save/load: ${head} years, save, load, ${tail} more. Hash ${h1} matches the continuous run.`);
}
finishHistory(w);
writeSnapshot(out, w);
writeHistory(w, out);
const ms = Date.now() - t0;
const books = checkEvery === 1 ? 'every day' : `at every check (every ${checkEvery} days)`;
console.log(`\nmemory ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
console.log(`${years} years, ${w.day} days, ${w.events.count} events, ${ms} ms. Books balanced ${books}. State hash ${w.ledger.hash()}`);
console.log(`chronicle ${(w.state.history as { entries: unknown[] }).entries.length} entries -> ${out}`);
