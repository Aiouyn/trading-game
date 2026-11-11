// Stop, stop-limit and GTC on the server broker. Triggering is the tick sweep; a read never arms or expires.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import { POST as cancelRoute } from "@/app/api/broker/orders/cancel/route";
import type { BrokerIntentReply, BrokerLedgerView } from "@/market/brokerLedger";
import { ASSETS, ASSET_BY_ID, WATCHLISTS } from "@/market/catalog";
import { appendAsset, listedDef, resetListingsForTests } from "@/market/listings";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, START_CASH_CENTS } from "@/server/auth";
import type { AccountId } from "@/server/auth/types";
import { getBroker, setBrokerForTests } from "@/server/broker";
import { dayExpiryTick, sweepListed, type IdSource } from "@/server/broker/execution";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { buildPlayerPrivate } from "@/server/player/privateState";
import type { OrderDraft } from "@/shell/contracts/channels";
import { exchangeFeeMinor, fmt } from "@/shell/contracts/mockFeed";

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
const post = (url: string, cookie: string, body: unknown) =>
  new Request(`http://localhost${url}`, {
    method: "POST", headers: { "content-type": "application/json", cookie, origin: "http://localhost" }, body: JSON.stringify(body),
  });
async function place(cookie: string, key: string, draft: OrderDraft): Promise<BrokerIntentReply> {
  const res = await placeRoute(post("/api/broker/orders", cookie, { idempotencyKey: key, draft }));
  expect(res.status).toBe(200);
  return res.json();
}
async function cancel(cookie: string, key: string, orderId: string): Promise<BrokerIntentReply> {
  const res = await cancelRoute(post("/api/broker/orders/cancel", cookie, { idempotencyKey: key, orderId }));
  expect(res.status).toBe(200);
  return res.json();
}
async function ledger(cookie: string): Promise<BrokerLedgerView> {
  const res = await brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie } }));
  expect(res.status).toBe(200);
  return res.json();
}
const orderIdOf = (r: BrokerIntentReply) => r.result.effects!.find((e) => e.startsWith("order:"))!.slice(6);

class ControlledMarket {
  private snap: MarketSnapshot;
  private readonly fns = new Set<() => void>();
  constructor() { this.snap = structuredClone(new LiveMarket().snapshot()); }
  snapshot(): MarketSnapshot { return structuredClone(this.snap); }
  stop() {}
  onStep(fn: () => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  onList() { return () => {}; }
  impactListed() { return null; }
  depthInputs() { return null; }
  goto(tick: number, marks: Record<string, number> = {}) {
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, tick, quotes: { ...this.snap.quotes, rows } };
  }
  last(id: string) { return minor(this.snap.quotes.rows[id]!.last); }
}

