import { initRates, ratesDay } from './rates';
import { Rng, seedStream } from './rng';
import type { RatesConfig, RatesState, RegimeDef, RegimeId, WorldState, YieldKey } from './types';

/**
 * Daily variance of the rates layer's yield changes (V1-PHASE1 F13, expectedVol's rate term). Derived from the rates layer
 * itself: ratesDay (rates.ts) run with the regime chain of sim.ts, on DEFAULT_RATES and DEFAULT_REGIMES, with a fixed seed.
 * Nothing here is fitted to a realized vol; the table is the model's own prediction of how far the yields move in a day, by
 * the regime the day is in. An asset with duration D and yieldKey K gets D^2 x this variance x 252 x the print pass-through
 * in expectedVol (config.ts).
 *
 * The table is a constant so option quotes do not run a simulation: the script scripts/balance/rate-var.ts prints it, and
 * src/engine/ratevar.test.ts checks that the constant is still what simulateYieldVariance gives for DEFAULT_RATES. If the rates
 * config or the regime chain changes, that test fails until the table is regenerated.
 */
export const YIELD_KEYS: readonly YieldKey[] = ['y2', 'y10', 'y30'];

/** The seed and length the table was generated with (scripts/balance/rate-var.ts). */
export const RATE_VAR_SEED = 'rate-var';
export const RATE_VAR_YEARS = 4000;

export type YieldVarByRegime = Record<RegimeId, Record<YieldKey, number>>;

/**
 * Horizons (game days) of the variance-ratio table: VR_k(H) = Var(y_(t+H) - y_t) / (H x Var(y_(t+1) - y_t)), averaged over all
 * days. VR = 1 for a random walk. The rates layer has yield trends that persist for months (regime drift), so VR > 1 at the
 * option horizons (up to about 25 days, options.ts). expectedVol multiplies the rate term by VR at the option's horizon.
 */
export const YIELD_HORIZONS: readonly number[] = [1, 2, 5, 10, 21, 42, 63];
export type YieldVarianceRatio = Record<YieldKey, readonly number[]>;

/** Variance ratio at each of YIELD_HORIZONS, by yield (generated, same run as RATE_YIELD_DAILY_VAR; see varianceRatios). */
export const RATE_YIELD_VARIANCE_RATIO: YieldVarianceRatio = {"y2":[1,1.0985714751608997,1.381440091367424,1.816782231840288,2.622596323743917,3.747286440035296,4.422911896039354],"y10":[1,0.9199677673879738,0.8755378980431612,0.8634167442029327,0.8583655488468573,0.9111649897851043,0.9516207375941712],"y30":[1,0.9983176525468358,0.9951269338065972,0.9849287288218892,0.9588863939701222,0.9625054883357314,0.9619731939676085]};

/** Daily variance of each yield's change, by the regime of the day, from the simulation above (generated). */
export const RATE_YIELD_DAILY_VAR: YieldVarByRegime = {
  expansion: { y2: 1.9964991250815353e-7, y10: 1.0470802094908068e-7, y30: 7.884784255530402e-8 },
  overheating: { y2: 2.575378554012654e-7, y10: 2.1344326466220363e-7, y30: 2.364937218002383e-7 },
  contraction: { y2: 3.035596457849194e-7, y10: 4.7190981759108227e-7, y30: 6.663048067303535e-7 },
  recovery: { y2: 2.561423422663991e-7, y10: 1.8067416539327757e-7, y30: 1.8383163121248156e-7 },
};

/** VR at each of YIELD_HORIZONS for one yield's path of daily levels (the path starts after burn-in). */
export function varianceRatios(levels: readonly number[]): number[] {
  const n = levels.length;
  let v1 = 0;
  for (let t = 0; t + 1 < n; t++) v1 += (levels[t + 1]! - levels[t]!) ** 2;
  v1 /= Math.max(1, n - 1);
  return YIELD_HORIZONS.map((h) => {
    let vh = 0;
    for (let t = 0; t + h < n; t++) vh += (levels[t + h]! - levels[t]!) ** 2;
    vh /= Math.max(1, n - h);
    return v1 > 0 ? vh / (h * v1) : 1;
  });
}

/** The regime chain's next draw (sim.ts pickNext, same ordering and cumulative rule). */
function pickNext(next: Partial<Record<RegimeId, number>>, u: number): RegimeId {
  const entries = Object.entries(next).sort(([a], [b]) => a.localeCompare(b)) as [RegimeId, number][];
  let acc = 0;
  for (const [id, p] of entries) {
    acc += p;
    if (u < acc) return id;
  }
  return entries[entries.length - 1]![0];
}

/**
 * Simulate the rates layer for `years` game years (one more year is run and dropped as burn-in) and return the mean squared
 * daily change of each yield, by the regime of the day, with the number of days in each regime.
 */
export function simulateYieldVariance(
  rates: RatesConfig,
  regimes: Record<RegimeId, RegimeDef>,
  years: number,
  seed: string,
  daysPerYear = 252,
): { variance: YieldVarByRegime; days: Record<RegimeId, number>; ratio: YieldVarianceRatio } {
  const ids = Object.keys(regimes) as RegimeId[];
  const macro = new Rng(seedStream(seed, 'rate-var:macro'));
  const sumSq = Object.fromEntries(ids.map((id) => [id, { y2: 0, y10: 0, y30: 0 }])) as unknown as YieldVarByRegime;
  const days = Object.fromEntries(ids.map((id) => [id, 0])) as Record<RegimeId, number>;
  const path: Record<YieldKey, number[]> = { y2: [], y10: [], y30: [] };
  let regime: RegimeId = 'expansion';
  // ratesDay reads the state's seed, regime and rates, and config.assets (empty here: only yield changes are wanted)
  const world = { seed, regime, config: { assets: [] } } as unknown as WorldState;
  let prev: RatesState = initRates(world, rates, 0);
  const burn = daysPerYear;
  const total = Math.round(years * daysPerYear) + burn;
  for (let d = 0; d < total; d++) {
    // the day-boundary regime transition, as sim.ts does it
    const def = regimes[regime];
    if (macro.chance(1 / def.meanDays)) {
      const to = pickNext(def.next, macro.uniform());
      if (to !== regime) regime = to;
    }
    const next = ratesDay({ ...world, regime, rates: prev } as unknown as WorldState, rates, regime, d, 0).rates;
    if (d >= burn) {
      days[regime]++;
      for (const k of YIELD_KEYS) { sumSq[regime][k] += (next[k] - prev[k]) ** 2; path[k].push(next[k]); }
    }
    prev = next;
  }
  for (const id of ids) for (const k of YIELD_KEYS) sumSq[id][k] = days[id] > 0 ? sumSq[id][k] / days[id] : 0;
  const ratio = {} as Record<YieldKey, number[]>;
  for (const k of YIELD_KEYS) ratio[k] = varianceRatios(path[k]);
  return { variance: sumSq, days, ratio };
}
