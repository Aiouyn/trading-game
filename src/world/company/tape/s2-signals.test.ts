/**
 * Tape section 2 (informed trading, signals, backlog, faking), the rows that are unit-level in v1.7 (tape-company-building.md
 * re-targeted to Quant v1.7). Test names carry the Tape id. Seed sweeps and the rho legs run in scripts/balance/company-tape.ts.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../game';
import { advanceTo, companyOf, FOUNDER, founded, listedWorld } from '../b1fixture';
import { publicCompanyView } from '../views';
import { biasCorrect } from '../signals';

/** Seeded uniform stream (mulberry32), so the draws are reproducible. */
function uniforms(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal by Box-Muller on the seeded stream. */
function normals(seed: number, n: number): number[] {
  const u = uniforms(seed);
  const out: number[] = [];
  while (out.length < n) {
    const r = Math.sqrt(-2 * Math.log(1 - u()));
    const th = 2 * Math.PI * u();
    out.push(r * Math.cos(th), r * Math.sin(th));
  }
  return out.slice(0, n);
}

describe('Tape s2: signals, backlog and faking (unit rows)', () => {
  it('signal_bias_correct: consensus = centre x exp(-sigma^2/2); mean error over 100k draws within 0.1% of zero (SE about 0.013%)', () => {
    const sigma = 0.04, centre = 1000;
    const zs = normals(20261010, 100_000);
    let sum = 0;
    for (const z of zs) sum += biasCorrect(centre, sigma) * Math.exp(sigma * z) / centre - 1;
    const meanErr = sum / zs.length;
    expect(biasCorrect(centre, sigma)).toBeCloseTo(centre * Math.exp(-(sigma * sigma) / 2), 12);
    expect(Math.abs(meanErr)).toBeLessThan(0.001);
  });

  it('signal_cadence: a listed company prints a weekly signal every 5 game days, none in between (exact spacing)', () => {
    const { g } = listedWorld('cadence-1');
    advanceTo(g, 240);
    const days = publicCompanyView(companyOf(g), 240).signals.map((s) => s.day);
    expect(days.length).toBeGreaterThan(3);
    for (let i = 1; i < days.length; i++) expect(days[i]! - days[i - 1]!).toBe(5);
  });

  it('private_no_signals: a Seed private company over 2 quarters has no weekly signals (signals empty)', () => {
    const { g } = founded('priv-1');
    advanceTo(g, 130);
    const v = publicCompanyView(companyOf(g), 130);
    expect(v.signals).toEqual([]);
    expect(v.window).toBeUndefined();
  });

  it('signal_public_only: twins with identical public fields and different private cash give an identical public view', () => {
    const { g } = listedWorld('public-1');
    const c = companyOf(g);
    const day = 230;
    const before = JSON.stringify(publicCompanyView(c, day));
    c.cash = c.cash + 987_654;
    c.qtd.revenue = c.qtd.revenue + 1234;
    expect(JSON.stringify(publicCompanyView(c, day))).toBe(before);
  });

  it('no_hidden_strategy_leak: the public view does not change with the founder cash or a resting founder order (window open)', () => {
    const { g, assetId } = listedWorld('leak-1');
    const c = companyOf(g);
    advanceTo(g, 205); // F = 192, so the window is open 194..213
    const before = JSON.stringify(publicCompanyView(c, 205));
    const placed = applyCommand(g, FOUNDER, { type: 'order.place', order: { assetId, side: 'buy', type: 'limit', limitPrice: 0.0001, qty: 10, tif: 'gtc' } });
    expect(placed.ok, 'the founder rests an order in the open window').toBe(true);
    c.cash = c.cash + 987_654; // private founder cash
    expect(JSON.stringify(publicCompanyView(c, 205))).toBe(before);
  });

  it.skip('consensus_alpha1: SKIPPED (needs the bias-corrected report chain; the consensus cases are in company.test.ts)', () => {});
});
