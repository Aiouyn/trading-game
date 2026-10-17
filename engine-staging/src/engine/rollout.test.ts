import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as engine from './index';
import {
  createWorld, defaultConfig, ecologyConfig, ecologyOn, ecologyWeight, enterSimMode, FULL_ECOLOGY, FULL_MODE_DEFAULTS, NEW_WORLD_ECOLOGY,
  newWorldEcologyField, openAccount, placeOrder, step,
} from './index';
import { runScenarios } from './__fixtures__/fingerprint-scenarios';
import type { EngineApi, Fingerprint } from './__fixtures__/fingerprint-scenarios';
import type { WorldConfig, WorldState } from './types';

/** Spec migration step 3: mode 'full' (the 100% save field) and the single new-world default switch. */
const FIXTURE = JSON.parse(readFileSync(new URL('./__fixtures__/fingerprint.json', import.meta.url), 'utf8')) as { scenarios: Fingerprint };
const api = engine as unknown as EngineApi;
const TPD = 24;

function closes(s0: WorldState, days: number, trade = false) {
  let s = s0;
  if (trade) s = openAccount(s, 'p', 250_000);
  const lnP: number[][] = [];
  for (let d = 0; d < days; d++) {
    if (trade && d % 3 === 0) s = placeOrder(s, { playerId: 'p', assetId: s.config.assets[d % 5]!.id, side: d % 2 ? 'sell' : 'buy', type: 'market', qty: 50 }).state;
    for (let t = 0; t < TPD; t++) s = step(s).state;
    lnP.push(s.assets.map((a) => a.lnP));
  }
  return { s, lnP };
}

describe("mode 'full': the 100% save field", () => {
  it('weight absent or exactly 1 is on at weight 1; anything else is off', () => {
    const w = (e: unknown) => ecologyWeight({ ...defaultConfig(), ecology: e } as WorldConfig);
    expect(w({ mode: 'full' })).toBe(1);
    expect(w({ mode: 'full', weight: 1 })).toBe(1);
    expect(w(FULL_ECOLOGY)).toBe(1);
    for (const bad of [{ mode: 'full', weight: 0.25 }, { mode: 'full', weight: '1' }, { mode: 'full', weight: 0 }, { mode: 'full', weight: Number.NaN }, { mode: 'Full' }])
      expect(w(bad)).toBe(0);
    const cfg = { ...defaultConfig(), ecology: { mode: 'full' } } as WorldConfig;
    expect(ecologyOn(cfg)).toBe(true);
    expect(ecologyConfig(cfg).mode).toBe('full');
    expect(ecologyConfig({ ...defaultConfig(), ecology: { mode: 'full', weight: 0.25 } } as WorldConfig).mode).toBe('off');
  });

  it("full = enterSimMode = hybrid weight 1, close for close (with a player trading), and survives save/load", () => {
    const base = () => defaultConfig({ ticksPerDay: TPD });
    const full = closes(createWorld('full-eq', base(), { ecology: 'full' }), 30, true);
    const sim = closes(enterSimMode(createWorld('full-eq', base(), { ecology: 'off' })), 30, true);
    const h1 = closes(createWorld('full-eq', defaultConfig({ ticksPerDay: TPD, ecology: { mode: 'hybrid', weight: 1 } as WorldConfig['ecology'] })), 30, true);
    expect(full.s.config.ecology).toEqual(FULL_ECOLOGY);
    expect(full.lnP).toEqual(sim.lnP);
    expect(full.lnP).toEqual(h1.lnP);
    expect(full.s.ecology).toEqual(sim.s.ecology);
    const off = closes(createWorld('full-eq', base(), { ecology: 'off' }), 30, true);
    expect(full.lnP).not.toEqual(off.lnP);
    const mid = closes(createWorld('full-eq', base(), { ecology: 'full' }), 12).s;
    const loaded = JSON.parse(JSON.stringify(mid)) as WorldState;
    expect(closes(loaded, 10).lnP).toEqual(closes(createWorld('full-eq', base(), { ecology: 'full' }), 22).lnP.slice(12));
  });

  it("createWorld({ ecologyWeight: 1 }) writes the 'full' field; 0.25 the hybrid fallback; anything else throws", () => {
    expect(createWorld('o', defaultConfig(), { ecologyWeight: 1 }).config.ecology).toEqual(FULL_ECOLOGY);
    expect(createWorld('o', defaultConfig(), { ecologyWeight: 0.25 }).config.ecology).toEqual({ mode: 'hybrid', weight: 0.25 });
    expect(() => createWorld('o', defaultConfig(), { ecologyWeight: 0.5 })).toThrow();
    expect(() => createWorld('o', defaultConfig(), { ecology: 'hybrid' as never })).toThrow();
    // knobs a caller passed survive; the mode/weight are the option's
    const k = createWorld('o', defaultConfig({ ecology: { valueClose: 0.8 } as WorldConfig['ecology'] }), { ecology: 'full' });
    expect(k.config.ecology).toEqual({ valueClose: 0.8, ...FULL_ECOLOGY });
  });
});

