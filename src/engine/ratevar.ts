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

/** Daily variance of each yield's change, by the regime of the day, from the simulation above (generated). */
export const RATE_YIELD_DAILY_VAR: YieldVarByRegime = {
  expansion: { y2: 1.9964991250815353e-7, y10: 1.0470802094908068e-7, y30: 7.884784255530402e-8 },
  overheating: { y2: 2.575378554012654e-7, y10: 2.1344326466220363e-7, y30: 2.364937218002383e-7 },
  contraction: { y2: 3.035596457849194e-7, y10: 4.7190981759108227e-7, y30: 6.663048067303535e-7 },
  recovery: { y2: 2.561423422663991e-7, y10: 1.8067416539327757e-7, y30: 1.8383163121248156e-7 },
};

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
): { variance: YieldVarByRegime; days: Record<RegimeId, number> } {
  const ids = Object.keys(regimes) as RegimeId[];
  const macro = new Rng(seedStream(seed, 'rate-var:macro'));
  const sumSq = Object.fromEntries(ids.map((id) => [id, { y2: 0, y10: 0, y30: 0 }])) as unknown as YieldVarByRegime;
  const days = Object.fromEntries(ids.map((id) => [id, 0])) as Record<RegimeId, number>;
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
      for (const k of YIELD_KEYS) sumSq[regime][k] += (next[k] - prev[k]) ** 2;
    }
    prev = next;
  }
  for (const id of ids) for (const k of YIELD_KEYS) sumSq[id][k] = days[id] > 0 ? sumSq[id][k] / days[id] : 0;
  return { variance: sumSq, days };
}
