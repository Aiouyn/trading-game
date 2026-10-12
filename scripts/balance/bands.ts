// Balance target bands (owner: Tape). Each band is a release gate checked over N seeds. The release tick rate is 720 ticks a
// game day (V1-PHASE1 F19, gates.ts): run.ts defaults to 24 ticks, a fast smoke run that prints SMOKE RUN, so the 24-tick
// verdicts here are provisional. The vol-ratio verdicts at 720 use the 2 s.e. rule of gates.ts (FAIL only when wholly outside).
// Phase 0 bands: Quant's proposal, adopted by Ledger 2026-10-07. Adversarial bands (vision 03 §16) arrive in Phase 3.
// Bands are design targets; the values checked against them are always measured by run.ts.

export type Band = { id: string; label: string; min: number; max: number; source: string };

const Q = "Quant Phase 0 proposal (adopted by Ledger)";

/** A class-specific vol band (universe only). `why` is the mechanism that moves the ratio, written next to the number. */
export type VolBand = { min: number; max: number; why: string };


/**
 * Meme floor pinning. A price that bleeds to its 1e-7 floor is pinned there, and a pinned day has zero return, so the
 * realized sd is about sqrt(alive share) of expectedVol (the variance is diluted by the share of days alive). The band
 * is 0.8 x sqrt(alive share): the 0.8 is a margin for seed noise, and the mechanism is the same for every meme.
 */
function floorPinned(alive: number): VolBand {
  return {
    min: Math.round(0.8 * Math.sqrt(alive) * 100) / 100,
    max: 1.4,
    why: `floor pinning: median alive share ${alive.toFixed(3)} of days (the rest sit at the price floor with zero return), so realized sd is about sqrt(alive) of expectedVol`,
  };
}

/**
 * Universe-only vol bands for the classes whose realized vol is structurally below expectedVol. Bare-engine bands are
 * unchanged: run.ts passes this table only with --universe. Each entry names the mechanism, so a reader can see why the
 * band is lower than the Phase 0 0.85, rather than a number widened to pass.
 *
 * F1 (calibration closure): commodities NGAS, LITH, COFF, forex NHK, MRE, KYN and biotech GNOM, NRVA were 0.81-0.85 on 20
 * seeds with no band. Measured causes (V1-PHASE1 F1): (1) GARCH read the close-to-close day return, which holds the value
 * pull, news and (full ecology) the auction: E[z^2]/E[h] for NRVA was 1.27 with ecology off and 0.95 with it (8 seeds).
 * The GARCH now reads only the diffusive shocks (AssetState.dayDiff), so E[z^2 | h] = h by construction (measured c 0.95-1.03
 * for 13 names). (2) GARCH standardized by volMult alone, so idio-heavy names had E[h] 0.86-0.95 (regimeShockSd adds the
 * loading split). (3) expectedVol counted the full jump, but the close prints closePrint (ecology). The eight F1 names pass
 * the general 0.85-1.4 band now (20 seeds, medians 0.92-1.11). FLUX passes it too (median 0.976), so its old class band is
 * gone. AUSD passes it too, on the RMS across seeds (V1-PHASE1 F13); its class band came later (V1-PHASE9 9C.4, below).
 *
 * Round 6 (V1-PHASE1 round 6): expectedVol adds the diffusion regime mix (vol x volMult x regimeShockSd, time-averaged), the
 * earnings gap of stocks (catalysts.ts) and, for option horizons, the rate variance ratio. Realized vol moved down with it: at 20
 * seeds, 24 ticks, the universe's lowest non-meme names are NHK 0.867, SOLN 0.876, AUSD 0.880, NHOL 0.897 (all PASS), and every
 * one of the 183 bands passes. No band was added or removed in round 6: the floor-pinned meme bands are the only class bands.
 *
 * Round 5 (V1-PHASE1 round 5): expectedVol is the model's honest prediction. Its jump term is the time average of the regime
 * jump intensity over the default regimes (regimeShares.ts), not the expansion value; a rates-exposed asset (duration and
 * yieldKey: bonds, property) adds D² x the daily yield variance the rates layer produces (ratevar.ts) x the close's print
 * pass-through (ratePrintOf). Those two terms were the gap the bond and rare-jump bands had been absorbing. No class band
 * was removed by round 5 that existed only for them: the floor-pinned meme bands above keep their own mechanism (the price
 * floor), and nothing else in this table was there for the jump or rate gap. The general 0.85 to 1.4 band still applies to
 * every other asset.
 */
