// L4 book liquidity path (docs/v1/LAUNCHPAD.md "Book liquidity path, order types and template factors"): a listed coin's
// Broker fills run against its book account the way p10 fills an asset with a supply account (priced with the half
// spread and impact, the per-tick cap, bounded by the book's tokens and cash, commission to the book), with market and
// limit day orders like every asset of this door, resting limits swept against the book oldest first across accounts.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as orderRoute } from "@/app/api/broker/orders/route";
import { POST as cancelRoute } from "@/app/api/broker/orders/cancel/route";
import { GET as lpGet } from "@/app/api/launchpad/route";
import { POST as launchRoute } from "@/app/api/launchpad/launch/route";
import { POST as tradeRoute } from "@/app/api/launchpad/trade/route";
import { GET as marketGet } from "@/app/api/market/route";
import { ASSET_BY_ID, type AssetFixture } from "@/market/catalog";
import { listedDef, resetListingsForTests } from "@/market/listings";
import { LP } from "@/launchpad/rules";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { getBroker, setBrokerForTests } from "@/server/broker";
import { BOOK_LAW, fillOnBook, type BookAccount } from "@/server/broker/book";
import { marketCashCents } from "@/server/launchpad/state";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { memeParams } from "@/server/market/meme";

class Store implements AuthStore {
  failNext = false;
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> {
    if (this.failNext) { this.failNext = false; return Promise.reject(new Error("disk full")); }
    return this.inner.save(s);
  }
}

