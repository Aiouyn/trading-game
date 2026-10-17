import { describe, expect, it } from 'vitest';
import { createWorld, quote, step, stepMany, volumes } from './sim';
import { DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import { openAccount, placeOrder } from './trading';
import type { AssetDef, RegimeDef, RegimeId, WorldConfig, WorldState } from './types';

const TPD = 48;

function regimes(over: Partial<RegimeDef> = {}): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, jumpUpShift: 0, meanDays: 1e12, ...over };
  }
  return out;
}

function asset(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 's', initialPrice: 50, sharesOutstanding: 1e8,
    vol: 0.3, drift: 0, cycleBeta: 1, wMarket: 0.55, wSector: 0.45, wCrypto: 0,
    halfLifeDays: 20, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 2e8, qtyStep: 1, ...extra,
  });
}

function cfg(over: Partial<WorldConfig> = {}): WorldConfig {
  return defaultConfig({ ticksPerDay: TPD, regimes: regimes(), indices: [], assets: [asset('A')], ...over });
}

/** run whole days; returns per-day traded value / ADV for asset 0 and per-tick volumes */
function runDays(s: WorldState, days: number) {
  const day: number[] = [];
  const ticks: number[] = [];
  const absRet: number[] = [];
  const adv = s.config.assets[0]!.advNotional!;
  for (let d = 0; d < days; d++) {
    const open = s.assets[0]!.lnP;
    for (let t = 0; t < s.config.ticksPerDay; t++) {
      s = step(s).state;
      ticks.push(s.assets[0]!.volume);
    }
    day.push(s.assets[0]!.dayNotional / adv);
    absRet.push(Math.abs(s.assets[0]!.lnP - open));
  }
  return { day, ticks, absRet, state: s };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
  return n / Math.sqrt(da * db);
};