describe("stop, stop-limit and GTC", () => {
  let market: ControlledMarket;
  const temps: string[] = [];
  beforeEach(() => {
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
    market = new ControlledMarket();
    setLiveMarketForTests(market as unknown as LiveMarket);
    setBrokerForTests(undefined);
  });
  afterEach(async () => {
    resetListingsForTests();
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  /** Move the clock without notifying, then run one sweep. A GET is not a sweep. */
  async function at(tick: number, marks: Record<string, number> = {}) {
    market.goto(tick, marks);
    await getBroker().sweep();
  }

  it("triggers a sell stop when the last trade crosses down, and a read does not arm it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "stop-cross-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    const a = await signUp("Cross");
    const p = market.last("HALC");
    await place(a, "key-cross-buy1", { assetId: "HALC", side: "BUY", type: "market", qty: "4", tif: "day" });
    const stop = p - 250;
    const placed = await place(a, "key-cross-stp1", { assetId: "HALC", side: "SELL", type: "stop", qty: "4", stop: fmt(stop, 2), tif: "day" });
    const id = orderIdOf(placed);
    expect(placed.ledger.orders[id]).toMatchObject({ status: "WORKING", type: "stop", stop: fmt(stop, 2) });
    const held = (await ledger(a)).positions.HALC!.qty;

    const before = JSON.parse(await readFile(file, "utf8")) as { players: unknown };
    market.goto(market.snapshot().tick + 1, { HALC: stop - 40 });
    const peeked = await ledger(a);
    expect(peeked.orders[id]?.status).toBe("WORKING");
    expect(peeked.positions.HALC!.qty).toBe(held);
    expect(JSON.parse(await readFile(file, "utf8")).players).toEqual(before.players);

    await at(market.snapshot().tick, { HALC: p - 10 });
    expect((await ledger(a)).orders[id]?.status).toBe("WORKING");

    const gap = stop - 40;
    await at(market.snapshot().tick + 1, { HALC: gap });
    const l = await ledger(a);
    expect(l.orders[id]).toBeUndefined();
    expect(l.positions.HALC).toBeUndefined();
    expect(l.fills.at(-1)).toMatchObject({ orderId: id, side: "SELL", qty: "4", price: fmt(gap, 2), liquidity: "TAKER" });
    expect(l.fills.at(-1)!.price).not.toBe(fmt(stop, 2));
    expect(l.history).toEqual([expect.objectContaining({ orderId: id, status: "TRIGGERED", side: "SELL" })]);
    const cash = l.cashCents;
    await at(market.snapshot().tick + 1, { HALC: gap - 10 });
    expect((await ledger(a)).cashCents).toBe(cash);
    expect((await ledger(a)).history).toHaveLength(1);
  });

  it("a buy stop gaps up to the next price and will not spend cash reserved by another order", async () => {
    const a = await signUp("GapBuy");
    const p = market.last("HALC");
    const limit = p - 200;
    const gap = p + 300;
    const gapCost = gap + fee(gap);
    let qty = Math.floor((START_CASH_CENTS - gapCost) / limit);
    const spendable = () => START_CASH_CENTS - qty * limit - fee(qty * limit);
    while (spendable() >= gapCost) qty += 1;
    expect(spendable()).toBeGreaterThan(100 + fee(100));
    const resting = await place(a, "key-gap-lim01", { assetId: "HALC", side: "BUY", type: "limit", qty: String(qty), limit: fmt(limit, 2), tif: "day" });
    const limitId = orderIdOf(resting);
    const reserved = qty * limit + fee(qty * limit);
    expect(resting.ledger.reservedCashCents).toBe(reserved);
    const stop = await place(a, "key-gap-stp01", { assetId: "HALC", side: "BUY", type: "stop", qty: "1", stop: "1.00", tif: "gtc" });
    const id = orderIdOf(stop);
    expect(stop.ledger.reservedCashCents).toBe(reserved + 100 + fee(100));
    await at(market.snapshot().tick + 1, { HALC: gap });
    const l = await ledger(a);
    expect(l.orders[id]).toMatchObject({ status: "TRIGGERED", type: "stop", filled: "0" });
    expect(l.positions.HALC).toBeUndefined();
    expect(l.cashCents).toBe(START_CASH_CENTS);
    expect(l.orders[limitId]).toMatchObject({ status: "WORKING" });
    expect(l.reservedCashCents).toBe(reserved + 100 + fee(100));
    expect(l.fills.filter((f) => f.orderId === id)).toHaveLength(0);
  });

  it("a stop-limit rests at its limit when the price gaps through it", async () => {
    const a = await signUp("StopLim");
    const p = market.last("HALC");
    await place(a, "key-sl-buy001", { assetId: "HALC", side: "BUY", type: "market", qty: "3", tif: "day" });
    const after = (await ledger(a)).cashCents;
    const stop = p - 80;
    const limit = p - 400;
    const s = await place(a, "key-sl-stp001", { assetId: "HALC", side: "SELL", type: "stop_limit", qty: "3", stop: fmt(stop, 2), limit: fmt(limit, 2), tif: "day" });
    const id = orderIdOf(s);
    expect((await place(a, "key-sl-loc001", { assetId: "HALC", side: "SELL", type: "market", qty: "1", tif: "day" })).result.rejectCode).toBe("MKT_NO_LOCATE");

    await at(market.snapshot().tick + 1, { HALC: p - 900 });
    let l = await ledger(a);
    expect(l.orders[id]).toMatchObject({ status: "TRIGGERED", type: "stop_limit", limit: fmt(limit, 2), filled: "0" });
    expect(l.positions.HALC!.qty).toBe("3");
    expect(l.cashCents).toBe(after);
    expect(l.fills.filter((f) => f.orderId === id)).toHaveLength(0);
    expect(l.history).toEqual([expect.objectContaining({ orderId: id, status: "TRIGGERED" })]);

    await at(market.snapshot().tick + 1, { HALC: limit });
    l = await ledger(a);
    expect(l.orders[id]).toBeUndefined();
    expect(l.positions.HALC).toBeUndefined();
    expect(l.fills.at(-1)).toMatchObject({ orderId: id, price: fmt(limit, 2), qty: "3", liquidity: "MAKER" });
    expect(l.cashCents).toBe(after + limit * 3 - fee(limit * 3));
  });

  it("releases a buy stop's cash on cancel and on day expiry", async () => {
    const a = await signUp("Release");
    const p = market.last("HALC");
    const stop = p + 4_000;
    const w = await place(a, "key-rel-stp01", { assetId: "HALC", side: "BUY", type: "stop", qty: "2", stop: fmt(stop, 2), tif: "day" });
    const id = orderIdOf(w);
    const reserved = stop * 2 + fee(stop * 2);
    expect(w.ledger.reservedCashCents).toBe(reserved);
    expect(w.ledger.cashCents).toBe(START_CASH_CENTS);
    const c = await cancel(a, "key-rel-cxl01", id);
    expect(c.ledger.orders[id]).toMatchObject({ status: "CANCELLED" });
    expect(c.ledger.reservedCashCents).toBe(0);
    expect(c.ledger.cashCents).toBe(START_CASH_CENTS);
    expect(c.ledger.history).toEqual([expect.objectContaining({ orderId: id, status: "CANCELLED" })]);
    const again = await cancel(a, "key-rel-cxl01", id);
    expect(again.intentId).toBe(c.intentId);
    expect((await ledger(a)).reservedCashCents).toBe(0);

    const day = await place(a, "key-rel-day01", { assetId: "HALC", side: "BUY", type: "stop", qty: "2", stop: fmt(stop, 2), tif: "day" });
    const dayId = orderIdOf(day);
    const close = dayExpiryTick(market.snapshot().tick);
    await at(close, { HALC: p });
    const l = await ledger(a);
    expect(l.orders[dayId]).toMatchObject({ status: "EXPIRED" });
    expect(l.reservedCashCents).toBe(0);
    expect(l.cashCents).toBe(START_CASH_CENTS);
    expect(l.history).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: dayId, status: "EXPIRED", tick: close })]));
    await at(close + 3, { HALC: p });
    expect((await ledger(a)).cashCents).toBe(START_CASH_CENTS);
    expect((await ledger(a)).history?.filter((h) => h.orderId === dayId && h.status === "EXPIRED")).toHaveLength(1);
  });

  it("a GTC limit survives the close and still fills on a later day", async () => {
    const a = await signUp("GtcStay");
    const p = market.last("HALC");
    const limit = p - 150;
    const gtc = await place(a, "key-gtc-lim01", { assetId: "HALC", side: "BUY", type: "limit", qty: "2", limit: fmt(limit, 2), tif: "gtc" });
    const day = await place(a, "key-gtc-day01", { assetId: "HALC", side: "BUY", type: "stop", qty: "1", stop: fmt(p + 3_000, 2), tif: "day" });
    const gtcId = orderIdOf(gtc);
    const dayId = orderIdOf(day);
    const gtcHold = limit * 2 + fee(limit * 2);
    expect(gtc.ledger.reservedCashCents).toBe(gtcHold);
    await at(dayExpiryTick(market.snapshot().tick) + 8, { HALC: p });
    let l = await ledger(a);
    expect(l.orders[dayId]).toMatchObject({ status: "EXPIRED" });
    expect(l.orders[gtcId]).toMatchObject({ status: "WORKING", tif: "gtc" });
    expect(l.reservedCashCents).toBe(gtcHold);
    expect(l.cashCents).toBe(START_CASH_CENTS);
    await at(market.snapshot().tick + 1, { HALC: limit - 5 });
    l = await ledger(a);
    expect(l.orders[gtcId]).toBeUndefined();
    expect(l.positions.HALC).toEqual({ assetId: "HALC", qty: "2", avgCost: fmt(limit, 2) });
    expect(l.cashCents).toBe(START_CASH_CENTS - limit * 2 - fee(limit * 2));
  });

  it("a triggered stop survives a restart without filling twice", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "stop-rst-"));
    temps.push(dir);
    const file = path.join(dir, "store.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    const a = await signUp("Restart");
    const p = market.last("HALC");
    await place(a, "key-rst-buy001", { assetId: "HALC", side: "BUY", type: "market", qty: "2", tif: "day" });
    const stop = p - 100;
    const s = await place(a, "key-rst-stp001", { assetId: "HALC", side: "SELL", type: "stop", qty: "2", stop: fmt(stop, 2), tif: "gtc" });
    const id = orderIdOf(s);
    const gap = stop - 80;
    await at(market.snapshot().tick + 2, { HALC: gap });
    const filled = await ledger(a);
    expect(filled.fills.filter((f) => f.orderId === id)).toHaveLength(1);
    expect(filled.fills.at(-1)!.price).toBe(fmt(gap, 2));
    const cash = filled.cashCents;

    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    setBrokerForTests(undefined);
    await getBroker().sweep();
    const again = await ledger(a);
    expect(again.cashCents).toBe(cash);
    expect(again.fills.filter((f) => f.orderId === id)).toHaveLength(1);
    expect(again.history?.filter((h) => h.orderId === id && h.status === "TRIGGERED")).toHaveLength(1);
    const replay = await place(a, "key-rst-stp001", { assetId: "HALC", side: "SELL", type: "stop", qty: "2", stop: fmt(stop, 2), tif: "gtc" });
    expect(replay.intentId).toBe(s.intentId);
    expect((await ledger(a)).cashCents).toBe(cash);
  });

  it("one account's stop fill does not move the other account", async () => {
    const a = await signUp("IsoA");
    const b = await signUp("IsoB");
    const p = market.last("HALC");
    await place(a, "key-iso-buy001", { assetId: "HALC", side: "BUY", type: "market", qty: "2", tif: "day" });
    const stop = await place(a, "key-iso-stp001", { assetId: "HALC", side: "SELL", type: "stop", qty: "2", stop: fmt(p - 50, 2), tif: "day" });
    const idA = orderIdOf(stop);
    const other = await place(b, "key-iso-lim001", { assetId: "HALC", side: "BUY", type: "limit", qty: "1", limit: "1.00", tif: "gtc" });
    const idB = orderIdOf(other);
    const bCash = other.ledger.cashCents;
    const bReserved = other.ledger.reservedCashCents;
    await at(market.snapshot().tick + 1, { HALC: p - 80 });
    const la = await ledger(a);
    const lb = await ledger(b);
    expect(la.fills.at(-1)).toMatchObject({ orderId: idA, price: fmt(p - 80, 2) });
    expect(la.orders[idB]).toBeUndefined();
    expect(lb.orders[idA]).toBeUndefined();
    expect(lb.orders[idB]).toMatchObject({ status: "WORKING" });
    expect(lb.cashCents).toBe(bCash);
    expect(lb.reservedCashCents).toBe(bReserved);
    expect(lb.fills).toEqual([]);
    expect(lb.history).toEqual([]);
    expect(la.history).toEqual([expect.objectContaining({ orderId: idA, status: "TRIGGERED" })]);
  });

  it("a listed sell stop fills only what the book can pay", () => {
    appendAsset(listedDef("FROG", "Frog Coin", 20_000), { ASSETS, ASSET_BY_ID, WATCHLISTS });
    const id = `acc_${"c".repeat(32)}` as AccountId;
    const rec = buildPlayerPrivate(id, {
      cashCents: START_CASH_CENTS,
      positions: { FROG: { assetId: "FROG", qty: "1000000", avgCost: "0.00020000" } },
      openOrders: {
        o_stop: {
          orderId: "o_stop", assetId: "FROG", side: "SELL", type: "stop", qty: "1000000", filled: "0",
          stop: "0.00030000", tif: "gtc", status: "WORKING", placedTick: 1, avgPrice: "0.00000000",
        },
      },
    });
    const book = { cash: 40, tokens: 5_000_000 };
    const quote = { tick: 4, last: () => 20_000, tradable: () => true };
    const ids: IdSource = { next: (kind) => `${kind}_depth` };
    const out = sweepListed(new Map([["a", rec]]), new Map([["FROG", book]]), quote, ids);
    const next = out.ledgers.get("a");
    expect(next).toBeDefined();
    const fill = next!.fills?.at(-1);
    expect(fill).toMatchObject({ orderId: "o_stop", side: "SELL" });
    const qty = Number(fill!.qty);
    expect(qty).toBeGreaterThan(0);
    expect(qty).toBeLessThan(1_000_000);
    const px = Math.round(Number(fill!.price) * 1e8);
    expect(px).toBeLessThan(20_000);
    const paid = Math.round(px * qty / 1e6);
    const feeCents = Math.round(Number(fill!.fee) * 100);
    expect(paid).toBeLessThanOrEqual(book.cash);
    expect(next!.cashCents).toBe(START_CASH_CENTS + paid - feeCents);
    const moved = out.books.get("FROG")!;
    expect(moved.cash).toBe(book.cash - paid + feeCents);
    expect(moved.cash).toBeGreaterThanOrEqual(0);
    expect(moved.tokens).toBe(book.tokens + qty);
    expect(next!.openOrders.o_stop).toMatchObject({ status: "TRIGGERED", filled: String(qty) });
    const again = sweepListed(new Map([["a", buildPlayerPrivate(id, next!)]]), new Map([["FROG", moved]]), quote, ids);
    const second = again.ledgers.get("a") ?? next!;
    const secondBook = again.books.get("FROG") ?? moved;
    expect(second.cashCents + secondBook.cash).toBe(START_CASH_CENTS + book.cash);
    expect(secondBook.cash).toBeGreaterThanOrEqual(0);
    const sold = (second.fills ?? []).filter((f) => f.orderId === "o_stop").reduce((n, f) => n + Number(f.qty), 0);
    expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThan(1_000_000);
  });
});
