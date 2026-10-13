import { describe, expect, it } from 'vitest';
import { UNIVERSE_VOL_BANDS, check, verdictOf, type Band } from './bands';

/**
 * The verdict rule of V1-PHASE1 F13 (scripts/ecology/gates.ts): a value with a standard error is PASS only when estimate ± 2 s.e.
 * lies wholly inside the band, FAIL only when wholly outside, and UNDECIDED when the interval straddles an edge. A point-only band
 * is PASS or FAIL. These are the numbers of V1-PHASE9 9C.4 (AUSD: 300 seeds, RMS 1.032, s.e. 0.154).
 */
describe('band verdicts (F13: estimate ± 2 s.e.)', () => {
  it('a point-only band is PASS inside and FAIL outside, both edges included', () => {
    expect(verdictOf(0.85, 0.85, 1.4)).toBe('PASS');
    expect(verdictOf(1.4, 0.85, 1.4)).toBe('PASS');
    expect(verdictOf(0.8, 0.85, 1.4)).toBe('FAIL');
    expect(verdictOf(Number.NaN, 0.85, 1.4)).toBe('FAIL');
  });

  it('an interval wholly inside is PASS; wholly outside is FAIL; straddling an edge is UNDECIDED', () => {
    expect(verdictOf(1.0, 0.85, 1.4, 0.05)).toBe('PASS'); // [0.90, 1.10] inside [0.85, 1.4]
    expect(verdictOf(0.5, 0.85, 1.4, 0.05)).toBe('FAIL'); // [0.40, 0.60] wholly below
    expect(verdictOf(0.86, 0.85, 1.4, 0.05)).toBe('UNDECIDED'); // [0.76, 0.96] straddles 0.85
  });

  it('AUSD at 300 seeds (RMS 1.032, s.e. 0.154) is UNDECIDED under the general and the stablecoin class band', () => {
    expect(verdictOf(1.032, 0.85, 1.4, 0.154)).toBe('UNDECIDED'); // [0.724, 1.340] straddles 0.85
    expect(verdictOf(1.032, 0.6, 1.1, 0.154)).toBe('UNDECIDED'); // [0.724, 1.340] straddles 1.1
  });

  it('the stablecoin class band is applied to AUSD (the ruling of V1-PHASE9 9C.4)', () => {
    expect(UNIVERSE_VOL_BANDS.AUSD).toMatchObject({ min: 0.6, max: 1.1 });
  });

  it('check() gives each band its verdict, and a standard error changes only the bands that have one', () => {
    const bands: Band[] = [
      { id: 'vol_ratio_rms:AUSD', label: 'AUSD', min: 0.6, max: 1.1, source: 'test' },
      { id: 'gx_cagr_median', label: 'GX', min: 0, max: 0.12, source: 'test' },
    ];
    const out = check(bands, { 'vol_ratio_rms:AUSD': 1.032, gx_cagr_median: 0.05 }, { 'vol_ratio_rms:AUSD': 0.154 });
    expect(out[0]!.verdict).toBe('UNDECIDED');
    expect(out[0]!.pass).toBe(false);
    expect(out[1]!.verdict).toBe('PASS');
    expect(out[1]!.se).toBeUndefined();
  });
});