describe('volume', () => {
  it('never changes prices: same seed, same prices with or without the volume stream', () => {
    const a = stepMany(createWorld('v'), 3000).state;
    const legacy = createWorld('v');
    // a save from before volume existed: no volume fields at all
    const volumeKeys = ['vrng', 'volume', 'notional', 'dayVolume', 'dayNotional', 'cumVolume', 'heat'];
    const stripped = {
      ...legacy,
      assets: legacy.assets.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !volumeKeys.includes(k)))),
    } as unknown as WorldState;
    expect('volume' in stripped.assets[0]!).toBe(false);
    const b = stepMany(stripped, 3000).state;
    expect(b.assets.map((x) => x.lnP)).toEqual(a.assets.map((x) => x.lnP));
    expect(b.assets.map((x) => x.volume)).toEqual(a.assets.map((x) => x.volume)); // lazily seeded from the same key
  });

  it('is deterministic and survives a JSON round trip', () => {
    const a = stepMany(createWorld('v'), 2000).state;
    const re = JSON.parse(JSON.stringify(a)) as WorldState;
    expect(stepMany(re, 500).state).toEqual(stepMany(a, 500).state);
  });

  it('averages about the ADV that square-root impact uses', () => {
    const { day } = runDays(createWorld('adv', cfg()), 2000);
    expect(mean(day)).toBeGreaterThan(0.85);
    expect(mean(day)).toBeLessThan(1.2);
    for (const v of day) expect(v).toBeGreaterThan(0);
  });

  it('is busier on days with bigger price moves', () => {
    const { day, absRet } = runDays(createWorld('corr', cfg()), 1500);
    expect(corr(day, absRet)).toBeGreaterThan(0.25);
  });

  it('is quieter in a calm regime than in a crisis', () => {
    const calm = runDays(createWorld('r', cfg({ initialRegime: 'expansion' })), 600).day;
    const crisis = runDays(createWorld('r', cfg({ initialRegime: 'contraction' })), 600).day;
    expect(mean(crisis) / mean(calm)).toBeGreaterThan(1.3);
  });

  it('spikes on news jumps and decays after', () => {
    const c = cfg({ assets: [asset('A', { jumpsPerYear: 40, jumpUpMean: 0.06, jumpDownMean: 0.06 })] });
    let s = createWorld('jump', c);
    const base: number[] = [];
    const spikes: number[] = [];
    const after: number[] = [];
    let lastJump = -1e9;
    for (let k = 0; k < TPD * 600; k++) {
      const r = step(s);
      s = r.state;
      const v = s.assets[0]!.volume;
      if (r.events.some((e) => e.type === 'jump')) { spikes.push(v); lastJump = s.tick; }
      else if (s.tick - lastJump <= 3) after.push(v);
      else if (s.tick - lastJump > TPD) base.push(v);
    }
    expect(spikes.length).toBeGreaterThan(20);
    expect(mean(spikes) / mean(base)).toBeGreaterThan(8);
    expect(mean(after) / mean(base)).toBeGreaterThan(2);
  });

  it('prints nothing while halted and a burst at the reopen', () => {
    const c = cfg({ assets: [asset('A', { circuitBreaker: true })] });
    let s = createWorld('h', c);
    s = { ...s, assets: s.assets.map((a) => ({ ...a, haltUntil: 5, pending: 0.1 })) };
    const seen: number[] = [];
    for (let k = 0; k < 5; k++) { s = step(s).state; seen.push(s.assets[0]!.volume); }
    expect(seen.slice(0, 4)).toEqual([0, 0, 0, 0]);
    const typical = mean(runDays(createWorld('h', c), 50).ticks);
    expect(seen[4]!).toBeGreaterThan(10 * typical);
  });

  it('has an intraday U shape for stocks and trades flat for crypto', () => {
    const shape = (def: AssetDef) => {
      const { ticks } = runDays(createWorld('u', cfg({ assets: [def] })), 400);
      const edge: number[] = [], middle: number[] = [];
      ticks.forEach((v, k) => {
        const t = k % TPD;
        if (t < TPD / 8 || t >= (7 * TPD) / 8) edge.push(v);
        else if (t >= (3 * TPD) / 8 && t < (5 * TPD) / 8) middle.push(v);
      });
      return mean(edge) / mean(middle);
    };
    expect(shape(asset('S'))).toBeGreaterThan(1.8);
    const flat = shape(asset('C', { assetClass: 'crypto', qtyStep: 0, wCrypto: 0.6, wSector: 0 }));
    expect(flat).toBeGreaterThan(0.85);
    expect(flat).toBeLessThan(1.15);
  });

  it('keeps day and cumulative counters consistent, in whole shares for stocks', () => {
    let s = createWorld('c', cfg());
    let day = 0;
    let cum = 0;
    for (let k = 0; k < TPD * 3; k++) {
      const newDay = s.tick > 0 && s.tick % TPD === 0;
      s = step(s).state;
      const v = s.assets[0]!.volume;
      expect(Number.isInteger(v)).toBe(true);
      day = (newDay ? 0 : day) + v;
      cum += v;
      expect(s.assets[0]!.dayVolume).toBe(day);
      expect(s.assets[0]!.cumVolume).toBe(cum);
    }
    const q = quote(s, 'A');
    expect(q).toMatchObject({ volume: s.assets[0]!.volume, dayVolume: day, cumVolume: cum });
    expect(q.adv).toBeCloseTo(2e8 / q.price, 6);
    expect(volumes(s)).toEqual({ A: s.assets[0]!.volume });
  });

  it('adds player fills to the tape', () => {
    let s = openAccount(createWorld('f', cfg()), 'p1', 1e6);
    s = stepMany(s, 3).state;
    const without = step(s).state.assets[0]!;
    s = placeOrder(s, { playerId: 'p1', assetId: 'A', side: 'buy', type: 'market', qty: 1000 }).state;
    const withFill = step(s).state.assets[0]!;
    expect(withFill.volume - without.volume).toBe(1000);
    expect(withFill.cumVolume - without.cumVolume).toBe(1000);
  });
});
