// Seeded balance harness (owner: Tape).
// Usage: npx tsx scripts/balance/run.ts [--seeds 20] [--years 5] [--tpd 24] [--out balance-out]
// Runs the engine headless across many seeds, aggregates stats, checks them against bands.ts.
// Exit code 1 if any band fails, so it can gate a release. Same args => same output.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWorld, stepMany, indexLevel, defaultConfig, universeConfig, expectedVol, closePrint, openAccount, placeOrder, portfolio } from "../../src/engine";
import type { AssetDef, WorldState } from "../../src/engine";
import { phase0Bands, check, UNIVERSE_VOL_BANDS } from "./bands";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

/** --universe runs the app's 155-asset game universe (world events on) instead of the bare 17-asset engine */
const universe = process.argv.includes("--universe");
const noEvents = process.argv.includes("--no-events");
function configFor(ticksPerDay: number) {
  return universe ? universeConfig({ ticksPerDay, ...(noEvents ? { worldEvents: undefined } : {}) }) : defaultConfig({ ticksPerDay });
}

const nSeeds = Number(arg("seeds", "20"));
const years = Number(arg("years", "5"));
const tpd = Number(arg("tpd", "24"));
const out = arg("out", "balance-out");

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2; };
const logRets = (xs: number[]) => xs.slice(1).map((x, i) => Math.log(x / xs[i]!));
/**
 * Info only (universe): the share of log-return days where both ends are above the floor. A meme token that bleeds to its
 * 1e-7 floor is pinned there for part of a run, and those days carry zero vol. The vol band is still measured on every day
 * (logRets), the same definition as the bare engine; this share shows how much of a class's shortfall is that pinning.
 */
const aliveRets = (xs: number[], floor: number) => {
  const lim = floor * (1 + 1e-9);
  const out: number[] = [];
  for (let k = 1; k < xs.length; k++) if (xs[k]! > lim && xs[k - 1]! > lim) out.push(Math.log(xs[k]! / xs[k - 1]!));
  return out;
};

// Small seeded PRNG for the random-pick strategy only (kept separate from engine streams).
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

type SeedResult = {
  seed: string; volRatio: Record<string, number>; aliveShare: Record<string, number>; gxCagr: number; invalid: number; sawContraction: boolean;
  bh: number; random: number; momentum: number; finalHash: string; msPerTick: number;
  fee: { bh: number; random: number; momentum: number; contrarian: number; momentumFees: number };
  /** assets appended by listings (IPOs, spin-offs) and assets delisted (bankruptcy, merger, spin-off parent), by the end */
  listed: number; delisted: number;
};

// The engine appends assets at runtime (listings.ts), so every strategy follows the CURRENT asset list. Assets are
// addressed by their index in state.assets, which only grows. A strategy may pick a stock on decision day d only if
// it is not delisted by then and has a price on d and on d - look (so a late listing waits out its first month).
// With no listings this is the whole starting stock list, so the no-listing numbers are unchanged.

