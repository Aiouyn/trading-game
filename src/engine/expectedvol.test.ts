import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALYSTS } from './catalysts';
import { DEFAULT_REGIME_SHARES, defaultConfig, expectedVolOf, yieldVarianceRatio } from './config';
import { DEFAULT_RATES } from './rates';
import { RATE_YIELD_DAILY_VAR, RATE_YIELD_VARIANCE_RATIO, YIELD_HORIZONS, varianceRatios } from './ratevar';
import { universeConfig } from './universe';
import type { AssetDef, WorldConfig } from './types';

/** The same world with the rates layer and catalysts set (null = off, as gates.ts --drop rates does). */
const world = (cfg: WorldConfig, rates: WorldConfig['rates'], catalysts: WorldConfig['catalysts'] = undefined): WorldConfig =>
  ({ ...cfg, rates, catalysts });

describe('expectedVolOf: rates layer and catalysts come from the config (V1-PHASE1 F13, F21)', () => {
  const cfg = universeConfig();
  const bond = cfg.assets.find((a) => a.assetClass === 'bond' && a.duration && a.yieldKey) as AssetDef;
  const stock = cfg.assets.find((a) => a.assetClass === 'stock') as AssetDef;

  it('a config with no rates layer gets no rate term, so a dropped layer is not priced in', () => {
    const off = world(cfg, undefined);
    expect(cfg.rates).toBe(DEFAULT_RATES);
    expect(expectedVolOf(bond, cfg)).toBeGreaterThan(expectedVolOf(bond, off));
    // with the layer off, the expectation is diffusion and jumps only: the same as the bond with no duration
    expect(expectedVolOf(bond, off)).toBeCloseTo(expectedVolOf({ ...bond, duration: undefined, yieldKey: undefined }, off), 14);
  });

  it('the rate term is D² x the regime-mix daily yield variance x 252 x the print pass-through, from the rates config', () => {
    const offRate = expectedVolOf(bond, world(cfg, undefined), undefined, 1, 0.5) ** 2;
    const onRate = expectedVolOf(bond, cfg, undefined, 1, 0.5) ** 2;
    // no regime: the daily variance is the time-average over the default regimes, and the print pass-through at 0.5 is 0.5
    const key = bond.yieldKey!;
    const mixDaily = (Object.keys(DEFAULT_REGIME_SHARES) as (keyof typeof DEFAULT_REGIME_SHARES)[]).reduce(
      (acc, id) => acc + DEFAULT_REGIME_SHARES[id] * RATE_YIELD_DAILY_VAR[id][key], 0);
    expect(onRate - offRate).toBeCloseTo(bond.duration! ** 2 * mixDaily * 252 * 0.5, 12);
  });

  it('catalysts add the earnings variance to stocks only: 4 reports a year x (moveScale vol / 0.3)² x E[s²] x (1 + PEAD share)', () => {
    const plain = expectedVolOf(stock, defaultConfig());
    const on = expectedVolOf(stock, world(defaultConfig(), undefined, DEFAULT_CATALYSTS));
    const added = on ** 2 - plain ** 2;
    const full = (252 / DEFAULT_CATALYSTS.everyDays) * (DEFAULT_CATALYSTS.moveScale * (stock.vol / 0.3)) ** 2
      * (1 + DEFAULT_CATALYSTS.peadShare ** 2 / DEFAULT_CATALYSTS.peadDays);
    // E[s²] is at most 1 (the clamped consensus only shrinks its part) and at least rho² x 0.88 + (1 - rho²) for the clamp
    expect(added).toBeLessThanOrEqual(full * 1.0001);
    expect(added).toBeGreaterThan(full * 0.9);
    // a bond does not report
    expect(expectedVolOf(bond, world(cfg, cfg.rates, DEFAULT_CATALYSTS))).toBeCloseTo(expectedVolOf(bond, cfg), 14);
  });

  it('the horizon ratio multiplies the rate term at option horizons, and leaves the one-day band alone', () => {
    const y = bond.yieldKey!;
    const idx21 = YIELD_HORIZONS.indexOf(21);
    const ratio21 = RATE_YIELD_VARIANCE_RATIO[y][idx21]!;
    const rateAt1 = expectedVolOf(bond, cfg, undefined, 1, 1, 1) ** 2 - expectedVolOf(bond, world(cfg, undefined), undefined, 1, 1, 1) ** 2;
    const rateAt21 = expectedVolOf(bond, cfg, undefined, 1, 1, 21) ** 2 - expectedVolOf(bond, world(cfg, undefined), undefined, 1, 1, 21) ** 2;
    expect(rateAt21).toBeCloseTo(rateAt1 * ratio21, 12);
    expect(expectedVolOf(bond, cfg, undefined, 1, 0.5, 1)).toBeCloseTo(expectedVolOf(bond, cfg, undefined, 1, 0.5), 14);
  });

  it('the ratio is 1 at one day, interpolates log-linearly between horizons, and is flat past the last', () => {
    const r = RATE_YIELD_VARIANCE_RATIO;
    expect(yieldVarianceRatio(r, 'y2', 1)).toBe(r.y2[0]);
    expect(yieldVarianceRatio(r, 'y2', 0.2)).toBe(r.y2[0]);
    expect(yieldVarianceRatio(r, 'y2', 1000)).toBe(r.y2[YIELD_HORIZONS.length - 1]);
    const mid = yieldVarianceRatio(r, 'y2', Math.sqrt(2 * 5));
    expect(mid).toBeCloseTo((r.y2[1]! + r.y2[2]!) / 2, 12);
  });

  it('a random walk has variance ratio 1 at every horizon (the estimator is unbiased in form)', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;
    const levels = [0];
    for (let t = 0; t < 40000; t++) levels.push(levels[t]! + rnd());
    for (const v of varianceRatios(levels)) {
      expect(v).toBeGreaterThan(0.9);
      expect(v).toBeLessThan(1.1);
    }
  });
});
