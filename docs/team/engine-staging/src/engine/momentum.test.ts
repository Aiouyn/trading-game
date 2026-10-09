import { describe, expect, it } from 'vitest';
import { createWorld, jumpCompensator, quote, shockPrice, stepMany } from './sim';
import { DEFAULT_ASSETS, defaultConfig } from './config';
import type { WorldConfig } from './types';

// The model before the momentum fix: 80% of every shock and jump is permanent, jumps print in full
// and the leftover reverts to value, so past 63-day winners gave back their overshoot (rank IC ≈ −0.05).
const LEGACY: Partial<WorldConfig> = { permanentShare: 0.8, jumpPermanent: 0.8, jumpImmediate: 1, jumpCompensation: false };

/** Mean cross-sectional Spearman IC of 63-day past log return vs the next 21 days, stocks only. */
function rankIC(over: Partial<WorldConfig>, seeds: number, days: number): number {
  const cfg = defaultConfig({ ticksPerDay: 24, ...over });
  const st = cfg.assets.map((a, i) => (a.assetClass === 'stock' ? i : -1)).filter((i) => i >= 0);
  const rank = (x: number[]) => { const r = new Array<number>(x.length); x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).forEach(([, i], j) => { r[i] = j; }); return r; };
  const ics: number[] = [];
  for (let k = 0; k < seeds; k++) {
    let s = createWorld(`ic-${k}`, cfg, { ecology: 'off' }); // the live model
    const c: number[][] = st.map(() => []);
    const rec = () => st.forEach((i, j) => c[j]!.push(s.assets[i]!.lnP));
    rec();
    for (let d = 0; d < days; d++) { s = stepMany(s, cfg.ticksPerDay).state; rec(); }
    for (let d = 63; d + 21 <= days; d += 21) {
      const ra = rank(c.map((x) => x[d]! - x[d - 63]!)), rb = rank(c.map((x) => x[d + 21]! - x[d]!));
      const n = ra.length; let dd = 0;
      for (let i = 0; i < n; i++) dd += (ra[i]! - rb[i]!) ** 2;
      ics.push(1 - (6 * dd) / (n * (n * n - 1)));
    }
  }
  return ics.reduce((a, b) => a + b, 0) / ics.length;
}

describe('momentum fix: news underreacts, no built-in reversal', () => {
  it('63-day winners no longer reliably lose the next 21 days', { timeout: 120_000 }, () => {
    const fixed = rankIC({}, 8, 1260);
    const legacy = rankIC(LEGACY, 8, 1260);
    expect(fixed).toBeGreaterThan(-0.01);
    expect(fixed).toBeLessThan(0.08); // mild, not a money printer
    expect(legacy).toBeLessThan(fixed - 0.03);
  });

  it('a save made before the fix keeps its old market (missing fields mean the legacy model)', () => {
    const bare = defaultConfig({ ticksPerDay: 24, permanentShare: 0.8 });
    delete bare.jumpPermanent; delete bare.jumpImmediate; delete bare.jumpCompensation;
    const explicit = defaultConfig({ ticksPerDay: 24, ...LEGACY });
    const a = stepMany(createWorld('old-save', bare), 24 * 60).state;
    const b = stepMany(createWorld('old-save', explicit), 24 * 60).state;
    expect(a.assets.map((x) => x.lnP)).toEqual(b.assets.map((x) => x.lnP));
  });
});

describe('jumpCompensator', () => {
  it('is zero without jumps', () => {
    expect(jumpCompensator({ ...DEFAULT_ASSETS[0]!, jumpsPerYear: 0 }, 1)).toBe(0);
  });
  it('matches the Kou closed form λ·(p/(1−cηu) + (1−p)/(1+cηd) − 1) for Lumen Pharma', () => {
    const lmnp = DEFAULT_ASSETS.find((a) => a.id === 'LMNP')!;
    expect(jumpCompensator(lmnp, 1)).toBeCloseTo(6 * (0.5 / 0.88 + 0.5 / 1.18 - 1), 12);
  });
});

describe('shockPrice (test-only)', () => {
  it('moves one price by pct, leaves value and the input state alone', () => {
    const s0 = stepMany(createWorld('shock', defaultConfig({ ticksPerDay: 24 })), 24).state;
    const before = JSON.stringify(s0);
    const s1 = shockPrice(s0, 'HLCN', -0.015);
    expect(JSON.stringify(s0)).toBe(before);
    const i = s0.config.assets.findIndex((a) => a.id === 'HLCN');
    expect(Math.exp(s1.assets[i]!.lnP) / Math.exp(s0.assets[i]!.lnP)).toBeCloseTo(0.985, 12);
    expect(s1.assets[i]!.lnV).toBe(s0.assets[i]!.lnV);
    s1.assets.forEach((a, j) => { if (j !== i) expect(a).toBe(s0.assets[j]); });
    expect(quote(s1, 'HLCN').price).toBeCloseTo(quote(s0, 'HLCN').price * 0.985, 9);
  });
  it('rejects unknown assets and impossible moves', () => {
    const s0 = createWorld('shock', defaultConfig({ ticksPerDay: 24 }));
    expect(() => shockPrice(s0, 'NOPE', 0.1)).toThrow();
    expect(() => shockPrice(s0, 'HLCN', -1)).toThrow();
  });
});
