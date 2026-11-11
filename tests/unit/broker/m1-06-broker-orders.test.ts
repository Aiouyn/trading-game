// M1-06: server-executed, persisted Broker market + limit orders with atomic / idempotent safety.
// Through the real route handlers and AuthService (memory and file stores); prices come from the server clock only.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import { POST as cancelRoute } from "@/app/api/broker/orders/cancel/route";
import * as meRoute from "@/app/api/broker/me/route";
import type { BrokerIntentReply, BrokerLedgerView } from "@/market/brokerLedger";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { AuthError, AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, START_CASH_CENTS } from "@/server/auth";
import type { AccountId } from "@/server/auth/types";
import { BrokerService, setBrokerForTests } from "@/server/broker";
import { dayExpiryTick, decidePlace, reservedCashCents, reservedQty, sweepLedger, type IdSource, type ServerQuote } from "@/server/broker/execution";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { dayCloseTick, dayOfTick } from "@/server/market/rumorFarm";
import { MAX_IDEMPOTENCY, buildPlayerPrivate } from "@/server/player/privateState";
import type { OrderDraft } from "@/shell/contracts/channels";
import { exchangeFeeMinor, fmt, MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { previewOrder, placeOrder, cancelOrder, parseOrderId, mockTransport, type DayDraft } from "@/shell/contracts/orders";
import { openChannel, setFeed } from "@/shell/contracts/useChannel";
import { serverHalfLoaded } from "../helpers/serverHalf";
import * as telemetryEvents from "@/server/telemetry/events";

const fee = (n: number) => exchangeFeeMinor(n, 3);
const minor = (s: string) => Math.round(Number(s) * 100);

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const hit = raw.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!hit) throw new Error("missing session cookie");
  return hit.split(";")[0]!;
}

async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return cookieFrom(res);
}

const post = (url: string, cookie: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST", headers: { "content-type": "application/json", cookie, origin: "http://localhost", ...headers }, body: JSON.stringify(body),
  });

async function place(cookie: string, key: string, draft: OrderDraft): Promise<{ status: number; body: BrokerIntentReply }> {
  const res = await placeRoute(post("/api/broker/orders", cookie, { idempotencyKey: key, draft }));
  return { status: res.status, body: await res.json() };
}
async function cancel(cookie: string, key: string, orderId: string): Promise<{ status: number; body: BrokerIntentReply }> {
  const res = await cancelRoute(post("/api/broker/orders/cancel", cookie, { idempotencyKey: key, orderId }));
  return { status: res.status, body: await res.json() };
}
async function ledger(cookie: string): Promise<BrokerLedgerView> {
  const res = await brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie } }));
  expect(res.status).toBe(200);
  return res.json();
}

const mkt = (assetId: string, side: "BUY" | "SELL", qty: string): OrderDraft => ({ assetId, side, type: "market", qty, tif: "day" });
const lmt = (assetId: string, side: "BUY" | "SELL", qty: string, limit: string): OrderDraft => ({ assetId, side, type: "limit", qty, limit, tif: "day" });

/** A market clock whose marks the test sets. Same snapshot shape as LiveMarket. */
class ControlledMarket {
  private snap: MarketSnapshot;
  private readonly fns = new Set<() => void>();
  constructor() { this.snap = structuredClone(new LiveMarket().snapshot()); }
  snapshot(): MarketSnapshot { return structuredClone(this.snap); }
  stop() {}
  onStep(fn: () => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  onList() { return () => {}; } // L4 listing hook: this stand-in clock lists nothing
  impactListed() { return null; }
  /** Next tick with HALC (or another asset) at `lastMinor`. */
  step(marks: Record<string, number> = {}) {
    this.goto(this.snap.tick + 1, marks, true);
  }
  /** Set the clock to `tick`. `notify` false is a read-only jump (GET must not expire). */
  goto(tick: number, marks: Record<string, number> = {}, notify = true) {
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, tick, quotes: { ...this.snap.quotes, rows } };
    if (notify) for (const fn of this.fns) fn();
  }
  last(id: string) { return minor(this.snap.quotes.rows[id]!.last); }
}

