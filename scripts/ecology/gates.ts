/**
 * Ecology gates (specs/quant-market-ecology.md, calibration table), ported from engine-staging to the v1 engine.
 *
 *   npx tsx scripts/ecology/gates.ts full   [--universe] [--seeds 8] [--tpd 720] [--days 1260] [--set k=v ...] [--out DIR] [--txt FILE]
 *       (diagnostics: --first K runs seeds K.. so a release run can be split over processes; --drop k1,k2 removes top-level
 *        layers of the config; --world a.b=v sets a nested config field, e.g. catalysts.peadShare=0)
 *   npx tsx scripts/ecology/gates.ts shadow [--universe] [--seeds 8] [--tpd 720] [--days 1260] [--set k=v ...] [--out DIR] [--txt FILE]
 *   npx tsx scripts/ecology/gates.ts report --dir DIR [--live-ref SHADOW_DIR] [--check-replay] [--txt FILE]
 *   npx tsx scripts/ecology/gates.ts replay --dir SHADOW_DIR [--set k=v ...] [--txt FILE]      (tuning only)
 *
 * Configs. Default: the bare 17-asset catalog (defaultConfig plus the momentum-fix fields). --universe: universeConfig
 * (183 assets, world events, rivals, listings). Seeds are eco-01 ... eco-NN (--seed-prefix). Defaults are quick; the
 * release gate is 60 seeds (--seeds 60, tape-ecology-hunts.md). A universe seed at 720 ticks/day takes about 5 minutes,
 * so --universe defaults to 24 ticks/day; pass --tpd 720 for the calibrated run. Output dirs default to the OS temp dir.
 *
 * Modes.
 *   full:   config.ecology = { mode: 'full', weight: 1 }. The ecology sets every game-day close (the closing auction),
 *           and the gate closes are the printed lnP. This is the closed loop; it replaces staging's enterSimMode.
 *   shadow: config.ecology = { mode: 'shadow' }. The pools run beside the live path and never move a price. The gate
 *           closes are the shadow lnS. The live lnP is recorded too, so a shadow dir is the live reference for a full
 *           run (report --live-ref). Shadow leaves prices unchanged (src/engine/ecology.test.ts).
 *   report: prints the gate table of a dir. --live-ref adds the live column from a shadow dir of the same seeds.
 *           --check-replay also replays each shadow run and compares.
 *   replay: folds ecologyDay over the recorded day-end inputs of a shadow dir (tuning with --set, no engine run).
 *
 * Not ported. staging's `sim` mode (enterSimMode, a harness-only closed loop) is `full` here: v1 has no enterSimMode, and
 * the full save field already sets every close. staging's `record` mode is dropped: the live reference is the shadow run's
 * live lnP. fingerprint.ts is dropped: staging pinned its own legacy engine to a committed JSON fixture, and v1 has no
 * such fixture; src/engine/ecology.test.ts checks flag-off against shadow byte for byte on a live run instead.
 *
 * Gates. Each seed's value is the average over its alive assets (IC over alive stocks); the table shows the mean over seeds ± 1 s.e.
 *   kurt     excess kurtosis of daily log returns, above 3 (the spec's calibration table). Staging also capped it at 10;
 *            the spec has no cap, so none is applied here.
 *   absAc    corr(|r_t|, |r_t-1|), above 0.15
 *   dailyAc  daily return autocorrelation, in [-0.05, 0.05]
 *   ic1      1-day cross-sectional rank IC of stocks (r_t-1 vs r_t), in [-0.05, 0]
 *   ic63     rank IC of the 63-day return vs the next 21 days (stocks, non-overlapping), in [0, 0.04]
 *   volCorr  corr(|r_t|, traded value), in (0.3, 0.6]. The gate is on dayNotional (the engine's own volume), which only
 *            the live path writes. So the FULL column gates dayNotional, and the SHADOW column shows the shadow gross flow
 *            (pool orders, ADV units) as INFO, not a gate. The live column (report --live-ref, or a shadow dir's own live
 *            lnP) carries the dayNotional gate for the shadow run.
 *   volRatio Tape's vol ratio, sd(daily log returns) · sqrt(daysPerYear) / expectedVol, RMS over seeds per asset; every
 *            asset in [0.85, 1.4], or in its universe class band from scripts/balance/bands.ts (UNIVERSE_VOL_BANDS, the
 *            same table run.ts uses). expectedVol uses the close's print share (closePrint) for the gate closes, and the
 *            jumpImmediate share for the live reference. Assets delisted in any seed are left out (Tape's rule).
 * Info: GARCH h (live engine) mean and max; ecology gross flow per asset-day.
 *
 * Universe runs use only the starting asset list, and only assets alive for the whole run (not delisted).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorld, expectedVol, step } from '../../src/engine/index';
import type { EcologyConfig, WorldConfig } from '../../src/engine/index';
import { ecoDayInput, ecologyConfig, ecologyDay, initEcology } from '../../src/engine/ecology';
import type { EcoDayInput } from '../../src/engine/ecology';
import { arg, corr, diffs, ecologyOverrides, hasFlag, mean, median, numArg, sem, spearman, worldConfig } from './common';
import { UNIVERSE_VOL_BANDS } from '../balance/bands';

const cmd = process.argv[2] ?? 'report';

interface SeedRun {
  mode: 'full' | 'shadow';
  seed: string;
  universe: boolean;
  tpd: number;
  days: number;
  daysPerYear: number;
  /** the --set overrides of the run */
  set: Partial<EcologyConfig>;
  ids: string[];
  /** stock asset, and alive (not delisted at any day end) */
  stock: boolean[];
  alive: boolean[];
  /** expectedVol for the gate closes (full closes, shadow lnS): the close prints the ecology's newsPrint share of a jump */
  expVol: number[];
  /** expectedVol for the live reference (shadow dir's live lnP): the live path prints jumpImmediate at once */
  expVolLive: number[];
  /** printed close per asset: lnP at each day end (full) or the shadow close lnS (shadow). Index 0 is the start. */
  closes: number[][];
  /** shadow only: the live lnP at each day end (the live reference) */
  live?: number[][];
  /** the engine's traded value on each day (dayNotional at the day end), per asset; index = day */
  dayNotional: number[][];
  /** the ecology's gross flow on each day, ADV units, per asset */
  gross: number[][];
  hMean: number;
  hMax: number;
  /** shadow only: the day-end inputs, so the pools can be replayed */
  inputs?: EcoDayInput[];
  ms: number;
}

