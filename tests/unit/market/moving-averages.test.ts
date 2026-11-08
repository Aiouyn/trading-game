// SMA / EMA overlays (Broker chart): the values against hand-worked fixtures, no value before n closes, and the whole
// series following the bars as they change (a live bar replaced in place, a correction to an older close, a new
// history after an epoch reset). The plot draws exactly these on the shown closes: tests/e2e/17b/broker-sma-ema.spec.ts.
import { describe, expect, it } from "vitest";
import { ema, sma } from "@/components/market/movingAverages";
import { studyPoints } from "@/components/market/CandleChart";
import type { UTCTimestamp } from "lightweight-charts";

const closeTo = (got: readonly (number | null)[], want: readonly (number | null)[]) => {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => { const w = want[i]!; if (w === null) expect(g).toBeNull(); else expect(g).toBeCloseTo(w, 10); });
};

describe("SMA", () => {
  it("is the mean of the last n closes, none before the n-th bar", () => {
    closeTo(sma([1, 2, 3, 4, 5, 6], 3), [null, null, 2, 3, 4, 5]);
    closeTo(sma([10, 11, 13, 12], 1), [10, 11, 13, 12]);
  });
  it("a history shorter than n has no value at all (nothing invented)", () => {
    expect(sma([5, 6, 7], 20)).toEqual([null, null, null]);
    expect(sma([], 20)).toEqual([]);
  });
  it("matches p10's running-sum SMA on a long series (no drift)", () => {
    const closes = Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 7) * 3 + i * 0.01);
    let run = 0; const p10: (number | null)[] = [];
    closes.forEach((c, i) => { run += c; if (i >= 20) run -= closes[i - 20]!; p10.push(i >= 19 ? run / 20 : null); });
    closeTo(sma(closes, 20), p10);
  });
});

describe("EMA", () => {
  it("is seeded with the SMA of the first n closes, then e = c·k + e·(1−k), k = 2/(n+1)", () => {
    // n = 3, k = 0.5: seed (1+2+3)/3 = 2; then 4·.5+2·.5 = 3; 5·.5+3·.5 = 4; 10·.5+4·.5 = 7
    closeTo(ema([1, 2, 3, 4, 5, 10], 3), [null, null, 2, 3, 4, 7]);
  });
  it("a known 12-bar fixture: EMA 12 of 1..13", () => {
    const c = Array.from({ length: 13 }, (_, i) => i + 1);
    const k = 2 / 13;
    closeTo(ema(c, 12), [...Array<null>(11).fill(null), 6.5, 13 * k + 6.5 * (1 - k)]);
  });
  it("no value before n closes; none at all on a shorter history", () => {
    expect(ema([1, 2], 12)).toEqual([null, null]);
  });
});

describe("the series follows the shown bars", () => {
  const base = [10, 11, 12, 13, 14, 15];
  it("a live bar replaced again and again: only the last value moves, to the new close's", () => {
    let last = sma(base, 3);
    for (const c of [15.5, 14.2, 16, 15]) {
      const now = sma([...base.slice(0, -1), c], 3);
      expect(now.slice(0, -1)).toEqual(last.slice(0, -1));
      expect(now.at(-1)).toBeCloseTo((13 + 14 + c) / 3, 10);
      last = now;
    }
    const e = ema([...base.slice(0, -1), 15], 3);
    expect(e).toEqual(ema(base, 3)); // back to the same close: the same value, no residue of the replaced ones
  });
  it("a late correction to an older close changes every value whose window holds it (and the EMA after it)", () => {
    const fixed = [10, 11, 20, 13, 14, 15];
    closeTo(sma(fixed, 3), [null, null, 41 / 3, 44 / 3, 47 / 3, 14]);
    const e0 = ema(base, 3), e1 = ema(fixed, 3);
    expect(e1[1]).toBeNull();
    for (let i = 2; i < 6; i++) expect(e1[i]).not.toBeCloseTo(e0[i]!, 6);
  });
  it("an epoch reset (a new, shorter history) has nothing of the old one", () => {
    expect(sma([50, 51], 3)).toEqual([null, null]);
    expect(ema([50, 51, 52], 3)).toEqual([null, null, 51]);
  });
  it("the plot's points are the bars' times with a value: none for the bars before n", () => {
    const data = [1, 2, 3, 4].map((t) => ({ time: (t * 60) as UTCTimestamp }));
    expect(studyPoints(data, sma([1, 2, 3, 4], 3))).toEqual([{ time: 180, value: 2 }, { time: 240, value: 3 }]);
    expect(studyPoints(data, sma([1, 2, 3, 4], 20))).toEqual([]);
  });
});
