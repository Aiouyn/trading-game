// The rho probe (V1-PHASE9 9C, O-2; Quant G22, rho_residual; quant-company-building.md section 6.2 (c)).
// For each seed, a listed company runs on the engine's own path (the b1fixture listing, real orders and the real engine
// ticks' sector draws). Each post-listing filing carries its residual surprise s (company.ts surpriseAtFiling: the actuals
// against the consensus at the close, over D = max(EV_20, 0.25 mcap_20)). s_quarter is the same expression with the consensus
// replaced by the previous quarter's filed actuals, over the same D. rho per seed = sd(s_filing) / sd(s_quarter) across the
// quarters. Gate: median <= 0.15 and p90 <= 0.25 across seeds (hard ceiling 0.25).
//
// Usage: npx tsx scripts/balance/rho-probe.ts [--seeds 200] [--first 1] [--quarters 8] [--out dir]
// Several processes split a run by --first (the seeds rho-K .. rho-K+seeds-1), each with its own --out; combine with the
// same summary (the medians are recomputed from the per-seed rows the processes write).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { advanceTo, listedWorld } from '../../src/world/company/b1fixture';
import { surprise } from '../../src/world/company/valuation';
import { today } from '../../src/world/core';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const nSeeds = Number(arg('seeds', '200'));
const firstSeed = Number(arg('first', '1'));
const quarters = Number(arg('quarters', '8'));
const out = arg('out', 'rho-out');

// the consensus of a filing as the probe reads it: the previous quarter for the S_quarter baseline
const cons = (f: { income: { revUnrelated: number }; cashFlow: { ocf: number }; backlogContribution: number }) => ({ rev: f.income.revUnrelated, ocf: f.cashFlow.ocf, cb: f.backlogContribution });
const sd = (xs: number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const pct = (xs: number[], q: number): number => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? NaN;
};

interface Row { seed: string; n: number; sdFiling: number; sdQuarter: number; rho: number; sdRev: number; sdOcf: number; sdCb: number }
const rows: Row[] = [];
const t0 = Date.now();
for (let k = firstSeed; k < firstSeed + nSeeds; k++) {
  const seed = `rho-${k}`;
  const { g, c } = listedWorld(seed);
  // advance day by day until `quarters` filings carry a surprise (a listed company's filings have a consensus)
  let guard = 0;
  while (c.filings.filter((f) => f.surprise).length < quarters && guard++ < 2_000) advanceTo(g, today(g) + 1);
  const fs = c.filings.filter((f) => f.surprise).slice(0, quarters);
  if (fs.length < quarters) throw new Error(`${seed}: only ${fs.length} filings with a surprise`);
  const sFiling: number[] = [];
  const sQuarter: number[] = [];
  // the three terms of s_filing (revenue at the margin, OCF, backlog), so a reader can see which one carries the surprise
  const tRev: number[] = [];
  const tOcf: number[] = [];
  const tCb: number[] = [];
  for (let i = 1; i < fs.length; i++) {
    const cur = fs[i]!;
    const prev = fs[i - 1]!;
    const sur = cur.surprise!;
    sFiling.push(sur.s);
    tRev.push(((cur.income.revUnrelated - (cons(prev)).rev) * sur.margin) / sur.d);
    tOcf.push((cur.cashFlow.ocf - cons(prev).ocf) / sur.d);
    tCb.push((cur.backlogContribution - cons(prev).cb) / sur.d);
    // s_quarter: the same expression with the consensus replaced by the previous quarter's filed actuals, over the same D
    sQuarter.push(surprise({
      revActual: cur.income.revUnrelated, revCons: prev.income.revUnrelated,
      ocfActual: cur.cashFlow.ocf, ocfCons: prev.cashFlow.ocf,
      cbActual: cur.backlogContribution, cbCons: prev.backlogContribution,
      margin: sur.margin, d: sur.d,
    }));
  }
  const sdF = sd(sFiling);
  const sdQ = sd(sQuarter);
  rows.push({ seed, n: sFiling.length, sdFiling: sdF, sdQuarter: sdQ, rho: sdF / sdQ, sdRev: sd(tRev), sdOcf: sd(tOcf), sdCb: sd(tCb) });
  console.log(`${seed} rho ${(sdF / sdQ).toFixed(4)} (sd s_filing ${sdF.toExponential(3)}, sd s_quarter ${sdQ.toExponential(3)})`);
}

const rhos = rows.map((r) => r.rho);
const summary = {
  seeds: rows.length, quarters, median: pct(rhos, 0.5), p90: pct(rhos, 0.9), p95: pct(rhos, 0.95),
  gate: { median: 0.15, p90: 0.25 }, pass: pct(rhos, 0.5) <= 0.15 && pct(rhos, 0.9) <= 0.25,
  finite: rhos.every((x) => Number.isFinite(x)), wallSeconds: (Date.now() - t0) / 1000,
};
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'rho.json'), JSON.stringify({ summary, rows }, null, 2));
console.log(`rho over ${summary.seeds} seeds x ${quarters} quarters: median ${summary.median.toFixed(4)}, p90 ${summary.p90.toFixed(4)}, p95 ${summary.p95.toFixed(4)}; gate ${summary.pass ? 'PASS' : 'FAIL'}`);
