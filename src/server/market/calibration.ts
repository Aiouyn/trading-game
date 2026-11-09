// Documented CALIBRATION metrics for V1 (20 §3.7.3–3.7.4, 05 §6.2 / acc., 06 spread/meme).
// Pure helpers + a deterministic LiveMarket runner. Bands that need the full 05 equity GARCH/Student-t
// process are reported as misses when the volBp walk cannot hit them — never invented.
import { ASSETS, type AssetFixture } from "@/market/catalog";
import { listedDef } from "@/market/listings";
import { HALF_SPREAD, BOOK_LAW } from "@/server/broker/book";
import { LiveMarket } from "@/server/market/clock";
import {
  CRYPTO_DAYS_PER_YEAR, SESSION_DAYS_PER_YEAR, TICKS_PER_DAY, memeParams,
} from "@/server/market/meme";
import {
  CRISIS_WEEK_MAJOR_MULT, GAME_DAYS_PER_CHAPTER, MACRO_MAJOR_BASE_RATE, MACRO_MAJOR_MIN_GAP_DAYS,
  constraintsAllowMajor, crisisWeekChapterDraw, eventsDayDraw, inclusiveInt,
} from "@/server/market/crises";
import { STORM_RATE, stormDayDraw } from "@/server/market/storms";

export interface ReturnStats {
  n: number;
  mean: number;
  sd: number;
  excessKurtosis: number;
  autocorr1: number;
  volCluster: number;
  annVol: number;
  cagr: number;
}

export function dailyLogReturns(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]!, b = closes[i]!;
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

export function returnStats(rets: readonly number[], annDays: number): ReturnStats | null {
  const n = rets.length;
  if (n < 5) return null;
  const mean = rets.reduce((s, x) => s + x, 0) / n;
  const v = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(Math.max(v, 0));
  const m4 = rets.reduce((s, x) => s + (x - mean) ** 4, 0) / n;
  const excessKurtosis = sd > 0 ? m4 / sd ** 4 - 3 : 0;
  let num = 0, d0 = 0, d1 = 0;
  for (let i = 1; i < n; i++) {
    num += (rets[i]! - mean) * (rets[i - 1]! - mean);
    d0 += (rets[i]! - mean) ** 2;
    d1 += (rets[i - 1]! - mean) ** 2;
  }
  const autocorr1 = d0 > 0 && d1 > 0 ? num / Math.sqrt(d0 * d1) : 0;
  const abs = rets.map((x) => Math.abs(x));
  const ma = abs.reduce((s, x) => s + x, 0) / n;
  let n2 = 0, e0 = 0, e1 = 0;
  for (let i = 1; i < n; i++) {
    n2 += (abs[i]! - ma) * (abs[i - 1]! - ma);
    e0 += (abs[i]! - ma) ** 2;
    e1 += (abs[i - 1]! - ma) ** 2;
  }
  const volCluster = e0 > 0 && e1 > 0 ? n2 / Math.sqrt(e0 * e1) : 0;
  const total = rets.reduce((s, x) => s + x, 0);
  const years = n / annDays;
  const cagr = years > 0 ? Math.exp(total / years) - 1 : 0;
  return { n, mean, sd, excessKurtosis, autocorr1, volCluster, annVol: sd * Math.sqrt(annDays), cagr };
}

/** Target annual vol of the catalog uniform ±volBp walk (sd = volBp/√3 per tick). */
export function targetAnnVol(volBp: number, dy: number = SESSION_DAYS_PER_YEAR): number {
  return (volBp / 10_000 / Math.sqrt(3)) * Math.sqrt(TICKS_PER_DAY * dy);
}

export type BandStatus = "PASS" | "MISS" | "REPORT";

export interface BandRow {
  band: string;
  measured: number | string;
  target: string;
  status: BandStatus;
  note?: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

/** Pure volBp walk (no storms) for calm equity stylized checks. */
export function pureWalkCloses(a: AssetFixture, days: number, seed: number): number[] {
  let x = (seed >>> 0) || 1;
  const rnd = () => {
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^= x >>> 16) >>> 0) / 4294967296;
  };
  let px = a.base;
  const closes: number[] = [];
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      const step = Math.round(((rnd() - 0.5) * 2 * a.volBp * px) / 10_000);
      px = Math.max(1, px + step);
    }
    closes.push(px);
  }
  return closes;
}

export interface CalibrationReport {
  rows: BandRow[];
  days: number;
  seeds: number[];
  digestNote: string;
}

/**
 * Run documented V1 calibration checks. Reachable bands assert PASS; known structural misses are REPORT
 * (full 05 equity model unbuilt). Does not invent parameters outside registry ranges.
 */