describe("M1-06 Broker market + limit orders on the server", () => {
  let market: ControlledMarket;
  let auth: AuthService;
  const temps: string[] = [];
  const useMarket = (m: ControlledMarket) => setLiveMarketForTests(m as unknown as LiveMarket);

  beforeEach(() => {
    auth = new AuthService({ store: new MemoryAuthStore() });
    setAuthServiceForTests(auth);
    market = new ControlledMarket();
    useMarket(market);
    setBrokerForTests(undefined);
  });
  afterEach(async () => {
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    setFeed(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("buys then sells at the server mark with exact cash and cost basis; receipts name the fill", async () => {
    const a = await signUp("BuyerA");
    const p0 = market.last("HALC");
    const buy = await place(a, "key-buy-0001", mkt("HALC", "BUY", "10"));
    expect(buy.status).toBe(200);
    expect(buy.body.result).toMatchObject({ status: "ACCEPTED", tick: market.snapshot().tick });
    const buyFill = buy.body.ledger.fills.at(-1)!;
    expect(buy.body.result.effects).toEqual([`fill:${buyFill.fillId}`]);
    expect(buyFill).toMatchObject({ side: "BUY", qty: "10", price: fmt(p0, 2), fee: fmt(fee(p0 * 10), 2), liquidity: "TAKER", counterpartyKind: "NPC" });
    expect(buy.body.ledger.cashCents).toBe(START_CASH_CENTS - p0 * 10 - fee(p0 * 10));
    expect(buy.body.ledger.positions.HALC).toEqual({ assetId: "HALC", qty: "10", avgCost: fmt(p0, 2) });

    // Second buy at a new mark re-averages the cost (rounded to the cent, fees excluded).
    market.step({ HALC: p0 + 37 });
    const p1 = p0 + 37;
    const buy2 = await place(a, "key-buy-0002", mkt("HALC", "BUY", "5"));
    const cashAfter2 = START_CASH_CENTS - p0 * 10 - fee(p0 * 10) - p1 * 5 - fee(p1 * 5);
    expect(buy2.body.ledger.cashCents).toBe(cashAfter2);
    expect(buy2.body.ledger.positions.HALC).toEqual({ assetId: "HALC", qty: "15", avgCost: fmt(Math.round((p0 * 10 + p1 * 5) / 15), 2) });

    market.step({ HALC: p0 - 50 });
    const p2 = p0 - 50;
    const sell = await place(a, "key-sell-0001", mkt("HALC", "SELL", "15"));
    expect(sell.body.result.status).toBe("ACCEPTED");
    expect(sell.body.ledger.cashCents).toBe(cashAfter2 + p2 * 15 - fee(p2 * 15));
    expect(sell.body.ledger.positions.HALC).toBeUndefined();
    expect(sell.body.ledger.fills.map((f) => f.side)).toEqual(["BUY", "BUY", "SELL"]);

    // Refresh = a new read of the same saved ledger.
    expect(await ledger(a)).toEqual({ ...sell.body.ledger, tick: market.snapshot().tick });
  });

  it("the client cannot choose price, cash or holdings: extra fields are refused and limits fill at the server mark", async () => {
    const a = await signUp("NoClaims");
    const draft = mkt("HALC", "BUY", "1");
    for (const body of [
      { idempotencyKey: "key-claim-01", draft: { ...draft, price: "0.01" } },
      { idempotencyKey: "key-claim-02", draft, cashCents: 999_999_999 },
      { idempotencyKey: "key-claim-03", draft, positions: { HALC: { qty: "1000" } } },
      { idempotencyKey: "short", draft },
      { draft },
    ]) {
      const res = await placeRoute(post("/api/broker/orders", a, body));
      expect(res.status).toBe(400);
    }
    expect((await ledger(a)).cashCents).toBe(START_CASH_CENTS);
    // A marketable buy limit far above the mark fills at the server mark, never at the client's limit.
    const p = market.last("HALC");
    const r = await place(a, "key-claim-04", lmt("HALC", "BUY", "2", "9999.00"));
    expect(r.body.ledger.fills.at(-1)!.price).toBe(fmt(p, 2));
    expect(r.body.ledger.cashCents).toBe(START_CASH_CENTS - p * 2 - fee(p * 2));
    expect("POST" in meRoute).toBe(false);
  });

  it("refuses signed-out, cross-origin and non-JSON mutations", async () => {
    const a = await signUp("Guarded");
    const body = { idempotencyKey: "key-guard-01", draft: mkt("HALC", "BUY", "1") };
    expect((await placeRoute(post("/api/broker/orders", "", body))).status).toBe(401);
    expect((await placeRoute(post("/api/broker/orders", a, body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await placeRoute(new Request("http://localhost/api/broker/orders", {
      method: "POST", headers: { "content-type": "text/plain", cookie: a, origin: "http://localhost" }, body: JSON.stringify(body),
    }))).status).toBe(415);
    expect((await brokerMe(new Request("http://localhost/api/broker/me"))).status).toBe(401);
    expect((await ledger(a)).cashCents).toBe(START_CASH_CENTS);
  });

  it("business refusals are stored results: unknown asset, bad qty/price, stop types, no cash, oversell", async () => {
    const a = await signUp("Refused");
    const cases: [OrderDraft, string][] = [
      [mkt("NOPE", "BUY", "1"), "MKT_UNKNOWN_ASSET"],
      [mkt("HALC", "BUY", "0"), "MKT_BAD_QTY"],
      [mkt("HALC", "BUY", "1.5"), "MKT_BAD_QTY"],
      [lmt("HALC", "BUY", "1", "0"), "MKT_BAD_PRICE"],
      [lmt("HALC", "BUY", "1", "42.123"), "MKT_BAD_PRICE"],
      [{ assetId: "HALC", side: "SELL", type: "stop", qty: "1", stop: "40.00", tif: "day" }, "MKT_ORDER_TYPE_UNSUPPORTED"],
      [{ ...mkt("HALC", "BUY", "1"), tif: "gtc" }, "MKT_ORDER_TYPE_UNSUPPORTED"],
      [mkt("GX", "BUY", "100"), "MKT_INSUFFICIENT_BP"],
      [mkt("HALC", "SELL", "1"), "MKT_NO_LOCATE"],
    ];
    let i = 0;
    for (const [d, code] of cases) {
      const r = await place(a, `key-refuse-${String(i++).padStart(3, "0")}`, d);
      expect(r.status, code).toBe(200);
      expect(r.body.result, code).toMatchObject({ status: "REJECTED", rejectCode: code });
    }
    const l = await ledger(a);
    expect(l.cashCents).toBe(START_CASH_CENTS);
    expect(l.positions).toEqual({});
    expect(l.fills).toEqual([]);
    expect(l.intents).toHaveLength(cases.length);
  });

  it("one key executes once: sequential and concurrent duplicates replay; a reused key with a new request is 409", async () => {
    const a = await signUp("Retry");
    const p = market.last("HALC");
    const first = await place(a, "key-dup-00001", mkt("HALC", "BUY", "3"));
    const again = await place(a, "key-dup-00001", mkt("HALC", "BUY", "3"));
    expect(again.body.intentId).toBe(first.body.intentId);
    expect(again.body.ledger.cashCents).toBe(first.body.ledger.cashCents);
    const burst = await Promise.all(Array.from({ length: 8 }, () => place(a, "key-dup-00002", mkt("HALC", "BUY", "2"))));
    expect(new Set(burst.map((r) => r.body.intentId)).size).toBe(1);
    const l = await ledger(a);
    expect(l.positions.HALC!.qty).toBe("5");
    expect(l.fills).toHaveLength(2);
    expect(l.cashCents).toBe(START_CASH_CENTS - p * 3 - fee(p * 3) - p * 2 - fee(p * 2));
    const clash = await placeRoute(post("/api/broker/orders", a, { idempotencyKey: "key-dup-00001", draft: mkt("HALC", "BUY", "4") }));
    expect(clash.status).toBe(409);
    expect((await clash.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect((await ledger(a)).fills).toHaveLength(2);
  });

  it("concurrent buys and sells cannot overspend or oversell (atomic checks, no minting)", async () => {
    const a = await signUp("Racer");
    const p = market.last("AVB");
    const each = p * 20 + fee(p * 20);
    const fits = Math.floor(START_CASH_CENTS / each);
    const tries = fits + 6;
    const buys = await Promise.all(Array.from({ length: tries }, (_, i) => place(a, `key-race-b${String(i).padStart(4, "0")}`, mkt("AVB", "BUY", "20"))));
    const ok = buys.filter((r) => r.body.result.status === "ACCEPTED").length;
    expect(ok).toBe(fits);
    expect(buys.filter((r) => r.body.result.rejectCode === "MKT_INSUFFICIENT_BP")).toHaveLength(tries - fits);
    let l = await ledger(a);
    expect(l.cashCents).toBe(START_CASH_CENTS - fits * each);
    expect(l.cashCents).toBeGreaterThanOrEqual(0);
    expect(l.positions.AVB!.qty).toBe(String(fits * 20));

    const held = fits * 20;
    const sells = await Promise.all(Array.from({ length: 12 }, (_, i) => place(a, `key-race-s${String(i).padStart(4, "0")}`, mkt("AVB", "SELL", String(Math.ceil(held / 5))))));
    const sold = sells.filter((r) => r.body.result.status === "ACCEPTED").length;
    expect(sold).toBe(Math.floor(held / Math.ceil(held / 5)));
    l = await ledger(a);
    const left = held - sold * Math.ceil(held / 5);
    expect(l.positions.AVB?.qty ?? "0").toBe(String(left));
    expect(sells.filter((r) => r.body.result.rejectCode === "MKT_NO_LOCATE")).toHaveLength(12 - sold);
  });

  it("a working buy limit reserves cash, fills on the server tick at its limit, and a cancel releases it", async () => {
    const a = await signUp("Limits");
    const p = market.last("HALC");
    const limit = p - 100;
    const w = await place(a, "key-lim-00001", lmt("HALC", "BUY", "100", fmt(limit, 2)));
    const orderId = w.body.result.effects![0]!.replace("order:", "");
    expect(w.body.result.effects).toEqual([`order:${orderId}`]);
    expect(w.body.ledger.orders[orderId]).toMatchObject({ status: "WORKING", side: "BUY", type: "limit", qty: "100", filled: "0", limit: fmt(limit, 2), tif: "day" });
    const reserved = limit * 100 + fee(limit * 100);
    expect(w.body.ledger.reservedCashCents).toBe(reserved);
    expect(w.body.ledger.cashCents).toBe(START_CASH_CENTS);

    // Reserved cash is not spendable by another order.
    const spendable = START_CASH_CENTS - reserved;
    const qtyTooMuch = Math.floor(spendable / p) + 1;
    expect((await place(a, "key-lim-00002", mkt("HALC", "BUY", String(qtyTooMuch)))).body.result.rejectCode).toBe("MKT_INSUFFICIENT_BP");

    // Mark stays above the limit: nothing fills.
    market.step({ HALC: limit + 1 });
    await auth.sweepPrivateStates(() => null);
    expect((await ledger(a)).orders[orderId]).toBeDefined();
    // Mark trades through the limit: fills in full at the limit (maker) on that server tick.
    market.step({ HALC: limit - 30 });
    await vi.waitFor(async () => expect((await ledger(a)).orders[orderId]).toBeUndefined());
    const l = await ledger(a);
    expect(l.positions.HALC).toEqual({ assetId: "HALC", qty: "100", avgCost: fmt(limit, 2) });
    expect(l.cashCents).toBe(START_CASH_CENTS - reserved);
    expect(l.reservedCashCents).toBe(0);
    expect(l.fills.at(-1)).toMatchObject({ orderId, price: fmt(limit, 2), liquidity: "MAKER", qty: "100" });

    // A sell limit holds units; cancelling returns them.
    const s = await place(a, "key-lim-00003", lmt("HALC", "SELL", "60", fmt(limit + 5000, 2)));
    const sellId = s.body.result.effects![0]!.replace("order:", "");
    expect((await place(a, "key-lim-00004", mkt("HALC", "SELL", "41"))).body.result.rejectCode).toBe("MKT_NO_LOCATE");
    const c = await cancel(a, "key-cxl-00001", sellId);
    expect(c.body.result).toMatchObject({ status: "ACCEPTED", effects: [`order:${sellId}`] });
    expect(c.body.ledger.orders[sellId]).toBeUndefined();
    const replay = await cancel(a, "key-cxl-00001", sellId);
    expect(replay.body.intentId).toBe(c.body.intentId);
    expect((await place(a, "key-lim-00005", mkt("HALC", "SELL", "41"))).body.result.status).toBe("ACCEPTED");
  });

  it("a second account cannot see or cancel another player's orders", async () => {
    const a = await signUp("OwnerA");
    const b = await signUp("OtherB");
    const p = market.last("VOLT");
    const w = await place(a, "key-own-00001", lmt("VOLT", "BUY", "3", fmt(p - 200, 2)));
    const orderId = w.body.result.effects![0]!.replace("order:", "");
    await place(a, "key-own-00002", mkt("HALC", "BUY", "4"));
    const lb = await ledger(b);
    expect(lb).toMatchObject({ cashCents: START_CASH_CENTS, reservedCashCents: 0, positions: {}, orders: {}, fills: [], intents: [] });
    const c = await cancel(b, "key-own-00003", orderId);
    expect(c.body.result.status).toBe("ACCEPTED");
    expect(c.body.result.effects).toBeUndefined();
    expect((await ledger(a)).orders[orderId]).toBeDefined();
    // B's own key space is separate: the same key string in A's ledger is not B's replay.
    const bBuy = await place(b, "key-own-00002", mkt("HALC", "SELL", "1"));
    expect(bBuy.body.result.rejectCode).toBe("MKT_NO_LOCATE");
  });

  it("cash, cost basis, working limits and decided keys survive a service restart on the same file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-06-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("Restart");
    const p = market.last("HALC");
    const buy = await place(a, "key-rst-00001", mkt("HALC", "BUY", "7"));
    const w = await place(a, "key-rst-00002", lmt("HALC", "BUY", "5", fmt(p - 300, 2)));
    const before = await ledger(a);

    // "Process restart": a fresh AuthService + Broker over the same store file, and a new market clock.
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    useMarket(new ControlledMarket());
    const after = await ledger(a);
    expect({ ...after, tick: 0 }).toEqual({ ...before, tick: 0 });
    expect(after.positions.HALC).toEqual({ assetId: "HALC", qty: "7", avgCost: fmt(p, 2) });
    expect(Object.values(after.orders)).toHaveLength(1);
    // Reconnect after restart with the same key: no second execution.
    const again = await place(a, "key-rst-00001", mkt("HALC", "BUY", "7"));
    expect(again.body.intentId).toBe(buy.body.intentId);
    expect(again.body.ledger.cashCents).toBe(before.cashCents);
    expect(w.body.result.status).toBe("ACCEPTED");
    const disk = JSON.parse(await readFile(file, "utf8")) as { players: { fills?: unknown[]; intents?: unknown[]; idempotency?: unknown[] }[] };
    expect(disk.players[0]!.fills).toHaveLength(1);
    expect(disk.players[0]!.intents).toHaveLength(2);
    expect(disk.players[0]!.idempotency).toHaveLength(2);
  });

  it("a failed persist rolls back the order and the sweep (memory never runs ahead of disk)", async () => {
    const store = new MemoryAuthStore();
    const svc = new AuthService({ store });
    setAuthServiceForTests(svc);
    const a = await signUp("Rollback");
    const p = market.last("HALC");
    await place(a, "key-rb-000001", lmt("HALC", "BUY", "2", fmt(p - 10, 2)));
    const save = vi.spyOn(store, "save").mockRejectedValue(new Error("disk full"));
    const res = await placeRoute(post("/api/broker/orders", a, { idempotencyKey: "key-rb-000002", draft: mkt("HALC", "BUY", "1") }));
    expect(res.status).toBe(500);
    const broker = new BrokerService({ auth: () => svc, market: () => market as unknown as LiveMarket });
    market.step({ HALC: p - 20 });
    await expect(broker.sweep()).rejects.toThrow("disk full");
    save.mockRestore();
    const l = await ledger(a);
    expect(l.cashCents).toBe(START_CASH_CENTS);
    expect(Object.keys(l.orders)).toHaveLength(1);
    expect(l.intents).toHaveLength(1);
  });

  it("the signed-in feed sends one key per Place, retries with the same key, and shows only the server ledger", async () => {
    vi.useFakeTimers();
    const a = await signUp("FeedUser");
    const sent: { url: string; body: Record<string, unknown> | null }[] = [];
    let dropNext = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      sent.push({ url: input, body });
      if (input === "/api/market") return Response.json(market.snapshot());
      if (input === "/api/broker/me") return brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie: a, origin: "http://localhost" } }));
      if (input === "/api/broker/orders") {
        if (dropNext) { dropNext = false; throw new TypeError("network down"); } // reply lost: client must retry with the same key
        return placeRoute(post(input, a, body));
      }
      if (input === "/api/broker/orders/cancel") return cancelRoute(post(input, a, body));
      return new Response(null, { status: 404 });
    }));
    const feed = new MockFeed({ empty: true, seed: 17 }, { authoritativeQuotes: true });
    setFeed(feed);
    const meStore = openChannel(feed, "me");
    const ticker = openChannel(feed, "ticker:wl_default");
    expect(meStore.get().state).toBe("loading");
    await serverHalfLoaded(feed);
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    expect(meStore.get().state).toBe("live");
    expect(meStore.get().body!.balances.FDL).toBe("10000.00");

    // Advisory preview flags what the server would refuse.
    const tooBig = await previewOrder({ assetId: "GX", side: "BUY", type: "market", qty: "100", tif: "day" } as DayDraft);
    expect(tooBig.ok && tooBig.value).toMatchObject({ valid: false, reasonCode: "MKT_INSUFFICIENT_BP" });
    const stop = await previewOrder({ assetId: "HALC", side: "SELL", type: "stop", qty: "1", stop: "1.00", tif: "day" } as DayDraft);
    expect(stop.ok && stop.value).toMatchObject({ valid: false, reasonCode: "MKT_ORDER_TYPE_UNSUPPORTED" });

    const p = market.last("HALC");
    const placed = placeOrder({ assetId: "HALC", side: "BUY", type: "market", qty: "4", tif: "day" } as DayDraft);
    await vi.advanceTimersByTimeAsync(2000);
    const r = await placed;
    expect(r.ok).toBe(true);
    const posts = sent.filter((s) => s.url === "/api/broker/orders");
    expect(posts).toHaveLength(2);
    expect(posts[0]!.body!.idempotencyKey).toBe(posts[1]!.body!.idempotencyKey);
    expect(String(posts[0]!.body!.idempotencyKey)).toMatch(/^[0-9a-f]{32}$/);
    const body = meStore.get().body!;
    expect(body.intents.find((i) => r.ok && i.intentId === r.value)).toMatchObject({ status: "ACCEPTED" });
    expect(body.positions.HALC).toMatchObject({ qty: "4", avgCost: fmt(p, 2) });
    expect(body.balances.FDL).toBe(fmt(START_CASH_CENTS - p * 4 - fee(p * 4), 2));

    // A second Place is a new key; a limit rests and cancel goes to the server too.
    const lim = await placeOrder({ assetId: "HALC", side: "BUY", type: "limit", qty: "2", limit: fmt(p - 500, 2), tif: "day" } as DayDraft);
    const keys = sent.filter((s) => s.url === "/api/broker/orders").map((s) => s.body!.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    const oid = Object.keys(meStore.get().body!.orders)[0]!;
    expect(lim.ok).toBe(true);
    const c = await cancelOrder(parseOrderId(oid)!);
    expect(c.ok).toBe(true);
    expect(meStore.get().body!.orders).toEqual({});
    expect(mockTransport()).not.toBeNull();
    meStore.close();
    ticker.close();
  });


  it("a key evicted from the last-50 receipt ring still replays and does not fill again, including after restart", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-06-win-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    const traded = vi.spyOn(telemetryEvents, "recordEventSafe");
    const a = await signUp("Window");
    const p = market.last("HALC");
    const first = await place(a, "key-win-00001", mkt("HALC", "BUY", "1"));
    expect(first.status).toBe(200);
    expect(first.body.result.status).toBe("ACCEPTED");
    const firstId = first.body.intentId;
    for (let i = 2; i <= 51; i++) {
      const r = await place(a, `key-win-${String(i).padStart(5, "0")}`, mkt("HALC", "BUY", "1"));
      expect(r.status, `place ${i}`).toBe(200);
      expect(r.body.result.status).toBe("ACCEPTED");
    }
    const mid = await ledger(a);
    expect(mid.intents).toHaveLength(50);
    expect(mid.intents.map((x) => x.intentId)).not.toContain(firstId);
    expect(mid.fills).toHaveLength(50);
    const cash = mid.cashCents;
    expect(cash).toBe(START_CASH_CENTS - 51 * (p + fee(p)));

    const again = await place(a, "key-win-00001", mkt("HALC", "BUY", "1"));
    expect(again.status).toBe(200);
    expect(again.body.intentId).toBe(firstId);
    expect(again.body.result).toEqual(first.body.result);
    expect(again.body.ledger.cashCents).toBe(cash);
    expect((await ledger(a)).fills).toHaveLength(50);

    const clash = await placeRoute(post("/api/broker/orders", a, { idempotencyKey: "key-win-00001", draft: mkt("HALC", "BUY", "2") }));
    expect(clash.status).toBe(409);
    expect((await clash.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect((await ledger(a)).cashCents).toBe(cash);

    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    useMarket(new ControlledMarket());
    const after = await place(a, "key-win-00001", mkt("HALC", "BUY", "1"));
    expect(after.body.intentId).toBe(firstId);
    expect(after.body.ledger.cashCents).toBe(cash);
    const clash2 = await placeRoute(post("/api/broker/orders", a, { idempotencyKey: "key-win-00001", draft: mkt("HALC", "BUY", "2") }));
    expect(clash2.status).toBe(409);
    const disk = JSON.parse(await readFile(file, "utf8")) as { players: { fills?: unknown[]; intents?: unknown[]; idempotency?: unknown[] }[] };
    expect(disk.players[0]!.intents).toHaveLength(50);
    expect(disk.players[0]!.idempotency).toHaveLength(51);
    expect(traded.mock.calls.filter((c) => c[0] === "first_trade")).toHaveLength(1);
  });

  it("a full idempotency journal fails closed with IDEMPOTENCY_JOURNAL_FULL and does not execute", () => {
    const rec = buildPlayerPrivate(`acc_${"b".repeat(32)}` as AccountId, {
      cashCents: START_CASH_CENTS,
      positions: {},
      openOrders: {},
      idempotency: Array.from({ length: MAX_IDEMPOTENCY }, (_, i) => ({
        key: `full${String(i).padStart(4, "0")}`,
        fingerprint: '["place","HALC","BUY","market","1",null,null,"day"]',
        result: { intentId: `i_full${i}`, tick: 1, status: "REJECTED" as const, rejectCode: "MKT_BAD_QTY" },
      })),
    });
    const quote: ServerQuote = { tick: market.snapshot().tick, last: (id) => (id === "HALC" ? market.last("HALC") : null), tradable: () => true };
    const ids: IdSource = { next: (kind) => `${kind}_full` };
    try {
      decidePlace(rec, "newkey01", mkt("HALC", "BUY", "1"), quote, ids);
      throw new Error("expected IDEMPOTENCY_JOURNAL_FULL");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect(err).toMatchObject({ code: "IDEMPOTENCY_JOURNAL_FULL", status: 503, message: "Idempotency journal is full." });
    }
    expect(rec.cashCents).toBe(START_CASH_CENTS);
    expect(rec.openOrders).toEqual({});
    expect(rec.fills ?? []).toEqual([]);
  });

  it("guests keep the local example Broker and never call the server door", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const feed = new MockFeed({ empty: true }, { autoStart: false });
    setFeed(feed);
    const r = await placeOrder({ assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" } as DayDraft);
    expect(r.ok).toBe(true);
    feed.advance();
    expect((feed.body("me") as { positions: Record<string, unknown> }).positions.HALC).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it("a resting day limit expires at the placement day's close, releases its hold exactly, and stays idempotent", async () => {
    const a = await signUp("DayBuy");
    const p = market.last("HALC");
    const limit = p - 100;
    const w = await place(a, "key-day-00001", lmt("HALC", "BUY", "8", fmt(limit, 2)));
    const orderId = w.body.result.effects![0]!.replace("order:", "");
    const reserved = limit * 8 + fee(limit * 8);
    expect(w.body.ledger.reservedCashCents).toBe(reserved);
    const placed = market.snapshot().tick;
    const close = dayExpiryTick(placed);
    expect(close).toBe(dayCloseTick(dayOfTick(placed)));
    expect(close).toBeGreaterThan(placed);

    market.step({ HALC: p });
    await auth.sweepPrivateStates(() => null);
    let l = await ledger(a);
    expect(l.orders[orderId]?.status).toBe("WORKING");
    expect(l.reservedCashCents).toBe(reserved);
    expect((l.history ?? [])).toEqual([]);

    // GET at the close, without a sweep, must not expire or persist.
    market.goto(close, { HALC: p }, false);
    l = await ledger(a);
    expect(l.orders[orderId]?.status).toBe("WORKING");
    expect(l.reservedCashCents).toBe(reserved);
    expect((l.history ?? [])).toEqual([]);
    expect(l.cashCents).toBe(START_CASH_CENTS);

    market.goto(close, { HALC: p }, true);
    await vi.waitFor(async () => expect((await ledger(a)).orders[orderId]?.status).toBe("EXPIRED"));
    l = await ledger(a);
    expect(l.cashCents).toBe(START_CASH_CENTS);
    expect(l.reservedCashCents).toBe(0);
    expect(l.positions).toEqual({});
    expect(l.orders[orderId]).toMatchObject({ status: "EXPIRED", qty: "8", filled: "0", tif: "day", limit: fmt(limit, 2) });
    expect((l.history ?? [])).toEqual([expect.objectContaining({ orderId, status: "EXPIRED", qty: "8", filled: "0", tick: close })]);

    market.goto(close + 1, { HALC: p }, true);
    await auth.sweepPrivateStates(() => null);
    const again = await ledger(a);
    expect(again.cashCents).toBe(START_CASH_CENTS);
    expect(again.reservedCashCents).toBe(0);
    expect((again.history ?? [])).toHaveLength(1);
    expect(again.orders[orderId]?.status).toBe("EXPIRED");
  });

  it("a resting day sell releases reserved shares exactly; a post-close jump does not fill at a later mark", async () => {
    const a = await signUp("DaySell");
    const p = market.last("HALC");
    await place(a, "key-day-s0001", mkt("HALC", "BUY", "5"));
    const afterBuy = await ledger(a);
    const lot = 5;
    const limit = p + 5_000;
    const s = await place(a, "key-day-s0002", lmt("HALC", "SELL", "5", fmt(limit, 2)));
    const orderId = s.body.result.effects![0]!.replace("order:", "");
    expect((await place(a, "key-day-s0003", mkt("HALC", "SELL", "1"))).body.result.rejectCode).toBe("MKT_NO_LOCATE");
    const close = dayExpiryTick(market.snapshot().tick);
    // Jump past the close with a mark that would have filled the limit, had the order still been live.
    market.goto(close + 25, { HALC: limit + 100 }, true);
    await vi.waitFor(async () => expect((await ledger(a)).orders[orderId]?.status).toBe("EXPIRED"));
    const l = await ledger(a);
    expect(l.cashCents).toBe(afterBuy.cashCents);
    expect(l.positions.HALC).toEqual(afterBuy.positions.HALC);
    expect(l.positions.HALC!.qty).toBe(String(lot));
    expect(l.reservedCashCents).toBe(0);
    expect(l.fills.filter((f) => f.orderId === orderId)).toHaveLength(0);
    expect((l.history ?? [])).toEqual([expect.objectContaining({ orderId, status: "EXPIRED", side: "SELL", tick: close })]);
    expect((await place(a, "key-day-s0004", mkt("HALC", "SELL", "5"))).body.result.status).toBe("ACCEPTED");
  });

  it("a day limit that is marketable at the close fills there; GET does not write the store", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-06-day-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    const a = await signUp("DayFill");
    const p = market.last("HALC");
    const limit = p - 50;
    const w = await place(a, "key-day-f0001", lmt("HALC", "BUY", "4", fmt(limit, 2)));
    const orderId = w.body.result.effects![0]!.replace("order:", "");
    const reserved = limit * 4 + fee(limit * 4);
    const close = dayExpiryTick(market.snapshot().tick);
    const before = JSON.parse(await readFile(file, "utf8")) as { players: unknown };
    market.goto(close, { HALC: p }, false);
    const peeked = await ledger(a);
    expect(peeked.orders[orderId]?.status).toBe("WORKING");
    expect(peeked.reservedCashCents).toBe(reserved);
    const afterGet = JSON.parse(await readFile(file, "utf8")) as { players: unknown };
    expect(afterGet.players).toEqual(before.players); // session lastSeen may move; the ledger must not

    market.goto(close, { HALC: limit - 10 }, true);
    await vi.waitFor(async () => expect((await ledger(a)).orders[orderId]).toBeUndefined());
    const l = await ledger(a);
    expect(l.cashCents).toBe(START_CASH_CENTS - reserved);
    expect(l.positions.HALC).toEqual({ assetId: "HALC", qty: "4", avgCost: fmt(limit, 2) });
    expect((l.history ?? []).filter((h) => h.orderId === orderId)).toEqual([]);
    expect(l.fills.at(-1)).toMatchObject({ orderId, liquidity: "MAKER", qty: "4", price: fmt(limit, 2) });
  });

  it("day expiry is isolated per account and survives a FileAuthStore restart", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "m1-06-day-r-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    useMarket(market);
    const a = await signUp("DayIsoA");
    const b = await signUp("DayIsoB");
    const p = market.last("HALC");
    const limitA = p - 80;
    const limitB = p - 120;
    const wa = await place(a, "key-day-a0001", lmt("HALC", "BUY", "2", fmt(limitA, 2)));
    const wb = await place(b, "key-day-b0001", lmt("HALC", "BUY", "3", fmt(limitB, 2)));
    const idA = wa.body.result.effects![0]!.replace("order:", "");
    const idB = wb.body.result.effects![0]!.replace("order:", "");
    const close = dayExpiryTick(market.snapshot().tick);
    market.goto(close, { HALC: p }, true);
    await vi.waitFor(async () => {
      expect((await ledger(a)).orders[idA]?.status).toBe("EXPIRED");
      expect((await ledger(b)).orders[idB]?.status).toBe("EXPIRED");
    });
    const la = await ledger(a);
    const lb = await ledger(b);
    expect(la.cashCents).toBe(START_CASH_CENTS);
    expect(lb.cashCents).toBe(START_CASH_CENTS);
    expect(la.reservedCashCents).toBe(0);
    expect(lb.reservedCashCents).toBe(0);
    expect(la.orders[idB]).toBeUndefined();
    expect(lb.orders[idA]).toBeUndefined();
    expect((la.history ?? [])).toEqual([expect.objectContaining({ orderId: idA, status: "EXPIRED" })]);
    expect((lb.history ?? [])).toEqual([expect.objectContaining({ orderId: idB, status: "EXPIRED" })]);

    const auth2 = new AuthService({ store: new FileAuthStore(file) });
    setAuthServiceForTests(auth2);
    setBrokerForTests(undefined);
    await new BrokerService({ auth: () => auth2, market: () => market as unknown as LiveMarket }).sweep();
    const ra = await ledger(a);
    const rb = await ledger(b);
    expect(ra.cashCents).toBe(START_CASH_CENTS);
    expect(rb.cashCents).toBe(START_CASH_CENTS);
    expect((ra.history ?? [])).toHaveLength(1);
    expect((rb.history ?? [])).toHaveLength(1);
    expect(ra.orders[idA]?.status).toBe("EXPIRED");
    const disk = JSON.parse(await readFile(file, "utf8")) as { players: { orderHistory?: unknown[]; accountId: string }[] };
    expect(disk.players.every((row) => (row.orderHistory ?? []).length === 1)).toBe(true);
  });

  it("a partly filled day remainder expires and releases only the leftover hold", () => {
    const placed = market.snapshot().tick;
    const close = dayExpiryTick(placed);
    const rec = buildPlayerPrivate(`acc_${"a".repeat(32)}` as AccountId, {
      cashCents: START_CASH_CENTS,
      positions: { HALC: { assetId: "HALC", qty: "3", avgCost: "10.00" } },
      openOrders: {
        o_partial: {
          orderId: "o_partial", assetId: "HALC", side: "BUY", type: "limit", qty: "10", filled: "3",
          limit: "10.00", tif: "day", status: "PARTIAL", placedTick: placed, avgPrice: "10.00",
        },
      },
    });
    const leftover = 1000 * 7 + fee(1000 * 7);
    expect(reservedCashCents(rec)).toBe(leftover);
    const ids: IdSource = { next: (kind) => `${kind}_t` };
    const quote = { tick: close, last: (id: string) => (id === "HALC" ? 1_500 : null), tradable: () => true };
    const next = sweepLedger(rec, quote, ids);
    expect(next).not.toBeNull();
    expect(next!.cashCents).toBe(START_CASH_CENTS);
    expect(next!.openOrders.o_partial).toMatchObject({ status: "EXPIRED", filled: "3", qty: "10" });
    expect(reservedCashCents(next!)).toBe(0);
    expect(reservedQty(next!, "HALC")).toBe(0);
    expect(next!.orderHistory).toEqual([expect.objectContaining({ orderId: "o_partial", status: "EXPIRED", filled: "3", tick: close })]);
    expect(sweepLedger(buildPlayerPrivate(rec.accountId, next!), quote, ids)).toBeNull();
  });
});
