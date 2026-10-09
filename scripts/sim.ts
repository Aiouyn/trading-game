/**
 * Headless price simulator run.
 *   npx tsx scripts/sim.ts --seed alpha --days 504 [--game] [--csv out/prices.csv] [--json out/summary.json]
 *   --game runs the app's game universe (155 assets; catalysts, ecology, world events, rates, options)
 *   --no-events (with --game) turns shared world events off, to measure what they add to the same seed
 * Prints per-asset stats from daily closes, the regime timeline, event counts, volume stats and trading costs.
 * The game universe lists new assets while it runs (IPOs, spin-offs) and delists others (bankruptcy, merger). An asset
 * gets its series from the day it first appears; its stats cover only its trading days (listing to delisting), and its
 * volume stats skip the days it did not trade. Days are record indices: record k is the world after k game days.
 * No UI, no network; same seed => same output, byte for byte.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createWorld, step, indexLevel, defaultConfig, universeConfig, expectedVol, estimateFill } from '../src/engine';
import type { AssetDef, StepEvent } from '../src/engine';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const seed = arg('seed', 'alpha');
const days = Number(arg('days', '504'));
const csvPath = process.argv.includes('--csv') ? arg('csv', 'out/prices.csv') : null;
const jsonPath = process.argv.includes('--json') ? arg('json', 'out/summary.json') : null;

const cfg = process.argv.includes('--game') ? universeConfig(process.argv.includes('--no-events') ? { worldEvents: undefined } : {}) : defaultConfig();

/** every asset seen so far, in listing order (the starting universe first); GX is not in it */
const ids: string[] = [];
/** record index at which each asset first appeared, and at which it was first seen delisted */
const firstAt: Record<string, number> = {};
const delistAt: Record<string, number> = {};
/** latest definition per asset (advNotional, delisted flag) */
const defById: Record<string, AssetDef> = {};
/** price by record k, NaN before the asset appears */
const series: Record<string, number[]> = { GX: new Array<number>(days + 1).fill(NaN) };
const regimeByDay: string[] = [];
/** per asset and day d: traded value / advNotional (NaN on a day it did not trade), and whether a jump or reopen happened */
const dayVol: Record<string, number[]> = {};
const newsDay: Record<string, boolean[]> = {};
const counts: Record<StepEvent['type'], number> = { regime: 0, jump: 0, auction: 0, halt: 0, reopen: 0, preview: 0, rumor: 0, earnings: 0, rates: 0, macro: 0, world: 0, listing: 0, margin_call: 0, liquidation: 0, option_expiry: 0 };

let state = createWorld(seed, cfg);
/** records taken so far: the record being written is index k */
let k = 0;

/** register an asset the first time it is in the world: its arrays start empty (NaN) so every index lines up by day */
function ensureAsset(id: string, at: number): void {
  if (series[id] !== undefined) return;
  series[id] = new Array<number>(days + 1).fill(NaN);
  dayVol[id] = new Array<number>(days).fill(NaN);
  newsDay[id] = new Array<boolean>(days).fill(false);
  ids.push(id);
  firstAt[id] = at;
}
const syncAssets = () => { for (const def of state.config.assets) ensureAsset(def.id, k); };

