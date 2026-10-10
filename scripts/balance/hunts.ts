// Exploit and value hunts, multi-seed (owner: Tape). Harness for tape-ecology-hunts.md and tape-stonks-exploits.md, "applies now".
// Usage: npx tsx scripts/balance/hunts.ts [--seeds 60] [--out balance-out]
// The measurements are the shared helpers in src/engine/hunt-helpers.ts, the same code the suite's slices run
// (src/engine/valuegap.test.ts, src/engine/exploits.test.ts), so a number here means the same thing there.
// Bands (each prints PASS or FAIL):
//   value_gap_halflife       median fitted half-life / def.halfLifeDays, legacy engine, 17 assets, 3 of each asset's half-lives
//   value_gap_halflife_days  median fitted half-life in game days (never > 126)
//   value_gap_p95            median over seeds x assets of the 95th percentile of |lnP − lnV| over 5 years; a regression guard
//                            against a provisional baseline (see VALUE_GAP_P95_BASELINE), not an independent check
//   value_gap_p95_max        largest such 95th percentile (never above ln 2)
//   ladder_roundtrip_ev      median one-day-in, one-day-out P&L after fees, SYN $240k (≤ 0)
//   pump_dump_ev:*           mean P&L after fees, SYN, 5/10/20% of ADV a day for D = 1/3/5 days (≤ 0, spec metric, raw)
//   earnings_surprise_ic     pooled rank IC of the earnings surprise vs the next 21-day return after the report-day close (> 0)
//   news_drift_beats_bh_share share of seeds where the news_drift strategy beats buy-and-hold after fees (≤ 0.70)
// Info lines (not gates): paired diagnostics, dispersion, the LTX ladder, per-seed IC, news_drift multiples.
// Exit code 1 if any band FAILs. Same args => same output.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultConfig, gameConfig } from "../../src/engine";
import {
  clipDay, earningsPairs, gapP95, halfLivesFor, ladderPnl, LN2, mean, median, newsDriftVsBh, pumpDump, sd, spearman,
} from "../../src/engine/hunt-helpers";
import { universeConfig } from "../../src/engine/universe";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const nSeeds = Number(arg("seeds", "60"));
const out = arg("out", "balance-out");
const seeds = Array.from({ length: nSeeds }, (_, k) => `tape-${String(k + 1).padStart(2, "0")}`);

const TPD_GAP = 24; // value-gap reads, earnings and news_drift: 24 ticks a game day (see valuegap.test.ts)
const TPD_TRADE = 720; // trade tests: the real tick, 720 ticks a game day (see exploits.test.ts)

/**
 * Baseline for the value_gap_p95 median: 0.0485, the 60-seed median of this harness (--seeds 60, defaultConfig, 5 game
 * years, 24 ticks a day, 17 assets) on the calibrated engine (p1/calib, F1: GARCH dayGap and regimeShockSd). It replaces
 * the 20-seed value 0.0484, which was self-referential (F11). The spec asks for "baseline + 50%" from the first PC run;
 * this is still a regression guard on this branch's own 60-seed median, not an independent check. Re-measure with
 * --seeds 60 whenever the bare engine's price path changes.
 */
const VALUE_GAP_P95_BASELINE = 0.0485;

type Band = { id: string; label: string; value: number; min: number; max: number; strict: boolean; pass: boolean };
const bands: Band[] = [];
function band(id: string, label: string, value: number, min: number, max: number, strict = false) {
  const pass = Number.isFinite(value) && (strict ? value > min : value >= min) && value <= max;
  bands.push({ id, label, value, min, max, strict, pass });
  const shown = Number.isFinite(value) ? value.toFixed(4).padStart(12) : String(value).padStart(12);
  const lo = min === -Infinity ? "-inf" : String(min);
  console.log(`${pass ? "PASS" : "FAIL"}  ${id.padEnd(34)} ${shown}   ${strict ? "(" : "["}${lo}, ${max}${strict ? "" : "]"}   ${label}`);
}
function info(id: string, value: number | string) {
  const shown = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(4) : String(value)) : value;
  console.log(`info  ${id.padEnd(44)} ${shown}`);
}

