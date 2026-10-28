// UI card 5 (17B BRK-A/C): order types in contracts/orders.ts and source/CSS guards.
// BR-5-01 (segment colours, CSS source), BR-5-02 parsePriceInput + no number parsing / arithmetic (extends BR-4-03),
// day drafts carry exactly their own price fields.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dayDraft, parseAssetId, parsePriceInput, type DayDraft, type MarketDayDraft, type PriceText, type WholeQty } from "@/shell/contracts/orders";
import { orderDraft } from "@/shell/contracts/schema";
import { brokerMathHits } from "./BR-4-guards.test";

const DIR = "src/apps/broker";
const strip = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
const css = readFileSync(join(DIR, "openOrders.css"), "utf8");

describe("BR-5-02 parsePriceInput: format only, comma to point", () => {
  it.each([["42", "42"], ["42.10", "42.10"], ["42,10", "42.10"], ["0.5", "0.5"]])("accepts %s as %s", (text, price) => {
    expect(parsePriceInput(text)).toEqual({ kind: "price", price });
  });
  it("empty is its own state", () => {
    expect(parsePriceInput("")).toEqual({ kind: "empty" });
  });
  it.each(["-1", "4e2", "42.", ".5", "42.1.0", "42,1,0", " 42", "42 ", "1_000", "+4", "abc"])("rejects %s", (text) => {
    expect(parsePriceInput(text)).toEqual({ kind: "badFormat" });
  });
  it("never rounds or pads: digits pass through as typed", () => {
    expect(parsePriceInput("42.123456")).toEqual({ kind: "price", price: "42.123456" });
    expect(parsePriceInput("007")).toEqual({ kind: "price", price: "007" });
  });
});

describe("day drafts carry exactly their own price fields", () => {
  const a = parseAssetId("HALC")!;
  const q = "40" as WholeQty;
  const p = (s: string) => s as PriceText;
  it("market: no limit, no stop", () => {
    expect(dayDraft(a, "BUY", q, { type: "market" })).toEqual({ assetId: "HALC", side: "BUY", type: "market", qty: "40", tif: "day" });
  });
  it("limit: limit only", () => {
    const d = dayDraft(a, "BUY", q, { type: "limit", limit: p("42.10") });
    expect(d).toEqual({ assetId: "HALC", side: "BUY", type: "limit", qty: "40", limit: "42.10", tif: "day" });
    expect("stop" in d).toBe(false);
  });
  it("stop: stop only", () => {
    const d = dayDraft(a, "SELL", q, { type: "stop", stop: p("40.00") });
    expect(d).toEqual({ assetId: "HALC", side: "SELL", type: "stop", qty: "40", stop: "40.00", tif: "day" });
    expect("limit" in d).toBe(false);
  });
  it("stop limit: both", () => {
    expect(dayDraft(a, "BUY", q, { type: "stop_limit", stop: p("40.00"), limit: p("39.80") }))
      .toEqual({ assetId: "HALC", side: "BUY", type: "stop_limit", qty: "40", stop: "40.00", limit: "39.80", tif: "day" });
  });
  it("every type passes the orderDraft schema", () => {
    const all: DayDraft[] = [
      dayDraft(a, "BUY", q, { type: "market" }), dayDraft(a, "BUY", q, { type: "limit", limit: p("42.10") }),
      dayDraft(a, "BUY", q, { type: "stop", stop: p("40") }), dayDraft(a, "BUY", q, { type: "stop_limit", stop: p("40"), limit: p("39.8") })];
    for (const d of all) expect(orderDraft(d, "draft")).toEqual(d);
  });
  it("the types refuse a wrong price field (compile-time)", () => {
    // @ts-expect-error a market draft cannot carry a limit
    const m: MarketDayDraft = { assetId: a, side: "BUY", type: "market", qty: q, tif: "day", limit: p("1") };
    // @ts-expect-error a stop limit needs both prices
    const sl: DayDraft = { assetId: a, side: "BUY", type: "stop_limit", qty: q, tif: "day", stop: p("1") };
    // @ts-expect-error a limit draft cannot carry a stop
    const l: DayDraft = { assetId: a, side: "BUY", type: "limit", qty: q, tif: "day", limit: p("1"), stop: p("2") };
    expect([m, sl, l]).toHaveLength(3);
  });
});

describe("BR-5-02 no number parsing or arithmetic (extends BR-4-03)", () => {
  const files = [...readdirSync(DIR).filter((f) => /\.tsx?$/.test(f)).map((f) => join(DIR, f)), "src/shell/contracts/orders.ts"];
  it("the scan covers the card 5 files", () => {
    for (const f of ["OrderType.tsx", "OpenOrders.tsx"]) expect(files).toContain(join(DIR, f));
  });
  it.each(files)("%s", (f) => {
    // `parseIntentId` (orders.ts, card 4) contains the letters "parseInt"; it parses an id string, not a number.
    const src = strip(readFileSync(f, "utf8")).replaceAll("parseIntentId", "readIntentId");
    expect(brokerMathHits(src)).toEqual([]);
    expect(src).not.toMatch(/\.(limit|stop|filled|placedTick)\b\s*[-+*/%]\s*[\w($.]|[\w)\]]\s*[-+*/%]\s*(?:\w+\.)+(limit|stop|filled)\b(?!\s*[:=(])/);
  });
});

describe("BR-5-01 / 08 colour rules (CSS source)", () => {
  it("no brass, gain or loss anywhere in openOrders.css", () => {
    expect(css).not.toMatch(/--acc\b|--gain\b|--loss\b/);
  });
  it("status chips: --steel outline, --fg text", () => {
    expect(css).toMatch(/\.br-oo-chip\s*\{[^}]*border-color:\s*var\(--steel\)[^}]*color:\s*var\(--fg\)/);
  });
  it("reduced motion drops the fresh-row highlight", () => {
    expect(css).toMatch(/html\[data-motion="reduce"\] \.br-oo-row\.fresh\s*\{[^}]*background:\s*transparent/);
  });
});
