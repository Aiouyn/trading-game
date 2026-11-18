// Headless run: node sim/run.ts --years 10 --seed 1 [--explain cb.rate] [--chronicle] [--load worlds/7] [--without bonds,social]
// This is the only acceptance check a module needs: it runs, the books balance every day, the stats look sane.
import { DAYS_PER_YEAR, World } from './kernel/index.ts';
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
import { bars } from './modules/markets/bars.ts';
import { earnings } from './modules/earnings/index.ts';
import { signals } from './modules/signals/index.ts';
import { law } from './modules/law/index.ts';
import { crime } from './modules/crime/index.ts';
import { politics } from './modules/politics/index.ts';
import { player } from './modules/player/index.ts';
import { circle } from './modules/circle/index.ts';
import { society } from './modules/society/index.ts';
import { courses } from './modules/courses/index.ts';
import { venues } from './modules/venues/index.ts';
import { history } from './modules/history/index.ts';
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
  if (!without.has('signals') && !without.has('earnings')) w.use(signals);
  if (!without.has('law')) w.use(law);
  if (!without.has('crime')) w.use(crime);
  if (!without.has('politics')) w.use(politics);
  if (!without.has('player')) w.use(player);
  if (!without.has('circle')) w.use(circle);
  if (!without.has('society')) w.use(society);
  if (!without.has('courses')) w.use(courses);
  if (!without.has('venues')) w.use(venues);
  if (!without.has('bars')) w.use(bars);
  if (!without.has('history')) w.use(history);
}

export function openWorld(seed: string, without: Set<string>, deferPlayer = false): World {
  const w = new World(seed, 8);
  if (deferPlayer) w.state.deferPlayer = true;
  installRng(w);
  useModules(w, without);
  return w;
}

const SIM_FRAME = /\/sim\/(modules|kernel)\//;

/** The first frame outside this file. A module that calls the clock fails the run; a module that calls console does not. */
function callerIsModule(stack: string): boolean {
  for (const line of stack.split('\n')) {
    if (!line.includes(' at ')) continue;
    if (line.includes('/sim/run.ts') || line.includes('\\sim\\run.ts')) continue;
    return SIM_FRAME.test(line);
  }
  return false;
}

/** Fails the run if a module reads the wall clock or an unnamed random source while the world is stepping. */
function guardClock(run: () => void): void {
  const random = Math.random;
  const now = Date.now;
  const perf = performance.now.bind(performance);
  const hrtime = process.hrtime.bind(process);
  const hrBig = process.hrtime.bigint.bind(process.hrtime);
  const RealDate = Date;
  const fail = (what: string): void => {
    const stack = new Error().stack ?? '';
    if (callerIsModule(stack)) throw new Error(`${what} called during the run`);
  };
  Math.random = () => { fail('Math.random'); return random(); };
  Date.now = () => { fail('Date.now'); return now(); };
  performance.now = () => { fail('performance.now'); return perf(); };
  const guardedHr = ((...args: Parameters<typeof process.hrtime>) => { fail('process.hrtime'); return hrtime(...args); }) as typeof process.hrtime;
  guardedHr.bigint = () => { fail('process.hrtime.bigint'); return hrBig(); };
  process.hrtime = guardedHr;
  const Guarded = function DateGuard(this: Date, ...args: ConstructorParameters<typeof Date>) {
    if (args.length === 0) fail('new Date()');
    return new RealDate(...args);
  };
  Guarded.now = Date.now;
  Guarded.parse = RealDate.parse;
  Guarded.UTC = RealDate.UTC;
  Guarded.prototype = RealDate.prototype;
  // The modules look Date up when they call it. Node's own timers keep the original.
  globalThis.Date = Guarded as unknown as DateConstructor;
  try { run(); }
  finally {
    Math.random = random;
    Date.now = now;
    performance.now = perf;
    process.hrtime = hrtime as typeof process.hrtime;
    (process.hrtime as typeof process.hrtime).bigint = hrBig;
    globalThis.Date = RealDate;
  }
}

function main(): void {
  const years = +arg('years', '10'), seed = arg('seed', '1'), explain = arg('explain', 'cb.rate'), load = arg('load', '');
  const checkEvery = +arg('check-every', String(+(process.env.SIM_POP ?? 20000) > 20000 ? 7 : 1));
  const without = new Set(arg('without', '').split(',').filter(Boolean));
  const t0 = Date.now();
  const w = openWorld(load ? snapshotSeed(load) : seed, without);
  if (load) applySnapshot(w, load);
  guardClock(() => simulate(w, years, checkEvery, true));
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
