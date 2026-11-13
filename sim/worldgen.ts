// node sim/worldgen.ts --years 100 --seed 7 --out worlds/7
// Runs the years, proves that saving and loading continues with the same ledger hash, and writes the chronicle.
import fs from 'node:fs';
import path from 'node:path';
import { openWorld } from './run.ts';
import { simulate } from './modules/history/boot.ts';
import { finishHistory } from './modules/history/index.ts';
import { writeHistory } from './modules/history/chronicle.ts';
import { applySnapshot, snapshotSeed, writeSnapshot } from './modules/history/save.ts';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const years = +arg('years', '100'), seed = arg('seed', '7'), out = arg('out', 'worlds/7');
const checkEvery = +arg('check-every', String(+(process.env.SIM_POP ?? 20000) > 20000 ? 7 : 1));
const without = new Set<string>();

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