// ---------------------------------------------------------------- engine runs

function runSeed(seed: string, mode: 'full' | 'shadow', universe: boolean, tpd: number, days: number, set: Partial<EcologyConfig>): SeedRun {
  const eco: Partial<EcologyConfig> = mode === 'full' ? { mode: 'full', weight: 1, logDays: 1, ...set } : { mode: 'shadow', logDays: 1, ...set };
  const cfg: WorldConfig = worldConfig(universe, tpd, eco);
  // --drop k1,k2 switches off top-level layers of the config (diagnostic: which layer makes a gate fail)
  for (const k of arg('drop', '').split(',').filter(Boolean)) delete (cfg as unknown as Record<string, unknown>)[k];
  // --world a.b=v (repeatable via ';'): sets a nested WorldConfig field (diagnostic, e.g. catalysts.peadShare=0)
  for (const kv of arg('world', '').split(';').filter(Boolean)) {
    const [k, v] = kv.split('=');
    const keys = k!.split('.');
    let t = cfg as unknown as Record<string, unknown>;
    for (const kk of keys.slice(0, -1)) t = t[kk] as Record<string, unknown>;
    t[keys[keys.length - 1]!] = Number(v);
  }
  const ids = cfg.assets.map((a) => a.id);
  const n = ids.length;
  let s = createWorld(seed, cfg);
  const isShadow = mode === 'shadow';
  const closes = ids.map((_, i) => [s.assets[i]!.lnP]);
  const live = isShadow ? ids.map((_, i) => [s.assets[i]!.lnP]) : undefined;
  const dayNotional: number[][] = ids.map(() => []);
  const gross: number[][] = ids.map(() => []);
  const alive = ids.map(() => true);
  const inputs: EcoDayInput[] = [];
  let hSum = 0, hN = 0, hMax = 0;
  const t0 = performance.now();
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < tpd; t++) s = step(s).state;
    const e = s.ecology!;
    const last = e.log[e.log.length - 1]!;
    for (let i = 0; i < n; i++) {
      const a = s.assets[i]!;
      closes[i]!.push(isShadow ? e.assets[i]!.lnS : a.lnP);
      if (live) live[i]!.push(a.lnP);
      dayNotional[i]!.push(a.dayNotional);
      gross[i]!.push(last.assets[i]!.gross);
      hSum += a.h; hN++; hMax = Math.max(hMax, a.h);
      if (s.config.assets[i]!.delisted) alive[i] = false;
    }
    if (isShadow) inputs.push(ecoDayInput(s, d));
  }
  const stock = cfg.assets.map((a) => a.assetClass === 'stock');
  // the gate closes print the ecology's newsPrint share of each jump; the live reference prints jumpImmediate (closePrint)
  const expVol = cfg.assets.map((a) => expectedVol(a, undefined, ecologyConfig(cfg).newsPrint ?? 1));
  const expVolLive = cfg.assets.map((a) => expectedVol(a, undefined, cfg.jumpImmediate ?? 1));
  return {
    mode, seed, universe, tpd, days, daysPerYear: cfg.daysPerYear, set, ids, stock, alive, expVol, expVolLive, closes, live, dayNotional, gross,
    hMean: hSum / hN, hMax, ...(isShadow ? { inputs } : {}), ms: performance.now() - t0,
  };
}

