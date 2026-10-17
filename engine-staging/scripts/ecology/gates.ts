/**
 * Shadow-ecology gates (specs/quant-market-ecology.md, calibration table), on the SHADOW daily closes.
 *
 *   npx tsx scripts/ecology/gates.ts full   --tpd 720 --from 1 --to 40 [--out /tmp/eco/full]   # engine with the flag on
 *   npx tsx scripts/ecology/gates.ts record --tpd 720 --from 1 --to 40 [--out /tmp/eco/rec]    # live inputs only (flag off)
 *   npx tsx scripts/ecology/gates.ts report --dir /tmp/eco/full [--txt /tmp/ecology-gates.txt]
 *   npx tsx scripts/ecology/gates.ts replay --dir /tmp/eco/rec [--set valueClose=0.9 ...]      # tuning only
 *   npx tsx scripts/ecology/gates.ts sim    --tpd 24 --from 1 --to 60 [--seed-prefix tape-] [--weight 0.25] [--set ...] --out DIR
 *   npx tsx scripts/ecology/gates.ts report --dir DIR --label '...' [--live-ref /tmp/eco/rec720]   # live column = flag-off recording
 *   npx tsx scripts/ecology/gates.ts report --dir DIR --label 'CLOSED-LOOP sim'                 # closed-loop gates
 *
 * `sim` is the CLOSED LOOP (enterSimMode: the ecology sets each close at 100%; with --weight 0.25 the save-field
 * hybrid path instead, close = 0.75·live + 0.25·ecology); its "SHADOW" column is the
 * closed-loop lnP closes themselves (live == shadow there), not the old open-loop shadow.
 *
 * `full` runs the real engine tick by tick with config.ecology.mode = 'shadow' and reads the shadow
 * close out of state.ecology at every day end. `record` + `replay` fold the same pure ecologyDay()
 * over the live engine's recorded day-end inputs (identical by construction, since the shadow never
 * feeds back); it is only for fast tuning, and `report --check-replay` shows the two agree.
 * Seeds are eco-01 ... eco-NN. Real default universe (17 assets); cross-sectional ICs on the 12 stocks.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorld, defaultConfig, ecoDayInput, ecologyDay, enterSimMode, expectedVol, initEcology, step } from '../../src/engine';
import type { EcoDayInput, EcologyConfig, WorldConfig } from '../../src/engine';

const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'report';
function arg(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
}
const tpd = Number(arg('tpd', '720'));
const days = Number(arg('days', '1260'));
const seedName = (k: number) => `${arg('seed-prefix', 'eco-')}${String(k).padStart(2, '0')}`;

function ecoOverrides(): Partial<EcologyConfig> {
  const o: Record<string, unknown> = {};
  argv.forEach((a, i) => {
    if (a !== '--set') return;
    const [k, v] = argv[i + 1]!.split('=');
    const keys = k!.split('.');
    let t = o;
    for (const kk of keys.slice(0, -1)) t = (t[kk] ??= {}) as Record<string, unknown>;
    t[keys[keys.length - 1]!] = Number(v);
  });
  return o as Partial<EcologyConfig>;
}

interface SeedRun { seed: string; tpd: number; days: number; ids: string[]; stock: boolean[]; live: number[][]; shadow?: number[][]; value: number[][]; gross?: number[][]; inputs?: EcoDayInput[]; ms: number; hMean?: number; hMax?: number }

function runSeed(seed: string, withShadow: boolean): SeedRun {
  const cfg: WorldConfig = defaultConfig({ ticksPerDay: tpd, ...(withShadow ? { ecology: { mode: 'shadow', logDays: 1, ...ecoOverrides() } } : {}) });
  // record (no shadow field) must be the legacy live engine: say so explicitly, new worlds default to full ecology
  let s = withShadow ? createWorld(seed, cfg) : createWorld(seed, cfg, { ecology: 'off' });
  const ids = cfg.assets.map((a) => a.id);
  const live = ids.map((_, i) => [s.assets[i]!.lnP]);
  const value = ids.map((_, i) => [s.assets[i]!.lnV]);
  const shadow = ids.map((_, i) => [s.assets[i]!.lnP]);
  const gross: number[][] = ids.map(() => []);
  const inputs: EcoDayInput[] = [];
  const t0 = performance.now();
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < tpd; t++) s = step(s).state;
    s.assets.forEach((a, i) => { live[i]!.push(a.lnP); value[i]!.push(a.lnV); });
    if (withShadow) {
      inputs.push(ecoDayInput(s, d)); // saved too, so variants can be replayed from the same live path
      s.ecology!.assets.forEach((a, i) => shadow[i]!.push(a.lnS));
      s.ecology!.log[s.ecology!.log.length - 1]!.assets.forEach((a, i) => gross[i]!.push(a.gross));
    } else inputs.push(ecoDayInput(s, d));
  }
  const ms = performance.now() - t0;
  const stock = cfg.assets.map((a) => a.assetClass === 'stock');
  return withShadow ? { seed, tpd, days, ids, stock, live, shadow, value, gross, inputs, ms } : { seed, tpd, days, ids, stock, live, value, inputs, ms };
}

/** closed loop: enterSimMode, the ecology sets every close (lnP) at 100% */
function runSim(seed: string): SeedRun {
  const weight = arg('weight', '');
  const cfg: WorldConfig = defaultConfig({ ticksPerDay: tpd, ecology: { logDays: 1, ...ecoOverrides() } });
  let s = weight ? createWorld(seed, cfg, { ecologyWeight: Number(weight) }) : enterSimMode(createWorld(seed, cfg));
  const ids = cfg.assets.map((a) => a.id);
  const live = ids.map((_, i) => [s.assets[i]!.lnP]);
  const value = ids.map((_, i) => [s.assets[i]!.lnV]);
  const gross: number[][] = ids.map(() => []);
  let hSum = 0, hN = 0, hMax = 0;
  const t0 = performance.now();
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < tpd; t++) s = step(s).state;
    s.assets.forEach((a, i) => { live[i]!.push(a.lnP); value[i]!.push(a.lnV); hSum += a.h; hN++; hMax = Math.max(hMax, a.h); });
    s.ecology!.log[s.ecology!.log.length - 1]!.assets.forEach((a, i) => gross[i]!.push(a.gross));
  }
  const stock = cfg.assets.map((a) => a.assetClass === 'stock');
  return { seed, tpd, days, ids, stock, live, shadow: live, value, gross, ms: performance.now() - t0, hMean: hSum / hN, hMax };
}

