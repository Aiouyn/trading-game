// Headless run: node sim/run.ts --years 10 --seed 1 [--explain cb.rate] [--chronicle]   (SIM_POP=5000 for a quick run)
// This is the only acceptance check a module needs: it runs, the books balance every day, the stats look sane.
import { DAYS_PER_YEAR, World } from './kernel/index.ts';
import { economy } from './modules/economy/index.ts';
import { banking } from './modules/banking/index.ts';
import { bonds } from './modules/bonds/index.ts';
import { markets } from './modules/markets/index.ts';
import { social } from './modules/social/index.ts';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const years = +arg('years', '10'), seed = arg('seed', '1'), explain = arg('explain', 'cb.rate');
// The full conservation check sums every holding; past 20,000 people it runs weekly unless --check-every says otherwise.
const checkEvery = +arg('check-every', String(+(process.env.SIM_POP ?? 20000) > 20000 ? 7 : 1));

const w = new World(seed, 8);
w.use(economy);
w.use(banking);
w.use(bonds);
w.use(markets);
w.use(social);

const t0 = Date.now();
let header = false;
for (let y = 0; y < years; y++) {
  for (let d = 0; d < DAYS_PER_YEAR; d++) {
    w.step();
    if (w.day % checkEvery !== 0) continue;
    const bad = w.ledger.check();
    if (bad.length) { console.error(`BOOKS DO NOT BALANCE on day ${w.day}:\n  ${bad.slice(0, 10).join('\n  ')}`); process.exit(1); }
  }
  const row: Record<string, number | string> = { year: y + 1 };
  for (const m of w.modules) Object.assign(row, m.stats?.(w));
  if (!header) { console.log(Object.keys(row).join('\t')); header = true; }
  console.log(Object.values(row).join('\t'));
}
console.log(`\nmemory ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
console.log(`\n${years} years, ${w.day} days, ${w.events.count} events, ${Date.now() - t0} ms. Books balanced ${checkEvery === 1 ? 'every day' : `at every check (every ${checkEvery} days)`}. State hash ${w.ledger.hash()}`);
if (process.argv.includes('--chronicle')) {
  console.log('\nChronicle (latest notable events):');
  for (const e of w.events.recent(['shock.energy', 'firm.succession', 'firm.ceoFired', 'firm.default', 'firm.cashCrunch', 'person.died', 'person.breakdown', 'life.tally'], 40))
    console.log(`  year ${Math.floor(e.day / DAYS_PER_YEAR) + 1}, day ${e.day % DAYS_PER_YEAR}: ${e.actor ? e.actor + ': ' : ''}${e.msg}`);
}
const id = w.events.last(explain);
if (id !== undefined) console.log(`\nWhy? Last '${explain}':\n` + w.events.explain(id, 7).join('\n'));
