import type { AssetDef } from './types';

/**
 * Merton compensator λ·(E[e^{cJ}] − 1) for Kou jumps of log size J scaled by c, at the asset's base
 * (regime-neutral) intensity and up-probability. Subtracting it from the drift makes the jumps add
 * nothing to the expected arithmetic return, so a stock with down-skewed news isn't a slow bleed by design.
 * Regime shifts in intensity and skew still move prices.
 */
export function jumpCompensator(def: AssetDef, c: number): number {
  if (def.jumpsPerYear <= 0) return 0;
  const p = def.jumpUpProb;
  const up = c * def.jumpUpMean < 0.99 ? p / (1 - c * def.jumpUpMean) : p * 100;
  const down = (1 - p) / (1 + c * def.jumpDownMean);
  return def.jumpsPerYear * (up + down - 1);
}
