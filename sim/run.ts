// Headless run: node sim/run.ts --years 10 --seed 1 [--explain cb.rate] [--chronicle] [--load worlds/7] [--without bonds,social]
// This is the only acceptance check a module needs: it runs, the books balance every day, the stats look sane.
import { DAYS_PER_YEAR, World } from './kernel/index.ts';
import { economy } from './modules/economy/index.ts';
import { abroad } from './modules/abroad/index.ts';
import { banking } from './modules/banking/index.ts';
import { property } from './modules/property/index.ts';
import { bonds } from './modules/bonds/index.ts';
import { markets } from './modules/markets/index.ts';
import { options } from './modules/options/index.ts';
import { commodities } from './modules/commodities/index.ts';
import { social } from './modules/social/index.ts';
import { psyche } from './modules/psyche/index.ts';
import { crypto } from './modules/crypto/index.ts';
import { law } from './modules/law/index.ts';
import { politics } from './modules/politics/index.ts';
import { player } from './modules/player/index.ts';
import { history } from './modules/history/index.ts';
import { simulate } from './modules/history/boot.ts';
import { installRng } from './modules/history/rngbox.ts';
import { applySnapshot, snapshotSeed } from './modules/history/save.ts';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

export function useModules(w: World, without: Set<string>): void {
  w.use(economy);
  if (!without.has('abroad')) w.use(abroad);
  for (const m of [banking, property, bonds, markets]) if (!without.has(m.id)) w.use(m);
  if (!without.has('options')) w.use(options);
  for (const m of [commodities, social, psyche, crypto]) if (!without.has(m.id)) w.use(m);
  if (!without.has('law')) w.use(law);
  if (!without.has('politics')) w.use(politics);
  if (!without.has('player')) w.use(player);
  if (!without.has('history')) w.use(history);
}

export function openWorld(seed: string, without: Set<string>): World {
  const w = new World(seed, 8);
  installRng(w);
  useModules(w, without);
  return w;
}

function main(): void {
  const years = +arg('years', '10'), seed = arg('seed', '1'), explain = arg('explain', 'cb.rate'), load = arg('load', '');
  const checkEvery = +arg('check-every', String(+(process.env.SIM_POP ?? 20000) > 20000 ? 7 : 1));
  const without = new Set(arg('without', '').split(',').filter(Boolean));
  const t0 = Date.now();
  const w = openWorld(load ? snapshotSeed(load) : seed, without);
  if (load) applySnapshot(w, load);
  simulate(w, years, checkEvery, true);
  console.log(`\nmemory ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  console.log(`\n${years} years, ${w.day} days, ${w.events.count} events, ${Date.now() - t0} ms. Books balanced ${checkEvery === 1 ? 'every day' : `at every check (every ${checkEvery} days)`}. State hash ${w.ledger.hash()}`);
  if (process.argv.includes('--chronicle')) {
    console.log('\nChronicle (latest notable events):');
    for (const e of w.events.recent(['shock.energy', 'firm.succession', 'firm.ceoFired', 'firm.default', 'firm.cashCrunch', 'person.died', 'person.breakdown', 'life.tally'], 40))
      console.log(`  year ${Math.floor(e.day / DAYS_PER_YEAR) + 1}, day ${e.day % DAYS_PER_YEAR}: ${e.actor ? e.actor + ': ' : ''}${e.msg}`);
  }
  const id = w.events.last(explain);
  if (id !== undefined) console.log(`\nWhy? Last '${explain}':\n` + w.events.explain(id, 7).join('\n'));
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('run.ts') || entry.endsWith('run.js')) main();
