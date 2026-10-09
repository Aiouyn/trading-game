/**
 * Headless price simulator run.
 *   npx tsx scripts/sim.ts --seed alpha --days 504 [--game] [--csv out/prices.csv] [--json out/summary.json]
 *   --game runs the app's game universe (155 assets; catalysts, ecology, world events, rates, options)
 *   --no-events (with --game) turns shared world events off, to measure what they add to the same seed
 * Prints per-asset stats from daily closes, the regime timeline, event counts, volume stats and trading costs.
 * No UI, no network; same seed => same output, byte for byte.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createWorld, step, indexLevel, defaultConfig, universeConfig, expectedVol, estimateFill } from '../src/engine';
import type { StepEvent } from '../src/engine';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const seed = arg('seed', 'alpha');
const days = Number(arg('days', '504'));
const csvPath = process.argv.includes('--csv') ? arg('csv', 'out/prices.csv') : null;
const jsonPath = process.argv.includes('--json') ? arg('json', 'out/summary.json') : null;

const cfg = process.argv.includes('--game') ? universeConfig(process.argv.includes('--no-events') ? { worldEvents: undefined } : {}) : defaultConfig();
const ids = cfg.assets.map((a) => a.id);
const series: Record<string, number[]> = { GX: [] };
for (const id of ids) series[id] = [];
const regimeByDay: string[] = [];
/** per asset: each day's traded value / advNotional, and whether a jump or reopen happened that day */
const dayVol: Record<string, number[]> = {};
const newsDay: Record<string, boolean[]> = {};
for (const id of ids) { dayVol[id] = []; newsDay[id] = []; }
const counts: Record<StepEvent['type'], number> = { regime: 0, jump: 0, auction: 0, halt: 0, reopen: 0, preview: 0, rumor: 0, earnings: 0, rates: 0, macro: 0, world: 0, listing: 0, margin_call: 0, liquidation: 0, option_expiry: 0 };

let state = createWorld(seed, cfg);
const record = () => {
  state.assets.forEach((a, i) => series[ids[i]!]!.push(Math.exp(a.lnP)));
  series.GX!.push(indexLevel(state, 'GX'));
  regimeByDay.push(state.regime);
};
record();
const t0 = performance.now();
for (let d = 0; d < days; d++) {
  for (let t = 0; t < cfg.ticksPerDay; t++) {
    const r = step(state);
    state = r.state;
    for (const e of r.events) {
      counts[e.type]++;
      if ((e.type === 'jump' || e.type === 'reopen') && newsDay[e.assetId]) newsDay[e.assetId]![d] = true;
    }
  }
  state.assets.forEach((a, i) => {
    dayVol[ids[i]!]!.push(a.dayNotional / (cfg.assets[i]!.advNotional ?? 1e9));
    newsDay[ids[i]!]![d] ??= false;
  });
  record();
}
const ms = performance.now() - t0;

const logRets = (xs: number[]) => xs.slice(1).map((x, i) => Math.log(x / xs[i]!));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const maxDD = (xs: number[]) => { let peak = xs[0]!, dd = 0; for (const x of xs) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); } return dd; };
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
  return num / Math.sqrt(da * db);
};

const years = days / cfg.daysPerYear;
const rows = ['GX', ...ids].map((id) => {
  const xs = series[id]!;
  const r = logRets(xs);
  const def = cfg.assets.find((a) => a.id === id);
  return {
    id,
    start: xs[0]!,
    end: xs[xs.length - 1]!,
    cagr: Math.pow(xs[xs.length - 1]! / xs[0]!, 1 / years) - 1,
    vol: sd(r) * Math.sqrt(cfg.daysPerYear),
    targetVol: def ? expectedVol(def) : null,
    maxDrawdown: maxDD(xs),
    corrGX: id === 'GX' ? 1 : corr(r, logRets(series.GX!)),
  };
});

const timeline: { fromDay: number; regime: string }[] = [];
regimeByDay.forEach((r, d) => { if (!timeline.length || timeline[timeline.length - 1]!.regime !== r) timeline.push({ fromDay: d, regime: r }); });