/** fold ecologyDay over the recorded day-end inputs of a shadow run (tuning only). Same config as the run, plus over. */
function replay(r: SeedRun, over: Partial<EcologyConfig>): SeedRun {
  const cfg = worldConfig(r.universe, r.tpd, { mode: 'shadow', logDays: 1, ...r.set, ...over });
  const w0 = createWorld(r.seed, cfg);
  // the engine initialises the shadow book on the state after the first tick (step() calls initEcology(cleared)), so do the same
  const w1 = step(w0).state;
  let e = initEcology(w1);
  const shadow = r.ids.map((_, i) => [w0.assets[i]!.lnP]);
  const gross: number[][] = r.ids.map(() => []);
  for (const inp of r.inputs!) {
    e = ecologyDay(cfg, e, inp);
    e.assets.forEach((a, i) => shadow[i]!.push(a.lnS));
    e.log[e.log.length - 1]!.assets.forEach((a, i) => gross[i]!.push(a.gross));
  }
  return { ...r, closes: shadow, gross };
}

// ---------------------------------------------------------------- gates

interface Market { kurt: number; absAc: number; dailyAc: number; ic1: number; ic63: number }

/** the price gates on one set of closes, averaged over the alive assets (the ICs over the alive stocks) */
function marketGates(closes: number[][], alive: boolean[], stock: boolean[]): Market {
  const idx = closes.map((_, i) => i).filter((i) => alive[i]);
  let kurt = 0, absAc = 0, dailyAc = 0;
  for (const i of idx) {
    const r = diffs(closes[i]!);
    const m = mean(r), v = mean(r.map((x) => (x - m) ** 2));
    kurt += v ? mean(r.map((x) => (x - m) ** 4)) / (v * v) - 3 : 0;
    dailyAc += corr(r.slice(1), r.slice(0, -1));
    absAc += corr(r.slice(1).map(Math.abs), r.slice(0, -1).map(Math.abs));
  }
  const na = Math.max(1, idx.length);
  const rets = closes.map(diffs);
  const st = idx.filter((i) => stock[i]);
  const D = closes[0]!.length - 1;
  const ic1: number[] = [];
  for (let d = 1; d < D; d++) ic1.push(spearman(st.map((i) => rets[i]![d - 1]!), st.map((i) => rets[i]![d]!)));
  const ic63: number[] = [];
  for (let d = 63; d + 21 <= D; d += 21) ic63.push(spearman(st.map((i) => closes[i]![d]! - closes[i]![d - 63]!), st.map((i) => closes[i]![d + 21]! - closes[i]![d]!)));
  return { kurt: kurt / na, absAc: absAc / na, dailyAc: dailyAc / na, ic1: mean(ic1), ic63: mean(ic63) };
}

/** the volume gate: mean over alive assets of corr(|r_t|, flow_t); flow[i][t] is the day-t traded value */
function volCorr(closes: number[][], flow: number[][], alive: boolean[]): number {
  const idx = closes.map((_, i) => i).filter((i) => alive[i]);
  return mean(idx.map((i) => corr(diffs(closes[i]!).map(Math.abs), flow[i]!.slice(0, closes[i]!.length - 1))));
}

