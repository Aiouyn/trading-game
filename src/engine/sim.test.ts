import { describe, expect, it } from 'vitest';
import { createWorld, indexLevel, prices, quote, step, stepMany } from './sim';
import { DEFAULT_ASSETS, DEFAULT_REGIMES, defaultConfig, normalizeLoadings } from './config';
import type { AssetDef, RegimeDef, RegimeId, WorldConfig, WorldState } from './types';

/** Coarse clock for statistical tests: 24 ticks per game day. Calibration is per game year, so results carry over. */
const FAST = { ticksPerDay: 24 };

function frozenRegimes(overrides: Partial<RegimeDef> = {}): Record<RegimeId, RegimeDef> {
  const out = {} as Record<RegimeId, RegimeDef>;
  for (const [id, r] of Object.entries(DEFAULT_REGIMES) as [RegimeId, RegimeDef][]) {
    out[id] = { ...r, equityDrift: 0, volMult: 1, jumpMult: 1, jumpUpShift: 0, marketLoadMult: 1, idioMult: 1, meanDays: 1e12, ...overrides };
  }
  return out;
}

function testStock(id: string, sector: string, extra: Partial<AssetDef> = {}): AssetDef {
  return normalizeLoadings({
    id, name: id, assetClass: 'stock', sector, initialPrice: 100, sharesOutstanding: 1e6,
    vol: 0.3, drift: 0, cycleBeta: 1, wMarket: 0.55, wSector: 0.45, wCrypto: 0,
    halfLifeDays: 20, jumpsPerYear: 0, jumpUpMean: 0.04, jumpDownMean: 0.06, jumpUpProb: 0.5,
    floor: 0.01, circuitBreaker: false, ...extra,
  });
}

function dailyCloses(state: WorldState, days: number): { closes: Record<string, number[]>; state: WorldState } {
  const closes: Record<string, number[]> = {};
  const ids = state.config.assets.map((a) => a.id);
  for (const id of ids) closes[id] = [];
  const push = (s: WorldState) => s.assets.forEach((a, i) => closes[ids[i]!]!.push(a.lnP));
  push(state);
  let s = state;
  for (let d = 0; d < days; d++) {
    s = stepMany(s, s.config.ticksPerDay).state;
    push(s);
  }
  return { closes, state: s };
}

const diffs = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]!);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
  return n / Math.sqrt(da * db);
};

describe('determinism', () => {
  it('same seed gives the identical path', () => {
    const a = stepMany(createWorld('seed-1'), 3000).state;
    const b = stepMany(createWorld('seed-1'), 3000).state;
    expect(prices(a)).toEqual(prices(b));
    expect(a).toEqual(b);
  });

  it('different seeds diverge', () => {
    const a = stepMany(createWorld('seed-1'), 500).state;
    const b = stepMany(createWorld('seed-2'), 500).state;
    expect(prices(a)).not.toEqual(prices(b));
  });

  it('step is pure (input state is not mutated)', () => {
    const s0 = stepMany(createWorld('pure'), 10).state;
    const snapshot = JSON.stringify(s0);
    step(s0);
    step(s0);
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(step(s0).state).toEqual(step(s0).state);
  });

  it('a JSON save/load mid-run continues exactly', () => {
    const mid = stepMany(createWorld('save'), 1234).state;
    const loaded = JSON.parse(JSON.stringify(mid)) as WorldState;
    expect(stepMany(loaded, 2000).state).toEqual(stepMany(mid, 2000).state);
  });

  it('stepMany equals repeated step', () => {
    let s = createWorld('many');
    for (let i = 0; i < 800; i++) s = step(s).state;
    expect(stepMany(createWorld('many'), 800).state).toEqual(s);
  });

  it('removing an asset does not change any other asset (per-asset streams)', () => {
    const full = defaultConfig();
    const noSyn = defaultConfig({ assets: DEFAULT_ASSETS.filter((a) => a.id !== 'SYN') });
    const a = prices(stepMany(createWorld('streams', full), 3000).state);
    const b = prices(stepMany(createWorld('streams', noSyn), 3000).state);
    delete a.SYN;
    expect(b).toEqual(a);
  });
});

