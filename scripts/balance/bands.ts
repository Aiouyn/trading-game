// Balance target bands (owner: Tape). Each band is a release gate checked over N seeds.
// Phase 0 bands: Quant's proposal, adopted by Ledger 2026-10-07. Adversarial bands (vision 03 §16) arrive in Phase 3.
// Bands are design targets; the values checked against them are always measured by run.ts.

export type Band = { id: string; label: string; min: number; max: number; source: string };

const Q = "Quant Phase 0 proposal (adopted by Ledger)";

/** A class-specific vol band (universe only). `why` is the mechanism that moves the ratio, written next to the number. */
export type VolBand = { min: number; max: number; why: string };

const STABLE_WHY = "stablecoin pulled back to $1 within half a day (halfLifeDays 0.5): shocks and depeg jumps mostly revert before the next close, so close-to-close vol keeps only part of the jump variance that expectedVol counts in full";

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
 * Not banded here, so they stay FAIL on the universe run until their mechanism is isolated: commodities NGAS, LITH, COFF;
 * forex NHK, MRE, KYN; biotech GNOM, NRVA (all 0.81-0.85 on 20 seeds). A 4-seed check with the ecology off did not move
 * NGAS, COFF or the forex pairs back to 1, so the closing pools (ecology.ts) are not the cause. A band here with no mechanism
 * would be a number widened to pass.
 */
export const UNIVERSE_VOL_BANDS: Record<string, VolBand> = {
  AUSD: { min: 0.25, max: 0.45, why: STABLE_WHY },
  FLUX: { min: 0.4, max: 0.6, why: STABLE_WHY },
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
        id: `vol_ratio_median:${id}`,
        label: o ? `${id} realized vol / expectedVol(def), class band: ${o.why}` : `${id} realized vol / expectedVol(def) (diffusive + jumps), median across seeds`,
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

export function check(bands: Band[], stats: Record<string, number>) {
  return bands.map((b) => {
    const v = stats[b.id];
    const pass = typeof v === "number" && Number.isFinite(v) && v >= b.min && v <= b.max;
    return { ...b, value: v, pass };
  });
}