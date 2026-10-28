// UI card 7 (17B BRK-B): the history door. BR-7-02 range → request (Q3) and paging; BR-7-03 request and reply parsed
// at the boundary, a malformed bar fails the whole range; the live-bar merge (BR-7-06's rule, unit side).
import { describe, expect, it } from "vitest";
import type { CandleHistoryReq } from "@/shell/contracts/channels";
import {
  CHART_RANGES, DEFAULT_RANGE, MAX_BARS_PER_CALL, SPAN, loadCandles, loadRange, mergeLive, parseBar, parseHistory, rangeRequests, resOf,
  type Bar, type ChartRange, type GameTick, type HistoryTransport,
} from "@/shell/contracts/history";
import type { AssetId } from "@/shell/contracts/orders";

const HALC = "HALC" as AssetId;
const T = (n: number) => n as GameTick;
const bar = (t: number, c = "42.10"): Bar => ({ t, o: c, h: c, l: c, c, v: "100" }) as unknown as Bar;
/** A fake server: every bar from..to on the span, recorded. */
function fake(): HistoryTransport & { reqs: CandleHistoryReq[] } {
  const reqs: CandleHistoryReq[] = [];
  return {
    reqs,
    candleHistory(req) {
      reqs.push(req);
      const span = SPAN[req.res];
      const bars = [];
      for (let t = Math.ceil(req.from / span) * span; t <= req.to; t += span) bars.push({ t, o: "1.00", h: "1.00", l: "1.00", c: "1.00", v: "1" });
      return { bars };
    },
  };
}
const count = (r: { from: number; to: number; res: keyof typeof SPAN }) => (r.to - r.from) / SPAN[r.res] + 1;

describe("BR-7-02 range → request (Q3, E-56 §1)", () => {
  const live = { tick: T(30_000), hour: T(300_000), day: T(288_000) }; // span-aligned, past genesis + the range
  const plan: [ChartRange, "tick" | "hour" | "day", number, number][] = [
    ["1H", "tick", 1, 30], ["1D", "tick", 1, 720], ["1W", "hour", 30, 168], ["1Q", "hour", 30, 2184], ["1Y", "day", 720, 364],
  ];
  for (const [range, res, span, bars] of plan) {
    it(`${range}: ${res}, ${bars} bars, to = live t, from = to − (bars − 1) × ${span}`, () => {
      const to = live[res];
      const reqs = rangeRequests(HALC, range, to);
      expect(reqs).toEqual([{ assetId: HALC, res, from: to - (bars - 1) * span, to }]);
      expect(count(reqs[0]!)).toBe(bars);
      expect(resOf(range)).toBe(res);
    });
  }
  it("default is 1D; tabs are the six ranges in order", () => {
    expect(DEFAULT_RANGE).toBe("1D");
    expect(CHART_RANGES).toEqual(["1H", "1D", "1W", "1Q", "1Y", "All"]);
  });
  it("from clamps at tick 0 before genesis (short reply, no padding)", () => {
    expect(rangeRequests(HALC, "1D", T(100))).toEqual([{ assetId: HALC, res: "tick", from: 0, to: 100 }]);
    expect(rangeRequests(HALC, "1Y", T(7200))).toEqual([{ assetId: HALC, res: "day", from: 0, to: 7200 }]);
  });
  it("All: day bars from tick 0, contiguous pages, none over 5,000 bars", () => {
    const to = T(720 * 12_345);
    const reqs = rangeRequests(HALC, "All", to);
    expect(reqs.length).toBe(3);
    expect(reqs[0]!.from).toBe(0);
    expect(reqs.at(-1)!.to).toBe(to);
    for (const [i, r] of reqs.entries()) {
      expect(r.res).toBe("day");
      expect(count(r)).toBeLessThanOrEqual(MAX_BARS_PER_CALL);
      if (i > 0) expect(r.from).toBe(reqs[i - 1]!.to + 720);
    }
    expect(reqs.reduce((n, r) => n + count(r), 0)).toBe(12_346);
  });
  it("All with one page when the history is short", () => {
    expect(rangeRequests(HALC, "All", T(720 * 10))).toEqual([{ assetId: HALC, res: "day", from: 0, to: 7200 }]);
  });
  it("loadRange issues exactly the planned calls, oldest first, and concatenates them", async () => {
    const f = fake();
    const r = await loadRange(HALC, "All", T(720 * 12_345), f);
    expect(f.reqs).toEqual(rangeRequests(HALC, "All", T(720 * 12_345)));
    expect(r.ok && r.value.length).toBe(12_346);
    expect(r.ok && r.value.map((b) => b.t).every((t, i, a) => i === 0 || t > a[i - 1]!)).toBe(true);
  });
});

