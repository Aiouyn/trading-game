// UI card 6: the mock cancel path (orders.ts cancelOrder + MockFeed.orderDoor().cancel) and the ENGINE-TBD seam
// (orderPolicy.ts). BR-6-08 absent id / partly filled / ENGINE-TBD markers; Producer E-98 (1) halted priced orders.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { IntentResult, MeTradingBody, OpenOrder, OrderDraft } from "@/shell/contracts/channels";
import { MockFeed, type Scenario } from "@/shell/contracts/mockFeed";
import { ORDER_POLICY, type OrderPolicy } from "@/shell/contracts/orderPolicy";
import { cancelOrder, parseOrderId, type OrderTransport } from "@/shell/contracts/orders";
import { setFeed } from "@/shell/contracts/useChannel";
import { intentLog } from "@/shell/intentLog";

const LIMIT: OrderDraft = { assetId: "HALC", side: "BUY", type: "limit", qty: "40", limit: "42.10", tif: "day" };
const me = (f: MockFeed) => f.body("me") as MeTradingBody;
const last = (f: MockFeed): IntentResult => me(f).intents.at(-1)!;
const cancels = () => intentLog().filter((i) => i.kind === "mkt.order.cancel");
function rested(scenario: Partial<Scenario> = {}, policy?: OrderPolicy): { f: MockFeed; id: string } {
  const f = new MockFeed(scenario, { tickMs: 3_600_000, ...(policy ? { policy } : {}) });
  f.submit(LIMIT);
  f.advance();
  return { f, id: Object.keys(me(f).orders)[0]! };
}
/** Tests reach the mock's private order map to set an exact state; the browser gets these through the ?partFill / ?cancelKeep / ?cancelGone hooks (below). */
const ordersOf = (f: MockFeed) => f as unknown as { orders: Record<string, OpenOrder> };
afterEach(() => setFeed(null));

describe("orders.ts cancelOrder", () => {
  it("sends one mkt.order.cancel and resolves to the intent id; parseOrderId is non-empty only", async () => {
    const { f, id } = rested();
    setFeed(f);
    const n = cancels().length;
    const r = await cancelOrder(parseOrderId(id)!);
    expect(r.ok && r.value).toMatch(/^i-\d+$/);
    expect(cancels().slice(n)).toEqual([{ kind: "mkt.order.cancel", payload: { orderId: id } }]);
    expect(parseOrderId("")).toBeNull();
    expect(parseOrderId("o-1")).toBe("o-1");
  });
  it("noTransport logs nothing; a bad reply is badReply", async () => {
    const n = intentLog().length;
    expect(await cancelOrder(parseOrderId("o-1")!, null)).toEqual({ ok: false, error: { kind: "noTransport" } });
    expect(intentLog().length).toBe(n);
    const bad: OrderTransport = { preview: () => null, submit: () => "i-1", cancel: () => 42 };
    const r = await cancelOrder(parseOrderId("o-1")!, bad);
    expect(!r.ok && r.error.kind).toBe("badReply");
  });
});

