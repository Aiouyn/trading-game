import { describe, expect, it } from 'vitest';
import { defaultConfig, gameConfig } from './config';
import { universeConfig } from './universe';
import { earningsPairs, fitHalfLife, gapP95, halfLivesFor, LN2, median, shockedGaps, spearman } from './hunt-helpers';

/**
 * X2 · Price detached from fundamentals (Tape, hunts v1). Harness ids: value_gap_halflife, value_gap_p95,
 * earnings_surprise_ic. The value line lnV is what the price is pulled toward (kappa = ln2 / halfLifeDays), so a shock to
 * the price alone must decay with the asset's own half-life, and the gap |lnP − lnV| must stay a bounded, finite number.
 * The measurements live in hunt-helpers.ts (shared with scripts/balance/hunts.ts). Full 60-seed bands are in the
 * harness, news_drift (the free-lunch check on earnings_surprise_ic) is harness-only; these are the suite slices.
 */
const TPD = 24; // the gap is read per tick; 24 ticks a day resolves a half-life of a few days and keeps the suite fast
const SEEDS_LEGACY = ['tape-01', 'tape-02', 'tape-03'];

describe("X2 value gap: a price shock decays back to value at the asset's own half-life", () => {
  it('value_gap_halflife (defaultConfig, tape-01..03, all 17 assets): median half-life / def.halfLifeDays in [0.5, 1.5]; median in days <= 126', { timeout: 60_000 }, () => {
    const cfg = defaultConfig({ ticksPerDay: TPD });
    const fits = SEEDS_LEGACY.flatMap((seed) => halfLivesFor(cfg, seed));
    const ratios = fits.map((f) => f.ratio);
    const hls = fits.map((f) => f.days);
    const medRatio = median(ratios);
    const medDays = median(hls);
    console.log(`value_gap_halflife defaultConfig, 3 seeds x 17 assets: median h/def ${medRatio.toFixed(3)} (min ${Math.min(...ratios).toFixed(2)}, max ${Math.max(...ratios).toFixed(2)}), median half-life ${medDays.toFixed(1)} game days`);
    expect(medRatio).toBeGreaterThanOrEqual(0.5);
    expect(medRatio).toBeLessThanOrEqual(1.5);
    expect(medDays).toBeLessThanOrEqual(126);
  });

  it('value_gap_halflife (universe, full ecology, tape-01, HLCN/OSTV/SYN, diffusive shock): the fitted half-life is a few days, the gap is near zero by day 10, and any overshoot past value is bounded', { timeout: 60_000 }, () => {
    // The -30% is also a diffusive innovation (see shockedGaps). Mechanism for the strict bounds: a diffusive move drives
    // the GARCH h to its cap, and the ecology's flows scale with volatility, so the gap closes in about 2 days. Measured
    // 754f3ab: HLCN 2.12, OSTV 2.04 days; this commit with the same diffusive shock: the same numbers (tape-01).
    const cfg = universeConfig({ ticksPerDay: TPD });
    const ids = ['HLCN', 'OSTV', 'SYN'];
    const series = shockedGaps(cfg, 'tape-01', ids, 10, { diffusive: true });
    const rows = ids.map((id, k) => {
      const r = series[k]!.slice(0, 10 * TPD);
      const td = r.map((_, j) => (j + 1) / TPD);
      // the most negative ratio: how far the gap crossed to the other side of value, as a fraction of the shock
      const minRatio = Math.min(...r);
      return { id, h: fitHalfLife(r, td), left: [1, 5, 10].map((d) => series[k]![d * TPD - 1]!), minRatio };
    });
    console.log(`value_gap_halflife universe full ecology: ${rows.map((x) => `${x.id} h=${x.h.toFixed(2)}d, gap/shock at day 1/5/10 ${x.left.map((v) => v.toFixed(3)).join('/')}, min ${x.minRatio.toFixed(3)}`).join('; ')}`);
    for (const x of rows) {
      expect(x.h).toBeLessThanOrEqual(5); // the full ecology's closing auction pulls the gap in a few days
      // closed by day 10: under a quarter of the shock left. Not zero: the price keeps its own diffusion around value.
      // Probe residuals at day 10 were 0.14–0.20 of the start (about 0.05–0.07 in log terms), which is that noise.
      expect(Math.abs(x.left[2]!)).toBeLessThanOrEqual(0.25);
      // Overshoot is real on SYN (the gap crosses zero, the price runs past value by a fraction of the shock before it
      // settles), so the fit above is a summary, not a monotone decay. The bound: never past value by more than the shock.
      expect(x.minRatio).toBeGreaterThanOrEqual(-1);
    }
  });

  it('value_gap_halflife (universe, full ecology, tape-01, HLCN/OSTV/SYN, price-only shock): the gap closes at least as fast as the asset\'s own half-life', { timeout: 60_000 }, () => {
    // A price move with no news or flow behind it books no diffusive innovation, so GARCH h stays near 1 and the pools
    // close the gap at their own pace. The pools' half-lives are 10 to 63 days (ecology.ts DEFAULT_ECOLOGY), so the
    // fitted half-life is not expected to be a few days. Measured this commit (tape-01): HLCN 9.9 days (def 30), OSTV 9.0,
    // SYN 1.2 (def 120). The bound: the gap closes at least as fast as the asset's own half-life (fitted half-life <=
    // def.halfLifeDays, day-10 residual <= 0.5^(10 / def.halfLifeDays)).
    const cfg = universeConfig({ ticksPerDay: TPD });
    const ids = ['HLCN', 'OSTV', 'SYN'];
    const series = shockedGaps(cfg, 'tape-01', ids, 10);
    ids.forEach((id, k) => {
      const def = cfg.assets.find((a) => a.id === id)!;
      const r = series[k]!.slice(0, 10 * TPD);
      const td = r.map((_, j) => (j + 1) / TPD);
      const h = fitHalfLife(r, td);
      const d10 = series[k]![10 * TPD - 1]!;
      console.log(`value_gap_halflife price-only ${id}: h=${h.toFixed(2)}d (def ${def.halfLifeDays}), day-10 residual ${d10.toFixed(3)} (own-half-life bound ${Math.pow(0.5, 10 / def.halfLifeDays!).toFixed(3)})`);
      expect(h).toBeLessThanOrEqual(def.halfLifeDays!);
      expect(d10).toBeLessThanOrEqual(Math.pow(0.5, 10 / def.halfLifeDays!));
      expect(Math.min(...r)).toBeGreaterThanOrEqual(-1);
    });
  });
});

