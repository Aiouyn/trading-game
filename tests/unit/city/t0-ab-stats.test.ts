import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { abVerdict, median } from '../../e2e/city/ab-stats';

// QA follow-up on card 2: the T0 A/B must stay median-of-5. A mean slips through the gate unseen
// (QA: the mean mutant passes phone at 1.095; card 2's run 40602934708 phone: median 1.061, mean 1.082).
describe('T0 A/B verdict', () => {
  it('takes the median, not the mean (one slow outlier does not move it)', () => {
    expect(median([50, 49, 300, 48, 51])).toBe(50);
  });
  it('fails a branch whose median is over 1.1x even when its mean is under', () => {
    // main median 50 -> limit 55; pr median 56 (> 55) but pr mean 54.4 (< 55)
    const v = abVerdict([50, 50, 50, 50, 50], [56, 56, 56, 52, 52]);
    expect(v).toMatchObject({ mMain: 50, mPr: 56, limit: 55, pass: false });
  });
  it('passes a branch whose median is under 1.1x even when one outlier lifts its mean over', () => {
    const v = abVerdict([50, 50, 50, 50, 50], [52, 52, 52, 52, 90]);
    expect(v).toMatchObject({ mPr: 52, pass: true });
  });
  it('refuses an even sample count (no silent average of the middle two)', () => {
    expect(() => median([1, 2, 3, 4])).toThrow();
  });
});

// The verdict must come from abVerdict: the spec may not sum or average samples itself, and its
// gate must compare abVerdict's mPr with abVerdict's limit.
describe('t0-ab.spec.ts uses abVerdict for the gate', () => {
  const src = readFileSync(join(__dirname, '../../e2e/city/t0-ab.spec.ts'), 'utf8');
  it('takes mPr and limit from abVerdict', () => {
    expect(src).toMatch(/const \{[^}]*\bmPr\b[^}]*\blimit\b[^}]*\} = abVerdict\(of\('main'\), of\('pr'\)\)/);
    expect(src).toMatch(/expect\(mPr\b[^;]*\.toBeLessThanOrEqual\(limit\)/);
  });
  it('does no arithmetic of its own on the samples (no reduce, sum, mean or median)', () => {
    expect(src.match(/\.reduce\(|\bmean\b|\bsum\b|const median\b|function median\b/g)).toBeNull();
  });
});