function main() {
  const t0 = performance.now();
  const cfgGap = defaultConfig({ ticksPerDay: TPD_GAP });

  // value_gap_halflife and value_gap_p95: legacy engine, every asset, every seed
  const hl = seeds.map((sd0) => halfLivesFor(cfgGap, sd0));
  const hlFlat = hl.flat();
  const ratios = hlFlat.map((x) => x.ratio);
  const days = hlFlat.map((x) => x.days);
  band("value_gap_halflife", `median over seeds x assets of fitted half-life / def.halfLifeDays (${hlFlat.length} fits)`, median(ratios), 0.5, 1.5);
  band("value_gap_halflife_days", "median fitted half-life in game days (X2: never > 126)", median(days), 0, 126);
  info("value_gap_halflife_iqr_ratio", (() => { const s = [...ratios].sort((a, b) => a - b); return s[Math.floor(0.75 * (s.length - 1))]! - s[Math.floor(0.25 * (s.length - 1))]!; })());

  const p95s = seeds.map((sd0) => gapP95(cfgGap, sd0, 5)).flat();
  band("value_gap_p95", `median of |lnP − lnV| 95th percentiles, 5 years; regression guard, baseline ${VALUE_GAP_P95_BASELINE} + 50% (provisional)`, median(p95s), 0, VALUE_GAP_P95_BASELINE * 1.5);
  band("value_gap_p95_max", "largest |lnP − lnV| 95th percentile (X2: never above ln 2)", Math.max(...p95s), 0, LN2);

  // ladder_roundtrip_ev: SYN $240k (the thinnest large book, the probe case); LTX as info
  const cfgTrade = defaultConfig({ ticksPerDay: TPD_TRADE });
  const ladderSyn = seeds.map((sd0) => ladderPnl(sd0, "SYN", 240_000, cfgTrade));
  const ladderPnls = ladderSyn.map((r) => r.pnl);
  band("ladder_roundtrip_ev", "median one-day-in, one-day-out P&L after fees, SYN $240k (X1: ≤ 0)", median(ladderPnls), -Infinity, 0);
  info("ladder_roundtrip_ev_profitable_share", ladderPnls.filter((x) => x > 0).length / ladderPnls.length);
  info("ladder_roundtrip_ev_LTX_median_usd", median(seeds.map((sd0) => ladderPnl(sd0, "LTX", 240_000, cfgTrade).pnl)));

  // pump_dump_ev: 9 scenarios, raw mean P&L after fees (X1: ≤ 0) and the paired diagnostic (info only)
  for (const share of [0.05, 0.1, 0.2]) {
    for (const D of [1, 3, 5]) {
      const rs = seeds.map((sd0) => pumpDump(sd0, "SYN", share, D, cfgTrade));
      const raw = rs.map((r) => r.raw);
      const paired = rs.map((r) => r.paired);
      band(`pump_dump_ev:${share * 100}pct:D${D}`, `mean P&L after fees, SYN, ${share * 100}% of ADV a day for ${D} day(s) (X1: ≤ 0)`, mean(raw), -Infinity, 0);
      info(`pump_dump_paired_mean:${share * 100}pct:D${D}`, mean(paired));
      info(`pump_dump_seeds_raw_above_0:${share * 100}pct:D${D}`, raw.filter((x) => x > 0).length / raw.length);
      info(`pump_dump_raw_sd:${share * 100}pct:D${D}`, sd(raw));
      const rejected = rs.reduce((a, r) => a + Object.values(r.rejects).reduce((x, y) => x + y, 0), 0);
      if (rejected > 0) info(`pump_dump_rejects:${share * 100}pct:D${D}`, rejected);
    }
  }

  // earnings_surprise_ic: gameConfig (catalysts on), pooled over seeds, 3 game years
  const cfgGame = gameConfig({ ticksPerDay: TPD_GAP });
  const pairs = seeds.map((sd0) => earningsPairs(sd0, cfgGame, 3));
  const X = pairs.flatMap((p) => p.x);
  const Y = pairs.flatMap((p) => p.y);
  const ic = spearman(X, Y);
  band("earnings_surprise_ic", `pooled rank IC of surprise vs next 21-day return after the report-day close (X2: > 0), ${X.length} reports; SE if independent ~${(1 / Math.sqrt(X.length)).toFixed(3)} (reports on one day share the market, so this understates it)`, ic, 0, 1, true);
  info("earnings_surprise_ic_seed_median", median(pairs.map((p) => spearman(p.x, p.y))));

  // self impact (selfimpact.test.ts, Ledger's clip gate): full ecology, 720 ticks a game day, one day of SYN and AURH.
  // Info only: the suite gates tape-01..05; these lines show the same measure on every harness seed.
  const cfgClip = universeConfig({ ticksPerDay: TPD_TRADE });
  for (const id of ["SYN", "AURH"]) {
    const one = seeds.map((sd0) => clipDay(id, 1, cfgClip, sd0));
    const many = seeds.map((sd0) => clipDay(id, TPD_TRADE, cfgClip, sd0));
    const ratios = many.map((r, k) => r.peak / one[k]!.peak);
    info(`selfimpact_close1_nonpositive:${id}`, `${one.filter((r) => r.lift <= 0).length} of ${seeds.length}`);
    info(`selfimpact_peak_ratio_median:${id}`, median(ratios));
    info(`selfimpact_peak_ratio_min_max:${id}`, `${Math.min(...ratios).toFixed(4)} to ${Math.max(...ratios).toFixed(4)}`);
    info(`selfimpact_peak_ratio_outside_0.75_1.5:${id}`, `${ratios.filter((x) => !(x > 0.75 && x <= 1.5)).length} of ${seeds.length}`);
  }

  // news_drift: the free-lunch check on the earnings signal (M04). Same gameConfig, 5 game years, from day 63.
  const nd = seeds.map((sd0) => newsDriftVsBh(sd0, cfgGame, { years: 5 }));
  const beats = nd.filter((r) => r.news > r.bh).length / nd.length;
  band("news_drift_beats_bh_share", "share of seeds where news_drift beats buy-and-hold after fees (X2 / M04: ≤ 0.70)", beats, 0, 0.7);
  info("news_drift_median_multiple", median(nd.map((r) => r.news)));
  info("news_drift_bh_median_multiple", median(nd.map((r) => r.bh)));
  info("news_drift_fills_median", median(nd.map((r) => r.fills)));
  const ndRejects = nd.reduce((a, r) => a + Object.values(r.rejects).reduce((x, y) => x + y, 0), 0);
  info("news_drift_rejects_total", ndRejects);

  const checked = bands.filter((b) => !b.pass);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "hunts-summary.json"), JSON.stringify({ seeds: nSeeds, bands, valueGapP95Baseline: VALUE_GAP_P95_BASELINE }, null, 2));
  console.log(`hunts: ${nSeeds} seeds, wall ${secs} s`);
  console.log(checked.length ? `hunts: ${checked.length} band(s) FAILED` : "hunts: all bands PASS");
  if (checked.length) process.exitCode = 1;
}

main();