describe("BR-6-08 mock cancel", () => {
  it("present: ACCEPTED next tick, effects order:{id}, order removed", () => {
    const { f, id } = rested();
    const iid = f.cancel(id);
    expect(me(f).orders[id], "nothing changes before the tick").toBeDefined();
    f.advance();
    expect(last(f)).toMatchObject({ intentId: iid, status: "ACCEPTED", effects: [`order:${id}`] });
    expect(me(f).orders[id]).toBeUndefined();
  });
  it("absent id: ACCEPTED, no effects, me.orders unchanged", () => {
    const { f, id } = rested();
    const before = JSON.stringify(me(f).orders);
    const iid = f.cancel("o-404");
    f.advance();
    const r = last(f);
    expect(r).toMatchObject({ intentId: iid, status: "ACCEPTED" });
    expect(r.effects ?? []).toEqual([]);
    expect(JSON.stringify(me(f).orders)).toBe(before);
    expect(me(f).orders[id]).toBeDefined();
  });
  it("partly filled (filled 18 of 40): removed on ACCEPTED", () => {
    const { f, id } = rested();
    const o = ordersOf(f);
    o.orders = { ...o.orders, [id]: { ...o.orders[id]!, filled: "18", status: "PARTIAL" } };
    f.cancel(id);
    f.advance();
    expect(last(f).status).toBe("ACCEPTED");
    expect(me(f).orders[id]).toBeUndefined();
  });
  it("?cancelReject=CODE: REJECTED with the code, order unchanged; ?reject does not touch cancels", () => {
    const { f, id } = rested({ cancelReject: "MKT_X" });
    f.cancel(id);
    f.advance();
    expect(last(f)).toMatchObject({ status: "REJECTED", rejectCode: "MKT_X" });
    expect(me(f).orders[id]).toBeDefined();
  });
  it("?halt=HALC: the cancel is ACCEPTED", () => {
    const { f, id } = rested({ halt: "HALC" });
    f.cancel(id);
    f.advance();
    expect(last(f).status).toBe("ACCEPTED");
    expect(me(f).orders[id]).toBeUndefined();
  });
  it("every ENGINE-TBD rule carries a // ENGINE-TBD comment at its code site", () => {
    const src = readFileSync("src/shell/contracts/mockFeed.ts", "utf8").split("\n");
    const site = (needle: string) => {
      const i = src.findIndex((l) => l.includes(needle));
      expect(i, needle).toBeGreaterThan(-1);
      return src.slice(Math.max(0, i - 3), i + 1).join("\n");
    };
    expect(site("this.policy.cancelUnknown")).toMatch(/\/\/ ENGINE-TBD/);
    expect(site("this.policy.cancelIn.includes")).toMatch(/\/\/ ENGINE-TBD/);
    expect(site("this.orders = rest;")).toMatch(/\/\/ ENGINE-TBD/);
    expect(site("this.policy.haltedRestingStatus")).toMatch(/\/\/ ENGINE-TBD/);
    expect(readFileSync("src/shell/contracts/orderPolicy.ts", "utf8")).toMatch(/ENGINE-TBD/);
  });
});

describe("BR-6-06 / 08 browser hooks (QUAY_HOOKS): ?cancelKeep, ?partFill, ?cancelGone", () => {
  const held = (f: MockFeed) => Number(me(f).positions.HALC?.qty ?? 0);
  it("?cancelKeep=QUEUED_AUCTION: ACCEPTED naming the order, which stays open with that status", () => {
    const { f, id } = rested({ cancelKeep: "QUEUED_AUCTION" });
    const iid = f.cancel(id);
    f.advance();
    expect(last(f)).toMatchObject({ intentId: iid, status: "ACCEPTED", effects: [`order:${id}`] });
    expect(me(f).orders[id]).toMatchObject({ status: "QUEUED_AUCTION", filled: "0" });
  });
  it("?partFill=18: a live priced order rests PARTIAL 18 / 40 with a MAKER fill booked to the position; cancel removes the remainder, the fill stays", () => {
    const base = held(rested().f);
    const { f, id } = rested({ partFill: 18 });
    expect(me(f).orders[id]).toMatchObject({ status: "PARTIAL", filled: "18", qty: "40", avgPrice: "42.10" });
    expect(me(f).fills.at(-1)).toMatchObject({ orderId: id, qty: "18", price: "42.10", liquidity: "MAKER", side: "BUY" });
    expect(held(f)).toBe(base + 18);
    f.cancel(id);
    f.advance();
    expect(last(f)).toMatchObject({ status: "ACCEPTED", effects: [`order:${id}`] });
    expect(me(f).orders[id]).toBeUndefined();
    expect(held(f)).toBe(base + 18);
    expect(me(f).fills.filter((x) => x.orderId === id).map((x) => x.qty)).toEqual(["18"]);
  });
  it("?partFill: never on a halted asset, and N >= qty does not fill", () => {
    expect(me(rested({ partFill: 18, halt: "HALC" }).f).orders).toSatisfy((o: Record<string, OpenOrder>) => Object.values(o).every((x) => x.filled === "0"));
    expect(me(rested({ partFill: 40 }).f).orders).toSatisfy((o: Record<string, OpenOrder>) => Object.values(o).every((x) => x.status === "WORKING"));
  });
  it("?cancelGone=1: a fill takes the order on the next tick with no result; the tick after, the cancel finds no order: ACCEPTED, no effects, other orders unchanged", () => {
    const { f, id } = rested({ cancelGone: true });
    f.submit({ ...LIMIT, limit: "41.50", qty: "7" });
    f.advance();
    const other = Object.keys(me(f).orders).find((k) => k !== id)!;
    const iid = f.cancel(id);
    f.advance();
    expect(me(f).orders[id], "filled in full before the cancel settles").toBeUndefined();
    expect(me(f).fills.at(-1)).toMatchObject({ orderId: id, qty: "40", liquidity: "MAKER" });
    expect(me(f).intents.some((i) => i.intentId === iid), "no result yet").toBe(false);
    const before = JSON.stringify(me(f).orders);
    f.advance();
    const r = last(f);
    expect(r).toMatchObject({ intentId: iid, status: "ACCEPTED" });
    expect(r.effects ?? []).toEqual([]);
    expect(JSON.stringify(me(f).orders)).toBe(before);
    expect(me(f).orders[other]).toBeDefined();
  });
});

