import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as engine from './index';
import { createWorld, defaultConfig, ecologyLog, ecologyWeight, enterSimMode, openAccount, placeOrder, step } from './index';
import { runScenarios } from './__fixtures__/fingerprint-scenarios';
import type { EngineApi, Fingerprint } from './__fixtures__/fingerprint-scenarios';
import type { WorldConfig, WorldState } from './types';

/** Hybrid price path (spec migration step 2): the close is (1 − w)·live + w·ecology, w = 0.25 (or 1), a save field. */
const FIXTURE = JSON.parse(readFileSync(new URL('./__fixtures__/fingerprint.json', import.meta.url), 'utf8')) as { scenarios: Fingerprint };
const api = engine as unknown as EngineApi;
const TPD = 24;
const H25 = { mode: 'hybrid', weight: 0.25 } as const;

function closes(s0: WorldState, days: number) {
  let s = s0;
  const lnP: number[][] = [];
  for (let d = 0; d < days; d++) { for (let t = 0; t < TPD; t++) s = step(s).state; lnP.push(s.assets.map((a) => a.lnP)); }
  return { s, lnP };
}

describe('hybrid 25%: the save field', () => {
  it('weight is 0.25 or 1 only; everything else resolves to 0 (off)', () => {
    const w = (e: unknown) => ecologyWeight({ ...defaultConfig(), ecology: e } as WorldConfig);
    expect(w(H25)).toBe(0.25);
    expect(w({ mode: 'hybrid', weight: 1 })).toBe(1);
    for (const bad of [undefined, {}, { mode: 'shadow', weight: 0.25 }, { mode: 'hybrid' }, { mode: 'hybrid', weight: 0.3 }, { mode: 'hybrid', weight: '0.25' }, { mode: 'hybrid', weight: Number.NaN }, { mode: 'sim', weight: 1 }])
      expect(w(bad)).toBe(0);
  });

  it('createWorld option: new worlds default to full (never 25%), opt in with ecologyWeight 0.25, a made-up weight throws', () => {
    const plain = createWorld('h', defaultConfig({ ticksPerDay: TPD }));
    expect(plain.config.ecology).toEqual({ mode: 'full', weight: 1 });
    expect(createWorld('h', defaultConfig({ ticksPerDay: TPD }), { ecology: 'off' }).config.ecology).toBeUndefined();
    const h = createWorld('h', defaultConfig({ ticksPerDay: TPD }), { ecologyWeight: 0.25 });
    expect(h.config.ecology).toEqual(H25);
    expect(() => createWorld('h', defaultConfig(), { ecologyWeight: 0.3 })).toThrow();
    expect(() => createWorld('h', defaultConfig(), { ecologyWeight: 0 })).toThrow();
  });

  it('a save with no field, off or shadow still matches the fingerprint (old saves stay on the old path)', () => {
    expect(runScenarios(api)).toEqual(FIXTURE.scenarios);
    expect(runScenarios(api, { mode: 'off' })).toEqual(FIXTURE.scenarios);
    expect(runScenarios(api, { mode: 'shadow' })).toEqual(FIXTURE.scenarios);
  });
});

describe('hybrid 25%: the price path', () => {
  it('is deterministic and survives a save/load: the weight is in the save', () => {
    const a = closes(createWorld('h-det', defaultConfig({ ticksPerDay: TPD, ecology: H25 })), 20);
    const b = closes(createWorld('h-det', defaultConfig({ ticksPerDay: TPD, ecology: H25 })), 20);
    expect(a.lnP).toEqual(b.lnP);
    const mid = closes(createWorld('h-det', defaultConfig({ ticksPerDay: TPD, ecology: H25 })), 10).s;
    const loaded = JSON.parse(JSON.stringify(mid)) as WorldState;
    expect(closes(loaded, 10).lnP).toEqual(a.lnP.slice(10));
  });

  it('close move = (1 − w)·live move + w·ecology move (replaced, never added), and it moves lnP vs off', () => {
    const cfg = defaultConfig({ ticksPerDay: TPD, ecology: H25 });
    const h = closes(createWorld('h-move', cfg), 25);
    const off = closes(createWorld('h-move', defaultConfig({ ticksPerDay: TPD }), { ecology: 'off' }), 25);
    expect(h.lnP[24]).not.toEqual(off.lnP[24]);
    const log = ecologyLog(h.s);
    expect(log.length).toBe(21);
    for (const day of log) {
      const d = day.day;
      day.assets.forEach((x, i) => {
        const move = h.lnP[d]![i]! - h.lnP[d - 1]![i]!;
        const eco = Object.values(x.cause).reduce((p, q) => p + q, 0);
        expect(x.blend!.weight).toBe(0.25);
        expect(Math.abs(move - (0.75 * x.blend!.live + 0.25 * eco))).toBeLessThan(1e-12);
      });
    }
    // the ecology is re-anchored on the printed close: its state sits on lnP
    h.s.assets.forEach((a, i) => expect(h.s.ecology!.assets[i]!.lnS).toBe(a.lnP));
    // random streams and regimes are the live ones
    expect([h.s.regimeLog, h.s.macroRng]).toEqual([off.s.regimeLog, off.s.macroRng]);
    expect(h.s.assets.map((a) => a.rng)).toEqual(off.s.assets.map((a) => a.rng));
  });

  it('weight 1 as a save field prints exactly what enterSimMode prints', () => {
    const save = closes(createWorld('h-one', defaultConfig({ ticksPerDay: TPD, ecology: { mode: 'hybrid', weight: 1 } })), 15);
    const sim = closes(enterSimMode(createWorld('h-one', defaultConfig({ ticksPerDay: TPD }))), 15);
    expect(save.lnP).toEqual(sim.lnP);
  });

  it('player fills still happen and the pools join the shared day tally at weight 0.25', () => {
    let s = openAccount(createWorld('h-fill', defaultConfig({ ticksPerDay: TPD, ecology: H25 })), 'p', 1e5);
    s = placeOrder(s, { playerId: 'p', assetId: 'OSTV', side: 'buy', type: 'market', qty: 50 }).state;
    let fills = 0;
    for (let t = 0; t < TPD; t++) { const r = step(s); s = r.state; fills += r.fills.length; }
    expect(fills).toBe(1);
    // full-mode-only defaults (FULL_MODE_DEFAULTS: scaled lnV, valuePrint) switched off, so both paths see the same inputs
    const sim = enterSimMode(createWorld('h-fill', defaultConfig({ ticksPerDay: TPD, ecology: { lnVVolScale: 1, valuePrint: 0 } as WorldConfig['ecology'] })));
    let t1 = sim;
    for (let t = 0; t < TPD; t++) t1 = step(t1).state;
    const i = s.config.assets.findIndex((a) => a.id === 'HLCN');
    // HLCN had no player trades: on day 0 both paths see the same inputs, so its tally is the pools' alone,
    // a quarter of what the same pools post at full weight
    const h = s.assets[i]!.dayTraded!, f = t1.assets[i]!.dayTraded!;
    expect(h.buy + h.sell).toBeGreaterThan(0);
    expect(h.buy).toBeCloseTo(0.25 * f.buy, 6);
    expect(h.sell).toBeCloseTo(0.25 * f.sell, 6);
  });
});
