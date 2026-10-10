import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { universeConfig } from './universe';
import type { RegimeDef, RegimeId, WorldConfig, WorldState } from './types';

/**
 * R2 (drift attribution), confirmed: the regime's equity drift (cycleBeta x equityDrift) is a market move and goes to Market;
 * the asset's own drift (alpha, carry, seasonal) is company drift and goes to Company noise. This test pins the first half:
 * two worlds with the same seed that differ only in the regime's equity drift differ in the Market part by the regime term
 * and not at all in the Company drift part (the regime term cancels out of the asset's own drift, sim.ts dayLnV).
 */

const TPD = 24;
const ASSET = 'OSTV';

function withEquityDrift(e: number): WorldConfig {
  const cfg = universeConfig({ ticksPerDay: TPD });
  const regimes = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(cfg.regimes) as [RegimeId, RegimeDef][]) regimes[id] = { ...r, equityDrift: e };
  return { ...cfg, regimes };
}

function oneDay(e: number): WorldState {
  return stepMany(createWorld('regime-drift', withEquityDrift(e)), TPD).state;
}

describe('R2: the regime equity drift is Market, and the asset drift is Company noise', () => {
  it('a higher regime equity drift moves the Market part by cycleBeta x the change, and leaves the Company drift part alone', () => {
    const lo = oneDay(0);
    const hi = oneDay(0.3);
    const i = lo.config.assets.findIndex((a) => a.id === ASSET);
    const beta = lo.config.assets[i]!.cycleBeta;
    const a = lo.assets[i]!.dayLnV!;
    const b = hi.assets[i]!.dayLnV!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // one game day is 1/daysPerYear of a year: the regime term summed over the day
    const expected = beta * 0.3 / lo.config.daysPerYear;
    const dMarket = b.market - a.market;
    expect(dMarket).toBeGreaterThan(0);
    // within a few percent: the day's shocks are the same draws, and the GARCH variance responds only to second order
    expect(Math.abs(dMarket - expected)).toBeLessThan(0.05 * expected);
    // the asset's own drift (alpha, carry, seasonal) does not move with the regime's equity drift
    expect(Math.abs(b.drift - a.drift)).toBeLessThan(1e-6);
  });
});
