// Headless run: node sim/run.ts --years 10 --seed 1 [--explain cb.rate]
// This is the only acceptance check a module needs: it runs, the books balance every day, the stats look sane.
import { DAYS_PER_YEAR, World } from './kernel/index.ts';
import { economy } from './modules/economy/index.ts';
import { markets } from './modules/markets/index.ts';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const years = +arg('years', '10'), seed = arg('seed', '1'), explain = arg('explain', 'cb.rate');

const w = new World(seed, 8);
w.use(economy);
w.use(markets);

const t0 = Date.now();
let header = false;
for (let y = 0; y < years; y++) {
  for (let d = 0; d < DAYS_PER_YEAR; d++) {
    w.step();
    const bad = w.ledger.check();
    if (bad.length) { console.error(`BOOKS DO NOT BALANCE on day ${w.day}:\n  ${bad.slice(0, 10).join('\n  ')}`); process.exit(1); }
  }
  const row: Record<string, number | string> = { year: y + 1 };
  for (const m of w.modules) Object.assign(row, m.stats?.(w));
  if (!header) { console.log(Object.keys(row).join('\t')); header = true; }
  console.log(Object.values(row).join('\t'));
}
console.log(`\n${years} years, ${w.day} days, ${w.events.count} events, ${Date.now() - t0} ms. Books balanced every day. State hash ${w.ledger.hash()}`);
const id = w.events.last(explain);
if (id !== undefined) console.log(`\nWhy? Last '${explain}':\n` + w.events.explain(id, 7).join('\n'));