export const UNIVERSE_VOL_BANDS: Record<string, VolBand> = {
  /**
   * V1-PHASE9 9C.4 (the stablecoin ruling). AUSD's RMS over 300 seeds at 720 ticks a day (one game year per seed) is 1.032, with a
   * 2 s.e. interval [0.725, 1.340]: it straddles the general 0.85 edge, so the general band is undecided. The mechanism is the
   * depeg: a stablecoin's variance is set by its rare depeg jumps (AUSD 0.25 a year, down 6% on average), so 78% of the seeds
   * have no depeg in the year and sit on the no-jump shoulder (ratio below 0.3), while the seeds that depeg carry the RMS (max
   * 9.2). The class band is [0.6, 1.1] on the RMS ratio: the lead's ruling for a band that still straddles (V1-PHASE9 lead
   * decisions, track 9C). The ruling is a band, not a verdict: at 2 s.e. the interval [0.725, 1.340] straddles 1.1 as well, so
   * the AUSD verdict is UNDECIDED (run.ts prints it so; it is not a PASS). One seed (max 9.2) supplies 27% of the mean square; the
   * RMS without it is 0.886. The 300 seeds are one game year each, not the default five (about 34 CPU-hours for five; not run).
   * FLUX is the other stablecoin (0.5 jumps a year); it has no 300-seed run here and keeps the general band.
   */
  AUSD: { min: 0.6, max: 1.1, why: "stablecoin: the RMS is set by rare depeg jumps (0.25 a year); 78% of seeds sit on the no-jump shoulder (V1-PHASE9 9C.4)" },
  BONK: floorPinned(0.2),
  FROG: floorPinned(0.296),
  MOON: floorPinned(0.442),
  HAMR: floorPinned(0.442),
  CATZ: floorPinned(0.604),
  WOOF: floorPinned(0.81),
  GIGA: floorPinned(0.89),
};

export function phase0Bands(assetIds: string[], overrides: Record<string, VolBand> = {}): Band[] {
  return [
    ...assetIds.map((id) => {
      const o = overrides[id];
      return {
        id: `vol_ratio_rms:${id}`,
        label: o ? `${id} realized vol / expectedVol(def), class band: ${o.why}` : `${id} realized vol / expectedVol(def) (diffusive + jumps), RMS across seeds`,
        min: o?.min ?? 0.85,
        max: o?.max ?? 1.4,
        source: o ? "Tape, universe class band (see bands.ts UNIVERSE_VOL_BANDS)" : Q,
      };
    }),
    { id: "gx_cagr_median", label: "GX CAGR, median across seeds", min: 0, max: 0.12, source: Q },
    { id: "invalid_values", label: "NaN/Infinity, price below floor, or h outside [0.25, 9] (count)", min: 0, max: 0, source: Q },
    { id: "contraction_seed_share", label: "share of seeds with at least one contraction in the run", min: 0.5, max: 1, source: Q },
    { id: "bh_beats_random_share", label: "fee-aware: share of seeds where an equal-weight stock basket held from day 63 beats a random single stock rebalanced monthly", min: 0.1, max: 0.9, source: `${Q}: no guaranteed edge either way` },
    { id: "bh_beats_momentum_share", label: "fee-aware: share of seeds where buy-and-hold beats the top 63-day performer rebalanced monthly", min: 0.1, max: 0.9, source: `${Q}: no guaranteed edge either way` },
    { id: "bh_beats_contrarian_share", label: "fee-aware: share of seeds where buy-and-hold beats the worst 63-day performer rebalanced monthly", min: 0.1, max: 0.9, source: "Ledger 2026-10-07: contrarian strategy added" },
    { id: "max_strategy_beats_bh_share", label: "highest share of seeds in which any simple strategy (random, momentum, contrarian) beats buy-and-hold", min: 0, max: 0.7, source: "Ledger 2026-10-07: no simple strategy beats buy-and-hold in more than 70% of seeds" },
    { id: "determinism_mismatch", label: "same seed run twice gives a different final state (count)", min: 0, max: 0, source: "Tape release check" },
  ];
}

/** A band's verdict: PASS, FAIL, or UNDECIDED (the estimate's interval straddles a band edge; listed, not a pass). */
export type Verdict = "PASS" | "FAIL" | "UNDECIDED";

/**
 * The verdict of one value against [min, max]. With no standard error it is the point estimate (PASS inside, FAIL outside). With
 * a standard error it is the 2 s.e. rule of gates.ts (V1-PHASE1 F13): PASS only when estimate ± 2 s.e. lies wholly inside the
 * band, FAIL only when it lies wholly outside, and UNDECIDED when the interval straddles an edge.
 */
export function verdictOf(v: number | undefined, min: number, max: number, se?: number): Verdict {
  if (typeof v !== "number" || !Number.isFinite(v)) return "FAIL";
  if (se === undefined) return v >= min && v <= max ? "PASS" : "FAIL";
  const lo = v - 2 * se;
  const hi = v + 2 * se;
  if (lo >= min && hi <= max) return "PASS";
  if (hi < min || lo > max) return "FAIL";
  return "UNDECIDED";
}

/** Checks every band; `se` gives the standard error of each band's value where one exists (keyed by band id). */
export function check(bands: Band[], stats: Record<string, number>, se: Record<string, number> = {}) {
  return bands.map((b) => {
    const v = stats[b.id];
    const verdict = verdictOf(v, b.min, b.max, se[b.id]);
    return { ...b, value: v, se: se[b.id], verdict, pass: verdict === "PASS" };
  });
}