describe('sanity', () => {
  it('two game years of the default universe stay finite and above floors', () => {
    const cfg = defaultConfig(FAST);
    let s = createWorld('sanity', cfg);
    for (let t = 0; t < 2 * 252 * cfg.ticksPerDay; t++) {
      s = step(s).state;
      if (t % 97 === 0) {
        s.assets.forEach((a, i) => {
          expect(Number.isFinite(a.lnP)).toBe(true);
          expect(Math.exp(a.lnP)).toBeGreaterThanOrEqual(cfg.assets[i]!.floor * 0.999999);
          expect(a.h).toBeGreaterThanOrEqual(cfg.garchMin);
          expect(a.h).toBeLessThanOrEqual(cfg.garchMax);
        });
      }
    }
  });

  it('GX starts at its base and quote() exposes price and fundamental', () => {
    const s = createWorld('gx');
    expect(indexLevel(s, 'GX')).toBeCloseTo(1000, 9);
    const q = quote(s, 'HLCN');
    expect(q.price).toBeCloseTo(182, 9);
    expect(q.fundamental).toBeCloseTo(182, 9);
    expect(q.halted).toBe(false);
  });

  it('rejects duplicate asset ids', () => {
    const a = testStock('A', 'x');
    expect(() => createWorld('dup', defaultConfig({ assets: [a, a], indices: [] }))).toThrow(/duplicate/);
  });
});

describe('calibration (frozen neutral regime)', () => {
  const assets = [
    testStock('A1', 'alpha'),
    testStock('A2', 'alpha'),
    testStock('B1', 'beta'),
    normalizeLoadings({ ...testStock('C1', 'crypto'), assetClass: 'crypto', vol: 0.8, wMarket: 0.25, wSector: 0, wCrypto: 0.75, halfLifeDays: 120 }),
  ];
  const cfg: WorldConfig = defaultConfig({ ...FAST, assets, indices: [], regimes: frozenRegimes() });
  const { closes } = dailyCloses(createWorld('calib', cfg), 252 * 12);

  it('realized vol is close to target (±15%)', () => {
    for (const a of assets) {
      const realized = sd(diffs(closes[a.id]!)) * Math.sqrt(252);
      expect(realized / a.vol).toBeGreaterThan(0.85);
      expect(realized / a.vol).toBeLessThan(1.15);
    }
  });

  it('correlation: same sector > cross sector > stock vs crypto', () => {
    const r = (x: string) => diffs(closes[x]!);
    const same = corr(r('A1'), r('A2'));
    const cross = corr(r('A1'), r('B1'));
    const toCrypto = corr(r('A1'), r('C1'));
    // theory: same = 0.55² + 0.45² = 0.505, cross = 0.55² = 0.30, crypto = 0.55 × 0.25 = 0.14
    expect(same).toBeGreaterThan(0.42);
    expect(same).toBeLessThan(0.6);
    expect(cross).toBeGreaterThan(0.22);
    expect(cross).toBeLessThan(0.38);
    expect(toCrypto).toBeGreaterThan(0.05);
    expect(toCrypto).toBeLessThan(0.23);
    expect(same).toBeGreaterThan(cross);
    expect(cross).toBeGreaterThan(toCrypto);
  });

  it('daily returns are fat-tailed (excess kurtosis > 0)', () => {
    const r = diffs(closes.A1!);
    const m = mean(r);
    const v = mean(r.map((x) => (x - m) ** 2));
    const k = mean(r.map((x) => (x - m) ** 4)) / (v * v);
    expect(k).toBeGreaterThan(3.1);
  });
});

describe('mean reversion', () => {
  it('the price-to-value gap halves in about one half-life', () => {
    const a = testStock('M', 'm', { vol: 1e-6, halfLifeDays: 20 });
    const cfg = defaultConfig({ ...FAST, assets: [a], indices: [], regimes: frozenRegimes() });
    const s0 = createWorld('mr', cfg);
    const shocked: WorldState = { ...s0, assets: [{ ...s0.assets[0]!, lnP: s0.assets[0]!.lnV - 0.2 }] };
    const s1 = stepMany(shocked, 20 * cfg.ticksPerDay).state;
    const gap = s1.assets[0]!.lnV - s1.assets[0]!.lnP;
    expect(gap).toBeGreaterThan(0.09);
    expect(gap).toBeLessThan(0.11);
  });
});

