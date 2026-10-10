// Rate-shock variance table (V1-PHASE1 F13, owner: Ledger's expectedVol decision). Prints the daily variance of each yield's
// change by regime, from the rates layer itself (src/engine/ratevar.ts), and the analytic regime time shares it is weighted by.
// Usage: npx tsx scripts/balance/rate-var.ts [--years 4000] [--seed rate-var]
// The constant RATE_YIELD_DAILY_VAR in src/engine/ratevar.ts is this output at the default years and seed; a unit test checks it.

import { DEFAULT_REGIMES } from "../../src/engine/config";
import { DEFAULT_RATES } from "../../src/engine/rates";
import { regimeTimeShares } from "../../src/engine/regimeShares";
import { RATE_VAR_SEED, RATE_VAR_YEARS, YIELD_HORIZONS, YIELD_KEYS, simulateYieldVariance } from "../../src/engine/ratevar";

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const years = Number(arg("years", String(RATE_VAR_YEARS)));
const seed = arg("seed", RATE_VAR_SEED);
const t0 = performance.now();
const { variance, days, ratio } = simulateYieldVariance(DEFAULT_RATES, DEFAULT_REGIMES, years, seed);
const wall = performance.now() - t0;
const shares = regimeTimeShares(DEFAULT_REGIMES);
const total = Object.values(days).reduce((a, b) => a + b, 0);

console.log(`rate-var: ${years} game years, seed ${seed}, ${(wall / 1000).toFixed(2)} s`);
console.log("regime        share(analytic)  share(sampled)  daily var y2        y10          y30");
for (const id of Object.keys(DEFAULT_REGIMES) as (keyof typeof DEFAULT_REGIMES)[]) {
  const v = variance[id];
  console.log(
    `${id.padEnd(13)} ${shares[id].toFixed(4).padStart(15)}  ${(days[id] / total).toFixed(4).padStart(14)}  ` +
      YIELD_KEYS.map((k) => v[k].toExponential(4).padStart(12)).join("  "),
  );
}
const mix = Object.fromEntries(YIELD_KEYS.map((k) => [k, Object.keys(DEFAULT_REGIMES).reduce((a, id) => a + shares[id as keyof typeof shares] * variance[id as keyof typeof variance][k], 0)]));
console.log(`mix (analytic shares)  ${YIELD_KEYS.map((k) => `${k} ${mix[k]!.toExponential(4)}`).join("  ")}`);
console.log(`literal for ratevar.ts: ${JSON.stringify(variance)}`);
console.log(`variance-ratio horizons ${JSON.stringify(YIELD_HORIZONS)}`);
for (const k of YIELD_KEYS) console.log(`VR ${k}: ${ratio[k]!.map((x) => x.toFixed(4)).join("  ")}`);
console.log(`literal for ratevar.ts (RATE_YIELD_VARIANCE_RATIO): ${JSON.stringify(ratio)}`);