// Fee-aware strategies (engine task #2 order API): each strategy trades in its OWN same-seed world,
// because fills move prices (permanent impact) and would contaminate a shared world.
// $5,000 start (the real game start), market orders, whole shares. Rebalance every 21 game days from day 63:
// sell everything, step 1 tick, buy floor(0.97 * cash / price), step 1 tick. Buy-and-hold buys an
// equal-weight stock basket once on day 63. Result = equity multiple over the same window for all three.
const START_CASH = 5000, PID = "tape";
function feeAware(seed: string, cfg: ReturnType<typeof defaultConfig>, days: number, kind: "bh" | "random" | "momentum" | "contrarian") {
  const month = 21, look = 63;
  const lastStart = look + Math.floor((days - month - look) / month) * month;
  const end = lastStart + month;
  const rand = mulberry32(hash(`${seed}::tape-random`));
  let s: WorldState = openAccount(createWorld(seed, cfg), PID, START_CASH);
  // price by record (record k = the world after k days), NaN before an asset is listed
  const closes: number[][] = [];
  let recs = 0;
  const rec = () => {
    s.assets.forEach((a, i) => {
      const c = (closes[i] ??= []);
      while (c.length < recs) c.push(NaN);
      c.push(Math.exp(a.lnP));
    });
    recs++;
  };
  const pool = (d: number): number[] => {
    const out: number[] = [];
    s.config.assets.forEach((def, i) => {
      if (def.assetClass !== "stock" || def.delisted) return;
      if (Number.isFinite(closes[i]?.[d]) && Number.isFinite(closes[i]?.[d - look])) out.push(i);
    });
    return out;
  };
  const order = (assetId: string, side: "buy" | "sell", qty: number) => { if (qty > 0) s = placeOrder(s, { playerId: PID, assetId, side, type: "market", qty }).state; };
  const px = (i: number) => Math.exp(s.assets[i]!.lnP);
  rec();
  let startEq = START_CASH, endEq = START_CASH;
  for (let d = 0; d < end; d++) {
    let used = 0;
    if (d >= look && d < end && (d - look) % month === 0 && (kind !== "bh" || d === look)) {
      if (d === look) startEq = portfolio(s, PID).equity;
      for (const [id, p] of Object.entries(s.accounts[PID]!.positions)) order(id, "sell", p.qty);
      s = stepMany(s, 1).state; used++;
      const cash = s.accounts[PID]!.cash;
      const names = pool(d);
      if (names.length) {
        if (kind === "bh") {
          for (const i of names) order(s.config.assets[i]!.id, "buy", Math.floor((0.97 * cash) / names.length / px(i)));
        } else {
          let pick = names[0]!;
          if (kind === "random") pick = names[Math.floor(rand() * names.length)]!;
          else { const sgn = kind === "momentum" ? 1 : -1; let best = -Infinity; for (const i of names) { const tr = sgn * (closes[i]![d]! / closes[i]![d - look]!); if (tr > best) { best = tr; pick = i; } } }
          order(s.config.assets[pick]!.id, "buy", Math.floor((0.97 * cash) / px(pick)));
        }
      }
      s = stepMany(s, 1).state; used++;
    }
    s = stepMany(s, tpd - used).state; rec();
  }
  endEq = portfolio(s, PID).equity;
  return { multiple: endEq / startEq, fees: s.accounts[PID]!.feesPaid };
}

