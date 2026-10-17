import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as engine from './index';
import { createWorld, defaultConfig, openAccount, placeOrder, quote, step, stepMany } from './index';
import { DEFAULT_ECOLOGY, ecoDayInput, ecologyDay, ecologyLog, initEcology, shadowPrices } from './ecology';
import { runScenarios, liveJson } from './__fixtures__/fingerprint-scenarios';
import type { EngineApi, Fingerprint } from './__fixtures__/fingerprint-scenarios';
import type { WorldConfig, WorldState } from './types';

/** Written from an untouched copy of the engine before the ecology existed (scripts/ecology/fingerprint.ts). */
const FIXTURE = JSON.parse(readFileSync(new URL('./__fixtures__/fingerprint.json', import.meta.url), 'utf8')) as { scenarios: Fingerprint };
const api = engine as unknown as EngineApi;
const SHADOW = { mode: 'shadow' } as const;

describe('ecology off: the live engine is byte-identical to the pre-ecology engine', () => {
  it('field absent (old saves): lnP, lnV, h, volume, quote().volume and the whole live state match the fixture', () => {
    const now = runScenarios(api);
    expect(now.A!.samples.length).toBe(40);
    expect(now.C!.fills).toBeGreaterThan(0);
    expect(now).toEqual(FIXTURE.scenarios);
  });

  it("mode 'off' matches the fixture", () => {
    expect(runScenarios(api, { mode: 'off' })).toEqual(FIXTURE.scenarios);
  });

  it('only the allowed hybrid weights move prices: unknown modes and made-up weights are off, byte for byte', () => {
    // 'hybrid' with weight 0.25 or 1 is real now (hybrid.test.ts); every other value stays on today's engine
    for (const e of [
      { mode: 'hybrid', weight: 0.3, permanentShare: 1 }, { mode: 'hybrid', weight: 0.5 }, { mode: 'hybrid', weight: 0 },
      { mode: 'hybrid', weight: 2 }, { mode: 'hybrid', weight: '0.25' }, { mode: 'hybrid', weight: Number.NaN },
      { mode: 'hybrid' }, { mode: 'Hybrid', weight: 0.25 }, { mode: 'blend', weight: 0.25 }, { mode: 'off', weight: 0.25 },
    ]) expect(runScenarios(api, e)).toEqual(FIXTURE.scenarios);
  });

  it('a legacy world (no ecology field, like an old save) carries no ecology state', () => {
    const s = stepMany(createWorld('plain', defaultConfig({ ticksPerDay: 24 }), { ecology: 'off' }), 24 * 3).state;
    expect('ecology' in s).toBe(false);
    expect('ecology' in s.config).toBe(false);
  });

  it('the fixture comparison really bites: a one-ulp change in one price fails it', () => {
    const now = runScenarios(api);
    const bent = structuredClone(now);
    const x = bent.A!.samples[10]!.lnP[3]!;
    bent.A!.samples[10]!.lnP[3] = x + Math.abs(x) * Number.EPSILON;
    expect(bent).not.toEqual(FIXTURE.scenarios);
  });
});

