import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as engine from './index';
import { createWorld, defaultConfig, ecologyLog, enterSimMode, isSimMode, openAccount, placeOrder, step } from './index';
import { runScenarios } from './__fixtures__/fingerprint-scenarios';
import type { EngineApi, Fingerprint } from './__fixtures__/fingerprint-scenarios';
import type { WorldState } from './types';

/** harness-only closed loop: the ecology sets every close at 100% weight (enterSimMode) */
const FIXTURE = JSON.parse(readFileSync(new URL('./__fixtures__/fingerprint.json', import.meta.url), 'utf8')) as { scenarios: Fingerprint };
const api = engine as unknown as EngineApi;
const TPD = 24;

function closes(s0: WorldState, days: number): { s: WorldState; lnP: number[][]; fills: number } {
  let s = s0;
  const lnP: number[][] = [];
  let fills = 0;
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < TPD; t++) { const r = step(s); s = r.state; fills += r.fills.length; }
    lnP.push(s.assets.map((a) => a.lnP));
  }
  return { s, lnP, fills };
}

describe('sim mode (harness only): the ecology sets the close', () => {
  it('is deterministic: same seed, same closes and same state', () => {
    const a = closes(enterSimMode(createWorld('sim-det', defaultConfig({ ticksPerDay: TPD }))), 30);
    const b = closes(enterSimMode(createWorld('sim-det', defaultConfig({ ticksPerDay: TPD }))), 30);
    expect(a.lnP).toEqual(b.lnP);
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
  });

  it('moves lnP relative to flag-off, and close-to-close lnP equals the ecology move (no live day on top)', () => {
    const cfg = defaultConfig({ ticksPerDay: TPD });
    const off = closes(createWorld('sim-move', cfg, { ecology: 'off' }), 30);
    const sim = closes(enterSimMode(createWorld('sim-move', cfg)), 30);
    let differ = 0;
    for (let d = 0; d < 30; d++) for (let i = 0; i < cfg.assets.length; i++) if (off.lnP[d]![i] !== sim.lnP[d]![i]) differ++;
    expect(differ).toBeGreaterThan(30 * cfg.assets.length * 0.9);
    // the close IS the ecology close, and the logged cause vector sums to the close-to-close lnP move
    sim.s.assets.forEach((a, i) => expect(a.lnP).toBe(sim.s.ecology!.assets[i]!.lnS));
    const log = ecologyLog(sim.s);
    for (const day of log.slice(1)) {
      const d = day.day;
      day.assets.forEach((x, i) => {
        const move = sim.lnP[d]![i]! - sim.lnP[d - 1]![i]!;
        const sum = Object.values(x.cause).reduce((p, q) => p + q, 0);
        expect(Math.abs(move - sum)).toBeLessThan(1e-12);
      });
    }
    // sim writes only the close: the random draws (asset, volume, macro, sector streams) and regimes are the live ones.
    // lnV is not written either, but it is not equal: GARCH h reads the overwritten closes and scales value's shock.
    expect(sim.s.assets.map((a) => [a.rng, a.vrng])).toEqual(off.s.assets.map((a) => [a.rng, a.vrng]));
    expect([sim.s.regimeLog, sim.s.macroRng, sim.s.sectorRng]).toEqual([off.s.regimeLog, off.s.macroRng, off.s.sectorRng]);
  });

  it('player fills still happen in sim mode', () => {
    let s = enterSimMode(openAccount(createWorld('sim-fill', defaultConfig({ ticksPerDay: TPD })), 'p', 100_000));
    s = placeOrder(s, { playerId: 'p', assetId: s.config.assets[0]!.id, side: 'buy', type: 'market', qty: 10 }).state;
    expect(closes(s, 2).fills).toBeGreaterThan(0);
  });

  it('flag absent, off, shadow, a made-up hybrid weight (0.3), and a save claiming mode sim all still match the fixture', () => {
    expect(runScenarios(api)).toEqual(FIXTURE.scenarios);
    expect(runScenarios(api, { mode: 'off' })).toEqual(FIXTURE.scenarios);
    expect(runScenarios(api, { mode: 'shadow' })).toEqual(FIXTURE.scenarios);
    expect(runScenarios(api, { mode: 'hybrid', weight: 0.3 } as never)).toEqual(FIXTURE.scenarios);
    expect(runScenarios(api, { mode: 'sim' } as never)).toEqual(FIXTURE.scenarios);
  });

  it('is memory only: a saved/loaded or cloned sim world is not sim, and the shared config is untouched', () => {
    const cfg = defaultConfig({ ticksPerDay: TPD });
    const plain = createWorld('sim-save', cfg);
    const sim = enterSimMode(plain);
    expect(isSimMode(sim)).toBe(true);
    expect(isSimMode(plain)).toBe(false);
    expect('sim' in sim.config || 'sim' in sim).toBe(false);
    const loaded = JSON.parse(JSON.stringify(closes(sim, 3).s)) as WorldState;
    expect(isSimMode(loaded)).toBe(false);
    expect(isSimMode(structuredClone(sim))).toBe(false);
    // a world built from the same config object after enterSimMode is still the live engine
    expect(closes(createWorld('sim-save', cfg), 5).lnP).toEqual(closes(createWorld('sim-save', defaultConfig({ ticksPerDay: TPD })), 5).lnP);
  });
});