/** fold ecologyDay over recorded live inputs (tuning only) */
function replay(r: SeedRun, over: Partial<EcologyConfig>): SeedRun {
  const cfg: WorldConfig = defaultConfig({ ticksPerDay: r.tpd, ecology: { mode: 'shadow', logDays: 1, ...over } });
  const w0 = createWorld(r.seed, cfg);
  let eco = initEcology(w0);
  const shadow = r.ids.map((_, i) => [w0.assets[i]!.lnP]);
  const gross: number[][] = r.ids.map(() => []);
  for (const inp of r.inputs!) {
    eco = ecologyDay(cfg, eco, inp);
    eco.assets.forEach((a, i) => shadow[i]!.push(a.lnS));
    eco.log[eco.log.length - 1]!.assets.forEach((a, i) => gross[i]!.push(a.gross));
  }
  return { ...r, shadow, gross };
}

// ---------------------------------------------------------------- stats
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const median = (x: number[]) => { const s = [...x].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2; };
function corr(a: number[], b: number[]) {
  const n = a.length, ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
function rank(x: number[]) { const r = new Array<number>(x.length); x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).forEach(([, i], j) => { r[i] = j; }); return r; }
function spearman(a: number[], b: number[]) { const ra = rank(a), rb = rank(b); let dd = 0; for (let i = 0; i < a.length; i++) dd += (ra[i]! - rb[i]!) ** 2; const n = a.length; return 1 - (6 * dd) / (n * (n * n - 1)); }
const diffs = (x: number[]) => x.slice(1).map((v, i) => v - x[i]!);