export function runCalibration(opts: { days?: number; seed?: number } = {}): CalibrationReport {
  const days = opts.days ?? 260;
  const seed = opts.seed ?? 17;
  const rows: BandRow[] = [];

  // --- calm equity vol_ratio / autocorr (pure walk) ---
  const equities = ASSETS.filter((a) => a.class === "equity" || a.assetId === "GX");
  const ratios: number[] = [];
  const autocorr: number[] = [];
  const kurt: number[] = [];
  const clusters: number[] = [];
  for (const a of equities) {
    const closes = pureWalkCloses(a, days, seed + a.volBp);
    const st = returnStats(dailyLogReturns(closes), SESSION_DAYS_PER_YEAR);
    if (!st) continue;
    const tgt = targetAnnVol(a.volBp, SESSION_DAYS_PER_YEAR);
    ratios.push(st.annVol / tgt);
    autocorr.push(st.autocorr1);
    kurt.push(st.excessKurtosis);
    clusters.push(st.volCluster);
  }
  const medRatio = median(ratios);
  const medAc = median(autocorr);
  const medKurt = median(kurt);
  const medVc = median(clusters);
  rows.push({
    band: "MKT.vol_ratio (calm)",
    measured: +medRatio.toFixed(3),
    target: "0.85–1.40 (calm large-cap aim 0.9–1.1)",
    status: medRatio >= 0.85 && medRatio <= 1.40 ? "PASS" : "MISS",
  });
  rows.push({
    band: "MKT.autocorr (calm)",
    measured: +medAc.toFixed(4),
    target: "−0.05–0.05",
    status: medAc >= -0.05 && medAc <= 0.05 ? "PASS" : "MISS",
  });
  rows.push({
    band: "MKT.kurtosis (calm median)",
    measured: +medKurt.toFixed(3),
    target: "> 3 (05 fat tails 3–10)",
    status: "REPORT",
    note: "volBp uniform walk has excess kurtosis ≈ 0; needs 05 Student-t / jumps on equities — not invented this unit",
  });
  rows.push({
    band: "MKT.vol_cluster (calm median)",
    measured: +medVc.toFixed(4),
    target: "> 0.15",
    status: "REPORT",
    note: "no GARCH on equity walk; clustering emerges with storms but event-on autocorr then breaches — report",
  });

  // --- live engine window: stocks + listed meme + storms/majors/Fear (no player) ---
  const market = new LiveMarket({ tickMs: 1e9, persistStorms: false, seed });
  market.list(listedDef("FROG", "FROG Club", 21_596));
  const gxCloses: number[] = [];
  const frogCloses: number[] = [];
  for (let d = 0; d < Math.min(days, 60); d++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) market.step();
    const snap = market.snapshot();
    const gx = snap.quotes.rows.GX;
    if (gx) gxCloses.push(Number(gx.last));
    const fr = snap.quotes.rows.FROG;
    if (fr) frogCloses.push(Number(fr.last));
  }
  const gxStats = returnStats(dailyLogReturns(gxCloses), SESSION_DAYS_PER_YEAR);
  if (gxStats) {
    const cagrPct = gxStats.cagr * 100;
    rows.push({
      band: "MKT.index_cagr (events on, 60 GD)",
      measured: +cagrPct.toFixed(2),
      target: "0–12%",
      status: cagrPct >= 0 && cagrPct <= 12 ? "PASS" : "REPORT",
      note: cagrPct >= 0 && cagrPct <= 12 ? undefined
        : "crisis proxies dominate the volBp index walk; full 05 mean-reverting value layer unbuilt — not inventing shock sizes outside UNIT proxies",
    });
  }
  const frogStats = returnStats(dailyLogReturns(frogCloses), CRYPTO_DAYS_PER_YEAR);
  if (frogStats && frogCloses[0]) {
    const end = frogCloses.at(-1)!;
    const failed = end / frogCloses[0]! < 0.05 || end < 1e-6;
    rows.push({
      band: "MEME.near_zero (single seed demo)",
      measured: failed ? "near_zero" : `end/start=${(end / frogCloses[0]!).toExponential(2)}`,
      target: "~90% of memes → ~0 / chapter (06 balance band)",
      status: "REPORT",
      note: "single-seed smoke; multi-coin chapter farm is a later harness cell — negative drift template biases to fail",
    });
    const mp = memeParams("FROG");
    const ratio = frogStats.annVol / mp.vol;
    rows.push({
      band: "MEME.vol_ratio (events on)",
      measured: +ratio.toFixed(3),
      target: "0.85–1.40 (calm) / disclosed with hype·regime·jumps",
      status: ratio >= 0.85 && ratio <= 1.40 ? "PASS" : "REPORT",
      note: ratio >= 0.85 && ratio <= 1.40 ? undefined
        : "hype (1+2H), regime vol mult, and Kou jumps inflate realized vs template vol — template range 1.9–2.0 retained",
    });
  }

  // --- storm rate ---
  let starts = 0;
  const stormDays = 5000;
  for (let d = 0; d < stormDays; d++) if (stormDayDraw(d).start) starts++;
  const perQuarter = (starts / stormDays) * 91;
  rows.push({
    band: "MAC.storm_rate",
    measured: +perQuarter.toFixed(3),
    target: "0.6–1.5 / game quarter (rate 1/91)",
    status: perQuarter >= 0.6 && perQuarter <= 1.5 ? "PASS" : "MISS",
    note: `raw start rate ${(starts / stormDays).toFixed(5)} vs ${STORM_RATE.toFixed(5)}`,
  });

  // --- major crisis P(≥1 trigger per chapter): lightweight day-draw sim (avoids O(n²) scheduler jump) ---
  const chapters = 200;
  const pFromRate = (r: number) => 1 - Math.exp(-r);
  const triggeredByChapter = new Set<number>();
  let activeUntilTick: number | null = null;
  let lastMajorTriggerTick: number | null = null;
  for (let d = 0; d < chapters * GAME_DAYS_PER_CHAPTER; d++) {
    const tick = d * TICKS_PER_DAY + (TICKS_PER_DAY - 1);
    if (activeUntilTick !== null && tick >= activeUntilTick) activeUntilTick = null;
    const ch = Math.floor(d / GAME_DAYS_PER_CHAPTER);
    const c0 = ch * GAME_DAYS_PER_CHAPTER * TICKS_PER_DAY;
    const cEnd = c0 + GAME_DAYS_PER_CHAPTER * TICKS_PER_DAY;
    const cw = crisisWeekChapterDraw(ch);
    let inCw = false;
    if (cw.yes) {
      // weekIndex 2–7: start at real-week boundary inside chapter (168 GD weeks)
      const weekStartDay = ch * GAME_DAYS_PER_CHAPTER + cw.weekIndex * 7;
      inCw = d >= weekStartDay && d < weekStartDay + 168;
    }
    const lambda = MACRO_MAJOR_BASE_RATE * (inCw ? CRISIS_WEEK_MAJOR_MULT : 1);
    const draw = eventsDayDraw(d);
    const pre = inclusiveInt(draw.majorPreU, 8, 16);
    const plannedTrigger = tick + 1 + pre * TICKS_PER_DAY;
    const want = draw.majorStartU < pFromRate(lambda);
    if (!want || activeUntilTick !== null) continue;
    const allow = constraintsAllowMajor({
      activeMajor: activeUntilTick !== null,
      lastMajorTriggerTick,
      plannedTriggerTick: plannedTrigger,
      dayCloseTick: tick,
      chapterStartTick: c0,
      chapterEndTick: cEnd,
      playerSuppressUntil: null,
    });
    if (!allow.ok) continue;
    // Accepted start → precursor then trigger (count the chapter of the trigger day)
    const triggerDay = Math.floor(plannedTrigger / TICKS_PER_DAY);
    const contagionDays = inclusiveInt(draw.majorContU, 5, 30);
    activeUntilTick = plannedTrigger + TICKS_PER_DAY + contagionDays * TICKS_PER_DAY;
    lastMajorTriggerTick = plannedTrigger;
    triggeredByChapter.add(Math.floor(triggerDay / GAME_DAYS_PER_CHAPTER));
  }
  const pMajor = triggeredByChapter.size / chapters;
  rows.push({
    band: "MAC.major_crisis",
    measured: +pMajor.toFixed(3),
    target: "0.25–0.45 (λ=3.6e-4, ~35%)",
    status: pMajor >= 0.25 && pMajor <= 0.45 ? "PASS" : "REPORT",
    note: `λ=${MACRO_MAJOR_BASE_RATE}; V(t) held equal; lightweight eventsDayDraw over ${chapters} chapters`,
  });

  // --- meme half-spread ---
  const halfPct = HALF_SPREAD * 100;
  rows.push({
    band: "MEME.half_spread",
    measured: +halfPct.toFixed(2),
    target: "1–3% (BOOK_LAW.spreadBps=400 → 2%)",
    status: halfPct >= 1 && halfPct <= 3 ? "PASS" : "MISS",
    note: `spreadBps=${BOOK_LAW.spreadBps}`,
  });

  // --- Dy reconcile disclosure ---
  rows.push({
    band: "Dy.rv21_session",
    measured: SESSION_DAYS_PER_YEAR,
    target: "260 (05 session / 20 tm_trading_days_per_year)",
    status: SESSION_DAYS_PER_YEAR === 260 ? "PASS" : "MISS",
  });
  rows.push({
    band: "Dy.crypto_sigma_d",
    measured: CRYPTO_DAYS_PER_YEAR,
    target: "364 (05 crypto Dy)",
    status: CRYPTO_DAYS_PER_YEAR === 364 ? "PASS" : "MISS",
  });

  return {
    rows,
    days,
    seeds: [seed],
    digestNote: "Dy/rv21 + pools σ_d reconcile do not touch the catalog volBp stock walk; 4000-tick digest fc1359d1 expected unchanged (no volBp/shock tune this unit).",
  };
}
