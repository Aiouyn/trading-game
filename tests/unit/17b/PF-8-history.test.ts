// UI card 8: GET /orders/me, the ENGINE-TBD client contract (orderHistory.ts) and the mock that stands in for it
// (mockFeed.ts `ordersHistory`, rules from orderPolicy.ts ORDER_HISTORY_POLICY). No UI reads it yet (Gap 1).
import { afterEach, describe, expect, it } from "vitest";
import type { MeTradingBody, OrderDraft, OrderHistoryRow } from "@/shell/contracts/channels";
import { MockFeed, type Scenario } from "@/shell/contracts/mockFeed";
import { loadOrderHistory, parseOrderHistory, type OrderHistoryTransport } from "@/shell/contracts/orderHistory";
import { ORDER_HISTORY_POLICY } from "@/shell/contracts/orderPolicy";
import { setFeed } from "@/shell/contracts/useChannel";

afterEach(() => setFeed(null));
const LIMIT: OrderDraft = { assetId: "HALC", side: "BUY", type: "limit", qty: "40", limit: "42.10", tif: "day" };
const MARKET: OrderDraft = { assetId: "VOLT", side: "BUY", type: "market", qty: "10", tif: "day" };
const me = (f: MockFeed) => f.body("me") as MeTradingBody;
const feed = (s: Partial<Scenario> = {}, pageSize?: number) =>
  new MockFeed(s, { tickMs: 3_600_000, ...(pageSize ? { historyPolicy: { ...ORDER_HISTORY_POLICY, pageSize } } : {}) });

/** tick 1: market fill (FILLED) + a limit rests; tick 2: cancel it (CANCELLED); tick 3: a limit part-fills and fills. */
function story(pageSize?: number): MockFeed {
  const f = feed({ partFill: 30 }, pageSize);
  f.submit(MARKET);
  f.submit({ ...LIMIT, qty: "20" }); // <= partFill: rests whole
  f.advance();
  f.cancel(Object.keys(me(f).orders)[0]!);
  f.advance();
  f.submit({ ...LIMIT, qty: "60" }); // > partFill: rests, then fills 30 next tick
  f.advance();
  f.advance();
  return f;
}

describe("mock GET /orders/me", () => {
  it("records FILLED, CANCELLED (with its fills) newest first; strings as the order had them", async () => {
    const f = story();
    setFeed(f);
    const r = await loadOrderHistory();
    expect(r.ok).toBe(true);
    const rows = r.ok ? r.value.rows : [];
    expect(rows.map((x) => [x.status, x.type, x.qty, x.filled])).toEqual([["CANCELLED", "limit", "20", "0"], ["FILLED", "market", "10", "10"]]);
    const market = rows.find((x) => x.type === "market")!;
    const fillPx = me(f).fills.find((x) => x.orderId === market.orderId)!.price;
    expect(market).toMatchObject({ status: "FILLED", assetId: "VOLT", side: "BUY", qty: "10", filled: "10", avgPrice: fillPx });
    expect(rows.find((x) => x.status === "CANCELLED")).toMatchObject({ assetId: "HALC", qty: "20", filled: "0", avgPrice: "0.00" });
    expect(r.ok && r.value.nextCursor).toBeNull();
    const ticks = rows.map((x) => x.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => b - a));
  });
  it("a resting order that fills in full closes FILLED at its limit; a part fill stays open", () => {
    const f = feed({ partFill: 30 });
    f.submit({ ...LIMIT, qty: "60" });
    f.advance();
    f.advance(); // 30 of 60
    expect(f.ordersHistory({}).rows).toEqual([]);
    const id = Object.keys(me(f).orders)[0]!;
    (f as unknown as { fillRest(id: string): void }).fillRest(id);
    expect(f.ordersHistory({}).rows).toMatchObject([{ orderId: id, status: "FILLED", qty: "60", filled: "60", avgPrice: "42.10", type: "limit" }]);
  });
  it("a rejected place is listed under its intentId with its code (policy: rejectedOrderId intentId)", () => {
    const f = feed({ reject: "MKT_BAD_QTY" });
    const iid = f.submit(MARKET);
    f.advance();
    expect(f.ordersHistory({}).rows).toEqual([{ orderId: iid, assetId: "VOLT", side: "BUY", type: "market", qty: "10", filled: "0", avgPrice: "0.00", status: "REJECTED", rejectCode: "MKT_BAD_QTY", tick: me(f).intents.at(-1)!.tick }]);
  });
  it("filters by status and from..to; pages by the policy's size with an opaque cursor", async () => {
    const f = story(1);
    const all: OrderHistoryRow[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const r = f.ordersHistory(cursor === undefined ? {} : { cursor });
      expect(r.rows.length).toBeLessThanOrEqual(1);
      all.push(...r.rows);
      if (r.nextCursor === null) break;
      cursor = r.nextCursor;
    }
    expect(all.map((x) => x.status)).toEqual(["CANCELLED", "FILLED"]);
    expect(all).toEqual(story().ordersHistory({}).rows);
    expect(f.ordersHistory({ status: "CANCELLED" }).rows.map((x) => x.status)).toEqual(["CANCELLED"]);
    const t = all.find((x) => x.status === "CANCELLED")!.tick;
    expect(story().ordersHistory({ from: t, to: t }).rows.map((x) => x.status)).toEqual(["CANCELLED"]);
    expect(f.ordersHistory({ cursor: "nope" }).rows).toEqual([]);
    setFeed(f);
    const page = await loadOrderHistory({}, undefined, { ...ORDER_HISTORY_POLICY, pageSize: 1 });
    expect(page.ok && page.value.rows.length).toBe(1);
  });
  it("?empty=1: no history", () => expect(feed({ empty: true }).ordersHistory({})).toEqual({ rows: [], nextCursor: null }));
});

