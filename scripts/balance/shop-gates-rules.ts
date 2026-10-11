/**
 * The shop gates as pure rules (Phase 4 stage B, DECISIONS S1 and S6, docs/V1-PHASE4.md 2.2). No I/O here, so the vitest
 * suite can check the band logic without running the probe. The CLI that runs the probe is shop-gates.ts.
 *
 * The gates are ratios to the ladder value (the lead's ruling):
 *   well-run (average style) 0.9 to 1.1x, excellent 0.7 to 0.8x, neglected (once a real day, sets nothing) 2 to 3x,
 *   managed (once a real day, 2-star manager, well-run settings) 0.95 to 1.15x (O-8, docs/V1-PHASE4.md 2.2b).
 */

/** The tier ladder the gates are read against (S1): payback in game days for well-run play on each tier. */
export const LADDER = [10, 15, 30, 50, 80, 120] as const;

/** The gates, by management style. `average` is the well-run style (online 16 of 24 game days, well-run settings). */
export const GATES = [
  { style: 'average', label: 'well-run', lo: 0.9, hi: 1.1 },
  { style: 'excellent', label: 'excellent', lo: 0.7, hi: 0.8 },
  { style: 'neglected', label: 'neglected (once a real day, sets nothing)', lo: 2, hi: 3 },
  { style: 'managed', label: 'managed (once a real day, 2-star manager)', lo: 0.95, hi: 1.15 },
] as const;

/** Reference styles reported but not gated. */
export const REFERENCE = ['casual', 'idle'] as const;

export interface PaybackRow { style: string; tier: number; payback: number }
export interface StyleSummary { medians: number[]; ratios: number[] }

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** Median payback per style and tier, and the ratio of each to the ladder value. */
export function summarize(rows: PaybackRow[]): Map<string, StyleSummary> {
  const out = new Map<string, StyleSummary>();
  for (const style of [...GATES.map((x) => x.style), ...REFERENCE]) {
    const medians = LADDER.map((_, i) => median(rows.filter((r) => r.style === style && r.tier === i + 1).map((r) => r.payback)));
    out.set(style, { medians, ratios: medians.map((m, i) => m / LADDER[i]!) });
  }
  return out;
}

/** Whether one ratio is inside a gate's band. NaN (no rows for a style and tier) is out of band. */
export function inBand(ratio: number, lo: number, hi: number): boolean {
  return ratio >= lo && ratio <= hi;
}

/** Each gate that is out of band on some tier, as a readable line. Empty when every gate holds. */
export function failures(summary: Map<string, StyleSummary>): string[] {
  const bad: string[] = [];
  for (const gate of GATES) {
    const s = summary.get(gate.style)!; // summarize always holds every gated style (NaN when it has no rows)
    s.ratios.forEach((r, i) => {
      if (!inBand(r, gate.lo, gate.hi)) bad.push(`${gate.label}, tier ${i + 1}: ${r.toFixed(2)}x (band ${gate.lo} to ${gate.hi}x)`);
    });
  }
  return bad;
}
