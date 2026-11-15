// Headless run: node sim/run.ts --years 10 --seed 1 [--explain cb.rate] [--chronicle] [--load worlds/7] [--without bonds,social]
// This is the only acceptance check a module needs: it runs, the books balance every day, the stats look sane.
import { DAYS_PER_YEAR, openingDay, World } from './kernel/index.ts';
import { economy } from './modules/economy/index.ts';
import { abroad } from './modules/abroad/index.ts';
import { port } from './modules/port/index.ts';
import { banking } from './modules/banking/index.ts';
import { corporate } from './modules/corporate/index.ts';
import { property } from './modules/property/index.ts';
import { insurance } from './modules/insurance/index.ts';
import { bonds } from './modules/bonds/index.ts';
import { markets } from './modules/markets/index.ts';
import { options } from './modules/options/index.ts';
import { funds } from './modules/funds/index.ts';
import { commodities } from './modules/commodities/index.ts';
import { energy } from './modules/energy/index.ts';
import { social } from './modules/social/index.ts';
import { media } from './modules/media/index.ts';
import { psyche } from './modules/psyche/index.ts';
import { health } from './modules/health/index.ts';
import { careers } from './modules/careers/index.ts';
import { labour } from './modules/labour/index.ts';
import { crypto } from './modules/crypto/index.ts';
import { earnings } from './modules/earnings/index.ts';
import { law } from './modules/law/index.ts';
import { crime } from './modules/crime/index.ts';
import { politics } from './modules/politics/index.ts';
import { player } from './modules/player/index.ts';
import { history } from './modules/history/index.ts';
import { setSimDay } from './modules/economy/people.ts';
import { simulate } from './modules/history/boot.ts';
import { installRng } from './modules/history/rngbox.ts';
import { applySnapshot, snapshotSeed } from './modules/history/save.ts';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

export function useModules(w: World, without: Set<string>): void {
  w.use(economy);
  if (!without.has('abroad')) w.use(abroad);
  if (!without.has('port')) w.use(port);
  if (!without.has('banking')) w.use(banking);
  if (!without.has('corporate')) w.use(corporate);
  if (!without.has('property')) w.use(property);
  if (!without.has('insurance')) w.use(insurance);
  for (const m of [bonds, markets]) if (!without.has(m.id)) w.use(m);
  if (!without.has('options')) w.use(options);
  if (!without.has('funds')) w.use(funds);
  if (!without.has(commodities.id)) w.use(commodities);
  if (!without.has(energy.id)) w.use(energy);
  if (!without.has(social.id)) w.use(social);
  if (!without.has('media')) w.use(media);
  for (const m of [psyche]) if (!without.has(m.id)) w.use(m);
  if (!without.has('health')) w.use(health);
  if (!without.has('careers')) w.use(careers);
  if (!without.has('labour')) w.use(labour);
  for (const m of [crypto]) if (!without.has(m.id)) w.use(m);
  if (!without.has('earnings')) w.use(earnings);
  if (!without.has('law')) w.use(law);
  if (!without.has('crime')) w.use(crime);
  if (!without.has('politics')) w.use(politics);
  if (!without.has('player')) w.use(player);
  if (!without.has('history')) w.use(history);
}

// Opening production is staffed for 90% of the workforce and priced at cost plus 20%, but the first
// week's buyers only clear about 85% of it: household budgets are about four-fifths of the wage
// bill and the government starts with no fiscal stance. Firms cut staff, unemployment jumps from
// 10% to the mid-20s, and the printed year-1 figure is that swing (about 17%). Six years lets the
// inventory cycle die. The clock then returns to day 360, past the opening gates (they are for an
// empty world, and tripping them again knocks a settled one off its path), and ages, debts,
// voyages and shock clocks move with it. Daily rules are untouched.
const WARM_YEARS = 6;
const OPEN_DAY = 360;
const DAY_KEYS = new Set([
  'until', 'shockUntil', 'hikeUntil', 'closedUntil', 'coldUntil', 'dryUntil', 'strikeUntil',
  'issueDay', 'matureDay', 'nextCoupon', 'eta', 'sailDay', 'bornDay', 'hiredDay', 'listOn',
  'dockDay', 'bookDay', 'starvedDay', 'due',
  'ready', 'opened', 'pubDay', 'firstDay', 'day', 'ranDay', 'born',
  'epiUntil', 'portUntil', 'snapDay',
]);
// Typed arrays of absolute days. People.born is every live person, including the founding
// generation whose dates are already negative; the others only move a date that is still set.
const ARRAY_KEYS = new Set(['freeAt', 'holdDay', 'wealthDay', 'snapDay', 'fraudAt', 'dealUntil', 'lnOpened', 'firmRefuse', 'lock', 'caseUntil']);