describe('ecology shadow: computed beside the live path, never in it', () => {
  it('live prices, value, h, volume, quote().volume, RNG streams and fills are unchanged with shadow on', () => {
    const on = runScenarios(api, SHADOW);
    expect(on).toEqual(FIXTURE.scenarios); // finalHash covers every live field incl. asset:/volume:/macro:/sector: streams
  });

  function shadowRun(seed: string, days: number, over: Partial<WorldConfig> = {}): WorldState {
    return stepMany(createWorld(seed, defaultConfig({ ticksPerDay: 24, ecology: { ...SHADOW }, ...over })), 24 * days).state;
  }

  it('logs desired flow, depth, inventory, the shadow close and a cause vector that sums to the move', () => {
    const days = 30;
    const s = shadowRun('log', days);
    const log = ecologyLog(s);
    expect(log.length).toBe(DEFAULT_ECOLOGY.logDays);
    expect(log.map((d) => d.day)).toEqual(Array.from({ length: DEFAULT_ECOLOGY.logDays }, (_, k) => days - DEFAULT_ECOLOGY.logDays + k));
    for (let k = 1; k < log.length; k++) {
      const day = log[k]!;
      expect(day.tick).toBe((day.day + 1) * 24);
      expect(day.assets.map((a) => a.id)).toEqual(s.config.assets.map((a) => a.id));
      day.assets.forEach((a, i) => {
        expect(Object.keys(a.desired).sort()).toEqual(['own', 'pension', 'retail', 'trend', 'value']);
        expect(Object.keys(a.cause).sort()).toEqual(['maker', 'news', 'own', 'pension', 'retail', 'trend', 'value']);
        expect(a.depth).toBeGreaterThanOrEqual(DEFAULT_ECOLOGY.depthMin);
        expect(a.depth).toBeLessThanOrEqual(1);
        const sum = Object.values(a.cause).reduce((x, y) => x + y, 0);
        expect(sum).toBeCloseTo(a.lnS - log[k - 1]!.assets[i]!.lnS, 12);
        expect(a.net).toBeCloseTo(Object.values(a.desired).reduce((x, y) => x + y, 0), 12);
        for (const v of [a.lnS, a.lnV, a.net, a.gross, a.inv]) expect(Number.isFinite(v)).toBe(true);
      });
    }
    const sp = shadowPrices(s);
    expect(Object.keys(sp)).toEqual(s.config.assets.map((a) => a.id));
    // its own series: close to the live price but not a copy of it
    s.config.assets.forEach((d, i) => {
      expect(Math.abs(Math.log(sp[d.id]!) - s.assets[i]!.lnP)).toBeLessThan(0.5);
    });
    expect(s.config.assets.some((d, i) => sp[d.id] !== Math.exp(s.assets[i]!.lnP))).toBe(true);
  });

  it('is deterministic, survives a JSON save, and an old save can switch it on', () => {
    const a = shadowRun('det', 20);
    expect(shadowRun('det', 20)).toEqual(a);
    const re = JSON.parse(JSON.stringify(a)) as WorldState;
    expect(stepMany(re, 24 * 5).state).toEqual(stepMany(a, 24 * 5).state);
    // a save without the ecology: flip the flag on, the shadow starts from the live prices, live path unchanged
    const old = stepMany(createWorld('det', defaultConfig({ ticksPerDay: 24 }), { ecology: 'off' }), 24 * 20).state;
    const flipped = stepMany({ ...old, config: { ...old.config, ecology: { ...SHADOW } } }, 24 * 5).state;
    const plain = stepMany(old, 24 * 5).state;
    expect(liveJson(flipped)).toBe(liveJson(plain));
    expect(flipped.ecology!.log.length).toBe(5);
  });

  it('uses only eco:retail:<id> streams, seeded independently of the live streams', () => {
    const s0 = createWorld('streams', defaultConfig({ ticksPerDay: 24, ecology: { ...SHADOW } }));
    const eco = initEcology(s0);
    eco.assets.forEach((e, i) => {
      expect(e.rng).toEqual(engine.seedStream('streams', `eco:retail:${s0.config.assets[i]!.id}`));
      expect(e.rng).not.toEqual(s0.assets[i]!.rng);
      expect(e.rng).not.toEqual(s0.assets[i]!.vrng);
    });
  });

  it('the in-engine shadow equals folding ecologyDay over the live day-end inputs of a flag-off run', () => {
    const cfgOn = defaultConfig({ ticksPerDay: 24, ecology: { ...SHADOW } });
    const on = stepMany(createWorld('replay', cfgOn), 24 * 40).state;
    let off = createWorld('replay', defaultConfig({ ticksPerDay: 24 }), { ecology: 'off' });
    let eco = initEcology(off);
    for (let d = 0; d < 40; d++) {
      off = stepMany(off, 24).state;
      eco = ecologyDay(cfgOn, eco, ecoDayInput(off, d));
    }
    expect(eco).toEqual(on.ecology);
  });

  it("puts the player's fills in the own-flow term of that day", () => {
    let s = openAccount(createWorld('own', defaultConfig({ ticksPerDay: 24, ecology: { ...SHADOW } })), 'p1', 1e7);
    s = stepMany(s, 24 * 2 + 3).state;
    s = placeOrder(s, { playerId: 'p1', assetId: 'OSTV', side: 'buy', type: 'market', qty: 20000 }).state;
    s = stepMany(s, 24).state;
    const i = s.config.assets.findIndex((a) => a.id === 'OSTV');
    const day = ecologyLog(s).find((d) => d.day === 2)!;
    const fill = s.orders.find((o) => o.playerId === 'p1')!;
    expect(day.assets[i]!.desired.own).toBeCloseTo((fill.filledQty * fill.avgFillPrice) / s.config.assets[i]!.advNotional!, 12);
    expect(day.assets.filter((_, j) => j !== i).every((a) => a.desired.own === 0)).toBe(true);
  });

  it('pension trades only the last 3 days of each 63-day quarter, and only index members', () => {
    const s = shadowRun('pension', 130, { ecology: { ...SHADOW, logDays: 130 } });
    const stock = s.config.assets.map((a) => a.assetClass === 'stock');
    for (const d of ecologyLog(s)) {
      const live = d.day % 63 >= 60;
      d.assets.forEach((a, i) => {
        if (!live || !stock[i]) expect(a.desired.pension).toBe(0);
      });
      if (live && d.day >= 63) expect(d.assets.some((a) => a.desired.pension !== 0)).toBe(true);
    }
  });

  it('the maker steps back: depth is thinner the day after a heavy-flow day', () => {
    const s = shadowRun('depth', 252, { ecology: { ...SHADOW, logDays: 252 } });
    const log = ecologyLog(s);
    const after: number[] = [], calm: number[] = [];
    for (let k = 1; k < log.length; k++) {
      log[k]!.assets.forEach((a, i) => {
        const prevNet = Math.abs(log[k - 1]!.assets[i]!.net);
        (prevNet > 2 ? after : prevNet < 0.3 ? calm : []).push(a.depth);
      });
    }
    const mean = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length;
    expect(after.length).toBeGreaterThan(20);
    expect(mean(after)).toBeLessThan(mean(calm));
  });
});

