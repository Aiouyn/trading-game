import { describe, expect, it } from 'vitest';
import { createWorld, step } from './sim';
import { DEFAULT_REGIMES, defaultConfig, gameConfig, normalizeLoadings } from './config';
import { DEFAULT_CATALYSTS, earningsCalendar, earningsInfo } from './catalysts';
import type { AssetDef, RegimeDef, RegimeId, StepEvent, WorldConfig, WorldState } from './types';

const TPD = 24;

function regimes(): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, jumpUpShift: 0, meanDays: 1e12 };
  }
  return out;
}

function stock(id: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector: 's', initialPrice: 50, sharesOutstanding: 1e8,
    vol: 0.3, drift: 0, cycleBeta: 1, wMarket: 0.55, wSector: 0.45, wCrypto: 0,
    halfLifeDays: 20, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, spreadBps: 10, advNotional: 2e8, qtyStep: 1, ...extra,
  });
}

function cfg(over: Partial<WorldConfig> = {}): WorldConfig {
  const assets = Array.from({ length: 8 }, (_, i) => stock(`S${i}`));
  return defaultConfig({ ticksPerDay: TPD, regimes: regimes(), indices: [], assets, catalysts: DEFAULT_CATALYSTS, ...over });
}

function run(s: WorldState, ticks: number): { state: WorldState; events: StepEvent[] } {
  const events: StepEvent[] = [];
  for (let k = 0; k < ticks; k++) {
    const r = step(s);
    s = r.state;
    for (const e of r.events) events.push(e);
  }
  return { state: s, events };
}

describe('catalysts', () => {
  it('leave prices untouched when config.catalysts is unset', () => {
    const base = cfg({ catalysts: undefined });
    const a = run(createWorld('c1', base), TPD * 30).state;
    const b = run(createWorld('c1', defaultConfig({ ...base })), TPD * 30).state;
    expect(a.assets.map((x) => x.lnP)).toEqual(b.assets.map((x) => x.lnP));
    expect(a.assets[0]!.nextEarnings).toBeUndefined();
  });

  it('are deterministic and survive a JSON save', () => {
    const w0 = createWorld('c2', cfg());
    const mid = run(w0, TPD * 40).state;
    const reloaded = JSON.parse(JSON.stringify(mid)) as WorldState;
    const a = run(mid, TPD * 40);
    const b = run(reloaded, TPD * 40);
    expect(a.state.assets.map((x) => x.lnP)).toEqual(b.state.assets.map((x) => x.lnP));
    expect(a.events).toEqual(b.events);
  });

  it('schedule about one report per stock per quarter, each with a preview first', () => {
    const days = 252;
    const { events } = run(createWorld('c3', cfg()), TPD * days);
    const earnings = events.filter((e) => e.type === 'earnings');
    const previews = events.filter((e) => e.type === 'preview');
    // 8 stocks x ~4 reports a year (the first lands within the first quarter)
    expect(earnings.length).toBeGreaterThanOrEqual(8 * 3);
    expect(earnings.length).toBeLessThanOrEqual(8 * 5);
    for (const e of earnings) {
      const pv = previews.find((p) => p.assetId === e.assetId && p.tick < e.tick && e.tick - p.tick <= (DEFAULT_CATALYSTS.previewDays + 1) * TPD);
      expect(pv, `preview before ${e.assetId} @${e.tick}`).toBeDefined();
    }
    // reports land on the first tick of a day (before the open)
    for (const e of earnings) expect((e.tick - 1) % TPD).toBe(0);
  });

  it('give consensus a real but imperfect edge, and rumors are mostly right', () => {
    let agree = 0, n = 0, rumorsRight = 0, rumors = 0;
    for (const seed of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) {
      const { events } = run(createWorld(seed, cfg()), TPD * 504);
      const lastRumor = new Map<string, 1 | -1>();
      for (const e of events) {
        if (e.type === 'rumor') lastRumor.set(e.assetId, e.direction);
        if (e.type !== 'earnings') continue;
        if (Math.abs(e.consensus) > 0.3) { n++; if (Math.sign(e.consensus) === Math.sign(e.surprise)) agree++; }
        const r = lastRumor.get(e.assetId);
        if (r) { rumors++; if (r === Math.sign(e.surprise)) rumorsRight++; lastRumor.delete(e.assetId); }
      }
    }
    expect(n).toBeGreaterThan(80);
    expect(agree / n).toBeGreaterThan(0.6);
    expect(agree / n).toBeLessThan(0.9);
    expect(rumors).toBeGreaterThan(40);
    expect(rumorsRight / rumors).toBeGreaterThan(0.55);
    expect(rumorsRight / rumors).toBeLessThan(0.85);
  });

  it('gap the price at the open by the report move, then drift the same way', () => {
    let s = createWorld('c5', cfg({ assets: [stock('A', { vol: 0.0001 })] }));
    let found = false;
    for (let k = 0; k < TPD * 140 && !found; k++) {
      const before = s.assets[0]!.lnP;
      const r = step(s);
      s = r.state;
      const e = r.events.find((x) => x.type === 'earnings');
      if (!e || e.type !== 'earnings') continue;
      found = true;
      const gap = Math.exp(s.assets[0]!.lnP - before) - 1;
      expect(gap).toBeCloseTo(e.move, 2);
      const after = s.assets[0]!.lnP;
      s = run(s, TPD * DEFAULT_CATALYSTS.peadDays).state;
      const drift = s.assets[0]!.lnP - after;
      expect(Math.sign(drift)).toBe(Math.sign(e.move));
      expect(Math.abs(drift)).toBeCloseTo(Math.abs(Math.log(1 + e.move)) * DEFAULT_CATALYSTS.peadShare, 2);
    }
    expect(found).toBe(true);
  });

  it('expose what the public knows: date, consensus after the preview, never the surprise', () => {
    let s = createWorld('c6', cfg());
    s = run(s, TPD * 2).state;
    const info = earningsInfo(s, 'S0')!;
    expect(info).not.toBeNull();
    expect(info.daysAway).toBeGreaterThanOrEqual(0);
    expect(Object.keys(info)).not.toContain('surprise');
    // advance to the preview day
    while (earningsInfo(s, 'S0')!.daysAway > DEFAULT_CATALYSTS.previewDays - 1) s = run(s, TPD).state;
    expect(earningsInfo(s, 'S0')!.consensus).not.toBeNull();
    const cal = earningsCalendar(s, 10);
    expect(cal.length).toBeGreaterThan(0);
    for (let i = 1; i < cal.length; i++) expect(cal[i]!.daysAway).toBeGreaterThanOrEqual(cal[i - 1]!.daysAway);
  });

  it('only stocks report, and gameConfig turns catalysts on', () => {
    const g = gameConfig();
    expect(g.catalysts).toBeDefined();
    const s = run(createWorld('c7', g), 3).state;
    expect(earningsInfo(s, 'AUC')).toBeNull();
    expect(earningsInfo(s, 'GOLD')).toBeNull();
    expect(earningsInfo(s, 'HLCN')).not.toBeNull();
  });
});