describe('new-world default: one constant, ready to flip', () => {
  it('FLIP: NEW_WORLD_ECOLOGY is full (flipped 2026-10-09 after Tape\'s bands, crowd gate, Ledger and the speed gate)', () => {
    expect(NEW_WORLD_ECOLOGY).toBe('full'); // FLIP: flipped together with the constant in src/engine/sim.ts
  });

  it('a new world with no ecology field gets exactly the field NEW_WORLD_ECOLOGY names (never the 25% fallback)', () => {
    expect(['off', 'full']).toContain(NEW_WORLD_ECOLOGY);
    const plain = createWorld('d', defaultConfig({ ticksPerDay: TPD }));
    expect(plain.config.ecology).toEqual(newWorldEcologyField(NEW_WORLD_ECOLOGY));
    // what each setting means, so flipping the constant is already tested
    expect(newWorldEcologyField('off')).toBeUndefined();
    expect(newWorldEcologyField('full')).toEqual(FULL_ECOLOGY);
    expect(newWorldEcologyField('hybrid25')).toEqual({ mode: 'hybrid', weight: 0.25 });
  });

  it('an explicit field is never overwritten by the default; old saves (no field) step on the legacy path', () => {
    for (const e of [{ mode: 'shadow' }, { mode: 'off' }, { mode: 'hybrid', weight: 0.25 }]) {
      const s = createWorld('d', defaultConfig({ ticksPerDay: TPD, ecology: e as WorldConfig['ecology'] }));
      expect(s.config.ecology).toEqual(e);
    }
    // a loaded old save never passes through createWorld: no field = legacy, byte for byte
    const old = JSON.parse(JSON.stringify(createWorld('d', defaultConfig({ ticksPerDay: TPD }), { ecology: 'off' }))) as WorldState;
    expect(old.config.ecology).toBeUndefined();
    const legacy = closes(old, 10).lnP;
    expect(closes(createWorld('d', defaultConfig({ ticksPerDay: TPD }), { ecology: 'off' }), 10).lnP).toEqual(legacy);
    expect(runScenarios(api)).toEqual(FIXTURE.scenarios);
  });
});

describe('full-mode-only vol defaults (FULL_MODE_DEFAULTS)', () => {
  const lnPV = (s0: WorldState, days: number) => { let s = s0; const out: number[] = []; for (let d = 0; d < days; d++) { for (let t = 0; t < TPD; t++) s = step(s).state; out.push(...s.assets.map((a) => a.lnP), ...s.assets.map((a) => a.lnV)); } return out; };
  it('full uses them by default; an explicit config value wins', () => {
    expect(FULL_MODE_DEFAULTS).toEqual({ lnVVolScale: 1.15, valuePrint: 0.1 });
    const def = lnPV(createWorld('fd', defaultConfig({ ticksPerDay: TPD }), { ecology: 'full' }), 20);
    const exp = lnPV(createWorld('fd', defaultConfig({ ticksPerDay: TPD, ecology: { ...FULL_MODE_DEFAULTS } as WorldConfig['ecology'] }), { ecology: 'full' }), 20);
    const old = lnPV(createWorld('fd', defaultConfig({ ticksPerDay: TPD, ecology: { lnVVolScale: 1, valuePrint: 0 } as WorldConfig['ecology'] }), { ecology: 'full' }), 20);
    expect(def).toEqual(exp);
    expect(def).not.toEqual(old);
    expect(lnPV(enterSimMode(createWorld('fd', defaultConfig({ ticksPerDay: TPD }), { ecology: 'off' })), 20)).toEqual(def);
  });
  it('shadow, 25% and off ignore them and the knobs: byte-identical with or without', () => {
    for (const [eco, opt] of [[{ mode: 'shadow' }, {}], [{}, { ecology: 'hybrid25' }], [{ mode: 'off' }, {}]] as const) {
      const a = lnPV(createWorld('fd', defaultConfig({ ticksPerDay: TPD, ecology: { ...eco } as WorldConfig['ecology'] }), opt), 20);
      const b = lnPV(createWorld('fd', defaultConfig({ ticksPerDay: TPD, ecology: { ...eco, lnVVolScale: 1.3 } as WorldConfig['ecology'] }), opt), 20);
      expect(b).toEqual(a);
    }
  });
});