function runSeed(seed: string): SeedResult {
  const cfg = configFor(tpd);
  const days = Math.round(years * cfg.daysPerYear);
  const closes: number[][] = [];   // by asset index; record k = the world after k days; NaN before listing
  const firstRec: number[] = [];   // record at which the asset was first seen
  const delistRec: number[] = [];  // record at which the asset was first seen delisted (Infinity if never)
  const defs: AssetDef[] = [];     // latest definition per asset
  const gx: number[] = [];
  let invalid = 0;
  let sawContraction = false;
  let rec = 0;

  let state: WorldState = createWorld(seed, cfg);
  const record = () => {
    state.assets.forEach((a, i) => {
      const def = state.config.assets[i]!;
      const p = Math.exp(a.lnP);
      if (!Number.isFinite(p) || !Number.isFinite(a.lnV) || p < def.floor * (1 - 1e-9) || a.h < 0.25 - 1e-12 || a.h > 9 + 1e-12) invalid++;
      if (!closes[i]) { closes[i] = new Array<number>(rec).fill(NaN); firstRec[i] = rec; delistRec[i] = Infinity; }
      closes[i]!.push(p);
      defs[i] = def;
      if (def.delisted && delistRec[i] === Infinity) delistRec[i] = rec;
    });
    const g = indexLevel(state, "GX");
    if (!Number.isFinite(g)) invalid++;
    gx.push(g);
    if (state.regime === "contraction") sawContraction = true;
    rec++;
  };
  record();
  const t0 = performance.now();
  for (let d = 0; d < days; d++) { state = stepMany(state, tpd).state; record(); }
  const msPerTick = (performance.now() - t0) / state.tick;

  // Vol ratio only for assets listed from the start and never delisted. A late-listed name has a short history, and a
  // delisted one has a frozen price (zero vol) after its settlement, so neither would give a meaningful band.
  const volRatio: Record<string, number> = {};
  const aliveShare: Record<string, number> = {};
  closes.forEach((c, i) => {
    if (firstRec[i] !== 0 || delistRec[i] !== Infinity) return;
    if (universe) aliveShare[defs[i]!.id] = aliveRets(c, defs[i]!.floor).length / logRets(c).length;
    volRatio[defs[i]!.id] = (sd(logRets(c)) * Math.sqrt(cfg.daysPerYear)) / expectedVol(defs[i]!, undefined, closePrint(cfg));
  });
  const gxCagr = Math.pow(gx[gx.length - 1]! / gx[0]!, 1 / years) - 1;

  // Strategies on stocks, monthly (21 game days) holding periods, no fees (Phase 0 has no order book).
  // A name delisted while held is valued at its frozen price from then on.
  const month = 21, look = 63;
  // Stocks a monthly strategy may hold on day d (see the note at the top).
  const pool = (d: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (defs[i]!.assetClass !== "stock" || delistRec[i]! <= d) continue;
      if (Number.isFinite(closes[i]![d]) && Number.isFinite(closes[i]![d - look])) out.push(i);
    }
    return out;
  };
  const rand = mulberry32(hash(`${seed}::tape-random`));
  let random = 1, momentum = 1, bh = 1;
  for (let d = look; d + month <= days; d += month) {
    const r = (i: number) => closes[i]![d + month]! / closes[i]![d]!;
    const names = pool(d);
    if (names.length) {
      random *= r(names[Math.floor(rand() * names.length)]!);
      let best = names[0]!, bestRet = -Infinity;
      for (const i of names) { const tr = closes[i]![d]! / closes[i]![d - look]!; if (tr > bestRet) { bestRet = tr; best = i; } }
      momentum *= r(best);
    }
    bh *= gx[d + month]! / gx[d]!;
  }
  const finalHash = String(hash(JSON.stringify(state)));
  const fb = feeAware(seed, cfg, days, "bh"), fr = feeAware(seed, cfg, days, "random"), fm = feeAware(seed, cfg, days, "momentum"), fc = feeAware(seed, cfg, days, "contrarian");
  const fee = { bh: fb.multiple, random: fr.multiple, momentum: fm.multiple, contrarian: fc.multiple, momentumFees: fm.fees };
  const listed = state.config.assets.length - cfg.assets.length;
  const delisted = state.config.assets.filter((a) => a.delisted).length;
  return { seed, volRatio, aliveShare, gxCagr, invalid, sawContraction, bh, random, momentum, finalHash, msPerTick, fee, listed, delisted };
}