describe("X2 value gap: |lnP − lnV| stays finite and under ln 2 (value_gap_p95)", () => {
  it('value_gap_p95 (defaultConfig, tape-01, one game year, all 17 assets): every 95th percentile is finite and below ln 2', { timeout: 60_000 }, () => {
    const cfg = defaultConfig({ ticksPerDay: TPD });
    const p95 = gapP95(cfg, 'tape-01', 1);
    console.log(`value_gap_p95 tape-01, one year: median ${median(p95).toFixed(3)}, max ${Math.max(...p95).toFixed(3)} (ln 2 = ${LN2.toFixed(3)})`);
    for (const v of p95) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeLessThan(LN2);
    }
  });
});

describe('X2 value gap: the earnings surprise predicts the next 21 days (earnings_surprise_ic)', () => {
  it('earnings_surprise_ic (gameConfig, tape-01..05, 3 years): pooled rank IC of surprise vs the 21-day return after the report-day close is above 0', { timeout: 60_000 }, () => {
    const cfg = gameConfig({ ticksPerDay: TPD });
    const pairs = ['tape-01', 'tape-02', 'tape-03', 'tape-04', 'tape-05'].map((seed) => earningsPairs(seed, cfg, 3));
    const xs = pairs.flatMap((p) => p.x);
    const ys = pairs.flatMap((p) => p.y);
    const ic = spearman(xs, ys);
    console.log(`earnings_surprise_ic gameConfig 5 seeds x 3 years: rank IC ${ic.toFixed(3)} over ${xs.length} reports`);
    expect(xs.length).toBeGreaterThan(300);
    expect(Number.isFinite(ic)).toBe(true);
    expect(ic).toBeGreaterThan(0);
  });
});