/**
 * RMS over seeds (V1-PHASE1 F13): sqrt of the mean of the squared per-seed ratios, i.e. mean realized variance over expectedVol squared.
 * The median is biased low for a rare-jump asset: AUSD (0.25 jumps a year) has runs with no jump (ratio ~0.15) and runs with one (~1.7).
 */
const rmsOf = (x: readonly number[]): number => Math.sqrt(x.reduce((a, b) => a + b * b, 0) / Math.max(1, x.length));

/** Tape's vol ratio for every asset of one run (NaN for a delisted asset) */
function volRatios(closes: number[][], alive: boolean[], expVol: number[], dpy: number): number[] {
  return closes.map((c, i) => {
    if (!alive[i]) return Number.NaN;
    const d = diffs(c);
    const m = mean(d);
    return (Math.sqrt(mean(d.map((x) => (x - m) ** 2))) * Math.sqrt(dpy)) / expVol[i]!;
  });
}

const BAND_KEYS = ['kurt', 'absAc', 'dailyAc', 'ic1', 'ic63', 'volCorr'] as const;
type BandKey = (typeof BAND_KEYS)[number];
const BANDS: Record<BandKey, { label: string; text: string; ok: (v: number) => boolean }> = {
  kurt: { label: 'excess kurtosis of daily returns', text: 'above 3', ok: (v) => v > 3 },
  absAc: { label: 'corr(|r_t|, |r_t-1|) (vol clustering)', text: '> 0.15', ok: (v) => v > 0.15 },
  dailyAc: { label: 'daily return autocorrelation', text: 'in [-0.05, 0.05]', ok: (v) => v >= -0.05 && v <= 0.05 },
  ic1: { label: '1-day cross-sectional rank IC (stocks)', text: 'in [-0.05, 0]', ok: (v) => v >= -0.05 && v <= 0 },
  ic63: { label: '63-day -> next-21-day rank IC (stocks)', text: 'in [0, 0.04]', ok: (v) => v >= 0 && v <= 0.04 },
  volCorr: { label: 'corr(|r_t|, traded value) (volume)', text: 'in (0.3, 0.6]', ok: (v) => v > 0.3 && v <= 0.6 },
};
const VOL_BAND: [number, number] = [0.85, 1.4];
/** the vol-ratio band of one asset: the universe's class band where bands.ts has one (the same table run.ts uses), else [0.85, 1.4] */
const volBandOf = (id: string, universe: boolean): [number, number] => {
  const b = universe ? UNIVERSE_VOL_BANDS[id] : undefined;
  return b ? [b.min, b.max] : VOL_BAND;
};

// ---------------------------------------------------------------- report

/** pass: true/false when gated, null for info. livePass: the same gate on the live column, when there is one. */
interface Row { label: string; text: string; value: string; pass: boolean | null; live?: string; livePass?: boolean }

/**
 * The gate table. `runs` carry the printed closes (full: lnP; shadow: lnS). The live column comes from `ref` (the shadow
 * dir of the same seeds, aligned with runs), or from the runs themselves when they are shadow runs (their .live closes).
 */