describe("orderPolicy.ts is the one seam", () => {
  it("mock defaults", () => {
    expect(ORDER_POLICY).toEqual({
      cancelUnknown: { status: "ACCEPTED" },
      cancelIn: ["CONTINUOUS", "HALTED", "VOL_INTERRUPTION", "LIMIT_LOCKED", "SUSPENDED"],
      cancelClosedCode: "MKT_HALTED",
      cancelPartlyFilled: "removeRemainder",
      cancelGoneBeforeResult: "removeRow",
      haltedRestingStatus: "QUEUED_AUCTION",
    });
  });
  it("the mock reads the policy it is given (unknown id, closed states, halted resting status)", () => {
    const strict: OrderPolicy = { ...ORDER_POLICY, cancelUnknown: { status: "REJECTED", code: "MKT_ORDER_NOT_FOUND" }, cancelIn: ["CONTINUOUS"], cancelClosedCode: "MKT_CLOSED", haltedRestingStatus: "WORKING" };
    const a = rested({}, strict);
    a.f.cancel("o-404");
    a.f.advance();
    expect(last(a.f)).toMatchObject({ status: "REJECTED", rejectCode: "MKT_ORDER_NOT_FOUND" });
    const b = rested({ halt: "HALC" }, strict);
    expect(me(b.f).orders[b.id]!.status).toBe("WORKING");
    b.f.cancel(b.id);
    b.f.advance();
    expect(last(b.f)).toMatchObject({ status: "REJECTED", rejectCode: "MKT_CLOSED" });
    expect(me(b.f).orders[b.id]).toBeDefined();
  });
  it("E-98 (1) default: a halted limit / stop / stop limit rests as QUEUED_AUCTION; live ones WORKING", () => {
    for (const d of [LIMIT, { ...LIMIT, type: "stop", limit: undefined, stop: "40.00" }, { ...LIMIT, type: "stop_limit", stop: "40.00" }] as OrderDraft[]) {
      const f = new MockFeed({ halt: "HALC" }, { tickMs: 3_600_000 });
      f.submit(d);
      f.advance();
      expect(Object.values(me(f).orders).map((o) => o.status)).toEqual(["QUEUED_AUCTION"]);
    }
    expect(me(rested().f).orders).toSatisfy((o: Record<string, OpenOrder>) => Object.values(o).every((x) => x.status === "WORKING"));
  });
  it("no other src file names a policy default", () => {
    const hits = ["src/shell/contracts/mockFeed.ts", "src/apps/broker/OpenOrders.tsx", "src/apps/broker/CancelControl.tsx"]
      .filter((p) => /"removeRemainder"|"removeRow"|haltedRestingStatus:\s*"/.test(readFileSync(p, "utf8").replace(/\/\/.*$/gm, "")));
    expect(hits).toEqual([]);
  });
});
