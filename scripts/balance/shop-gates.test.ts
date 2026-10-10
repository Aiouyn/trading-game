import { describe, expect, it } from 'vitest';
import { GATES, LADDER, failures, inBand, median, summarize, type PaybackRow } from './shop-gates-rules';

/** Rows for one style with the payback set to a ratio of the ladder on every tier, `seeds` times each. */
function styleRows(style: string, ratio: number, seeds = 3): PaybackRow[] {
  const out: PaybackRow[] = [];
  for (let s = 0; s < seeds; s++) LADDER.forEach((l, i) => out.push({ style, tier: i + 1, payback: l * ratio }));
  return out;
}

/** A passing set of rows: every gated style at the middle of its band, reference styles at 1.5x. */
function passingRows(): PaybackRow[] {
  return [
    ...styleRows('average', 1.0),
    ...styleRows('excellent', 0.75),
    ...styleRows('neglected', 2.5),
    ...styleRows('casual', 1.5),
    ...styleRows('idle', 1.5),
    ...styleRows('managed', 1.5),
  ];
}

describe('shop gates: band logic', () => {
  it('median takes the middle value, and the mean of the two middles for an even count', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it('a band includes its edges and nothing outside them', () => {
    expect(inBand(0.9, 0.9, 1.1)).toBe(true);
    expect(inBand(1.1, 0.9, 1.1)).toBe(true);
    expect(inBand(0.899, 0.9, 1.1)).toBe(false);
    expect(inBand(1.101, 0.9, 1.1)).toBe(false);
    expect(inBand(Number.NaN, 0.9, 1.1)).toBe(false);
  });

  it('summarize takes the ratio of each style median to the ladder value, tier by tier', () => {
    const avg = summarize(styleRows('average', 1.2)).get('average')!;
    LADDER.forEach((l, i) => {
      expect(avg.medians[i]).toBeCloseTo(l * 1.2, 9);
      expect(avg.ratios[i]).toBeCloseTo(1.2, 9);
    });
  });

  it('a set where every gate holds has no failures', () => {
    expect(failures(summarize(passingRows()))).toEqual([]);
  });

  it('excellent out of band on one tier fails, and names the style, the tier and the band', () => {
    const rows = passingRows().map((r) => (r.style === 'excellent' && r.tier === 4 ? { ...r, payback: r.payback * 0.6 } : r));
    const bad = failures(summarize(rows));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain('excellent');
    expect(bad[0]).toContain('tier 4');
    expect(bad[0]).toContain('0.45x');
    expect(bad[0]).toContain('0.7 to 0.8x');
  });

  it('neglected too fast on every tier fails on every tier (the stage A miss)', () => {
    const rows = passingRows().map((r) => (r.style === 'neglected' ? { ...r, payback: LADDER[r.tier - 1]! * 1.5 } : r));
    const bad = failures(summarize(rows));
    expect(bad.filter((b) => b.startsWith('neglected'))).toHaveLength(LADDER.length);
  });

  it('well-run at the lower and upper edges passes, just outside either side fails', () => {
    expect(failures(summarize(styleRows('average', 0.9).concat(passingRows().filter((r) => r.style !== 'average'))))).toEqual([]);
    expect(failures(summarize(styleRows('average', 1.11).concat(passingRows().filter((r) => r.style !== 'average')))).length).toBe(LADDER.length);
  });

  it('a gated style with no rows at all fails on every tier (NaN is out of band), not a silent pass', () => {
    const rows = passingRows().filter((r) => r.style !== 'excellent');
    const bad = failures(summarize(rows)).filter((b) => b.startsWith('excellent'));
    expect(bad).toHaveLength(LADDER.length);
    expect(bad.every((b) => b.includes('NaNx'))).toBe(true);
  });

  it('the gates are the lead ruling: well-run 0.9 to 1.1, excellent 0.7 to 0.8, neglected 2 to 3', () => {
    expect(GATES.map((g) => [g.style, g.lo, g.hi])).toEqual([
      ['average', 0.9, 1.1],
      ['excellent', 0.7, 0.8],
      ['neglected', 2, 3],
    ]);
  });
});
