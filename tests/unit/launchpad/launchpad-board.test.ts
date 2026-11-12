// The ported first-version board (boardModel.ts) and candles (candles.ts): feeds, King of the Hill, trades bar, candle buckets.
import { describe, expect, it } from "vitest";
import { GRAD_CAP_CENTS, barOf, capOf, feedOf, kingOf, progressOf, type BoardCoin } from "@/apps/launchpad/boardModel";
import { MAX_CANDLES, candlesOf } from "@/apps/launchpad/candles";
import { spot, type HistoryData } from "@/apps/launchpad/history";
import { iconSpec } from "@/apps/launchpad/Board";
import { LP, marketCapCents } from "@/launchpad/rules";

const coin = (ticker: string, sold: number, extra: Partial<BoardCoin> = {}): BoardCoin => ({
  ticker, name: `${ticker} Coin`, x: LP.X0 + sold, sold, createdAtMs: 1_000, holders: 0, mine: false, tape: [], ...extra,
});

describe("Launchpad board model", () => {
  it("New holds live coins, Graduated graduated ones, Holdings only what the caller holds", () => {
    const coins = [coin("AAA", 10), coin("BBB", 20, { grad: { atMs: 5, price: 9_000, mark: 9_500 } }), coin("CCC", 0)];
    expect(feedOf(coins, "new", {}, "", "cap").map((c) => c.ticker)).toEqual(["AAA", "CCC"]);
    expect(feedOf(coins, "graduated", {}, "", "cap").map((c) => c.ticker)).toEqual(["BBB"]);
    expect(feedOf(coins, "holdings", { CCC: 5, AAA: 0 }, "", "cap").map((c) => c.ticker)).toEqual(["CCC"]);
    expect(feedOf(coins, "new", {}, "ccc", "cap").map((c) => c.ticker)).toEqual(["CCC"]);
  });
  it("sorts by last trade, volume and curve, largest first", () => {
    const a = coin("AAA", 50, { tape: [{ atMs: 100, side: "buy", tokens: 1, cents: 500, creator: false }] });
    const b = coin("BBB", 10, { tape: [{ atMs: 200, side: "buy", tokens: 1, cents: 100, creator: false }] });
    expect(feedOf([a, b], "new", {}, "", "bump").map((c) => c.ticker)).toEqual(["BBB", "AAA"]);
    expect(feedOf([a, b], "trending", {}, "", "vol").map((c) => c.ticker)).toEqual(["AAA", "BBB"]);
    expect(feedOf([a, b], "new", {}, "", "curve").map((c) => c.ticker)).toEqual(["AAA", "BBB"]);
  });
  it("the King of the Hill is the live coin with the most sold; none before any sale", () => {
    expect(kingOf([coin("AAA", 0)])).toBeNull();
    expect(kingOf([coin("AAA", 5), coin("BBB", 9), coin("CCC", 99, { grad: { atMs: 1, price: 1, mark: null } })])?.ticker).toBe("BBB");
  });
  it("the trades bar is the newest public trades across coins", () => {
    const a = coin("AAA", 1, { tape: [{ atMs: 30, side: "sell", tokens: 1, cents: 1, creator: true }, { atMs: 10, side: "buy", tokens: 1, cents: 2, creator: false }] });
    const b = coin("BBB", 1, { tape: [{ atMs: 20, side: "buy", tokens: 1, cents: 3, creator: false }] });
    expect(barOf([a, b]).map((r) => `${r.ticker}@${r.atMs}`)).toEqual(["AAA@30", "BBB@20", "AAA@10"]);
  });
  it("market cap: the curve's spot × supply, a graduated coin's Broker mark × supply; graduation cap about $216k", () => {
    const c = coin("AAA", 1_000_000);
    expect(capOf(c)).toBe(marketCapCents(c));
    expect(capOf(coin("BBB", 1, { grad: { atMs: 1, price: 2_000, mark: 9_367 } }))).toBe(9_367 * 1_000); // $0.00009367 × 1B = $93,670
    expect(progressOf(coin("CCC", (LP.Y0 - LP.GRAD_Y) / 2))).toBeCloseTo(0.5);
    expect(GRAD_CAP_CENTS / 100).toBeGreaterThan(200_000);
    expect(GRAD_CAP_CENTS / 100).toBeLessThan(230_000);
  });
  it("the icon is stable per ticker and names colours only through tokens", () => {
    expect(iconSpec("FROG")).toEqual(iconSpec("FROG"));
    expect(iconSpec("FROG").fill).toMatch(/^color-mix\(in oklab, var\(--[a-z]+\) \d+%, var\(--[a-z]+\)\)$/);
  });
});

describe("Launchpad candles", () => {
  const pt = (atMs: number, x: number, sold: number, side: "buy" | "sell" = "buy") => ({ tick: 0, atMs, side, tokens: 1, cents: 100, x, sold });
  const h = (pts: ReturnType<typeof pt>[]): HistoryData => ({ ticker: "FROG", createdAtMs: 0, startX: LP.X0, since: 0, dropped: 0, pts });
  it("one candle per minute from the launch, open at the last close, flat where nothing traded", () => {
    const data = h([pt(10_000, LP.X0 + 1_000, 1_000_000), pt(20_000, LP.X0 + 2_000, 2_000_000), pt(130_000, LP.X0 + 500, 500_000, "sell")]);
    const k = candlesOf(data, 60_000, 200_000);
    expect(k.map((c) => c.t)).toEqual([0, 60_000, 120_000, 180_000]);
    expect(k[0]!.o).toBe(spot(LP.X0, 0));
    expect(k[0]!.c).toBe(spot(LP.X0 + 2_000, 2_000_000));
    expect(k[0]!.h).toBe(k[0]!.c);
    expect(k[0]!.buys).toBe(2);
    expect(k[1]).toMatchObject({ o: k[0]!.c, c: k[0]!.c, v: 0 });
    expect(k[2]!.c).toBe(spot(LP.X0 + 500, 500_000));
    expect(k[2]!.sells).toBe(1);
    expect(k[3]!.o).toBe(k[2]!.c);
  });
  it("keeps the newest MAX_CANDLES and opens the window at the price before it", () => {
    const data = h([pt(1_000, LP.X0 + 1_000, 1_000_000)]);
    const k = candlesOf(data, 60_000, 1_000 * 60_000);
    expect(k).toHaveLength(MAX_CANDLES);
    expect(k[0]!.o).toBe(spot(LP.X0 + 1_000, 1_000_000));
  });
  it("a graduated coin's candles end at its graduation price", () => {
    const data: HistoryData = { ...h([pt(1_000, LP.X0 + 1_000, 1_000_000)]), grad: { atMs: 61_000, at: 1, price: 5_000 } };
    const k = candlesOf(data, 60_000, 10 * 60_000);
    expect(k).toHaveLength(2);
    expect(k[1]!.c).toBe(5_000 / 1e8);
  });
});
