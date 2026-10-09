import { describe, expect, it } from 'vitest';
import { createWorld, stepMany } from './sim';
import { jumpCompensator } from './drift';
import { DEFAULT_ASSETS, defaultConfig } from './config';
import { universeConfig } from './universe';
import type { WorldConfig } from './types';

// Ported from engine-staging (Quant's momentum fix). The legacy model: 80% of every shock and jump is
// permanent, jumps print in full and the leftover reverts to value, so past 63-day winners gave back
// their overshoot (rank IC ≈ −0.05). defaultConfig() stays legacy; the game (universeConfig) runs FIXED.
const LEGACY: Partial<WorldConfig> = { permanentShare: 0.8, jumpPermanent: 0.8, jumpImmediate: 1, jumpCompensation: false };
const FIXED: Partial<WorldConfig> = { permanentShare: 0.9, jumpPermanent: 1, jumpImmediate: 0.7, jumpCompensation: true };

/** Mean cross-sectional Spearman IC of 63-day past log return vs the next 21 days, stocks only. */
function rankIC(over: Partial<WorldConfig>, seeds: number, days: number): number {
  const cfg = defaultConfig({ ticksPerDay: 24, ...over });
  const st = cfg.assets.map((a, i) => (a.assetClass === 'stock' ? i : -1)).filter((i) => i >= 0);
  const rank = (x: number[]) => { const r = new Array<number>(x.length); x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]).forEach(([, i], j) => { r[i] = j; }); return r; };
  const ics: number[] = [];
  for (let k = 0; k < seeds; k++) {
    let s = createWorld(`ic-${k}`, cfg);
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
  it('63-day winners no longer reliably lose the next 21 days', { timeout: 240_000 }, () => {
    const fixed = rankIC(FIXED, 8, 1260);
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

  it('the game universe runs the fixed model', () => {
    const g = universeConfig();
    expect({ permanentShare: g.permanentShare, jumpPermanent: g.jumpPermanent, jumpImmediate: g.jumpImmediate, jumpCompensation: g.jumpCompensation }).toEqual(FIXED);
  });
});

describe('jumpCompensator', () => {
  it('is zero without jumps', () => {
    expect(jumpCompensator({ ...DEFAULT_ASSETS[0]!, jumpsPerYear: 0 }, 1)).toBe(0);
  });
  it('matches the Kou closed form λ·(p/(1−cηu) + (1−p)/(1+cηd) − 1) for Lumen Pharma', () => {
    const lmnp = DEFAULT_ASSETS.find((a) => a.id === 'LMNP')!;
    const expected = lmnp.jumpsPerYear * (lmnp.jumpUpProb / (1 - lmnp.jumpUpMean) + (1 - lmnp.jumpUpProb) / (1 + lmnp.jumpDownMean) - 1);
    expect(jumpCompensator(lmnp, 1)).toBeCloseTo(expected, 12);
  });
});