const record = () => {
  state.assets.forEach((a, i) => {
    const def = state.config.assets[i]!;
    series[def.id]![k] = Math.exp(a.lnP);
    defById[def.id] = def;
    if (def.delisted && delistAt[def.id] === undefined) delistAt[def.id] = k;
  });
  series.GX![k] = indexLevel(state, 'GX');
  regimeByDay.push(state.regime);
  k++;
};
syncAssets();
record();
const t0 = performance.now();
for (let d = 0; d < days; d++) {
  for (let t = 0; t < cfg.ticksPerDay; t++) {
    const r = step(state);
    state = r.state;
    // a listing appends assets at a day boundary: give each one its arrays before anything refers to it
    if (state.config.assets.length !== ids.length) syncAssets();
    for (const e of r.events) {
      counts[e.type]++;
      if ((e.type === 'jump' || e.type === 'reopen') && newsDay[e.assetId]) newsDay[e.assetId]![d] = true;
    }
  }
  state.assets.forEach((a, i) => {
    const def = state.config.assets[i]!;
    // a delisted name is frozen: no trading, so no volume that day
    if (!def.delisted) dayVol[def.id]![d] = a.dayNotional / (def.advNotional ?? 1e9);
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

/** the record span an asset traded over: from its first record to its delisting record (or the end) */
const spanOf = (id: string) => (id === 'GX' ? { from: 0, to: days } : { from: firstAt[id]!, to: delistAt[id] ?? days });

const years = days / cfg.daysPerYear;
const gxRets = logRets(series.GX!);
const rows = ['GX', ...ids].map((id) => {
  const { from, to } = spanOf(id);
  const xs = series[id]!.slice(from, to + 1);
  const r = logRets(xs);
  const def = defById[id];
  const yrs = (to - from) / cfg.daysPerYear;
  return {
    id,
    from,
    to,
    start: xs[0]!,
    end: xs[xs.length - 1]!,
    cagr: Math.pow(xs[xs.length - 1]! / xs[0]!, 1 / yrs) - 1,
    vol: sd(r) * Math.sqrt(cfg.daysPerYear),
    targetVol: def ? expectedVol(def) : null,
    maxDrawdown: maxDD(xs),
    corrGX: id === 'GX' ? 1 : corr(r, gxRets.slice(from, to)),
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
  const partial = r.id !== 'GX' && (r.from > 0 || r.to < days);
  console.log([
    r.id, f(r.start), f(r.end), pct(r.cagr), pct(r.vol), r.targetVol === null ? '-' : pct(r.targetVol), pct(r.maxDrawdown), f(r.corrGX),
  ].map((c) => String(c).padStart(10)).join('') + (partial ? `   record ${r.from}-${r.to}${delistAt[r.id] !== undefined ? ' (delisted)' : ''}` : ''));
}
console.log('');
console.log('regimes:', timeline.map((t) => `d${t.fromDay} ${t.regime}`).join(' → '));
console.log('events:', JSON.stringify(counts));
const added = ids.filter((id) => firstAt[id]! > 0);
const gone = ids.filter((id) => delistAt[id] !== undefined);
if (added.length || gone.length) {
  console.log(`listings: ${added.length} added (${added.map((id) => `${id} from record ${firstAt[id]}`).join(', ') || 'none'}); ${gone.length} delisted (${gone.map((id) => `${id} at record ${delistAt[id]}`).join(', ') || 'none'})`);
}

// volume: mean day vs ADV, link to price moves, news days, regimes (trading days only)
const median = (xs: number[]) => { const o = [...xs].sort((a, b) => a - b); return o.length ? o[o.length >> 1]! : NaN; };
const volumeRows = ids.map((id) => {
  const v = dayVol[id]!;
  const px = series[id]!;
  // a listing applies at a day boundary, so its first day has volume but no opening price: keep only days with volume and both prices
  const tradeDays = v.map((_, d) => d).filter((d) => Number.isFinite(v[d]) && Number.isFinite(px[d]) && Number.isFinite(px[d + 1]));
  const vals = tradeDays.map((d) => v[d]!);
  const absR = tradeDays.map((d) => Math.abs(Math.log(px[d + 1]! / px[d]!)));
  const news = tradeDays.filter((d) => newsDay[id]![d]).map((d) => v[d]!);
  return {
    id,
    meanVsAdv: mean(vals),
    medianVsAdv: median(vals),
    maxVsAdv: Math.max(...vals),
    // too few trade days for a meaningful correlation: printed as '-'
    corrAbsRet: tradeDays.length >= 5 ? corr(absR, vals) : null,
    newsDayMult: news.length ? mean(news) / median(vals) : NaN,
  };
});
const byRegime: Record<string, number[]> = {};
for (let d = 0; d < days; d++) {
  const rg = regimeByDay[d + 1]!;
  (byRegime[rg] ??= []).push(mean(ids.map((id) => dayVol[id]![d]!).filter(Number.isFinite)));
}
console.log('');
console.log('volume (daily traded value / ADV):');
console.log(['asset', 'mean', 'median', 'max', 'ρ(|r|,V)', 'news×'].map((h) => h.padStart(10)).join(''));
for (const r of volumeRows) {
  console.log([r.id, f(r.meanVsAdv), f(r.medianVsAdv), f(r.maxVsAdv), r.corrAbsRet === null ? '-' : f(r.corrAbsRet), Number.isNaN(r.newsDayMult) ? '-' : f(r.newsDayMult)]
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
  const cols = ['GX', ...ids];
  const header = ['day', 'regime', ...cols].join(',');
  const lines = regimeByDay.map((rg, d) => [d, rg, ...cols.map((id) => { const x = series[id]![d]!; return Number.isFinite(x) ? x.toPrecision(8) : ''; })].join(','));
  writeFileSync(csvPath, [header, ...lines].join('\n') + '\n');
  console.log(`wrote ${csvPath}`);
}
if (jsonPath) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({
    seed, days, rows, volume: volumeRows, volumeByRegime: Object.fromEntries(Object.entries(byRegime).map(([k, v]) => [k, mean(v)])), timeline, events: counts,
    listings: { addedAtRecord: Object.fromEntries(added.map((id) => [id, firstAt[id]])), delistedAtRecord: Object.fromEntries(gone.map((id) => [id, delistAt[id]])) },
  }, null, 2));
  console.log(`wrote ${jsonPath}`);
}