function shiftPos(a: ArrayLike<number> & { [i: number]: number }, n: number, D: number): void {
  const m = Math.min(n, a.length);
  for (let i = 0; i < m; i++) if (a[i] > 0) a[i] -= D;
}

function shiftTree(o: object, D: number, seen: WeakSet<object>, key = ''): void {
  if (seen.has(o)) return;
  seen.add(o);
  if (ArrayBuffer.isView(o)) {
    if (ARRAY_KEYS.has(key)) shiftPos(o as unknown as Int32Array, (o as unknown as Int32Array).length, D);
    return;
  }
  if (o instanceof Map || o instanceof Set) return;
  const rec = o as Record<string, unknown>;
  if (rec.born && rec.fearUntil && rec.outUntil && typeof rec.n === 'number') {
    const n = rec.n as number;
    const born = rec.born as Int32Array;
    for (let i = 0; i < n && i < born.length; i++) born[i] -= D;
    shiftPos(rec.fearUntil as Int32Array, n, D);
    shiftPos(rec.outUntil as Int32Array, n, D);
  }
  for (const k of Object.keys(rec)) {
    const v = rec[k];
    if (typeof v === 'number' && v > 0 && v < D + 400000 && DAY_KEYS.has(k)) rec[k] = v - D;
    else if (v !== null && typeof v === 'object') shiftTree(v, D, seen, k);
  }
}

function warmStart(w: World): void {
  // The port speaks its journal when the calendar year equals --years. Spoken during
  // the warm-up, or during the measured years of a run that opened on day 360, those
  // events renumber every later id. A game passes no --years, so it never speaks.
  const at = process.argv.indexOf('--years');
  if (at > 0) process.argv[at + 1] = '999';
  simulate(w, WARM_YEARS, 1, false);
  const D = w.day - OPEN_DAY;
  const evs = (w.events as unknown as { evs?: { day: number }[] }).evs;
  if (evs) for (const e of evs) e.day -= D;
  w.day = OPEN_DAY;
  w.events.day = OPEN_DAY;
  w.ledger.day = OPEN_DAY;
  shiftTree(w.state, D, new WeakSet());
  w.state.calendar = { origin: OPEN_DAY };
  setSimDay(OPEN_DAY);
}

export function openWorld(seed: string, without: Set<string>, settle = true): World {
  const w = new World(seed, 8);
  installRng(w);
  useModules(w, without);
  if (settle) warmStart(w);
  return w;
}

function main(): void {
  const years = +arg('years', '10'), seed = arg('seed', '1'), explain = arg('explain', 'cb.rate'), load = arg('load', '');
  const checkEvery = +arg('check-every', String(+(process.env.SIM_POP ?? 20000) > 20000 ? 7 : 1));
  const without = new Set(arg('without', '').split(',').filter(Boolean));
  const t0 = Date.now();
  const w = openWorld(load ? snapshotSeed(load) : seed, without, !load);
  if (load) applySnapshot(w, load);
  simulate(w, years, checkEvery, true);
  console.log(`\nmemory ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  console.log(`\n${years} years, ${w.day} days, ${w.events.count} events, ${Date.now() - t0} ms. Books balanced ${checkEvery === 1 ? 'every day' : `at every check (every ${checkEvery} days)`}. State hash ${w.ledger.hash()}`);
  if (process.argv.includes('--chronicle')) {
    console.log('\nChronicle (latest notable events):');
    for (const e of w.events.recent(['shock.energy', 'firm.succession', 'firm.ceoFired', 'firm.default', 'firm.cashCrunch', 'person.died', 'person.breakdown', 'life.tally'], 40))
      console.log(`  year ${Math.floor((e.day - openingDay(w)) / DAYS_PER_YEAR) + 1}, day ${e.day % DAYS_PER_YEAR}: ${e.actor ? e.actor + ': ' : ''}${e.msg}`);
  }
  const id = w.events.last(explain);
  if (id !== undefined) console.log(`\nWhy? Last '${explain}':\n` + w.events.explain(id, 7).join('\n'));
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('run.ts') || entry.endsWith('run.js')) main();