export interface Gates { kurt: number; absAc: number; dailyAc: number; ic1: number; ic63: number }
function gates(closes: number[][], stock: boolean[]): Gates {
  let kurt = 0, absAc = 0, ac = 0;
  const rets = closes.map(diffs);
  for (const r of rets) {
    ac += corr(r.slice(1), r.slice(0, -1));
    const a = r.map(Math.abs);
    absAc += corr(a.slice(1), a.slice(0, -1));
    const m = mean(r), v = mean(r.map((x) => (x - m) ** 2));
    kurt += v ? mean(r.map((x) => (x - m) ** 4)) / (v * v) - 3 : 0;
  }
  const st = closes.map((_, i) => i).filter((i) => stock[i]);
  const D = closes[0]!.length - 1;
  const ic1: number[] = [];
  for (let d = 1; d < D; d++) ic1.push(spearman(st.map((i) => rets[i]![d - 1]!), st.map((i) => rets[i]![d]!)));
  const ic63: number[] = [];
  for (let d = 63; d + 21 <= D; d += 21) ic63.push(spearman(st.map((i) => closes[i]![d]! - closes[i]![d - 63]!), st.map((i) => closes[i]![d + 21]! - closes[i]![d]!)));
  const n = closes.length;
  return { kurt: kurt / n, absAc: absAc / n, dailyAc: ac / n, ic1: mean(ic1), ic63: mean(ic63) };
}
function volCorr(closes: number[][], gross: number[][]): number {
  return mean(closes.map((c, i) => corr(diffs(c).map(Math.abs), gross[i]!)));
}

const BANDS: Record<keyof Gates, [number, number, string]> = {
  kurt: [4, 10, 'excess kurtosis of daily returns in [4, 10]'],
  absAc: [0.15, Infinity, 'corr(|r_t|, |r_t-1|) > 0.15'],
  dailyAc: [-0.05, 0.05, 'daily return autocorr in [-0.05, 0.05]'],
  ic1: [-0.05, 0, '1-day cross-sectional rank IC in [-0.05, 0]'],
  ic63: [0, 0.04, '63-day -> next-21-day rank IC in [0, 0.04]'],
};
const inBand = (k: keyof Gates, v: number) => { const [lo, hi] = BANDS[k]; return k === 'absAc' ? v > lo : v >= lo && v <= hi; };

function summarize(runs: SeedRun[], label: string): string[] {
  const keys = Object.keys(BANDS) as (keyof Gates)[];
  const per = runs.map((r) => gates(r.shadow!, r.stock));
  const liveG = runs.map((r) => gates(r.live, r.stock));
  const valG = runs.map((r) => gates(r.value, r.stock));
  const se = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)) / Math.max(1, xs.length - 1)); };
  const out: string[] = [];
  const r0 = runs[0]!;
  out.push(`${label}: ${runs.length} seeds (${runs[0]!.seed}..${runs[runs.length - 1]!.seed}), ${r0.days} game days, ${r0.ids.length} assets, ticksPerDay=${r0.tpd}; ICs on ${r0.stock.filter(Boolean).length} stocks; mean over seeds (± 1 s.e.)`);
  out.push(`${'gate'.padEnd(46)}${'SHADOW'.padStart(18)}  result   ${'live lnP (ref)'.padStart(14)} ${'lnV (input)'.padStart(12)}`);
  for (const k of keys) {
    const v = mean(per.map((g) => g[k]));
    out.push(`${BANDS[k][2].padEnd(46)}${(v.toFixed(4) + ' ±' + se(per.map((g) => g[k])).toFixed(4)).padStart(18)}  ${inBand(k, v) ? 'PASS' : 'MISS'}     ${mean(liveG.map((g) => g[k])).toFixed(4).padStart(14)} ${mean(valG.map((g) => g[k])).toFixed(4).padStart(12)}`);
  }
  if (runs.every((r) => r.gross)) out.push(`info: corr(|r_shadow|, shadow gross flow) daily = ${mean(runs.map((r) => volCorr(r.shadow!, r.gross!))).toFixed(4)} (log only; quote().volume is unchanged)`);
  if (runs.every((r) => r.hMean !== undefined)) out.push(`info: GARCH h (live engine, reading the live intraday move) mean ${mean(runs.map((r) => r.hMean!)).toFixed(4)}, max ${Math.max(...runs.map((r) => r.hMax!)).toFixed(4)}`);
  {
    // Tape's vol ratio (scripts/balance/run.ts): sd(daily log returns) · sqrt(daysPerYear) / expectedVol(asset), median over seeds
    const dc = defaultConfig();
    const vr = (cl: number[][]) => r0.ids.map((id, i) => median(runs.map((r) => {
      const d = diffs((cl === r0.shadow ? r.shadow! : r.live)[i]!);
      const m = mean(d);
      return (Math.sqrt(mean(d.map((x) => (x - m) ** 2))) * Math.sqrt(dc.daysPerYear)) / expectedVol(dc.assets.find((a) => a.id === id)!);
    })));
    const sh = vr(r0.shadow!), lv = vr(r0.live);
    out.push(`vol ratio (Tape's definition, median over seeds) SHADOW: min ${Math.min(...sh).toFixed(3)} median ${median(sh).toFixed(3)} max ${Math.max(...sh).toFixed(3)} | live column: min ${Math.min(...lv).toFixed(3)} median ${median(lv).toFixed(3)}`);
    out.push(`  per asset SHADOW: ${r0.ids.map((id, i) => `${id} ${sh[i]!.toFixed(3)}`).join(', ')}`);
  }
  out.push(`info: median seed kurt ${median(per.map((g) => g.kurt)).toFixed(4)}, absAc ${median(per.map((g) => g.absAc)).toFixed(4)}`);
  return out;
}