function main() {
  const cfg = configFor(tpd);
  const ids = cfg.assets.map((a) => a.id);
  const seeds = Array.from({ length: nSeeds }, (_, i) => `tape-${String(i + 1).padStart(2, "0")}`);

  const t0 = performance.now();
  const results = seeds.map(runSeed);
  const repeat = runSeed(seeds[0]!);
  const wall = performance.now() - t0;

  const stats: Record<string, number> = {};
  // vol-ratio bands: a starting asset gets one when some seed kept it listed for the whole run (median over those seeds)
  const volIds = ids.filter((id) => results.some((r) => r.volRatio[id] !== undefined));
  for (const id of volIds) stats[`vol_ratio_median:${id}`] = median(results.filter((r) => r.volRatio[id] !== undefined).map((r) => r.volRatio[id]!));
  stats.gx_cagr_median = median(results.map((r) => r.gxCagr));
  // universe: share of days a vol-ratio asset is above its floor, median over seeds (info; see aliveRets)
  const pinned = universe ? volIds.filter((id) => median(results.filter((r) => r.aliveShare[id] !== undefined).map((r) => r.aliveShare[id]!)) < 0.9) : [];
  stats.invalid_values = results.reduce((a, r) => a + r.invalid, 0);
  stats.contraction_seed_share = results.filter((r) => r.sawContraction).length / results.length;
  // banded: fee-aware (real order API). Info only: the old no-fee index version, and medians.
  stats.bh_beats_random_share = results.filter((r) => r.fee.bh > r.fee.random).length / results.length;
  stats.bh_beats_momentum_share = results.filter((r) => r.fee.bh > r.fee.momentum).length / results.length;
  stats.bh_beats_contrarian_share = results.filter((r) => r.fee.bh > r.fee.contrarian).length / results.length;
  // Ledger 2026-10-07: no simple strategy beats buy-and-hold in more than 70% of seeds
  const beats = (k: "random" | "momentum" | "contrarian") => results.filter((r) => r.fee[k] > r.fee.bh).length / results.length;
  stats.info_random_beats_bh_share = beats("random");
  stats.info_momentum_beats_bh_share = beats("momentum");
  stats.info_contrarian_beats_bh_share = beats("contrarian");
  stats.max_strategy_beats_bh_share = Math.max(beats("random"), beats("momentum"), beats("contrarian"));
  stats.info_fee_median_multiple_contrarian = median(results.map((r) => r.fee.contrarian));
  stats.info_nofee_bh_beats_random_share = results.filter((r) => r.bh > r.random).length / results.length;
  stats.info_nofee_bh_beats_momentum_share = results.filter((r) => r.bh > r.momentum).length / results.length;
  stats.info_fee_median_multiple_bh = median(results.map((r) => r.fee.bh));
  stats.info_fee_median_multiple_random = median(results.map((r) => r.fee.random));
  stats.info_fee_median_multiple_momentum = median(results.map((r) => r.fee.momentum));
  stats.info_momentum_median_fees_usd = median(results.map((r) => r.fee.momentumFees));
  stats.info_listed_assets_mean = mean(results.map((r) => r.listed));
  stats.info_delisted_assets_mean = mean(results.map((r) => r.delisted));
  stats.info_seeds_with_listings_share = results.filter((r) => r.listed + r.delisted > 0).length / results.length;
  stats.determinism_mismatch = repeat.finalHash === results[0]!.finalHash ? 0 : 1;

  const checked = check(phase0Bands(volIds, universe ? UNIVERSE_VOL_BANDS : {}), stats);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "summary.json"), JSON.stringify({ seeds: nSeeds, years, ticksPerDay: tpd, stats, results: checked, perSeed: results }, null, 2));

  console.log(`balance: ${nSeeds} seeds x ${years} game years, ticksPerDay=${tpd}, wall ${(wall / 1000).toFixed(1)} s, ${mean(results.map((r) => r.msPerTick * 1000)).toFixed(1)} us/tick`);
  for (const r of checked) {
    const v = r.value === undefined ? "n/a" : Number.isInteger(r.value) ? String(r.value) : r.value.toFixed(3);
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(30)} ${v.padStart(8)}   [${r.min}, ${r.max}]`);
  }
  const fails = checked.filter((r) => !r.pass).length;
  const skipped = ids.filter((id) => !volIds.includes(id));
  if (skipped.length) console.log(`info  vol-ratio bands skipped (not listed the whole run in any seed): ${skipped.join(", ")}`);
  for (const [k, v] of Object.entries(stats)) if (k.startsWith("info_")) console.log(`info  ${k.padEnd(40)} ${v.toFixed(3)}`);
  for (const id of pinned) console.log(`info  floor-pinned, vol ratio on alive days only: ${id} (median alive share ${median(results.filter((r) => r.aliveShare[id] !== undefined).map((r) => r.aliveShare[id]!)).toFixed(3)})`);
  console.log(fails ? `balance: ${fails} band(s) FAILED` : "balance: all bands PASS");
  if (fails) process.exitCode = 1;
}

main();
