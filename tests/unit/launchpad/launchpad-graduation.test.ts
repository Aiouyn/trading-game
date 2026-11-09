// Launchpad graduation, lead-launchpad L4 (docs/v1/LAUNCHPAD.md "Graduation (L4)"): the crossing buy graduates the coin,
// it is listed on the server clock as a runtime crypto asset, holders' tokens become Broker positions in the same commit,
// and it trades in the Broker against its book account. Hand-worked fixtures:
//   k = 1,500,000 × 1,073,000,000. The curve holds 273M tokens once its cash is ceil(k/273M) = 5,895,605¢, so a curve that
//   sold nothing needs 4,395,605¢ net: least outlay 4,440,006¢ (fee 44,401¢, creator 22,200¢). Raise R = 4,395,605¢;
//   graduation fee round(1.5% R) = 65,934¢; book = 4,329,671¢ + 200,000,000 tokens. Listing price = last curve price
//   5,895,605¢ / 273,000,000 = $0.000215956… → 21,596 × 1e-8 $. B's position: 800,000,000 at cost 4,440,006¢ →
//   avgCost 5,550.0075 → 5,550 (1e-8 $) = "0.00005550". Value at the mark: 21,596 × 8e8 / 1e6 = 17,276,800¢.
//   Broker execution now uses the finite-book source depth ladder (05/06): F22 half-spread .0266, D .9548,
//   ADV153M and effective crypto σd=.200258141606525. The grid-band inversion fixture appears at the actual fill below.
//   Fees still use 3bp/min10c; conservation includes the book and the already funded NPC pools.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as orderRoute } from "@/app/api/broker/orders/route";
import { GET as boardGet } from "@/app/api/leaderboard/route";
import { GET as lpGet } from "@/app/api/launchpad/route";
import { GET as histGet } from "@/app/api/launchpad/history/route";
import { POST as launchRoute } from "@/app/api/launchpad/launch/route";
import { POST as tradeRoute } from "@/app/api/launchpad/trade/route";
import { GET as marketGet } from "@/app/api/market/route";
import { GET as worldGet } from "@/app/api/world/route";
import { modelOf, parseHistory } from "@/apps/launchpad/history";
import { ASSET_BY_ID } from "@/market/catalog";
import { isListed, listVersion, listedDef, resetListingsForTests } from "@/market/listings";
import { LP, minAfterSlip } from "@/launchpad/rules";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { setBrokerForTests } from "@/server/broker";
import { marketCashCents, poolCashCents, poolDebtCents, poolFundedCents, poolTokens } from "@/server/launchpad/state";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { getCandles } from "@/server/market/candles";

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
const key = () => `lp-grad-key-${++n}`;
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, password: "password1" }) }));
  expect(res.status).toBe(201);
  return (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
}
const post = (route: (r: Request) => Promise<Response>, url: string, cookie: string, body: Record<string, unknown>) =>
  route(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", cookie }, body: JSON.stringify(body) }));
const launch = async (c: string, ticker = "FROG") => (await post(launchRoute, "/api/launchpad/launch", c, { idempotencyKey: key(), fee: LP.LAUNCH_FEE, tagline: "tg5", name: `${ticker} Club`, ticker })).json();
type Body = { side: "buy" | "sell"; amount: number; min?: number; k?: string; ticker?: string };
const tradeRes = (c: string, b: Body) => post(tradeRoute, "/api/launchpad/trade", c, { idempotencyKey: b.k ?? key(), ticker: b.ticker ?? "FROG", side: b.side, amount: b.amount, min: b.min ?? 0 });
const trade = async (c: string, b: Body) => (await tradeRes(c, b)).json();
const orderRes = (c: string, side: "BUY" | "SELL", qty: number, extra: Record<string, unknown> = {}, k = key()) =>
  post(orderRoute, "/api/broker/orders", c, { idempotencyKey: k, draft: { assetId: "FROG", side, type: "market", qty: String(qty), tif: "day", ...extra } });
const order = async (c: string, side: "BUY" | "SELL", qty: number, extra: Record<string, unknown> = {}, k?: string) => (await orderRes(c, side, qty, extra, k)).json();
const get = async (route: (r: Request) => Promise<Response>, url: string, c?: string) => (await route(new Request(`http://localhost${url}`, { headers: c ? { cookie: c } : {} }))).json();
const coinView = async (ticker = "FROG") => (await get(lpGet, "/api/launchpad")).coins.find((c: { ticker: string }) => c.ticker === ticker);
const me = (c: string) => get(brokerMe, "/api/broker/me", c);

describe("Launchpad graduation (L4): listing, positions, Broker trading against the book", () => {
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
  /** Σ player cash + Σ live curves' real cash + Σ books' cash + the Launchpad sink (Broker fees on a listed coin go to its book). */
  const world = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + r.cashCents, 0)))
    + (await auth.readLaunchpad(null, (lp) => lp.coins.reduce((s, c) => s + marketCashCents(c) + (c.book?.cash ?? 0) + poolCashCents(c) - poolDebtCents(c) - poolFundedCents(c), 0) + lp.sinkCents)); // the pools' booked funding is the one NPC cash line
  const lp = () => auth.readLaunchpad(null, (s) => s);
  /** Σ Broker positions in FROG over every ledger + the book's tokens + the trader pools' tokens. */
  const supply = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + (r.positions.find((p) => p.assetId === "FROG")?.qty ?? 0), 0)))
    + ((await lp()).coins[0]!.book?.tokens ?? 0) + poolTokens((await lp()).coins[0]!);

  it("threshold → listed → positions in the same commit (hand-worked); Launchpad trading ends (GRADUATED)", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    expect((await launch(a)).status).toBe("accepted");
    await setCash(10_000_000);
    const total = await world();
    expect((await coinView()).grad).toBeNull();
    expect(isListed("FROG")).toBe(false);
    const v0 = listVersion();
    const r = await trade(b, { side: "buy", amount: 10_000_000, min: minAfterSlip(800_000_000) });
    expect(r).toEqual({ status: "accepted", ticker: "FROG", side: "buy", tokens: 800_000_000, cents: 4_440_006, fee: 44_401, cashCents: 5_559_994, held: 800_000_000, graduated: true });
    // Listed by the engine's listing path: one append, the default watchlist, the server quote at the last curve price.
    expect(listVersion()).toBe(v0 + 1);
    expect(ASSET_BY_ID.FROG).toEqual(listedDef("FROG", "FROG Club", 21_596));
    const snap = await get(marketGet, "/api/market");
    expect(snap.quotes.rows.FROG).toMatchObject({ assetId: "FROG", last: "0.00021596", state: "CONTINUOUS" });
    expect(snap.listed).toEqual([listedDef("FROG", "FROG Club", 21_596)]);
    expect((await get(worldGet, "/api/world")).catalog.map((x: { assetId: string }) => x.assetId)).toContain("FROG");
    // Same commit: B's tokens are a Broker position at cost; no Launchpad holding or coin row remains.
    const mb = await me(b);
    expect(mb.positions).toEqual({ FROG: { assetId: "FROG", qty: "800000000", avgCost: "0.00005550" } });
    expect(mb.coins).toEqual([]);
    expect(mb.cashCents).toBe(5_559_994);
    expect((await me(a)).cashCents).toBe(10_022_200);
    const s = await lp();
    expect(s.holdings).toEqual({});
    expect(s.costs).toEqual({});
    expect(s.coins[0]).toMatchObject({ book: { cash: 4_329_671, tokens: 200_000_000 }, grad: { raise: 4_395_605, fee: 65_934, price: 21_596, at: 1 } });
    expect(s.sinkCents).toBe(100_000 + (44_401 - 22_200) + 65_934);
    expect(await world()).toBe(total);
    expect(await supply()).toBe(LP.SUPPLY);
    // Wealth: cash + the position at the server mark (the board uses the same valuation as Portfolio).
    expect((await get(boardGet, "/api/leaderboard", b)).self.nw).toBe(((5_559_994 + 17_276_800) / 100).toFixed(2));
    // The Graduated view: public record, listing price, book and the Broker mark.
    expect((await coinView()).grad).toEqual({ atMs: expect.any(Number), raise: 4_395_605, fee: 65_934, price: 21_596, book: { cash: 4_329_671, tokens: 200_000_000 }, mark: 21_596, npc: null }); // the trader pools start on the first server tick after the listing (launchpad-pools.test.ts)
    // History ends at the graduation, at the listing price.
    const h = await get(histGet, "/api/launchpad/history?ticker=FROG");
    expect(h.grad).toEqual({ atMs: expect.any(Number), at: 1, price: 21_596 });
    expect(modelOf(parseHistory(h, "FROG")!).steps.map((x) => x.kind)).toEqual(["launch", "buy", "graduation"]);
    // The coin no longer trades on the Launchpad, either side.
    expect(await trade(b, { side: "sell", amount: 1 })).toMatchObject({ status: "refused", code: "GRADUATED" });
    expect(await trade(a, { side: "buy", amount: 10_000 })).toMatchObject({ status: "refused", code: "GRADUATED" });
  });

  it("Broker: priced fills against the book (spread + impact), partial when it cannot cover, never minted, fee to the book", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await get(marketGet, "/api/market"); // a client already reads the market: its candle recorder runs before the listing
    await launch(a);
    await setCash(10_000_000);
    await trade(b, { side: "buy", amount: 10_000_000 });
    const w0 = await world();
    const r1 = await order(c, "BUY", 1_000_000);
    expect(r1.result.status).toBe("ACCEPTED");
    // Hand fixture: σd=1.9296372897108085×.9×2.2/√364, ADV=153M (F22), s=.0266, D=.9548.
    // Band=6σd/√720=.04477908, hi=floor(21596 exp(band))=22585; invert log ladder at that grid point.
    const f1 = r1.ledger.fills.at(-1);
    expect(f1).toMatchObject({ assetId: "FROG", side: "BUY", qty: "835884", price: "0.00022585", fee: "0.10" });
    const paid1 = Math.ceil(835884 * 22585 / 1e6) + 10;
    expect(r1.ledger.cashCents).toBe(10_000_000 - paid1);
    expect((await lp()).coins[0]!.book).toEqual({ cash: 4_329_671 + paid1, tokens: 200_000_000 - 835884 });
    expect(Number(market.snapshot().quotes.rows.FROG!.last)).toBeGreaterThan(0.00021596); // only after save
    // The shared side ladder is at its tick band, not "out of tokens". No unbacked or out-of-band buy.
    expect((await order(c, "BUY", 300_000_000)).result).toMatchObject({ status: "REJECTED", rejectCode: "MKT_NO_LIQUIDITY" });
    const t0 = market.snapshot().tick;
    expect(getCandles(market).history({ assetId: "FROG", res: "tick", from: t0, to: t0 })).toMatchObject([{ t: t0, v: "835884" }]);
    const beforeSell = await me(b), bk = (await lp()).coins[0]!.book!;
    const r3 = await order(b, "SELL", 800_000_000), sale = r3.ledger.fills.at(-1);
    expect(sale.side).toBe("SELL");
    const q = Number(sale.qty), px = Math.round(Number(sale.price) * 1e8), fee = Math.round(Number(sale.fee) * 100);
    expect(q).toBeGreaterThan(0); expect(q).toBeLessThan(800_000_000);
    const received = Math.round(q * px / 1e6);
    expect(received).toBeLessThanOrEqual(bk.cash);
    expect(r3.ledger.cashCents).toBe(beforeSell.cashCents + received - fee);
    expect(r3.ledger.positions.FROG.qty).toBe(String(800_000_000 - q));
    expect((await lp()).coins[0]!.book).toEqual({ cash: bk.cash - received + fee, tokens: bk.tokens + q });
    expect((await order(c, "SELL", 835885)).result).toMatchObject({ status: "REJECTED", rejectCode: "MKT_NO_LOCATE" });
    expect((await order(c, "SELL", 1, { type: "stop", stop: "0.00020000" })).result).toMatchObject({ status: "REJECTED", rejectCode: "MKT_ORDER_TYPE_UNSUPPORTED" });
    expect(await supply()).toBe(LP.SUPPLY);
    expect(await world()).toBe(w0);
    for (let i = 0; i < 50; i++) market.step();
    const mark = Number((await get(marketGet, "/api/market")).quotes.rows.FROG.last);
    const r4 = await order(c, "BUY", 10_000);
    expect(r4.result.status).toBe("ACCEPTED");
    expect(Number(r4.ledger.fills.at(-1).price)).toBeGreaterThan(mark * 1.02);

  });

  it("Broker replay and a failed save: the same key returns the first fill; a failed save moves neither ledger nor book", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    await setCash(10_000_000);
    await trade(b, { side: "buy", amount: 10_000_000 });
    const k = key();
    const first = await order(b, "SELL", 1_000_000, {}, k);
    const book1 = (await lp()).coins[0]!.book;
    expect(await order(b, "SELL", 1_000_000, {}, k)).toEqual(first);
    expect((await lp()).coins[0]!.book).toEqual(book1);
    store.failNext = true;
    const res = await orderRes(b, "SELL", 1_000_000);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect((await lp()).coins[0]!.book).toEqual(book1);
    expect((await me(b)).positions.FROG.qty).toBe(first.ledger.positions.FROG.qty);
    expect(await supply()).toBe(LP.SUPPLY);
  });

  it("exactly once: concurrent crossing buys graduate and list once; replay changes nothing", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    const total = await world();
    const v0 = listVersion();
    const k = key();
    const [rb, rc] = await Promise.all([trade(b, { side: "buy", amount: 9_000_000, k }), trade(c, { side: "buy", amount: 9_000_000 })]);
    const won = [rb, rc].filter((x) => x.status === "accepted");
    expect(won).toHaveLength(1);
    expect(won[0]!.graduated).toBe(true);
    expect([rb, rc].filter((x) => x.code === "GRADUATED")).toHaveLength(1);
    expect(listVersion()).toBe(v0 + 1);
    const s1 = await lp();
    const mb = await me(b), mc = await me(c);
    expect(await trade(b, { side: "buy", amount: 9_000_000, k })).toEqual(rb);
    expect(await lp()).toEqual(s1);
    expect([await me(b), await me(c)]).toEqual([mb, mc]);
    expect(listVersion()).toBe(v0 + 1);
    expect(await world()).toBe(total);
    expect(await supply()).toBe(LP.SUPPLY);
  });

  it("several holders: each balance becomes a position at its own cost basis; the creator's share ends", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    const first = await trade(b, { side: "buy", amount: 2_000_000 });
    const second = await trade(c, { side: "buy", amount: 9_000_000 });
    expect(second).toMatchObject({ graduated: true, tokens: 800_000_000 - first.tokens });
    const unit = 1e6;
    const avg = (cost: number, q: number) => ((Math.round((cost * unit * 2) / q) + 1) >> 1);
    expect((await me(b)).positions.FROG).toEqual({ assetId: "FROG", qty: String(first.tokens), avgCost: (avg(first.cents, first.tokens) / 1e8).toFixed(8) });
    expect((await me(c)).positions.FROG).toEqual({ assetId: "FROG", qty: String(second.tokens), avgCost: (avg(second.cents, second.tokens) / 1e8).toFixed(8) });
    const aCash = (await me(a)).cashCents;
    await order(c, "SELL", 1_000_000);
    expect((await me(a)).cashCents).toBe(aCash);
    expect(await supply()).toBe(LP.SUPPLY);
  });

  it("a failed save on the crossing buy lists nothing and grants nothing; the retry graduates once", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    await setCash(10_000_000);
    const total = await world();
    const k = key();
    store.failNext = true;
    expect((await tradeRes(b, { side: "buy", amount: 9_000_000, k })).status).toBeGreaterThanOrEqual(500);
    expect(isListed("FROG")).toBe(false);
    expect((await coinView()).grad).toBeNull();
    expect((await me(b)).positions).toEqual({});
    expect(await world()).toBe(total);
    expect(await trade(b, { side: "buy", amount: 9_000_000, k })).toMatchObject({ status: "accepted", graduated: true, cents: 4_440_006 });
    expect(isListed("FROG")).toBe(true);
    expect(await world()).toBe(total);
  });

  it("restart: a new process lists the saved graduated coin at its listing price with the same positions; tampering is refused (kept, 503)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lp-grad-"));
    const file = path.join(dir, "auth.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    const fresh = new AuthService({ store: new FileAuthStore(file) });
    await fresh.sweepPrivateStates((cur) => ({ ...cur, cashCents: 10_000_000 }));
    setAuthServiceForTests(fresh);
    await trade(b, { side: "buy", amount: 9_000_000 });
    await order(b, "SELL", 1_000_000);
    const view = await get(lpGet, "/api/launchpad", b), hist = await get(histGet, "/api/launchpad/history?ticker=FROG"), mb = await me(b);
    // A new process: a fresh catalog, a fresh clock, a fresh auth service reading the file.
    resetListingsForTests();
    setLiveMarketForTests(new LiveMarket());
    setBrokerForTests(undefined);
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    expect(isListed("FROG")).toBe(false);
    const snap = await get(marketGet, "/api/market");
    expect(snap.quotes.rows.FROG.last).toBe("0.00021596"); // the path restarts at the listing price (genuine gap: no saved path)
    expect(await me(b)).toEqual({ ...mb, tick: expect.any(Number) });
    // The view is the same but for the mark: the path (and the permanent impact on it) restarts at the listing price.
    const atListing = structuredClone(view);
    atListing.coins.find((x: { ticker: string }) => x.ticker === "FROG").grad.mark = 21_596;
    expect(await get(lpGet, "/api/launchpad", b)).toEqual(atListing);
    // The book's flow (the price law's memory) is saved with the book and loads again.
    expect(JSON.parse(readFileSync(file, "utf8")).launchpad.coins[0].flow).toMatchObject({ t: expect.any(Number), mid: 21_596, ts: 832807 });
    expect(await get(histGet, "/api/launchpad/history?ticker=FROG")).toEqual(hist);
    type Raw = {
      launchpad: { coins: { book?: { tokens: number }; flow?: { mid: number; buy: number; m: { d: number; inv: number; dt: number } }; grad: { price: number }; creatorId: string }[]; holdings: Record<string, Record<string, number>>; costs: Record<string, Record<string, number>> };
      players: { positions: Record<string, { qty: string }> }[];
    };
    for (const tamper of [
      (raw: Raw) => { raw.launchpad.coins[0]!.book!.tokens += 1; }, // supply no longer whole
      (raw: Raw) => { const p = raw.players.find((x) => x.positions.FROG)!; p.positions.FROG!.qty = String(Number(p.positions.FROG!.qty) + 1); },
      (raw: Raw) => { raw.launchpad.coins[0]!.grad.price += 1; },
      (raw: Raw) => { delete raw.launchpad.coins[0]!.book; },
      (raw: Raw) => { raw.launchpad.coins[0]!.flow!.mid = 0; }, // a flow that does not parse
      (raw: Raw) => { raw.launchpad.coins[0]!.flow!.buy = -1; },
      (raw: Raw) => { raw.launchpad.coins[0]!.flow!.m.d = .19; },
      (raw: Raw) => { raw.launchpad.coins[0]!.flow!.m.inv = Infinity; },
      (raw: Raw) => { raw.launchpad.coins[0]!.flow!.m.dt = -1; },
      (raw: Raw) => { const id = raw.launchpad.coins[0]!.creatorId; raw.launchpad.holdings[id] = { FROG: 1 }; raw.launchpad.costs[id] = { FROG: 0 }; },
    ]) {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Raw;
      const good = readFileSync(file, "utf8");
      tamper(raw);
      writeFileSync(file, JSON.stringify(raw));
      resetListingsForTests();
      setLiveMarketForTests(new LiveMarket());
      setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
      expect((await lpGet(new Request("http://localhost/api/launchpad"))).status).toBe(503);
      expect(isListed("FROG")).toBe(false); // nothing is listed from an untrusted save
      expect(readFileSync(file, "utf8")).toBe(JSON.stringify(raw)); // preserved verbatim
      writeFileSync(file, good);
    }
    // A graduated save from before the flow existed (4c8d4fbe) loads: no flow yet, the first fill starts one.
    const raw = JSON.parse(readFileSync(file, "utf8")) as Raw;
    delete raw.launchpad.coins[0]!.flow;
    writeFileSync(file, JSON.stringify(raw));
    resetListingsForTests();
    setLiveMarketForTests(new LiveMarket());
    setBrokerForTests(undefined);
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    expect((await lpGet(new Request("http://localhost/api/launchpad"))).status).toBe(200);
    expect((await order(b, "SELL", 1_000_000)).result.status).toBe("ACCEPTED");
  });

  it("old saves: a 6ac2b3b1 stand-in graduation (pool + pool points) is refused and preserved, not converted", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lp-grad-old-"));
    const file = path.join(dir, "auth.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    const fresh = new AuthService({ store: new FileAuthStore(file) });
    await fresh.sweepPrivateStates((cur) => ({ ...cur, cashCents: 10_000_000 }));
    setAuthServiceForTests(fresh);
    await trade(b, { side: "buy", amount: 1_000_000 });
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const coin = raw.launchpad.coins[0];
    // The stand-in's shape: grad without price, a pool, and holdings kept.
    coin.grad = { atMs: coin.createdAtMs, tick: 0, raise: 1, fee: 0, at: 1 };
    coin.pool = { cash: 1, tokens: 1 };
    writeFileSync(file, JSON.stringify(raw));
    resetListingsForTests();
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    expect((await lpGet(new Request("http://localhost/api/launchpad"))).status).toBe(503);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(raw);
  });

  it("privacy: public reads carry no account data; another account sees none of a holder's positions", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    await trade(b, { side: "buy", amount: 9_000_000 });
    expect((await me(c)).positions).toEqual({});
    const ids = await auth.readLaunchpad(null, (s) => [s.coins[0]!.creatorId]);
    const bId = (await auth.readStandings((rows) => rows.find((r) => r.handle === "bob")!.accountId));
    const text = JSON.stringify([await get(lpGet, "/api/launchpad"), await get(histGet, "/api/launchpad/history?ticker=FROG"), await get(marketGet, "/api/market"), await get(lpGet, "/api/launchpad", c)]);
    for (const s of [...ids, bId, "bob", "acc_", "holdings\":{\"", "receipt", "800000000\""]) expect(text).not.toContain(s);
  });
});