let n = 0;
const key = () => `lp-book-key-${++n}`;
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, password: "password1" }) }));
  expect(res.status).toBe(201);
  return (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
}
const post = (route: (r: Request) => Promise<Response>, url: string, cookie: string, body: Record<string, unknown>) =>
  route(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", cookie }, body: JSON.stringify(body) }));
const launch = async (c: string) => (await post(launchRoute, "/api/launchpad/launch", c, { idempotencyKey: key(), fee: LP.LAUNCH_FEE, tagline: "tg5", name: "FROG Club", ticker: "FROG" })).json();
const trade = async (c: string, amount: number) => (await post(tradeRoute, "/api/launchpad/trade", c, { idempotencyKey: key(), ticker: "FROG", side: "buy", amount, min: 0 })).json();
type Extra = { type?: "market" | "limit" | "stop"; limit?: string; stop?: string };
const orderRes = (c: string, side: "BUY" | "SELL", qty: number, extra: Extra = {}, k = key()) =>
  post(orderRoute, "/api/broker/orders", c, { idempotencyKey: k, draft: { assetId: "FROG", side, type: "market", qty: String(qty), tif: "day", ...extra } });
const order = async (c: string, side: "BUY" | "SELL", qty: number, extra: Extra = {}, k?: string) => (await orderRes(c, side, qty, extra, k)).json();
const cancel = async (c: string, orderId: string) => (await post(cancelRoute, "/api/broker/orders/cancel", c, { idempotencyKey: key(), orderId })).json();
const get = async (route: (r: Request) => Promise<Response>, url: string, c?: string) => (await route(new Request(`http://localhost${url}`, { headers: c ? { cookie: c } : {} }))).json();
const me = (c: string) => get(brokerMe, "/api/broker/me", c);
const minor = (s: string) => Math.round(Number(s) * 1e8);
type Fill = { side: "BUY" | "SELL"; qty: string; price: string; fee: string; orderId: string };
/** What a ledger's fills cost (+) or paid (−) in cents, fees included: the cents rule of the door (buy up, sale half up). */
const cashFlow = (fills: Fill[]) => fills.reduce((s, f) => {
  const m = minor(f.price) * Number(f.qty), fee = Math.round(Number(f.fee) * 100);
  return s + (f.side === "BUY" ? Math.ceil(m / 1e6) + fee : -Math.round(m / 1e6) + fee);
}, 0);

describe("L4 book liquidity: holders, order types, sweep, conservation", () => {
  let store: Store;
  let auth: AuthService;
  let market: LiveMarket;
  beforeEach(() => {
    store = new Store(new MemoryAuthStore());
    auth = new AuthService({ store });
    setAuthServiceForTests(auth);
    market = new LiveMarket();
    setLiveMarketForTests(market);
    setBrokerForTests(undefined);
  });
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); setBrokerForTests(undefined); resetListingsForTests(); });
  const setCash = (cents: number) => auth.sweepPrivateStates((cur) => ({ ...cur, cashCents: cents }));
  /** Σ player cash + Σ live curves' cash + Σ books' cash + the sink: constant across book fills (the fee stays in the book). */
  const world = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + r.cashCents, 0)))
    + (await auth.readLaunchpad(null, (lp) => lp.coins.reduce((s, c) => s + marketCashCents(c) + (c.book?.cash ?? 0), 0) + lp.sinkCents));
  const lp = () => auth.readLaunchpad(null, (s) => s);
  const book = async () => (await lp()).coins[0]!.book!;
  const supply = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + (r.positions.find((p) => p.assetId === "FROG")?.qty ?? 0), 0))) + (await book()).tokens;
  const mark = () => minor(market.snapshot().quotes.rows.FROG!.last);
  const tick = async () => { market.step(); await getBroker().sweep(); };
  const holds = async () => { expect(await supply()).toBe(LP.SUPPLY); expect((await book()).cash).toBeGreaterThanOrEqual(0); expect((await book()).tokens).toBeGreaterThanOrEqual(0); };

  it("several holders: an oversized sale is bounded by the book's cash; the next holder's market sale is partial or refused, its limit rests and fills after a buyer pays the book", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol"), d = await signUp("dave");
    await launch(a);
    await setCash(10_000_000);
    expect((await trade(b, 2_000_000)).graduated).toBe(false);
    expect((await trade(c, 9_000_000)).graduated).toBe(true);
    const w0 = await world();
    const bQty = Number((await me(b)).positions.FROG.qty);
    const cash0 = new Map(await Promise.all([b, c, d].map(async (ck) => [ck, (await me(ck)).cashCents as number] as const)));
    const book0 = await book(), m0 = mark();
    // B sells everything: what B holds is worth more at the mark than the book has, so the sale stops at the book's cash.
    expect(bQty * m0 / 1e6).toBeGreaterThan(book0.cash);
    const rb = await order(b, "SELL", bQty);
    const fb = rb.ledger.fills.at(-1) as Fill;
    expect(Number(fb.qty)).toBeLessThan(bQty);
    expect(minor(fb.price)).toBeLessThan(Math.floor(m0 * (1 - BOOK_LAW.spreadBps / 2 / 1e4)) + 1); // worse than the mark by the half spread at least
    const paid = Math.round(minor(fb.price) * Number(fb.qty) / 1e6), fee = Math.round(Number(fb.fee) * 100);
    expect(paid).toBeLessThanOrEqual(book0.cash);
    expect(await book()).toEqual({ cash: book0.cash - paid + fee, tokens: book0.tokens + Number(fb.qty) });
    expect(rb.ledger.positions.FROG.qty).toBe(String(bQty - Number(fb.qty)));
    await holds();
    // C, the other holder: a market sale fills only what is left in the book (its fee cash), never more.
    const left = (await book()).cash;
    const rc = await order(c, "SELL", 100_000_000);
    if (rc.result.status === "ACCEPTED") expect(Math.round(minor(rc.ledger.fills.at(-1).price) * Number(rc.ledger.fills.at(-1).qty) / 1e6)).toBeLessThanOrEqual(left);
    else expect(rc.result.rejectCode).toBe("MKT_NO_LIQUIDITY");
    // C's limit sale rests (whatever part fills now) with its units held: selling them again is refused.
    const lim = await order(c, "SELL", 50_000_000, { type: "limit", limit: "0.00010000" });
    expect(lim.result.status).toBe("ACCEPTED");
    const oid = String(lim.result.effects.find((e: string) => e.startsWith("order:"))).slice(6);
    const o1 = lim.ledger.orders[oid];
    expect(o1).toMatchObject({ assetId: "FROG", side: "SELL", type: "limit", qty: "50000000", limit: "0.00010000" });
    const cNow = Number(lim.ledger.positions.FROG.qty);
    expect((await order(c, "SELL", cNow - (50_000_000 - Number(o1.filled)) + 1)).result).toMatchObject({ status: "REJECTED", rejectCode: "MKT_NO_LOCATE" });
    // D buys tokens out of the book: its cash is the book's now; the next sweep fills C's order against it.
    const rd = await order(d, "BUY", 200_000_000);
    expect(rd.result.status).toBe("ACCEPTED");
    const cashBefore = (await book()).cash;
    expect(cashBefore).toBeGreaterThan(left);
    await tick();
    const after = await me(c);
    const fills = (after.fills as Fill[]).filter((f) => f.orderId === oid);
    const total = fills.reduce((s, f) => s + Number(f.qty), 0);
    expect(total).toBeGreaterThan(Number(o1.filled));
    for (const f of fills) expect(minor(f.price)).toBeGreaterThanOrEqual(10_000); // never below its limit
    if (total < 50_000_000) expect(after.orders[oid]).toMatchObject({ status: "PARTIAL", filled: String(total) });
    else expect(after.orders[oid]).toBeUndefined();
    // Every cent: each ledger's cash moved by exactly its Broker fills; the world total is unchanged; supply whole.
    for (const ck of [b, c, d]) { const l = await me(ck); expect(l.cashCents).toBe(cash0.get(ck)! - cashFlow(l.fills)); }
    expect(await world()).toBe(w0);
    await holds();
  });

  it("limit orders: rest when the priced fill is past the limit, hold dp-8 cash in cents, fill the marketable part now, the rest on the sweep; cancel releases", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    await trade(b, 10_000_000);
    const w0 = await world();
    // At the mark: the priced fill (mark + 45 bp + impact) is above it, so nothing fills; it rests with its hold:
    // ceil(1,000,000 × 21,596 / 1e6) = 21,596¢ + the 10¢ minimum fee.
    const r1 = await order(c, "BUY", 1_000_000, { type: "limit", limit: "0.00021596" });
    expect(r1.result.status).toBe("ACCEPTED");
    expect(r1.ledger.fills).toEqual([]);
    expect(r1.ledger.reservedCashCents).toBe(21_606);
    expect(r1.ledger.cashCents).toBe(10_000_000);
    const id1 = Object.keys(r1.ledger.orders)[0]!;
    expect(r1.ledger.orders[id1]).toMatchObject({ status: "WORKING", filled: "0", avgPrice: "0.00000000" });
    await tick();
    expect((await me(c)).orders[id1]).toMatchObject({ status: "WORKING" }); // still past its limit: waits
    expect((await cancel(c, id1)).ledger.reservedCashCents).toBe(0);
    // Marketable and bigger than the book's 200,000,000 tokens: the book's tokens fill now, the rest rests PARTIAL.
    const r2 = await order(c, "BUY", 300_000_000, { type: "limit", limit: "0.00030000" });
    const id2 = String(r2.result.effects.find((e: string) => e.startsWith("order:"))).slice(6);
    const f2 = r2.ledger.fills.at(-1) as Fill;
    expect(f2).toMatchObject({ side: "BUY", qty: "200000000", orderId: id2 });
    expect(minor(f2.price)).toBeLessThanOrEqual(30_000);
    expect(r2.ledger.orders[id2]).toMatchObject({ status: "PARTIAL", filled: "200000000", avgPrice: f2.price });
    expect(r2.ledger.reservedCashCents).toBe(3_000_000 + 900); // 100,000,000 × 30,000 / 1e6 + 3 bp
    expect((await book()).tokens).toBe(0);
    await tick();
    expect((await me(c)).orders[id2]).toMatchObject({ status: "PARTIAL", filled: "200000000" }); // no float: waits
    // B sells 100,000,000 into the book; the sweep fills C's rest within its limit.
    expect((await order(b, "SELL", 100_000_000)).result.status).toBe("ACCEPTED");
    await tick();
    const l = await me(c);
    expect(l.orders[id2]).toBeUndefined();
    expect(l.reservedCashCents).toBe(0);
    expect(l.positions.FROG.qty).toBe("300000000");
    const mine = (l.fills as Fill[]).filter((f) => f.orderId === id2);
    expect(mine.map((f) => f.qty)).toEqual(["200000000", "100000000"]);
    for (const f of mine) expect(minor(f.price)).toBeLessThanOrEqual(30_000);
    expect(l.cashCents).toBe(10_000_000 - cashFlow(l.fills));
    expect(await world()).toBe(w0);
    await holds();
    // Stop types: as every asset of this door.
    expect((await order(c, "SELL", 1, { type: "stop", stop: "0.00020000" })).result).toMatchObject({ status: "REJECTED", rejectCode: "MKT_ORDER_TYPE_UNSUPPORTED" });
  });

  it("rollback and replay: a failed save moves no ledger, book, flow or mark (place and sweep); the same key replays without a second impact", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    await trade(b, 10_000_000);
    const s0 = await lp(), mc0 = await me(c), m0 = mark();
    store.failNext = true;
    expect((await orderRes(c, "BUY", 50_000_000)).status).toBeGreaterThanOrEqual(500);
    expect(await lp()).toEqual(s0);
    expect({ ...(await me(c)), tick: 0 }).toEqual({ ...mc0, tick: 0 });
    expect(mark()).toBe(m0);
    const k = key();
    const first = await order(c, "BUY", 50_000_000, {}, k);
    const m1 = mark(), s1 = await lp();
    expect(m1).toBeGreaterThan(m0); // permanent impact of a saved buy
    expect(await order(c, "BUY", 50_000_000, {}, k)).toEqual(first);
    expect(mark()).toBe(m1);
    expect(await lp()).toEqual(s1);
    // A resting buy (the book's float is gone), then a seller refills the book: a failed sweep commit moves nothing; the
    // next sweep fills it once.
    expect((await order(c, "BUY", 200_000_000)).result.status).toBe("ACCEPTED");
    const lim = await order(c, "BUY", 5_000_000, { type: "limit", limit: "0.00030000" });
    const oid = Object.keys(lim.ledger.orders)[0]!;
    expect((await order(b, "SELL", 5_000_000)).result.status).toBe("ACCEPTED");
    // No clock step here: a step also runs the clock's own sweep (BrokerService.attach); this tick's sweep is explicit.
    const before = { lp: await lp(), c: await me(c), m: mark() };
    store.failNext = true;
    await expect(getBroker().sweep()).rejects.toThrow("disk full");
    expect(await lp()).toEqual(before.lp);
    expect({ ...(await me(c)), tick: 0 }).toEqual({ ...before.c, tick: 0 });
    expect(mark()).toBe(before.m);
    await getBroker().sweep();
    expect((await me(c)).orders[oid]).toBeUndefined();
    expect(mark()).toBeGreaterThanOrEqual(before.m); // the saved fill's impact (under a minor unit at this size), once
    expect((await lp()).coins[0]!.flow!.buy).toBeGreaterThan(before.lp.coins[0]!.flow!.buy);
    await getBroker().sweep();
    expect((await me(c)).fills.filter((f: Fill) => f.orderId === oid)).toHaveLength(1);
    await holds();
  });

  it("restart: a resting order on a listed coin, the book and its flow survive on disk; the sweep resumes on the new process", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lp-book-"));
    const file = path.join(dir, "auth.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    const fresh = new AuthService({ store: new FileAuthStore(file) });
    await fresh.sweepPrivateStates((cur) => ({ ...cur, cashCents: 10_000_000 }));
    setAuthServiceForTests(fresh);
    await trade(b, 10_000_000);
    expect((await order(c, "BUY", 200_000_000)).result.status).toBe("ACCEPTED"); // the book's float is gone
    const lim = await order(c, "BUY", 5_000_000, { type: "limit", limit: "0.00030000" });
    const oid = Object.keys(lim.ledger.orders)[0]!;
    expect(lim.ledger.orders[oid]).toMatchObject({ status: "WORKING" });
    const view = await me(c);
    // A new process.
    resetListingsForTests();
    const next = new LiveMarket();
    setLiveMarketForTests(next);
    setBrokerForTests(undefined);
    const again = new AuthService({ store: new FileAuthStore(file) });
    setAuthServiceForTests(again);
    expect({ ...(await me(c)), tick: 0 }).toEqual({ ...view, tick: 0 });
    expect(await again.readLaunchpad(null, (s) => s.coins[0]!.flow)).toMatchObject({ mid: 21_596 });
    expect((await order(b, "SELL", 5_000_000)).result.status).toBe("ACCEPTED");
    next.step();
    await getBroker().sweep();
    const l = await me(c);
    expect(l.orders[oid]).toBeUndefined();
    expect(l.positions.FROG.qty).toBe("205000000");
  });

  it("privacy: public reads carry the book's reserves only, never an order, a position or the book's flow", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    await trade(b, 10_000_000);
    const lim = await order(c, "BUY", 1_000_000, { type: "limit", limit: "0.00010000" });
    const oid = Object.keys(lim.ledger.orders)[0]!;
    const pub = JSON.stringify([await get(lpGet, "/api/launchpad"), await get(marketGet, "/api/market"), await get(lpGet, "/api/launchpad", c)]);
    for (const s of [oid, "openOrders", "orders", "flow", "800000000\"", "positions"]) expect(pub).not.toContain(s);
    expect((await get(lpGet, "/api/launchpad")).coins[0].grad.book).toEqual({ cash: expect.any(Number), tokens: expect.any(Number) });
    expect((await me(b)).orders).toEqual({}); // C's order is C's alone
  });
});