function summarize(runs: SeedRun[], label: string, ref?: SeedRun[]): string[] {
  const r0 = runs[0]!;
  const n = runs.length;
  const isFull = r0.mode === 'full';
  const liveRuns = ref ?? (r0.live ? runs : undefined);
  const liveCloses = (r: SeedRun, k: number) => (ref ? ref[k]!.live! : r.live!);
  const out: string[] = [];
  const nStocks = r0.stock.filter((x, i) => x && r0.alive[i]).length;
  out.push(`${label}: ${n} seeds (${runs[0]!.seed}..${runs[n - 1]!.seed}), ${r0.days} game days, ${r0.ids.length} assets (${r0.universe ? 'universe' : 'bare catalog'}), ticksPerDay=${r0.tpd}, ICs on ${nStocks} stocks; mean over seeds ± 1 s.e.${Object.keys(r0.set).length ? `; DIAGNOSTIC overrides ${JSON.stringify(r0.set)}` : ''}`);

  const per = runs.map((r) => marketGates(r.closes, r.alive, r.stock));
  const perVol = runs.map((r) => volCorr(r.closes, isFull ? r.dayNotional : r.gross, r.alive));
  const livePer = liveRuns?.map((r, k) => marketGates(liveCloses(r, k), r.alive, r.stock));
  const liveVol = liveRuns?.map((r, k) => volCorr(liveCloses(r, k), r.dayNotional, r.alive));

  const rows: Row[] = [];
  for (const k of BAND_KEYS) {
    const xs = k === 'volCorr' ? perVol : per.map((g) => g[k]);
    const v = mean(xs);
    const lvs = k === 'volCorr' ? liveVol : livePer?.map((g) => g[k]);
    const lv = lvs ? mean(lvs) : undefined;
    rows.push({
      label: BANDS[k].label + (k === 'volCorr' && !isFull ? ' [shadow gross: INFO]' : ''), text: BANDS[k].text,
      value: `${v.toFixed(4)} ±${Number.isFinite(sem(xs)) ? sem(xs).toFixed(4) : 'n/a'}`,
      pass: k === 'volCorr' && !isFull ? null : BANDS[k].ok(v),
      ...(lv !== undefined ? { live: `${lv.toFixed(4)}`, livePass: BANDS[k].ok(lv) } : {}),
    });
  }

  // vol ratio: median over seeds for each asset, and every asset inside the band
  const vrs = runs.map((r) => volRatios(r.closes, r.alive, r.expVol, r.daysPerYear));
  const assetVol = r0.ids.map((_, i) => rmsOf(vrs.map((v) => v[i]!).filter((x) => Number.isFinite(x))));
  const listed = assetVol.map((v, i) => ({ id: r0.ids[i]!, v })).filter((x) => Number.isFinite(x.v));
  const inBand = (x: { id: string; v: number }) => { const [lo, hi] = volBandOf(x.id, r0.universe); return x.v >= lo && x.v <= hi; };
  const outside = listed.filter((x) => !inBand(x));
  let liveVr: string | undefined, liveVrPass: boolean | undefined;
  if (liveRuns) {
    const lvrs = liveRuns.map((r, k) => volRatios(liveCloses(r, k), r.alive, r.expVolLive, r.daysPerYear));
    const lvAll = r0.ids.map((id, i) => ({ id, v: rmsOf(lvrs.map((v) => v[i]!).filter((x) => Number.isFinite(x))) })).filter((x) => Number.isFinite(x.v));
    const lv = lvAll.map((x) => x.v);
    liveVr = `min ${Math.min(...lv).toFixed(3)} med ${median(lv).toFixed(3)} max ${Math.max(...lv).toFixed(3)}`;
    liveVrPass = lvAll.every(inBand);
  }
  rows.push({
    label: `vol ratio per asset, RMS over seeds (${listed.length} assets)`, text: r0.universe ? 'in band (class bands)' : 'every asset in [0.85, 1.4]',
    value: `${Math.min(...listed.map((x) => x.v)).toFixed(3)}..${Math.max(...listed.map((x) => x.v)).toFixed(3)} med ${median(listed.map((x) => x.v)).toFixed(3)}`,
    pass: outside.length === 0,
    ...(liveVr ? { live: liveVr, livePass: liveVrPass } : {}),
  });

  const col = isFull ? 'FULL' : 'SHADOW';
  out.push(`${'gate'.padEnd(56)}${col.padStart(24)}  result  ${'band'.padEnd(30)}${liveRuns ? `${'live (ref)'.padStart(24)}  result` : ''}`);
  for (const row of rows) {
    const res = row.pass === null ? 'INFO  ' : row.pass ? 'PASS  ' : 'FAIL  ';
    const lres = row.livePass === undefined ? '' : row.livePass ? 'PASS' : 'FAIL';
    out.push(`${row.label.padEnd(56)}${row.value.padStart(24)}  ${res}${row.text.padEnd(30)}${row.live !== undefined ? row.live.padStart(24) : ''}${lres ? '  ' + lres : ''}`);
  }
  if (outside.length) out.push(`vol ratio outside its band: ${outside.length} assets: ${outside.map((x) => `${x.id} ${x.v.toFixed(3)} [${volBandOf(x.id, r0.universe).join(', ')}]`).join(', ')}`);
  out.push(`info: GARCH h (live engine) mean ${mean(runs.map((r) => r.hMean)).toFixed(4)}, max ${Math.max(...runs.map((r) => r.hMax)).toFixed(4)}`);
  out.push(`info: ecology gross flow ${mean(runs.map((r) => mean(r.gross.flat()))).toFixed(4)} ADV per asset-day (log only; quote().volume is not gated)`);
  const gated = rows.filter((x) => x.pass !== null);
  out.push(`gates ${col}: ${gated.filter((x) => x.pass).length}/${gated.length} PASS${rows.some((x) => x.pass === null) ? ' (volCorr INFO: see live column)' : ''}`);
  if (liveRuns) {
    const lg = rows.filter((x) => x.livePass !== undefined);
    out.push(`gates live: ${lg.filter((x) => x.livePass).length}/${lg.length} PASS`);
  }
  return out;
}

