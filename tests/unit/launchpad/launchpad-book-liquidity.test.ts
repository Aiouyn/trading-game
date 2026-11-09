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
import { POST as previewRoute } from "@/app/api/broker/preview/route";
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
import { BOOK_LAW, depthQuote, ladderImpact, fillOnBook, type BookAccount } from "@/server/broker/book";
import { marketCashCents, poolCashCents, poolDebtCents, poolFundedCents, poolTokens } from "@/server/launchpad/state";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { memeParams } from "@/server/market/meme";

class Store implements AuthStore {
  failNext = false;
  saves = 0;
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> {
    this.saves++;
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
    + (await auth.readLaunchpad(null, (lp) => lp.coins.reduce((s, c) => s + marketCashCents(c) + (c.book?.cash ?? 0) + poolCashCents(c) - poolDebtCents(c) - poolFundedCents(c), 0) + lp.sinkCents)); // the pools' booked funding is the one NPC cash line
  const lp = () => auth.readLaunchpad(null, (s) => s);
  const book = async () => (await lp()).coins[0]!.book!;
  const supply = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + (r.positions.find((p) => p.assetId === "FROG")?.qty ?? 0), 0))) + (await book()).tokens + poolTokens((await lp()).coins[0]!);
  const mark = () => minor(market.snapshot().quotes.rows.FROG!.last);
  const tick = async () => { market.step(); await getBroker().sweep(); };
  const holds = async () => { expect(await supply()).toBe(LP.SUPPLY); expect((await book()).cash).toBeGreaterThanOrEqual(0); expect((await book()).tokens).toBeGreaterThanOrEqual(0); };

  it("authoritative preview: repeat reads save nothing; exact-bound-state fills agree including partials, resting limits and sell fees", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a); await setCash(10_000_000); await trade(b, 10_000_000);
    const preview = async (side: "BUY" | "SELL", qty: number, extra: Extra = {}) => {
      const res = await post(previewRoute, "/api/broker/preview", c, { draft: { assetId: "FROG", side, qty: String(qty), type: "market", tif: "day", ...extra } });
      expect(res.status).toBe(200); return res.json();
    };
    const before = { lp: await lp(), c: await me(c), b: await me(b), mark: mark(), saves: store.saves };
    const p = await preview("BUY", 1_000_000);
    expect(p).toMatchObject({ valid: true, executableQty: "835884", estFill: "0.00022585", fee: "0.10", computedAtTick: market.snapshot().tick });
    expect(await preview("BUY", 1_000_000)).toEqual(p);
    const resting = await preview("BUY", 1000, { type: "limit", limit: "0.00020000" });
    expect(resting).toMatchObject({ valid: true, executableQty: "0", total: "0.00" });
    expect(store.saves).toBe(before.saves);
    expect({ lp: await lp(), c: await me(c), b: await me(b), mark: mark() }).toEqual({ lp: before.lp, c: before.c, b: before.b, mark: before.mark });
    const placed = await order(c, "BUY", 1_000_000), fill = placed.ledger.fills.at(-1);
    expect(fill).toMatchObject({ qty: p.executableQty, price: p.estFill, fee: p.fee });
    expect(placed.ledger.cashCents).toBe(before.c.cashCents - Math.round(Number(p.total) * 100));
    const ps = await preview("SELL", 10_000), cash = placed.ledger.cashCents;
    const sold = await order(c, "SELL", 10_000);
    expect(sold.ledger.fills.at(-1)).toMatchObject({ qty: ps.executableQty, price: ps.estFill, fee: ps.fee });
    expect(sold.ledger.cashCents).toBe(cash + Math.round(Number(ps.total) * 100));
    // No caller-private ledger/holds are serialized by the preview route; authentication and origin remain required.
    expect(Object.keys(p).sort()).toEqual(["buyingPowerAfter", "computedAtTick", "estFill", "executableQty", "fee", "firstTradeCapRemaining", "impactBp", "impactMoney", "price", "total", "valid"].sort());
    const draft = { assetId: "FROG", side: "BUY", qty: "1000", type: "market", tif: "day" };
    expect((await post(previewRoute, "/api/broker/preview", "", { draft })).status).toBe(401);
    expect((await post(previewRoute, "/api/broker/preview", c, { draft, userId: "bob" })).status).toBe(400);
    expect((await previewRoute(new Request("http://localhost/api/broker/preview", { method: "POST", headers: { origin: "https://evil.invalid", "content-type": "application/json", cookie: c }, body: JSON.stringify({ draft }) }))).status).toBe(403);
    await holds();
  });

  it("several holders: an oversized sale is bounded by source depth and book cash; the next holder's market sale is partial or refused, its limit rests and fills after a buyer pays the book", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol"), d = await signUp("dave");
    await launch(a);
    await setCash(10_000_000);
    expect((await trade(b, 2_000_000)).graduated).toBe(false);
    expect((await trade(c, 9_000_000)).graduated).toBe(true);
    const w0 = await world();
    const bQty = Number((await me(b)).positions.FROG.qty);
    const cash0 = new Map(await Promise.all([b, c, d].map(async (ck) => [ck, (await me(ck)).cashCents as number] as const)));
    const book0 = await book(), m0 = mark();
    // B requests everything: both the source tick band and the finite cash limit the executable quantity.
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
    // C, the other holder: any additional sale stays within the remaining source side ladder and actual book cash.
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
    // Source tick-band depth, not a reserve deletion: only the marketable ladder slice fills; the rest rests.
    const r2 = await order(c, "BUY", 300_000_000, { type: "limit", limit: "0.00030000" });
    const id2 = String(r2.result.effects.find((e: string) => e.startsWith("order:"))).slice(6);
    const f2 = r2.ledger.fills.at(-1) as Fill, q2 = Number(f2.qty);
    expect(f2).toMatchObject({ side: "BUY", orderId: id2 });
    expect(q2).toBeGreaterThan(0); expect(q2).toBeLessThan(200_000_000);
    expect(minor(f2.price)).toBeLessThanOrEqual(30_000);
    expect(r2.ledger.orders[id2]).toMatchObject({ status: "PARTIAL", filled: f2.qty, avgPrice: f2.price });
    const remaining = 300_000_000 - q2, held = Math.ceil(remaining * 30_000 / 1e6);
    expect(r2.ledger.reservedCashCents).toBe(held + Math.max(10, Math.round(held * 3 / 10000)));
    expect((await book()).tokens).toBeGreaterThan(0); // band exhaustion does not destroy float
    await tick();
    const l = await me(c), mine = (l.fills as Fill[]).filter((f) => f.orderId === id2);
    expect(mine.length).toBeGreaterThan(1);
    const filled = mine.reduce((sum, f) => sum + Number(f.qty), 0);
    expect(filled).toBeGreaterThan(q2);
    expect(l.orders[id2]).toMatchObject({ status: "PARTIAL", filled: String(filled) });
    for (const f of mine) expect(minor(f.price)).toBeLessThanOrEqual(30_000);
    expect(l.cashCents).toBe(10_000_000 - cashFlow(l.fills));
    expect(await world()).toBe(w0); await holds();
    expect((await cancel(c, id2)).ledger.reservedCashCents).toBe(0);
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
    // A genuinely resting limit (below the mark), then a public price move makes it marketable. Failed sweep rolls back.
    const lim = await order(c, "BUY", 50_000, { type: "limit", limit: "0.00020000" });
    const oid = Object.keys(lim.ledger.orders)[0]!;
    expect(lim.ledger.orders[oid]).toMatchObject({ status: "WORKING" });
    market.impactListed("FROG", Math.log(0.8));
    const before = { lp: await lp(), c: await me(c), m: mark() };
    store.failNext = true;
    market.step(); // new tick releases the old side ladder; attached sweep attempts and fails its save
    const stepped = mark();
    expect(await lp()).toEqual(before.lp);
    expect({ ...(await me(c)), tick: 0 }).toEqual({ ...before.c, tick: 0 });
    expect(mark()).toBe(stepped);
    await getBroker().sweep();
    expect((await me(c)).orders[oid]).toBeUndefined();
    expect(mark()).toBeGreaterThanOrEqual(before.m); // the saved fill's impact (under a minor unit at this size), once
    const committed = (await lp()).coins[0]!;
    expect(committed.flow!.buy).toBe(50_000 + committed.pools!.tape.filter((p) => p.tick === market.snapshot().tick && p.side === "BUY").reduce((sum, p) => sum + p.qty, 0));
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
    expect((await order(c, "BUY", 100_000)).result.status).toBe("ACCEPTED");
    const lim = await order(c, "BUY", 50_000, { type: "limit", limit: "0.00020000" });
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
    next.impactListed("FROG", Math.log(0.8));
    next.step();
    await getBroker().sweep();
    const l = await me(c);
    expect(l.orders[oid]).toBeUndefined();
    expect(l.positions.FROG.qty).toBe("150000");
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
  it("log-price token ladder: s=.02×(1+1.5×.22), D=(1−.6×.22)×1.1, Y=1.2, σd=vol/√364; grid rounding and fees", () => {
    const b: BookAccount = { cash: 1_000_000_000, tokens: 200_000_000 };
    const sd = memeParams("FROG").vol / Math.sqrt(364), s = 0.0266, d = 0.9548;
    const imp = 1.2 * sd * Math.sqrt(10_000 / (d * 150e6));
    const buy = fillOnBook(coin, "BUY", 10_000, 100_000_000, b, 5)!;
    expect(buy.px).toBe(Math.ceil(100_000_000 * Math.exp(s + imp)));
    expect(buy.notional).toBe(Math.ceil(buy.px * 10_000 / 1e6));
    expect(buy.fee).toBe(Math.round(buy.notional * 3 / 1e4));
    expect(buy.book).toMatchObject({ cash: b.cash + buy.notional + buy.fee, tokens: b.tokens - 10_000 });
    const sell = fillOnBook(coin, "SELL", 10_000, 100_000_000, b, 5)!;
    expect(sell.px).toBe(Math.floor(100_000_000 * Math.exp(-s - imp)));
    expect(sell.book).toMatchObject({ cash: b.cash - sell.notional + sell.fee, tokens: b.tokens + 10_000 });
    expect(buy.move).toBeCloseTo(0.5 * imp + s * (10_000 / 150e6) / 0.5, 12); // signed permanent + skew change, no second impact
  });
  it("the source 4% tick band bounds ladder volume; the same tick shares consumption, a new tick starts its side ladder again", () => {
    const b: BookAccount = { cash: 1e15, tokens: 200_000_000 };
    const sd = memeParams("FROG").vol / Math.sqrt(364);
    const cap = Math.floor(0.9548 * 150e6 * ((Math.log(Math.floor(1e8 * Math.exp(0.04)) / 1e8) - 0.0266) / (1.2 * sd)) ** 2);
    const first = fillOnBook(coin, "BUY", 200_000_000, 100_000_000, b, 7)!;
    expect(first.qty).toBe(cap);
    expect(first.px).toBeLessThanOrEqual(Math.floor(1e8 * Math.exp(0.04)));
    expect(fillOnBook(coin, "BUY", 1, 100_000_000, first.book, 7)).toBeNull();
    expect(fillOnBook(coin, "BUY", 1, 100_000_000, first.book, 8)?.qty).toBe(1);
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
  it("signed flow-risk statistics survive a day boundary without moving assets or pretending to lay off real tokens", () => {
    const b: BookAccount = { cash: 1e15, tokens: 200_000_000 };
    const buy = fillOnBook(coin, "BUY", 100_000, 100_000_000, b, 0)!;
    expect(buy.book.flow?.m?.inv).toBeCloseTo(-100_000 / 150e6, 15);
    const sell = fillOnBook(coin, "SELL", 100_000, 100_000_000, buy.book, 1)!;
    expect(sell.book.tokens).toBe(b.tokens);
    expect(sell.book.flow?.m?.inv).toBeCloseTo(0, 15);
    expect(sell.book.flow?.m?.qc).toBeCloseTo(0, 15);
    expect(sell.book.flow?.m?.pi).toBeCloseTo(0, 15);
    const tomorrow = fillOnBook(coin, "BUY", 10, 100_000_000, sell.book, 720)!;
    expect(tomorrow.book.tokens).toBe(b.tokens - 10);
    expect(tomorrow.book.flow?.m).toMatchObject({ day: 1, qc: 10 / 150e6, inv: -10 / 150e6 });
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


describe("finite depth hand/adversarial contracts", () => {
  const a: AssetFixture = { ...ASSET_BY_ID.BTC!, assetId: "FROG", displayDecimals: 8 };
  const inp = { fear: 0, regimeDepth: 1, adv: 150e6, sigmaDaily: .1 };
  it("depth is in the square-root ladder, not reserves; Fear/regime/adverse signed inventory change source spread/depth/skew", () => {
    const q = 150_000;
    expect(ladderImpact(q, inp, .5) / ladderImpact(q, inp, 1)).toBeCloseTo(Math.sqrt(2), 14);
    expect(depthQuote(1e8, inp, 0, "BUY")).toEqual({ s: .02, d: 1, skew: -0 });
    expect(depthQuote(1e8, { ...inp, fear: 100, regimeDepth: .8 }, 0, "BUY")).toEqual({ s: .05, d: .32000000000000006, skew: -0 });
    expect(depthQuote(1e8, inp, .5, "SELL")).toEqual({ s: .02, d: .2, skew: -.02 });
    expect(depthQuote(1e8, inp, .5, "BUY")).toEqual({ s: .02, d: 1, skew: -.02 });
    expect(depthQuote(1e8, inp, -.5, "BUY")).toEqual({ s: .02, d: .2, skew: .02 });
  });
  it("a one-token limit boundary is maximal on the grid and used side quantity cannot be spent twice", () => {
    const book = { cash: 1e9, tokens: 2e8 }, limit = 103_000_000;
    const one = fillOnBook(a, "BUY", 2e8, 1e8, book, 1, limit, inp)!;
    expect(one.qty).toBe(Math.floor(150e6 * ((Math.log(1.03) - .02) / .12) ** 2));
    expect(one.px).toBeLessThanOrEqual(limit);
    expect(fillOnBook(a, "BUY", 1, 1e8, one.book, 1, limit, inp)).toBeNull();
    const constrained = fillOnBook(a, "BUY", 1000, 1e8, { cash: 0, tokens: 7 }, 1, null, inp)!;
    expect(constrained.qty).toBe(7); expect(constrained.book.tokens).toBe(0);
    expect(fillOnBook(a, "BUY", 1, 1e8, constrained.book, 1, null, inp)).toBeNull();
  });
  it("sale cash is maximal, fee stays in book, no diagnostic statistic moves tokens and no legacy dollar flow becomes token usage", () => {
    const base = { cash: 10000, tokens: 0 };
    const sale = fillOnBook(a, "SELL", 1000, 1e8, base, 1, null, inp)!;
    expect(sale.notional).toBeLessThanOrEqual(10000);
    expect(Math.round((sale.qty + 1) * Math.floor(1e8 * Math.exp(-.02 - .12 * Math.sqrt((sale.qty + 1) / 150e6))) / 1e6)).toBeGreaterThan(10000);
    expect(sale.book).toMatchObject({ tokens: sale.qty, cash: 10000 - sale.notional + sale.fee });
    expect(sale.book.flow!.m!.inv).toBeCloseTo(sale.qty / 150e6);
    const legacy = { ...base, tokens: 1000, flow: { t: 1, mid: 1e8, buy: 4e8, sell: 2e8, tb: 4e8, ts: 2e8 } };
    const migrated = fillOnBook(a, "BUY", 1000, 1e8, legacy, 1, null, inp)!;
    expect(migrated.qty).toBe(1000); expect(migrated.book.flow!.tb).toBe(1000);
    // No round-trip profit: same quantity opposite side always pays spread + commissions.
    const back = fillOnBook(a, "SELL", migrated.qty, 1e8, migrated.book, 1, null, inp)!;
    expect(back.notional - back.fee).toBeLessThan(migrated.notional + migrated.fee);
    expect(back.book.tokens).toBe(1000);
  });
});