const f = (x: number, dp = 2) => x.toFixed(dp);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`seed=${seed} days=${days} (${f(years)} game yrs, ${f(days)} real hours) ticks=${state.tick} wall=${f(ms, 0)}ms (${f((ms * 1000) / state.tick, 1)} µs/tick)`);
console.log('');
console.log(['asset', 'start', 'end', 'CAGR', 'vol', 'target', 'maxDD', 'ρ(GX)'].map((h) => h.padStart(10)).join(''));
for (const r of rows) {
  console.log([
    r.id, f(r.start), f(r.end), pct(r.cagr), pct(r.vol), r.targetVol === null ? '-' : pct(r.targetVol), pct(r.maxDrawdown), f(r.corrGX),
  ].map((c) => String(c).padStart(10)).join(''));
}
console.log('');
console.log('regimes:', timeline.map((t) => `d${t.fromDay} ${t.regime}`).join(' → '));
console.log('events:', JSON.stringify(counts));

// volume: mean day vs ADV, link to price moves, news days, regimes
const median = (xs: number[]) => { const o = [...xs].sort((a, b) => a - b); return o.length ? o[o.length >> 1]! : NaN; };
const volumeRows = ids.map((id) => {
  const v = dayVol[id]!;
  const absR = logRets(series[id]!).map(Math.abs);
  const news = v.filter((_, d) => newsDay[id]![d]);
  return {
    id,
    meanVsAdv: mean(v),
    medianVsAdv: median(v),
    maxVsAdv: Math.max(...v),
    corrAbsRet: corr(absR, v),
    newsDayMult: news.length ? mean(news) / median(v) : NaN,
  };
});
const byRegime: Record<string, number[]> = {};
for (let d = 0; d < days; d++) {
  const rg = regimeByDay[d + 1]!;
  (byRegime[rg] ??= []).push(mean(ids.map((id) => dayVol[id]![d]!)));
}
console.log('');
console.log('volume (daily traded value / ADV):');
console.log(['asset', 'mean', 'median', 'max', 'ρ(|r|,V)', 'news×'].map((h) => h.padStart(10)).join(''));
for (const r of volumeRows) {
  console.log([r.id, f(r.meanVsAdv), f(r.medianVsAdv), f(r.maxVsAdv), f(r.corrAbsRet), Number.isNaN(r.newsDayMult) ? '-' : f(r.newsDayMult)]
    .map((c) => String(c).padStart(10)).join(''));
}
console.log('by regime (mean across assets):', Object.entries(byRegime).map(([k, v]) => `${k} ${f(mean(v))}`).join(', '));

// round-trip cost (buy then sell at the same price) on a fresh calm world, in bps of notional
{
  const w = createWorld(seed, cfg);
  console.log('');
  console.log('round-trip cost, calm market (spread + impact + fees, bps of notional):');
  console.log(['asset', '$500', '$5k', '$50k', '$1M'].map((h) => h.padStart(10)).join(''));
  for (const a of cfg.assets) {
    const p = a.initialPrice;
    const row = [500, 5000, 50000, 1e6].map((usd) => {
      const qty = a.assetClass === 'stock' ? Math.max(1, Math.round(usd / p)) : usd / p;
      const b = estimateFill(w, { assetId: a.id, side: 'buy', qty });
      const sl = estimateFill(w, { assetId: a.id, side: 'sell', qty });
      return f(((b.total - sl.total) / (qty * p)) * 1e4, 1);
    });
    console.log([a.id, ...row].map((x) => String(x).padStart(10)).join(''));
  }
}

if (csvPath) {
  mkdirSync(dirname(csvPath), { recursive: true });
  const header = ['day', 'regime', 'GX', ...ids].join(',');
  const lines = regimeByDay.map((rg, d) => [d, rg, ...['GX', ...ids].map((id) => series[id]![d]!.toPrecision(8))].join(','));
  writeFileSync(csvPath, [header, ...lines].join('\n') + '\n');
  console.log(`wrote ${csvPath}`);
}
if (jsonPath) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({ seed, days, rows, volume: volumeRows, volumeByRegime: Object.fromEntries(Object.entries(byRegime).map(([k, v]) => [k, mean(v)])), timeline, events: counts }, null, 2));
  console.log(`wrote ${jsonPath}`);
}
