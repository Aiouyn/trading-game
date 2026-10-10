/**
 * Tape section 2, the noise and cancellation rows of the v1.7 signal chain (tape-company-building.md section 3.4, Quant v1.7
 * G17 and G20). The reporting noise is drawn once per filing (G20), so every weekly report in a quarter carries the same
 * draw; the non-conversion allowance is the floor of c_s q over q on the orders actually cancelled (G17). Test names carry
 * the Tape id. Layer: U (unit), on the engine's own draw and reversal functions.
 */
import { describe, expect, it } from 'vitest';
import { Rng, seedStream } from '@/engine';
import { COMPANY } from '@/content/company';
import { noiseFor } from '../signals';
import { reversal } from '../filings';
import type { Company } from '../types';

/** The standard normal CDF (Abramowitz and Stegun 7.1.26 via erf), accurate to about 1e-7. */
function phi(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** A company stub with only the fields the noise draw reads. */
function stub(filingCount: number): Company {
  return { filingCount, noise: null } as unknown as Company;
}

type Resolved = Parameters<typeof reversal>[0][number];
function order(qty: number, shipped: number, cs: number, lift = 1): Resolved {
  return { qty, shipped, cs, lift, reportedSig: 0 } as unknown as Resolved;
}

describe('Tape s2: noise draws and cancellation allowance (G17, G20)', () => {
  it('signal_noise: 10k quarter draws per stream are normal with the stated sigma (mean within 4 SE, sd within 3%, KS p > 0.01)', () => {
    const rng = new Rng(seedStream('noise-stats', 'co:sig:tape'));
    const sigma = COMPANY.signals.sigRevenue;
    const n = 10_000;
    const xs: number[] = [];
    for (let q = 1; q <= n; q++) xs.push(noiseFor(stub(q), rng).eRevenue);
    const mean = xs.reduce((s, x) => s + x, 0) / n;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
    expect(Math.abs(mean)).toBeLessThan(4 * sigma / Math.sqrt(n));
    expect(Math.abs(sd / sigma - 1)).toBeLessThan(0.03);
    // Kolmogorov-Smirnov against N(0, sigma): the 1% critical value is 1.628 / sqrt(n)
    const sorted = [...xs].sort((a, b) => a - b);
    let dmax = 0;
    sorted.forEach((x, i) => {
      const f = phi(x / sigma);
      dmax = Math.max(dmax, Math.abs((i + 1) / n - f), Math.abs(f - i / n));
    });
    expect(dmax).toBeLessThan(1.628 / Math.sqrt(n));
  });

  it('signal_noise (once per quarter, G20): every report in a quarter carries the same draw and the stream is not consumed again', () => {
    const rng = new Rng(seedStream('noise-q', 'co:sig:q'));
    const c = stub(3);
    const first = noiseFor(c, rng);
    const state = rng.state();
    for (let k = 0; k < 5; k++) expect(noiseFor(c, rng)).toBe(first);
    expect(rng.state()).toEqual(state);
    // a new filing (the next quarter) draws afresh
    c.filingCount = 4;
    const next = noiseFor(c, rng);
    expect(next).not.toBe(first);
    expect(next.eRevenue).not.toBe(first.eRevenue);
  });

  it('signal_noise (streams): a company draws only from its own stream, so another company draws do not move it', () => {
    const seed = 'noise-indep';
    const a1 = new Rng(seedStream(seed, 'co:sig:A'));
    const a2 = new Rng(seedStream(seed, 'co:sig:A'));
    const b = new Rng(seedStream(seed, 'co:sig:B'));
    // B's stream is used heavily in one world and not at all in the other; A's draws must agree
    for (let k = 0; k < 500; k++) noiseFor(stub(k + 1), b);
    const withB = Array.from({ length: 10 }, (_, k) => noiseFor(stub(k + 1), a1).eRevenue);
    const withoutB = Array.from({ length: 10 }, (_, k) => noiseFor(stub(k + 1), a2).eRevenue);
    expect(withB).toEqual(withoutB);
    // and the two companies' streams are different
    expect(noiseFor(stub(1), new Rng(seedStream(seed, 'co:sig:A'))).eRevenue)
      .not.toBe(noiseFor(stub(1), new Rng(seedStream(seed, 'co:sig:B'))).eRevenue);
  });

  it('npc_cancel_deterministic: the same orders give the same non-conversion twice; no rng is consumed; the NPC loses floor(c_s q) of each order', () => {
    const cs = 0.25;
    const qtys = [10, 30, 60, 260, 1000];
    const orders = qtys.map((q) => order(q, q - Math.floor(cs * q), cs));
    const first = reversal(orders, { 0: 1 }, { 0: 1 });
    const second = reversal(orders, { 0: 1 }, { 0: 1 });
    expect(second).toEqual(first);
    for (const q of qtys) {
      const single = reversal([order(q, q - Math.floor(cs * q), cs)], { 0: 1 }, { 0: 1 });
      expect(single.nonConversion).toBeCloseTo(Math.floor(cs * q) / q, 12);
    }
  });

  it('reanchor_reversal_excess_only: non-conversion at c_s gives X = 0 and R = 0; c_s + delta gives X = delta x lift; a fully shipped order gives 0', () => {
    const cs = 0.25;
    const at = reversal([order(1000, 750, cs)], { 0: 1 }, { 0: 1000 });
    expect(at.excessLift).toBeCloseTo(0, 12);
    expect(at.repayment).toBeCloseTo(0, 12);
    // non-conversion 0.30 against the allowance 0.25: the excess is 0.05 of the lift
    const over = reversal([order(1000, 700, cs, 2)], { 0: 1 }, { 0: 1000 });
    expect(over.excessLift).toBeCloseTo(0.05 * 2, 12);
    expect(over.repayment).toBeGreaterThan(0);
    const shipped = reversal([order(1000, 1000, cs)], { 0: 1 }, { 0: 1000 });
    expect(shipped.excessLift).toBe(0);
    expect(shipped.repayment).toBe(0);
  });
});