describe('volume and volatility (live engine, default config)', () => {
  // THE volume gate (Ledger, 2026-10-09): corr(|daily return|, traded value = dayNotional) in (0.3, 0.6].
  // Units (quote().volume) are NOT the gate; they are logged for information only. Units fall as 1/price because
  // advNotional is a fixed $ amount, so over years the price level swamps the |r| link (0.28 to 0.29 at 5 years).
  // Measured 2026-10-09, 720 ticks/day, 5 game years, mean over the 17 assets, traded value: alpha 0.404, beta 0.414,
  // gamma 0.415, delta 0.405.
  it('volume gate: corr(|daily return|, dayNotional) mean over the real universe in (0.3, 0.6], 720 ticks/day, 2 game years', { timeout: 120_000 }, () => {
    const cfg = defaultConfig();
    let s = createWorld('vol-vs-vol', cfg);
    const ids = cfg.assets.map((a) => a.id);
    const val: number[][] = ids.map(() => []), units: number[][] = ids.map(() => []), absR: number[][] = ids.map(() => []);
    for (let d = 0; d < 504; d++) {
      const open = s.assets.map((a) => a.lnP);
      const u = ids.map(() => 0);
      for (let t = 0; t < cfg.ticksPerDay; t++) {
        s = step(s).state;
        ids.forEach((id, i) => { u[i]! += quote(s, id).volume; });
      }
      ids.forEach((id, i) => {
        val[i]!.push(quote(s, id).dayNotional); // traded value of the whole game day, at its last tick
        units[i]!.push(u[i]!);
        absR[i]!.push(Math.abs(s.assets[i]!.lnP - open[i]!));
      });
    }
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    const corr = (a: number[], b: number[]) => {
      const ma = mean(a), mb = mean(b);
      let n = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) { n += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
      return n / Math.sqrt(da * db);
    };
    const perVal = ids.map((_, i) => corr(absR[i]!, val[i]!));
    const perUnits = ids.map((_, i) => corr(absR[i]!, units[i]!));
    console.log(`volume_abs_return_corr: dayNotional (gate) mean ${mean(perVal).toFixed(4)} (min ${Math.min(...perVal).toFixed(4)}); units, info only, mean ${mean(perUnits).toFixed(4)}`);
    expect(mean(perVal)).toBeGreaterThan(0.3);
    expect(mean(perVal)).toBeLessThanOrEqual(0.6);
  });
});