describe("orderHistory.ts boundary", () => {
  const row: OrderHistoryRow = { orderId: "o-1", assetId: "HALC", side: "BUY", type: "limit", qty: "1", filled: "1", avgPrice: "1.00", status: "FILLED", tick: 5 };
  const bad = (raw: unknown, req = {}) => expect(() => parseOrderHistory(raw, req)).toThrow();
  it("parses a good page", () => expect(parseOrderHistory({ rows: [row], nextCursor: null }, {})).toEqual({ rows: [row], nextCursor: null }));
  it("rejects: unknown key, numeric money, older-first, outside from..to, wrong status, stray rejectCode, too many rows", () => {
    bad({ rows: [{ ...row, x: 1 }], nextCursor: null });
    bad({ rows: [{ ...row, avgPrice: 1 }], nextCursor: null });
    bad({ rows: [{ ...row, tick: 4 }, { ...row, tick: 5 }], nextCursor: null });
    bad({ rows: [row], nextCursor: null }, { from: 6 });
    bad({ rows: [row], nextCursor: null }, { to: 4 });
    bad({ rows: [row], nextCursor: null }, { status: "CANCELLED" });
    bad({ rows: [{ ...row, rejectCode: "X" }], nextCursor: null });
    bad({ rows: [{ ...row, status: "REJECTED" }], nextCursor: null });
    bad({ rows: [{ ...row, tick: -1 }], nextCursor: null });
    bad({ rows: [row] });
    expect(() => parseOrderHistory({ rows: [row, row], nextCursor: null }, {}, { ...ORDER_HISTORY_POLICY, pageSize: 1 })).toThrow(/more than 1 rows/);
    expect(parseOrderHistory({ rows: [row, row], nextCursor: "2" }, { from: 5, to: 5, status: "FILLED" }).rows).toHaveLength(2);
  });
  it("noTransport; a bad request never leaves; a throwing or malformed transport is badReply", async () => {
    expect(await loadOrderHistory({}, null)).toEqual({ ok: false, error: { kind: "noTransport" } });
    let sent = 0;
    const t: OrderHistoryTransport = { ordersHistory: () => { sent++; return { rows: [], nextCursor: null }; } };
    const r = await loadOrderHistory({ from: -1 }, t);
    expect([!r.ok && r.error.kind, sent]).toEqual(["badReply", 0]);
    const boom = await loadOrderHistory({}, { ordersHistory: () => Promise.reject(new Error("down")) });
    expect(!boom.ok && boom.error).toEqual({ kind: "badReply", detail: "down" });
    const junk = await loadOrderHistory({}, { ordersHistory: () => "x" });
    expect(!junk.ok && junk.error.kind).toBe("badReply");
  });
});
