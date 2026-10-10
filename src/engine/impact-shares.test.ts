import { describe, expect, it } from 'vitest';
import { DEFAULT_ECOLOGY, IMPACT_NET_SHARE, PENSION_MAX_ADV, impactShares } from './ecology';

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
    for (const p of parts) expect(Math.abs(p)).toBeLessThanOrEqual(Math.abs(I) + 1e-15);
    // on the cancelling branch the sign follows the move, and the larger flow takes the larger share
    expect(Math.sign(parts[0]!)).toBe(Math.sign(I));
    expect(parts[0]!).toBeGreaterThan(parts[1]!);
  });

  it('stays bounded on both sides of the switch-over, and the parts sum to the impact exactly', () => {
    const I = 0.01;
    // net / gross = 0.25 exactly (the proportional branch): parts are I x / net, at most |I| / 0.25
    const atSwitch = impactShares(I, [1, -0.6]);
    expect(sum(atSwitch)).toBeCloseTo(I, 15);
    for (const p of atSwitch) expect(Math.abs(p)).toBeLessThanOrEqual(Math.abs(I) / IMPACT_NET_SHARE + 1e-12);
    // net / gross = 0.111 (the gross branch): parts are I |x| / gross, at most |I|
    const below = impactShares(I, [1, -0.8]);
    expect(sum(below)).toBeCloseTo(I, 15);
    for (const p of below) expect(Math.abs(p)).toBeLessThanOrEqual(Math.abs(I) + 1e-15);
  });

  it('gives zero parts when no one traded', () => {
    expect(impactShares(0.5, [0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('pension cap (V1-PHASE1 F16, derived)', () => {
  it('is the capacity knee spread over the window: sizes.pension / capacity / pensionDays', () => {
    const { sizes, capacity, pensionDays } = DEFAULT_ECOLOGY;
    expect(PENSION_MAX_ADV).toBeCloseTo(sizes.pension / capacity / pensionDays, 15);
    expect(DEFAULT_ECOLOGY.pensionMaxAdv).toBe(PENSION_MAX_ADV);
    // 7.5 / 3 / 3 = 0.833: a window of pensionDays equal parts reaches the knee size / capacity (2.5 ADV) and no further
    expect(PENSION_MAX_ADV * pensionDays).toBeCloseTo(sizes.pension / capacity, 15);
  });
});
