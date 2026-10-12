// The rho probe (V1-PHASE9 9C, O-2; Quant G22, rho_residual; quant-company-building.md section 6.2 (c)).
// For each seed, a listed company runs on the engine path (src/world/company/rho.ts): the IPO orders, then every tick is a real
// stepGame (the engine's matching and bars, the company step, the sector factor of O-12). Each post-listing filing carries its
// residual surprise s (company.ts surpriseAtFiling). rho per seed = sd(s_filing) / sd(s_quarter) over the quarters.
// Gate: median <= 0.15 and p90 <= 0.25 across seeds (hard ceiling 0.25).
//
// Usage: npx tsx scripts/balance/rho-probe.ts [--seeds 200] [--first 1] [--quarters 8] [--out dir]
// Several processes split a run by --first (the seeds rho-K .. rho-K+seeds-1), each with its own --out; combine the rho.json
// files (the medians are recomputed from the per-seed rows).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { quantile, rhoOfListedSeed } from '../../src/world/company/rho';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const nSeeds = Number(arg('seeds', '200'));
const firstSeed = Number(arg('first', '1'));
const quarters = Number(arg('quarters', '8'));
const out = arg('out', 'rho-out');

const t0 = Date.now();
const rows = [];
for (let k = firstSeed; k < firstSeed + nSeeds; k++) {
  const r = rhoOfListedSeed(`rho-${k}`, quarters);
  rows.push(r);
  console.log(`${r.seed} rho ${r.rho.toFixed(4)} (sd s_filing ${r.sdFiling.toExponential(3)}, sd s_quarter ${r.sdQuarter.toExponential(3)}) ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const rhos = rows.map((r) => r.rho);
const summary = {
  seeds: rows.length, quarters, median: quantile(rhos, 0.5), p90: quantile(rhos, 0.9), p95: quantile(rhos, 0.95),
  gate: { median: 0.15, p90: 0.25 }, pass: quantile(rhos, 0.5) <= 0.15 && quantile(rhos, 0.9) <= 0.25,
  finite: rhos.every((x) => Number.isFinite(x)), wallSeconds: (Date.now() - t0) / 1000,
};
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'rho.json'), JSON.stringify({ summary, rows }, null, 2));
console.log(`rho over ${summary.seeds} seeds x ${quarters} quarters: median ${summary.median.toFixed(4)}, p90 ${summary.p90.toFixed(4)}, p95 ${summary.p95.toFixed(4)}; gate ${summary.pass ? 'PASS' : 'FAIL'}`);
