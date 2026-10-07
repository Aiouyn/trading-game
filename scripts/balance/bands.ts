// Balance target bands (owner: Tape). Each band is a release gate checked over N seeds.
// Phase 0 bands cover the single-player market only; adversarial bands (03 §16) arrive in Phase 3.
// All values are DESIGN TARGETS from the vision docs, not measured results.

export type Band = { id: string; label: string; min: number; max: number; source: string };

export const PHASE0_BANDS: Band[] = [
  // Filled in once Quant's engine exposes its stats (docs/ENGINE.md). Placeholders are commented out on purpose
  // so nothing pretends to be a real target before Quant and Ledger confirm it.
  // { id: "annual_vol_index", label: "GX index annualized vol", min: 0.12, max: 0.25, source: "01 / ENGINE.md" },
];

export function check(bands: Band[], stats: Record<string, number>) {
  return bands.map((b) => {
    const v = stats[b.id];
    const pass = typeof v === "number" && Number.isFinite(v) && v >= b.min && v <= b.max;
    return { ...b, value: v, pass };
  });
}