function load(dir: string): SeedRun[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as SeedRun);
}

function emit(lines: string[]): void {
  console.log(lines.join('\n'));
  const txt = arg('txt', '');
  if (txt) writeFileSync(txt, lines.join('\n') + '\n');
}

// ---------------------------------------------------------------- commands

function defaultOut(mode: string, universe: boolean): string {
  return path.join(os.tmpdir(), 'ecology-gates', `${mode}${universe ? '-universe' : ''}`);
}

if (cmd === 'full' || cmd === 'shadow') {
  const universe = hasFlag('universe');
  const tpd = numArg('tpd', universe ? 24 : 720);
  const days = numArg('days', 1260);
  const seeds = numArg('seeds', 8);
  const prefix = arg('seed-prefix', 'eco-');
  const out = arg('out', defaultOut(cmd, universe));
  const set = ecologyOverrides();
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // --first K runs seeds K..K+seeds-1, so independent processes can split a release run (merge the dirs with report)
  const first = numArg('first', 1);
  for (let k = first; k < first + seeds; k++) {
    const seed = `${prefix}${String(k).padStart(2, '0')}`;
    const r = runSeed(seed, cmd, universe, tpd, days, set);
    writeFileSync(path.join(out, `${seed}.json`), JSON.stringify(r));
    console.log(`${cmd} ${seed} tpd=${tpd} ${(r.ms / 1000).toFixed(1)} s`);
  }
  const what = cmd === 'full' ? 'FULL ecology gates (the ecology sets every close)' : 'SHADOW ecology gates (pools beside the live path, prices unchanged)';
  emit(summarize(load(out), `${what}, ${universe ? 'universe' : 'bare catalog'}`));
} else if (cmd === 'report') {
  let runs = load(arg('dir', defaultOut('full', hasFlag('universe'))));
  let ref: SeedRun[] | undefined;
  const refDir = arg('live-ref', '');
  if (refDir) {
    // the live column: the flag-off reference (a shadow dir) of the same seeds; only seeds present in both are reported
    const refRuns = load(refDir);
    if (refRuns.some((r) => !r.live)) throw new Error('report --live-ref needs a shadow dir (its runs carry the live lnP)');
    const byseed = new Map(refRuns.map((r) => [r.seed, r] as const));
    runs = runs.filter((r) => byseed.has(r.seed));
    ref = runs.map((r) => byseed.get(r.seed)!);
  }
  if (!runs.length) throw new Error('report: no seeds to report');
  const lines = summarize(runs, arg('label', `${runs[0]!.mode.toUpperCase()} gates`), ref);
  if (hasFlag('check-replay')) {
    const shadows = runs.filter((r) => r.mode === 'shadow' && r.inputs);
    let maxDiff = 0;
    for (const r of shadows) {
      const re = replay(r, {});
      r.closes.forEach((c, i) => c.forEach((x, d) => { maxDiff = Math.max(maxDiff, Math.abs(x - re.closes[i]![d]!)); }));
    }
    lines.push(`check: ${shadows.length} shadow seeds, max |shadow(engine) - shadow(replay)| = ${maxDiff}`);
  }
  emit(lines);
} else if (cmd === 'replay') {
  const runs = load(arg('dir', defaultOut('shadow', hasFlag('universe')))).filter((r) => r.inputs);
  if (!runs.length) throw new Error('replay needs a shadow dir with recorded inputs (run shadow first)');
  const over = ecologyOverrides();
  emit(summarize(runs.map((r) => replay(r, over)), `REPLAY ${JSON.stringify(over)} (folded over the recorded shadow inputs)`));
} else {
  throw new Error(`unknown command ${cmd}; use full | shadow | report | replay`);
}