describe("book price law (pure, hand-worked)", () => {
  const coin: AssetFixture = listedDef("FROG", "FROG Club", 100_000_000); // $1.00 a token, dp 8
  const sd = memeParams("FROG").vol / Math.sqrt(252);
  it("buy: mid × (1 + 45 bp + impact), up to the minor unit; sale: down; the fee goes to the book", () => {
    const b: BookAccount = { cash: 1_000_000_000, tokens: 2_000_000_000 };
    // 10,000 tokens at $1: n = $10,000, impact = 0.8 × sd × √(1e4 / 4e8).
    const imp = 0.8 * sd * Math.sqrt(1e4 / 4e8);
    const buy = fillOnBook(coin, "BUY", 10_000, 100_000_000, b, 5)!;
    expect(buy.px).toBe(Math.ceil(100_000_000 * (1 + 0.0045 + imp)));
    expect(buy.notional).toBe(Math.ceil(buy.px * 10_000 / 1e6));
    expect(buy.fee).toBe(Math.round(buy.notional * 3 / 1e4));
    expect(buy.book).toMatchObject({ cash: b.cash + buy.notional + buy.fee, tokens: b.tokens - 10_000 });
    const sell = fillOnBook(coin, "SELL", 10_000, 100_000_000, b, 5)!;
    expect(sell.px).toBe(Math.floor(100_000_000 * (1 - 0.0045 - imp)));
    expect(sell.book).toMatchObject({ cash: b.cash - sell.notional + sell.fee, tokens: b.tokens + 10_000 });
    expect(Math.exp(buy.move) - 1).toBeCloseTo(0.5 * imp, 12);
  });
  it("the per-tick cap (3 × ADV a side) is shared: a second order in the same tick waits, the next tick fills", () => {
    const b: BookAccount = { cash: 1e15, tokens: 5_000_000_000 };
    const first = fillOnBook(coin, "BUY", 2_000_000_000, 100_000_000, b, 7)!;
    expect(first.qty).toBe(1_200_000_000); // $1.2e9 at $1
    expect(fillOnBook(coin, "BUY", 1, 100_000_000, first.book, 7)).toBeNull();
    expect(fillOnBook(coin, "BUY", 1, 100_000_000, first.book, 8)?.qty).toBe(1);
    // The other side has its own cap; the same tick's fills share its mid.
    expect(fillOnBook(coin, "SELL", 10, 200_000_000, first.book, 7)?.px).toBeLessThan(100_000_000);
  });
  it("a sale is cut to the book's cash at the priced fill and never overdraws it; a buy takes at most the book's tokens; a limit past the price waits", () => {
    const b: BookAccount = { cash: 5_000, tokens: 3 }; // $50
    const s = fillOnBook(coin, "SELL", 1_000, 100_000_000, b, 1)!;
    expect(Math.round(s.px * s.qty / 1e6)).toBeLessThanOrEqual(5_000);
    expect(s.qty).toBe(Math.floor(5_000 * 1e6 / s.px));
    expect(s.book.cash).toBeGreaterThanOrEqual(0);
    expect(fillOnBook(coin, "BUY", 10, 100_000_000, b, 1)!.qty).toBe(3);
    expect(fillOnBook(coin, "BUY", 1, 100_000_000, b, 1, 100_000_000)).toBeNull();
    expect(fillOnBook(coin, "SELL", 1, 100_000_000, b, 1, 100_000_000)).toBeNull();
    expect(fillOnBook(coin, "SELL", 1, 100_000_000, { cash: 0, tokens: 0 }, 1)).toBeNull();
  });
  it("flow decays with a 360-tick half-life: the same buy later costs less impact", () => {
    const b: BookAccount = { cash: 1e15, tokens: 5e9 };
    const big = fillOnBook(coin, "BUY", 100_000_000, 100_000_000, b, 0)!;
    const soon = fillOnBook(coin, "BUY", 1_000, 100_000_000, big.book, 1)!;
    const later = fillOnBook(coin, "BUY", 1_000, 100_000_000, big.book, 1 + 3600)!;
    expect(soon.px).toBeGreaterThan(later.px);
    expect(big.book.flow).toMatchObject({ t: 0, mid: 100_000_000, buy: 1e8, tb: 1e8, sell: 0, ts: 0 });
  });
});

