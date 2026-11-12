// Bollinger Bands, RSI and VWAP (Broker chart overlays): hand-worked values, the warm-up (no value before it), RSI's
// flat / only-gains / only-losses cases and its 0..100 range, VWAP's day restart, its start when the shown bars begin
// mid-day, no value without traded volume, and every value following a replaced live bar or a corrected close or
// volume. The plot draws exactly these on the shown bars: tests/e2e/17b/broker-bb-rsi-vwap.spec.ts.
import { describe, expect, it } from "vitest";
import { bollinger, rsi, sma, vwap, type VwapBar } from "@/components/market/movingAverages";
import { warmup } from "@/components/market/chartStudies";

const near = (got: readonly (number | null)[], want: readonly (number | null)[]) => {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => { const w = want[i]!; if (w === null) expect(g, `[${i}]`).toBeNull(); else expect(g, `[${i}]`).toBeCloseTo(w, 10); });
};

describe("Bollinger Bands (n, ±2 population standard deviations)", () => {
  it("the textbook set 2 4 4 4 5 5 7 9: mean 5, σ 2 -> 9 / 1", () => {
    const [up, lo] = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8);
    near(up, [...Array<null>(7).fill(null), 9]);
    near(lo, [...Array<null>(7).fill(null), 1]);
  });
  it("each window: SMA(n) ± 2σ of the same closes; none before the n-th bar", () => {
    const c = [1, 2, 3, 4, 5, 9];
    const [up, lo] = bollinger(c, 5);
    const r2 = Math.sqrt(2);
    near(up, [null, null, null, null, 3 + 2 * r2, 4.6 + 2 * Math.sqrt(((2 - 4.6) ** 2 + (3 - 4.6) ** 2 + (4 - 4.6) ** 2 + (5 - 4.6) ** 2 + (9 - 4.6) ** 2) / 5)]);
    near(lo, [null, null, null, null, 3 - 2 * r2, 4.6 - 2 * Math.sqrt(((2 - 4.6) ** 2 + (3 - 4.6) ** 2 + (4 - 4.6) ** 2 + (5 - 4.6) ** 2 + (9 - 4.6) ** 2) / 5)]);
    expect(sma(c, 5)[5]).toBeCloseTo(4.6, 10);
  });
  it("a flat window has zero width; a short history none", () => {
    expect(bollinger([7, 7, 7], 3)).toEqual([[null, null, 7], [null, null, 7]]);
    expect(bollinger([1, 2], 20)).toEqual([[null, null], [null, null]]);
  });
});

describe("RSI (Wilder, n)", () => {
  it("first value at bar n (n changes = n + 1 closes); none before", () => {
    expect(rsi([1, 2], 2)).toEqual([null, null]);
    expect(warmup("rsi", 14)).toBe(15);
    near(rsi([10, 11, 10, 12], 2), [null, null, 50, 100 - 100 / (1 + 1.25 / 0.25)]);
  });
  it("only gains 100, only losses 0, flat 50", () => {
    expect(rsi([1, 2, 3, 4], 2)).toEqual([null, null, 100, 100]);
    expect(rsi([4, 3, 2, 1], 2)).toEqual([null, null, 0, 0]);
    expect(rsi([5, 5, 5, 5], 2)).toEqual([null, null, 50, 50]);
  });
  it("always within 0..100 on a long noisy series, never a price", () => {
    const c = Array.from({ length: 500 }, (_, i) => 1000 + Math.sin(i / 3) * 40 + (i % 7) * 3);
    const r = rsi(c, 14).filter((v): v is number => v !== null);
    expect(r).toHaveLength(500 - 14);
    expect(Math.min(...r)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...r)).toBeLessThanOrEqual(100);
  });
});

describe("VWAP (typical price × volume, per game day)", () => {
  const B = (t: number, h: number, l: number, c: number, v: number): VwapBar => ({ t, h, l, c, v });
  it("Σ typical·v / Σ v from the day's start; a zero-volume bar leaves it; the next day restarts", () => {
    const r = vwap([B(0, 3, 1, 2, 10), B(1, 5, 3, 4, 30), B(2, 10, 8, 9, 0), B(720, 7, 5, 6, 0), B(721, 7, 5, 6, 5)], 720);
    near(r.values, [2, (20 + 120) / 40, 3.5, null, 6]);
    expect(r.from).toEqual([0, 0, 0, 720, 720]);
  });
  it("no traded volume at all: no value anywhere (no price made up)", () => {
    const r = vwap([B(10, 3, 1, 2, 0), B(11, 3, 1, 2, 0)], 720);
    expect(r.values).toEqual([null, null]);
  });
  it("bars starting mid-day: the sum starts at the first shown bar of that day (said by `from`)", () => {
    const r = vwap([B(300, 3, 1, 2, 1), B(301, 3, 1, 2, 1), B(720, 3, 1, 2, 1)], 720);
    expect(r.from).toEqual([300, 300, 720]);
  });
  it("a replaced live bar or a corrected volume moves the value; the same bar back gives the same value", () => {
    const base = [B(0, 3, 1, 2, 10), B(1, 5, 3, 4, 30)];
    const a = vwap(base, 720).values;
    const corrected = vwap([base[0]!, B(1, 5, 3, 4, 10)], 720).values;
    expect(corrected[1]).toBeCloseTo((20 + 40) / 20, 10);
    expect(vwap([base[0]!, B(1, 5, 3, 4, 10)], 720).values[0]).toBe(a[0]);
    expect(vwap(base, 720).values).toEqual(a);
  });
});