describe('jumps', () => {
  it('arrive at the configured rate with Kou sizes (down 6%, up 4%)', () => {
    const a = testStock('J', 'j', { vol: 0.01, jumpsPerYear: 50 });
    const cfg = defaultConfig({ ...FAST, assets: [a], indices: [], regimes: frozenRegimes() });
    const years = 20;
    const { events } = stepMany(createWorld('jumps', cfg), years * 252 * cfg.ticksPerDay);
    const jumps = events.filter((e) => e.type === 'jump') as { logSize: number }[];
    const expected = 50 * years;
    expect(Math.abs(jumps.length - expected)).toBeLessThan(4 * Math.sqrt(expected));
    const ups = jumps.filter((j) => j.logSize > 0).map((j) => j.logSize);
    const downs = jumps.filter((j) => j.logSize < 0).map((j) => -j.logSize);
    expect(mean(ups)).toBeGreaterThan(0.034);
    expect(mean(ups)).toBeLessThan(0.046);
    expect(mean(downs)).toBeGreaterThan(0.052);
    expect(mean(downs)).toBeLessThan(0.068);
  });
});

describe('regimes', () => {
  it('visit all four states, only along allowed edges, with plausible lengths', () => {
    const a = testStock('R', 'r');
    const cfg = defaultConfig({ ticksPerDay: 1, assets: [a], indices: [] });
    const days = 252 * 200;
    const { state, events } = stepMany(createWorld('regimes', cfg), days);
    const seen = new Set(state.regimeLog.map((c) => c.to));
    expect(seen).toEqual(new Set(['expansion', 'overheating', 'contraction', 'recovery']));
    for (const c of state.regimeLog) expect(cfg.regimes[c.from].next[c.to]).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'regime').length).toBe(state.regimeLog.length);
    // mean cycle ~ 0.8·(567+189) + 0.2·567 + 189 + 189 (+ small recurrences) ≈ 1,000 days
    const cycles = days / state.regimeLog.filter((c) => c.to === 'contraction').length;
    expect(cycles).toBeGreaterThan(600);
    expect(cycles).toBeLessThan(1600);
  });

  it('contraction pulls equity prices down on average', () => {
    const assets = Array.from({ length: 8 }, (_, i) => testStock(`S${i}`, `s${i % 3}`));
    const regimes = frozenRegimes();
    regimes.contraction = { ...DEFAULT_REGIMES.contraction, meanDays: 1e12 };
    const cfg = defaultConfig({ ...FAST, assets, indices: [], regimes, initialRegime: 'contraction' });
    const s = stepMany(createWorld('bear', cfg), 252 * cfg.ticksPerDay).state;
    const avgLogRet = mean(s.assets.map((a, i) => a.lnP - Math.log(assets[i]!.initialPrice)));
    expect(avgLogRet).toBeLessThan(-0.1);
  });
});

describe('GARCH', () => {
  it('a big day raises h, calm days decay it toward 1', () => {
    const a = testStock('G', 'g', { vol: 0.2 });
    const cfg = defaultConfig({ ...FAST, assets: [a], indices: [], regimes: frozenRegimes() });
    let s = stepMany(createWorld('garch', cfg), cfg.ticksPerDay - 1).state;
    // inject a 10% down day (≈ 8 daily sd) right before the close
    s = { ...s, assets: [{ ...s.assets[0]!, lnP: s.assets[0]!.lnOpen - 0.1 }] };
    s = stepMany(s, 2).state; // crosses the day boundary
    const hAfter = s.assets[0]!.h;
    expect(hAfter).toBeGreaterThan(4);
    s = stepMany(s, 100 * cfg.ticksPerDay).state;
    expect(s.assets[0]!.h).toBeLessThan(2);
  });
});

describe('circuit breaker', () => {
  it('halts on a 15% move, freezes the price, reopens with the accumulated gap', () => {
    const a = testStock('H', 'h', { circuitBreaker: true, vol: 0.3 });
    const cfg = defaultConfig({ assets: [a], indices: [], regimes: frozenRegimes() });
    let s = createWorld('halt', cfg);
    s = { ...s, assets: [{ ...s.assets[0]!, lnP: s.assets[0]!.lnOpen + Math.log(0.84) }] };
    const r = step(s);
    expect(r.events.some((e) => e.type === 'halt')).toBe(true);
    const frozen = r.state.assets[0]!.lnP;
    let t = r.state;
    for (let k = 0; k < cfg.haltTicks - 1; k++) {
      t = step(t).state;
      expect(t.assets[0]!.lnP).toBe(frozen);
      expect(quote(t, 'H').halted).toBe(true);
    }
    const reopen = step(t);
    expect(reopen.events.some((e) => e.type === 'reopen')).toBe(true);
    expect(reopen.state.assets[0]!.haltUntil).toBe(-1);
    expect(reopen.state.assets[0]!.lnP).not.toBe(frozen);
    // halts at most once per day
    const rest = stepMany(reopen.state, 300);
    expect(rest.events.filter((e) => e.type === 'halt').length).toBe(0);
  });
});