describe("template factors: deterministic, shared, existing assets untouched", () => {
  afterEach(() => { resetListingsForTests(); });
  const rets = (m: LiveMarket, id: string, ticks: number) => {
    const out: number[] = [];
    let p = minor(m.snapshot().quotes.rows[id]!.last);
    for (let i = 0; i < ticks; i++) { m.step(); const q = minor(m.snapshot().quotes.rows[id]!.last); out.push(Math.log(q / p)); p = q; }
    return out;
  };
  const corr = (x: number[], y: number[]) => {
    const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i]! - mx) * (y[i]! - my); sxx += (x[i]! - mx) ** 2; syy += (y[i]! - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
  };
  it("same seed and listings: identical coin paths; two coins share the crypto factor; the coin loads on the index", () => {
    const run = () => {
      const m = new LiveMarket();
      m.list(listedDef("FROG", "FROG Club", 21_596));
      m.list(listedDef("GULL", "Gull Coin", 21_596));
      const steps: { FROG: string; GULL: string; GX: string }[] = [];
      for (let i = 0; i < 3000; i++) { m.step(); const r = m.snapshot().quotes.rows; steps.push({ FROG: r.FROG!.last, GULL: r.GULL!.last, GX: r.GX!.last }); }
      return steps;
    };
    const one = run();
    expect(run()).toEqual(one);
    const lr = (k: "FROG" | "GULL" | "GX") => one.slice(1).map((s, i) => Math.log(Number(s[k]) / Number(one[i]![k])));
    // Loadings 0.25 / 0.75: corr(coin, coin) ≈ 0.25² + 0.75² = 0.625, corr(coin, index) ≈ 0.25 (diffusion; jumps and
    // rounding lower both a little).
    expect(corr(lr("FROG"), lr("GULL"))).toBeGreaterThan(0.45);
    // The index's own walk steps at most volBp (6 bp) a tick; a larger move is a Wire story's shock, which is not the
    // factor (the coin reads the walk's step), so those ticks are left out.
    const gx = lr("GX"), frog = lr("FROG"), walk = gx.map((v, i) => [v, i] as const).filter(([v]) => Math.abs(v) <= 6.05e-4).map(([, i]) => i);
    const c = corr(walk.map((i) => frog[i]!), walk.map((i) => gx[i]!));
    expect(c).toBeGreaterThan(0.15);
    expect(c).toBeLessThan(0.35);
  });
  it("every existing asset's path is byte-identical with and without listed coins (the factors are read, never redrawn)", () => {
    const plain = new LiveMarket(); // runs to the end before the catalog grows (one market per process in production)
    const p = rets(plain, "GX", 500).concat(rets(plain, "HALC", 1));
    const pRows = plain.snapshot().quotes.rows;
    const withCoins = new LiveMarket();
    withCoins.list(listedDef("FROG", "FROG Club", 21_596));
    const w = rets(withCoins, "GX", 500).concat(rets(withCoins, "HALC", 1));
    expect(w).toEqual(p);
    const wRows = withCoins.snapshot().quotes.rows;
    for (const id of Object.keys(pRows)) expect(wRows[id]).toEqual(pRows[id]);
    expect(ASSET_BY_ID.FROG).toBeDefined();
  });
});
