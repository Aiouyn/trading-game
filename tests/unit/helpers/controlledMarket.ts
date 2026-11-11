// A clock whose marks and tick a test sets (same snapshot shape as LiveMarket); shared by the M1-07 suites.
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { LiveMarket } from "@/server/market/clock";
import { fmt } from "@/shell/contracts/mockFeed";

export class ControlledMarket {
  private snap: MarketSnapshot;
  private readonly fns = new Set<() => void>();
  constructor(tick = 720 * 38 + 28) { const s = structuredClone(new LiveMarket().snapshot()); this.snap = { ...s, tick }; }
  snapshot(): MarketSnapshot { return structuredClone(this.snap); }
  stop() {}
  onStep(fn: () => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  onList() { return () => {}; } // L4 listing hook: this stand-in clock lists nothing
  impactListed() { return null; }
  // Stand-in clocks have no storm-world path; getCandles starts a fresh history (as a real clock with no path does).
  takePendingPathCandles() { return null; }
  attachCandleSink() {}
  step(marks: Record<string, number> = {}) {
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, tick: this.snap.tick + 1, quotes: { ...this.snap.quotes, rows } };
    for (const fn of this.fns) fn();
  }
  set(marks: Record<string, number>) { // same tick, new marks (not a step)
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, quotes: { ...this.snap.quotes, rows } };
  }
  get tick() { return this.snap.tick; }
  last(id: string) { return Math.round(Number(this.snap.quotes.rows[id]!.last) * 100); }
}
export const asMarket = (m: ControlledMarket) => m as unknown as LiveMarket;