function load(dir: string): SeedRun[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as SeedRun);
}

if (cmd === 'sim') {
  const out = arg('out', '/tmp/eco/sim');
  mkdirSync(out, { recursive: true });
  for (let k = Number(arg('from', '1')); k <= Number(arg('to', '40')); k++) {
    const r = runSim(seedName(k));
    writeFileSync(path.join(out, `${r.seed}.json`), JSON.stringify(r));
    console.log(`sim ${r.seed} tpd=${tpd} ${(r.ms / 1000).toFixed(1)} s`);
  }
} else if (cmd === 'full' || cmd === 'record') {
  const out = arg('out', cmd === 'full' ? '/tmp/eco/full' : '/tmp/eco/rec');
  mkdirSync(out, { recursive: true });
  for (let k = Number(arg('from', '1')); k <= Number(arg('to', '40')); k++) {
    const r = runSeed(seedName(k), cmd === 'full');
    writeFileSync(path.join(out, `${r.seed}.json`), JSON.stringify(r));
    console.log(`${cmd} ${r.seed} tpd=${tpd} ${(r.ms / 1000).toFixed(1)} s`);
  }
} else if (cmd === 'replay') {
  const runs = load(arg('dir', '/tmp/eco/rec')).map((r) => replay(r, ecoOverrides()));
  const lines = summarize(runs, `REPLAY ${JSON.stringify(ecoOverrides())}`);
  console.log(lines.join('\n'));
  const txt = arg('txt', '');
  if (txt) writeFileSync(txt, lines.join('\n') + '\n');
} else if (cmd === 'report') {
  let runs = load(arg('dir', '/tmp/eco/full'));
  const liveRef = arg('live-ref', '');
  if (liveRef) {
    // the "live lnP (ref)" column from a flag-off recording of the same seeds (only seeds that have one)
    const rec = new Map(load(liveRef).map((r) => [r.seed, r] as const));
    runs = runs.filter((r) => rec.has(r.seed)).map((r) => ({ ...r, live: rec.get(r.seed)!.live }));
  }
  const lines = summarize(runs, arg('label', 'SHADOW GATES (engine run, flag on)'));
  if (argv.includes('--check-replay')) {
    // shadow: engine run vs replay of the live inputs; live: flag-on lnP vs a flag-off recording (when present)
    let recRuns: SeedRun[] = [];
    try { recRuns = load(arg('rec', '/tmp/eco/rec')); } catch { recRuns = []; }
    const rec = new Map(recRuns.map((r) => [r.seed, r] as const));
    let maxDiff = 0, n = 0, liveDiff = 0, liveN = 0;
    for (const r of runs) {
      const src = r.inputs ? r : rec.get(r.seed);
      if (!src) continue;
      const re = replay(src, ecoOverrides());
      n++;
      r.shadow!.forEach((c, i) => c.forEach((x, d) => { maxDiff = Math.max(maxDiff, Math.abs(x - re.shadow![i]![d]!)); }));
      const off = rec.get(r.seed);
      if (off) { liveN++; r.live.forEach((c, i) => c.forEach((x, d) => { liveDiff = Math.max(liveDiff, Math.abs(x - off.live[i]![d]!)); })); }
    }
    lines.push(`check: ${n} seeds, max |shadow(engine) - shadow(replay)| = ${maxDiff}; ${liveN} seeds with a flag-off recording, max |live lnP flag on - flag off| = ${liveDiff}`);
  }
  console.log(lines.join('\n'));
  const txt = arg('txt', '');
  if (txt) writeFileSync(txt, lines.join('\n') + '\n');
}
