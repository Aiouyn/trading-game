import { describe, expect, it } from 'vitest';
import { impactShares } from './ecology';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('impactShares (explainMove cause split, V1-PHASE1 E)', () => {
  it('parts sum to the impact exactly on a normal day, in proportion to each flow', () => {
    const I = 0.0123;
    const flows = [2, 1, -0.5, 0.25, 0];
    const parts = impactShares(I, flows);
    expect(sum(parts)).toBeCloseTo(I, 15);
    // a flow's share is I x / net, so the ratio of two parts is the ratio of their flows
    expect(parts[0]! / parts[1]!).toBeCloseTo(2, 12);
    expect(parts[4]).toBe(0);
  });

  it('keeps every part bounded when the day nearly cancels (the pension 73.9 case)', () => {
    // pension +2 ADV, value -1.99 ADV: net 0.01 ADV, gross 3.99. The old split gave I x 2 / 0.01 = 200 I.
    const I = Math.sign(0.01) * 0.5 * Math.sqrt(0.01);
    const parts = impactShares(I, [2, -1.99, 0, 0, 0]);
    expect(sum(parts)).toBeCloseTo(I, 15);
    for (const p of parts) expect(Math.abs(p)).toBeLessThanOrEqual(5 * Math.abs(I) + 1e-15);
    // the larger buyer takes the larger share, and the seller a negative one, as its flow
    expect(parts[0]!).toBeGreaterThan(0);
    expect(parts[1]!).toBeLessThan(0);
    expect(parts[0]!).toBeGreaterThan(-parts[1]!);
  });

  it('gives a seller a part of its own sign on both sides of the switch-over (the sign-blind case)', () => {
    // A seller (-0.6 or -0.8 against a buyer of +1) on a buying day (I > 0): its part is negative in both branches.
    // The old gross split gave the -0.8 seller +0.44 I, while the -0.6 seller (proportional) got -1.5 I.
    const I = 0.01;
    const atSwitch = impactShares(I, [1, -0.6]);
    const below = impactShares(I, [1, -0.8]);
    expect(atSwitch[1]!).toBeLessThan(0);
    expect(below[1]!).toBeLessThan(0);
    expect(sum(below)).toBeCloseTo(I, 15);
    for (const p of below) expect(Math.abs(p)).toBeLessThanOrEqual(5 * Math.abs(I) + 1e-15);
  });

  it('is continuous across the switch-over: flows either side of IMPACT_NET_SHARE x gross split the same way', () => {
    const I = 0.01;
    const eps = 1e-9;
    // net / gross = 0.25 exactly at -0.6 (net 0.4, gross 1.6); nudge the seller either side of it
    const lo = impactShares(I, [1, -0.6 - eps]);
    const hi = impactShares(I, [1, -0.6 + eps]);
    for (let k = 0; k < 2; k++) expect(Math.abs(lo[k]! - hi[k]!)).toBeLessThan(1e-7);
    expect(sum(impactShares(I, [1, -0.6]))).toBeCloseTo(I, 15);
    // the same at the proportional branch: parts are I x / net, bounded by 4 |I|
    for (const p of impactShares(I, [1, -0.6])) expect(Math.abs(p)).toBeLessThanOrEqual(4 * Math.abs(I) + 1e-12);
  });

  it('sign of every part follows its flow, for a buying day and a selling day alike', () => {
    // the impact has the sign of the net flow (ecologyDay: I = sgn(net) x ...), so that is the case tested
    for (const flows of [[1, -0.8, 0.3], [1, -1.6], [-1, 0.1, 0.2], [2, -1.99, -0.02], [1, -0.6], [1, -0.8]]) {
      const net = flows.reduce((a, b) => a + b, 0);
      const I = Math.sign(net) * 0.02;
      const parts = impactShares(I, flows);
      expect(sum(parts)).toBeCloseTo(I, 15);
      flows.forEach((x, k) => expect(Math.sign(parts[k]!)).toBe(Math.sign(x)));
    }
  });

  it('gives zero parts when no one traded, and sums exactly on a zero-net day', () => {
    expect(impactShares(0.5, [0, 0, 0])).toEqual([0, 0, 0]);
    const I = 0.03;
    const even = impactShares(I, [1, -1]);
    expect(sum(even)).toBeCloseTo(I, 15);
    expect(even[0]!).toBeGreaterThan(0);
    expect(even[1]!).toBeLessThan(0);
  });
});