describe("BR-7-03 parse at the boundary", () => {
  const req = { assetId: HALC, res: "tick" as const, from: T(10), to: T(12) };
  const ok = { bars: [{ t: 10, o: "1.00", h: "1.00", l: "1.00", c: "1.00", v: "5" }, { t: 11, o: "1.00", h: "1.10", l: "1.00", c: "1.10", v: "5" }] };
  it("a good reply parses to the same bars", () => {
    expect(parseHistory(ok, req)).toEqual(ok.bars);
  });
  const bad: [string, unknown][] = [
    ["a non-decimal close", { bars: [{ t: 10, o: "1", h: "1", l: "1", c: "x", v: "1" }] }],
    ["a number for a price", { bars: [{ t: 10, o: 1, h: "1", l: "1", c: "1", v: "1" }] }],
    ["a missing field", { bars: [{ t: 10, o: "1", h: "1", l: "1", v: "1" }] }],
    ["an extra key", { bars: [{ t: 10, o: "1", h: "1", l: "1", c: "1", v: "1", x: 1 }] }],
    ["a negative tick", { bars: [{ t: -1, o: "1", h: "1", l: "1", c: "1", v: "1" }] }],
    ["a fractional tick", { bars: [{ t: 10.5, o: "1", h: "1", l: "1", c: "1", v: "1" }] }],
    ["a bar after `to`", { bars: [{ t: 13, o: "1", h: "1", l: "1", c: "1", v: "1" }] }],
    ["a bar before `from`", { bars: [{ t: 9, o: "1", h: "1", l: "1", c: "1", v: "1" }] }],
    ["bars out of order", { bars: [ok.bars[1], ok.bars[0]] }],
    ["a duplicate t", { bars: [ok.bars[0], ok.bars[0]] }],
    ["no bars key", {}],
    ["null", null],
  ];
  for (const [what, raw] of bad) {
    it(`${what} → badReply, never a partial plot`, async () => {
      const r = await loadCandles(req, { candleHistory: () => raw });
      expect(r).toMatchObject({ ok: false, error: { kind: "badReply" } });
    });
  }
  it("an hour bar off the 30-tick span is rejected", () => {
    expect(() => parseBar({ t: 31, o: "1", h: "1", l: "1", c: "1", v: "1" }, "hour")).toThrow(/span/);
    expect(parseBar({ t: 60, o: "1", h: "1", l: "1", c: "1", v: "1" }, "hour").t).toBe(60);
  });
  it("an hour reply holding a bar off the span → badReply, not a plot with that bar", async () => {
    const hourReq = { assetId: HALC, res: "hour" as const, from: T(0), to: T(90) };
    const raw = { bars: [{ t: 30, o: "1", h: "1", l: "1", c: "1", v: "1" }, { t: 31, o: "1", h: "1", l: "1", c: "1", v: "1" }] };
    expect(await loadCandles(hourReq, { candleHistory: () => raw })).toMatchObject({ ok: false, error: { kind: "badReply" } });
  });
  it("more than 5,000 bars in one reply is rejected", () => {
    const many = { bars: Array.from({ length: 5001 }, (_, i) => ({ t: i, o: "1", h: "1", l: "1", c: "1", v: "1" })) };
    expect(() => parseHistory(many, { assetId: HALC, res: "tick", from: T(0), to: T(6000) })).toThrow(/5000/);
  });
  it("the request is parsed before it leaves: a bad request never reaches the transport", async () => {
    const f = fake();
    const r = await loadCandles({ assetId: HALC, res: "tick", from: 1.5 as GameTick, to: T(3) }, f);
    expect(r).toMatchObject({ ok: false, error: { kind: "badReply" } });
    expect(f.reqs).toEqual([]);
  });
  it("a rejecting transport → badReply; no transport → noTransport", async () => {
    expect(await loadCandles(req, { candleHistory: () => Promise.reject(new Error("net")) })).toMatchObject({ ok: false, error: { kind: "badReply" } });
    expect(await loadCandles(req, null)).toEqual({ ok: false, error: { kind: "noTransport" } });
  });
  it("one bad page fails the whole All range", async () => {
    let n = 0;
    const f = fake();
    const flaky: HistoryTransport = { candleHistory: (q) => (++n === 2 ? { bars: [{ t: q.from, o: "1", h: "1", l: "1", c: "?", v: "1" }] } : f.candleHistory(q)) };
    expect(await loadRange(HALC, "All", T(720 * 12_345), flaky)).toMatchObject({ ok: false });
  });
});

describe("live bar merge", () => {
  const bars = [bar(10), bar(11), bar(12)];
  it("same t replaces the last bar in place", () => {
    const m = mergeLive(bars, bar(12, "43.00"));
    expect(m.map((b) => [b.t, b.c])).toEqual([[10, "42.10"], [11, "42.10"], [12, "43.00"]]);
    expect(m[0]).toBe(bars[0]);
  });
  it("a newer t appends (a gap of missed ticks stays a gap, no fill)", () => {
    expect(mergeLive(bars, bar(13)).map((b) => b.t)).toEqual([10, 11, 12, 13]);
    expect(mergeLive(bars, bar(20)).map((b) => b.t)).toEqual([10, 11, 12, 20]);
  });
  it("an older t is dropped (the same array back)", () => {
    expect(mergeLive(bars, bar(11, "1.00"))).toBe(bars);
  });
});
