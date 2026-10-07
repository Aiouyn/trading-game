// Balance target bands (owner: Tape). Each band is a release gate checked over N seeds.
// Phase 0 bands: Quant's proposal, adopted by Ledger 2026-10-07. Adversarial bands (vision 03 §16) arrive in Phase 3.
// Bands are design targets; the values checked against them are always measured by run.ts.

export type Band = { id: string; label: string; min: number; max: number; source: string };

const Q = "Quant Phase 0 proposal (adopted by Ledger)";

export function phase0Bands(assetIds: string[]): Band[] {
  return [
    ...assetIds.map((id) => ({
      id: `vol_ratio_median:${id}`,
      label: `${id} realized vol / expectedVol(def) (diffusive + jumps), median across seeds`,
      min: 0.85,
      max: 1.4,
      source: Q,
    })),
    { id: "gx_cagr_median", label: "GX CAGR, median across seeds", min: 0, max: 0.12, source: Q },
    { id: "invalid_values", label: "NaN/Infinity, price below floor, or h outside [0.25, 9] (count)", min: 0, max: 0, source: Q },
    { id: "contraction_seed_share", label: "share of seeds with at least one contraction in the run", min: 0.5, max: 1, source: Q },
    { id: "bh_beats_random_share", label: "share of seeds where buy-and-hold GX beats random monthly picks", min: 0.1, max: 0.9, source: `${Q}: no guaranteed edge either way` },
    { id: "bh_beats_momentum_share", label: "share of seeds where buy-and-hold GX beats 63-day momentum", min: 0.1, max: 0.9, source: `${Q}: no guaranteed edge either way` },
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