describe("listing leaves the existing market unchanged", () => {
  afterEach(() => { resetListingsForTests(); });
  it("every existing asset's path is identical with and without a listed coin (own streams)", () => {
    const plain = new LiveMarket(); // runs to the end before the catalog grows (one market per process in production)
    for (let i = 0; i < 400; i++) plain.step();
    const p = plain.snapshot().quotes.rows;
    const withCoin = new LiveMarket();
    withCoin.list(listedDef("FROG", "FROG Club", 21_596));
    for (let i = 0; i < 400; i++) withCoin.step();
    const w = withCoin.snapshot().quotes.rows;
    for (const id of Object.keys(p)) if (id !== "FROG") expect(w[id]).toEqual(p[id]);
    expect(w.FROG!.last).not.toBe("0.00021596");
  });
});

describe("client feed and a listed coin (L4)", () => {
  afterEach(() => { resetListingsForTests(); });
  const draft = (type: "market" | "limit") => ({ assetId: "FROG", side: "BUY" as const, type, qty: "1000000", tif: "day" as const, ...(type === "limit" ? { limit: "0.00021596" } : {}) });
  it("signed-in: adopts the snapshot's listed def, previews a market buy in cents at least the half spread, and a limit", async () => {
    const { MockFeed } = await import("@/shell/contracts/mockFeed");
    const { adoptListed } = await import("@/market/listings");
    const cat = await import("@/market/catalog");
    const feed = new MockFeed({ empty: true, seed: 17 }, { authoritativeQuotes: true, autoStart: false });
    expect(adoptListed({ listed: [listedDef("FROG", "FROG Club", 21_596)] }, feed, cat.ASSETS, cat.ASSET_BY_ID, cat.WATCHLISTS)).toBe(true);
    expect(adoptListed({}, feed, cat.ASSETS, cat.ASSET_BY_ID, cat.WATCHLISTS)).toBe(true); // no listings: nothing to do
    expect(adoptListed({ listed: [{ ...listedDef("FROG", "FROG Club", 21_596), volBp: 5 }] }, feed, cat.ASSETS, cat.ASSET_BY_ID, cat.WATCHLISTS)).toBe(false);
    // 1,000,000 × 21,596 (1e-8 $) = 21,596¢ ($215.96, not 1e6× that) + the book's half spread 45 bp (97¢; the server adds
    // the size impact) + the 10¢ minimum fee.
    expect(feed.preview(draft("market"))).toMatchObject({ valid: true, price: "0.00021596", estFill: "0.00021693", impactBp: "45", fee: "0.10", total: "217.03" });
    expect(feed.preview(draft("limit"))).toMatchObject({ valid: true, price: "0.00021596", fee: "0.10" });
    expect(feed.preview({ ...draft("limit"), type: "stop", stop: "0.00021596" } as never)).toMatchObject({ valid: false, reasonCode: "MKT_ORDER_TYPE_UNSUPPORTED" });
  });
  it("guest demo in the same page: the listed coin is shown but not tradable (its local fills cannot price it)", async () => {
    const { MockFeed } = await import("@/shell/contracts/mockFeed");
    const cat = await import("@/market/catalog");
    const { appendAsset } = await import("@/market/listings");
    appendAsset(listedDef("FROG", "FROG Club", 21_596), cat);
    const guest = new MockFeed({}, { autoStart: false });
    expect(guest.preview(draft("market"))).toMatchObject({ valid: false, reasonCode: "MKT_UNKNOWN_ASSET" });
  });
});
