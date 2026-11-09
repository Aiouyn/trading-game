// Graduated-coin trader pools (docs/v1/LAUNCHPAD.md "Graduated-coin trader pools"; 05 §6.2 meme weights VALUE 0.2,
// RETAIL 3.0, DEGEN 1.0): explicit NPC accounts trading the coin against its book once a server tick through the same
// fill law, fees, bounds, lock and save as players. Hand numbers: an independent model (evidence/launchpad/tools/
// hand_pools.py) reproduces every one.
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
import { marketCashCents, poolCashCents, poolDebtCents, poolFundedCents, poolTokens } from "@/server/launchpad/state";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import { memeParams } from "@/server/market/meme";
import { getCandles } from "@/server/market/candles";
import { ADV_TOKENS, CRYPTO_POOL_WEIGHTS, MEME_POOL_WEIGHTS, POOL_KINDS, hypeF, hypeStep, newPools, retailNoise, stepPools, type CoinPools, type PoolWeights } from "@/server/broker/pools";
import type { PoolInputs } from "@/server/market/shockFeed";
import type { Regime } from "@/server/market/world";
import { readFileSync, writeFileSync } from "node:fs";

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
const key = () => `lp-pool-key-${++n}`;
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


const coin: AssetFixture = listedDef("FROG", "FROG Club", 21_596);
const vol = memeParams("FROG").vol, sd = vol / Math.sqrt(252), sh = sd / Math.sqrt(24);
const lnRef = Math.log(21_596 / 1e8);
/** The world at its floor terms: EXPANSION (turnover ×1.0), F = 20 (ADV fear term 0), no coin news (attention 1). */
const QUIET = { regime: "EXPANSION" as Regime, fear: 20, riskAppetite: 1 - 20 / 50, attention: 1, newsSign: 0 as -1 | 0 | 1, mentions: 0 };
const inputs = (tick: number, g: number, r1h: number | null, r1d: number | null, w: Partial<typeof QUIET> = {}): PoolInputs =>
  ({ tick, ref: 21_596, lnV: lnRef - g, r1h, r1d, vol, ...QUIET, ...w });

describe("trader pools: one tick by hand (pure)", () => {
  // Hour 921 (ticks 27,630–27,659): RETAIL's noise is +1.6615 (stream lp:FROG:retail:921).
  const T = 921 * 30;
  it("creation: three NPC accounts funded from the booked line with w ADV at the listing price, no tokens", () => {
    const p = newPools(MEME_POOL_WEIGHTS, 21_596, "e1", T, 200_000_000);
    expect(ADV_TOKENS).toBe(150_000_000); // 05 §3.3.6 meme turnover 0.15 × supply 1e9
    // w × 150M tokens × $0.00021596: 0.2 → $6,478.80, 3.0 → $97,182.00, 1.0 → $32,394.00
    expect([p.value, p.retail, p.degen]).toEqual([{ cash: 647_880, tokens: 0, pos: 0 }, { cash: 9_718_200, tokens: 0, pos: 0 }, { cash: 3_239_400, tokens: 0, pos: 0 }]);
    expect(p).toMatchObject({ funded: 13_605_480, h: 0.6, hr: 921, t: T - 1, bk: 200_000_000, pnet: [], tape: [], vol: 0 });
  });
  it("tick 1: targets, rate caps, soft capacity, limits and fills (price 1% under value, rising hour and day)", () => {
    expect(retailNoise("FROG", 921)).toBeCloseTo(1.66152392221008, 14);
    const book: BookAccount = { cash: 4_329_671, tokens: 200_000_000 };
    const s = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, undefined, book, 21_600, inputs(T, -0.01, 0.004, 0.02), "e1")!;
    // targets (unweighted, ADV): VALUE −tanh(G/g0), G = −0.01, g0 = σd√5; RETAIL tanh(z + 0.5 tanh(r1d/σd)) (no news,
    // no dip: the day rose); DEGEN (1+2H) tanh(r1h/σh)
    const tv = -Math.tanh(-0.01 / (sd * Math.sqrt(5))), tr = Math.tanh(1.66152392221008 + 0.5 * Math.tanh(0.02 / sd)), td = 2.2 * Math.tanh(0.004 / sh);
    expect([tv, tr, td].map((x) => +x.toFixed(6))).toEqual([0.036774, 0.94058, 0.35162]);
    // every weighted target is past its cap, so each order is its cap: w × rate / 720 ADV
    expect(0.2 * tv).toBeGreaterThan(0.2 * 0.9 / 720); expect(3 * tr).toBeGreaterThan(3 * 0.15 / 720); expect(td).toBeGreaterThan(0.4 / 720);
    // 0.00025 × 150M = 37,500; 0.000625 × 150M = 93,750; 0.000556 × 150M = 83,333 (toward zero); buy limit floor(21,596 e^{3×0.0266}); execution s=0.0266, D=0.9548, σd=vol/√364, Y=1.2
    expect(s.prints).toEqual([
      { tick: T, pool: "value", side: "BUY", qty: 37_500, px: 22_226 },
      { tick: T, pool: "retail", side: "BUY", qty: 93_750, px: 22_264 },
      { tick: T, pool: "degen", side: "BUY", qty: 83_333, px: 22_287 },
    ]);
    // Source depth ladder: px=ceil(21600 exp(s+1.2σd√(cumulative tokens/(D×150M)))); cash: notional (cents up) + the 10¢ minimum fee, paid to the book
    expect([s.pools.value, s.pools.retail, s.pools.degen].map((a) => [a.cash, a.tokens])).toEqual([[647_880 - 834 - 10, 37_500], [9_718_200 - 2_088 - 10, 93_750], [3_239_400 - 1_858 - 10, 83_333]]);
    expect(s.pools.value.pos).toBeCloseTo(0.00025, 15);
    expect(s.pools.retail.pos).toBeCloseTo(0.000625, 15);
    expect(s.book).toMatchObject({ cash: 4_329_671 + 834 + 2_088 + 1_858 + 30, tokens: 200_000_000 - 214_583 });
    expect(s.book.flow).toMatchObject({ t: T, mid: 21_600 });
    expect(s.moves.every((m) => m > 0)).toBe(true);
    expect(s.pools).toMatchObject({ t: T, bk: 200_000_000 - 214_583, ep: "e1", vol: 214_583 });
  });
  it("cash-limited NPC repricing retains authoritative Fear, ADV, depth and effective volatility, just like a player", () => {
    const weights = { value: .2, retail: 0, degen: 0 };
    const prior = newPools(weights, 21_596, "e1", T, 200_000_000);
    prior.value.cash = 100; // already depleted funded account, not a fresh backing line
    const depth = { fear: 60, regimeDepth: 1, adv: 210e6, sigmaDaily: .4 };
    const s = stepPools(coin, weights, 21_596, prior, { cash: 4_329_671, tokens: 200_000_000 }, 21_600, inputs(T, -.01, .004, .02, { fear: 60 }), "e1", depth)!;
    expect(s.prints).toHaveLength(1);
    const f = s.prints[0]!;
    expect(f.qty).toBeGreaterThan(0); expect(f.qty).toBeLessThan(37_500);
    // Independent source ladder at the actual reduced quantity; dropping context would silently use F22/σ_template.
    expect(f.px).toBe(Math.ceil(21_600 * Math.exp(.038 + .48 * Math.sqrt(f.qty / (.64 * 210e6)))));
    expect(s.pools.value.cash).toBe(100 - Math.ceil(f.qty * f.px / 1e6) - 10);
    expect(s.pools.value.cash).toBeGreaterThanOrEqual(0);
    const player = fillOnBook(coin, "BUY", f.qty, 21_600, { cash: 4_329_671, tokens: 200_000_000 }, T, null, depth)!;
    expect([f.qty, f.px, s.book]).toEqual([player.qty, player.px, player.book]);
  });
  it("tick 2: price 1% over value and a falling hour: VALUE and DEGEN sell only what they hold; RETAIL keeps buying", () => {
    const book: BookAccount = { cash: 4_329_671, tokens: 200_000_000 };
    const s1 = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, undefined, book, 21_600, inputs(T, -0.01, 0.004, 0.02), "e1")!;
    const s2 = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, s1.pools, s1.book, 21_600, inputs(T + 1, 0.01, -0.004, 0.02), "e1")!;
    // VALUE: cap 0.00025 over 1 + 3|pos| (pos 0.00025 decayed one tick) → 37,471; DEGEN: cap → 83,333 = all it holds
    expect(s2.prints).toEqual([
      { tick: T + 1, pool: "value", side: "SELL", qty: 37_471, px: 20_991 },
      { tick: T + 1, pool: "retail", side: "BUY", qty: 93_750, px: 22_252 },
      { tick: T + 1, pool: "degen", side: "SELL", qty: 83_333, px: 20_959 },
    ]);
    expect([s2.pools.value.tokens, s2.pools.retail.tokens, s2.pools.degen.tokens]).toEqual([29, 187_500, 0]);
    expect([s2.pools.value.cash, s2.pools.retail.cash, s2.pools.degen.cash]).toEqual([647_813, 9_714_005, 3_239_269]);
    expect(s2.book).toMatchObject({ cash: 4_334_064, tokens: 199_812_471 });
    // the decay moves only the tracking position: VALUE's 0.00025 × 0.5^(1/7200), less what it sold
    expect(s2.pools.value.pos).toBeCloseTo(0.00025 * Math.pow(0.5, 1 / 7200) - 37_471 / 150e6, 15);
    // once a tick: the same tick again does nothing
    expect(stepPools(coin, MEME_POOL_WEIGHTS, 21_596, s2.pools, s2.book, 21_600, inputs(T + 1, 0.01, -0.004, 0.02), "e1")).toBeNull();
  });
  it("hype by hand: one update a game hour from the players' net buy volume of the last 24 game hours", () => {
    const p0 = newPools(MEME_POOL_WEIGHTS, 21_596, "e1", T, 200_000_000);
    // players bought 1,000,000 tokens from the book since the last pool step; the next step is in hour 922
    const s = stepPools(coin, { value: 0, retail: 0, degen: 0 }, 21_596, { ...p0, t: T }, { cash: 4_329_671, tokens: 199_000_000 }, 21_596, inputs(922 * 30, 0, null, null), "e1")!;
    const net = 21_596; // 1,000,000 × $0.00021596 = $215.96
    const cap = Math.round(801_000_000 * 21_596 / 1e6); // (supply − book) × P, cents
    const f = Math.min(1, net / cap * 20);
    expect(hypeF(net, cap)).toBe(f);
    expect(s.pools.h).toBeCloseTo(0.6 + 0.15 * (f - 0.6) - 0.06 * 0.6, 15);
    expect(hypeStep(0.6, 0, f)).toBe(s.pools.h); // no Wire item names the coin: m = 0
    expect(s.pools.pnet).toEqual([[922, net]]);
    expect(s.pools).toMatchObject({ hr: 922, bk: 199_000_000 });
    expect(s.prints).toEqual([]); // zero weights trade nothing
    // 24 game hours later the window is empty (f = 0), and the same epoch still updates once per hour
    const later = stepPools(coin, { value: 0, retail: 0, degen: 0 }, 21_596, s.pools, { cash: 4_329_671, tokens: 199_000_000 }, 21_596, inputs(946 * 30, 0, null, null), "e1")!;
    expect(later.pools.pnet).toEqual([]);
    let h = s.pools.h;
    for (let i = 0; i < 24; i++) h = hypeStep(h, 0, 0);
    expect(later.pools.h).toBeCloseTo(h, 15);
  });
  it("a buy never exceeds the pool's cash; a pool with nothing to sell sends nothing; inputs it cannot read add nothing", () => {
    const p = newPools(MEME_POOL_WEIGHTS, 21_596, "e1", T, 200_000_000);
    p.retail.cash = 1_000; // $10: buys what $10 pays, fee included
    const s = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, p, { cash: 4_329_671, tokens: 200_000_000 }, 21_600, inputs(T, 0, null, null), "e1")!;
    const r = s.prints.find((x) => x.pool === "retail")!;
    expect(1_000 - s.pools.retail.cash).toBeLessThanOrEqual(1_000);
    expect(s.pools.retail.cash).toBeGreaterThanOrEqual(0);
    expect(r.qty).toBeLessThan(93_750);
    // at G = 0 and no returns, VALUE and DEGEN want nothing (no history of returns: their terms read 0)
    expect(s.prints.map((x) => x.pool)).toEqual(["retail"]);
    // hour 922: noise −0.39, holding nothing: RETAIL cannot sell
    const q = stepPools(coin, MEME_POOL_WEIGHTS, 21_596, newPools(MEME_POOL_WEIGHTS, 21_596, "e1", 922 * 30, 200_000_000), { cash: 4_329_671, tokens: 200_000_000 }, 21_600, inputs(922 * 30, 0, null, null), "e1");
    expect(retailNoise("FROG", 922)).toBeLessThan(0);
    expect(q?.prints ?? []).toEqual([]);
  });
});

describe("trader pools: the weights act through order flow (behavior, pure)", () => {
  const run = (w: PoolWeights, ticks: number, g: number) => {
    let p: CoinPools | undefined, book: BookAccount = { cash: 1e12, tokens: 900_000_000 };
    const vol: Record<string, number> = { value: 0, retail: 0, degen: 0 };
    const T0 = 921 * 30;
    for (let i = 0; i < ticks; i++) {
      const s = stepPools(coin, w, 21_596, p, book, 21_596, inputs(T0 + i, g, null, null), "e1");
      if (!s) continue;
      p = s.pools; book = s.book;
      for (const x of s.prints) vol[x.pool]! += x.qty;
    }
    return { vol, p: p! };
  };
  it("RETAIL 3.0 trades 3× the crypto row's 1.0 while its cap binds; VALUE 0.2 answers the same gap 0.4× as much as 0.5, and stops at a smaller position", () => {
    const meme = run(MEME_POOL_WEIGHTS, 30, -0.05), crypto = run(CRYPTO_POOL_WEIGHTS, 30, -0.05);
    expect(meme.vol.retail).toBe(30 * 93_750);
    expect(crypto.vol.retail).toBe(30 * 31_250);
    expect(meme.vol.retail / crypto.vol.retail).toBe(3);
    // first tick: both at their caps, 0.2 / 0.5 of the same rate
    const m1 = run(MEME_POOL_WEIGHTS, 1, -0.05).vol.value, c1 = run(CRYPTO_POOL_WEIGHTS, 1, -0.05).vol.value;
    expect(m1 / c1).toBeCloseTo(0.4, 6);
    // 400 ticks on: the meme VALUE pool reached its smaller target (0.2 × tanh(0.05/g0) ADV) and stopped; crypto's
    // (0.5 ×) kept going
    const target = 0.2 * Math.tanh(0.05 / (sd * Math.sqrt(5)));
    const m400 = run(MEME_POOL_WEIGHTS, 400, -0.05), c400 = run(CRYPTO_POOL_WEIGHTS, 400, -0.05);
    expect(m400.p.value.pos).toBeCloseTo(target, 3);
    expect(c400.p.value.pos).toBeGreaterThan(2 * target);
    expect(meme.vol.degen).toBe(0); // no hour return: DEGEN has no signal
  });
});

describe("trader pools in the world: clock, book, players alongside", () => {
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
  const lp = () => auth.readLaunchpad(null, (s) => s);
  const frog = async () => (await lp()).coins[0]!;
  /** Σ ledgers + curves + books + pools + sinks − the pools' booked funding: constant. */
  const world = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + r.cashCents, 0)))
    + (await auth.readLaunchpad(null, (l) => l.coins.reduce((s, c) => s + marketCashCents(c) + (c.book?.cash ?? 0) + poolCashCents(c) - poolDebtCents(c) - poolFundedCents(c), 0) + l.sinkCents));
  const supply = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + (r.positions.find((p) => p.assetId === "FROG")?.qty ?? 0), 0))) + (await frog()).book!.tokens + poolTokens(await frog());
  const mark = () => market.listedMark("FROG")!;
  const tick = async () => { market.step(); await getBroker().sweep(); };
  const graduate = async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol"), d = await signUp("dave");
    await launch(a);
    await setCash(10_000_000);
    await trade(b, 2_000_000);
    expect((await trade(c, 9_000_000)).graduated).toBe(true);
    await me(b); // the Broker's first read: the clock lists the coin and the sweep attaches
    return { a, b, c, d };
  };
  const checks = async (w0: number) => {
    expect(await supply()).toBe(LP.SUPPLY);
    expect(await world()).toBe(w0);
    const c = await frog();
    expect(c.book!.cash).toBeGreaterThanOrEqual(0);
    for (const k of POOL_KINDS) { expect(c.pools?.[k].cash ?? 0).toBeGreaterThanOrEqual(0); expect(c.pools?.[k].tokens ?? 0).toBeGreaterThanOrEqual(0); }
  };

  it("after an organic graduation the pools trade on the clock: real fills against the book, in the candles' volume, public on the Launchpad", async () => {
    const { b } = await graduate();
    const w0 = await world();
    expect((await get(lpGet, "/api/launchpad")).coins[0].grad.npc).toBeNull();
    const t0 = market.snapshot().tick;
    for (let i = 0; i < 6; i++) await tick(); // at most 18 prints: the whole NPC tape is still kept
    let c = await frog();
    expect(c.pools!.funded).toBe(13_605_480);
    expect(c.pools!.tape.length).toBeGreaterThan(0);
    await checks(w0);
    // volume: no player traded since the listing, so the candles' volume is exactly the NPC prints, each once
    const bars = getCandles(market).history({ assetId: "FROG", res: "tick", from: t0, to: market.snapshot().tick });
    expect(bars.reduce((s, x) => s + Number(x.v), 0)).toBe(c.pools!.tape.reduce((s, x) => s + x.qty, 0));
    expect(c.pools!.vol).toBe(c.pools!.tape.reduce((s, x) => s + x.qty, 0));
    // later ticks, with players alongside below: the identities still hold
    for (let i = 0; i < 34; i++) await tick();
    c = await frog();
    await checks(w0);
    const pub = await get(lpGet, "/api/launchpad");
    expect(pub.coins[0].grad.npc).toMatchObject({ funded: 13_605_480, pools: { retail: { cash: c.pools!.retail.cash, tokens: c.pools!.retail.tokens } } });
    // players trade alongside: a market buy and sale, a resting limit and its cancel
    expect((await order(b, "BUY", 1_000_000)).result.status).toBe("ACCEPTED");
    expect((await order(b, "SELL", 500_000)).result.status).toBe("ACCEPTED");
    const lim = await order(b, "BUY", 1_000_000, { type: "limit", limit: "0.00010000" });
    const oid = Object.keys(lim.ledger.orders)[0]!;
    await tick();
    expect((await cancel(b, oid)).result.status).toBe("ACCEPTED");
    await checks(w0);
  });

  it("VALUE's gap is the flow's permanent move: a saved fill's move shifts the mark, not lnV", () => {
    const m = new LiveMarket();
    m.list(listedDef("FROG", "FROG Club", 21_596));
    m.step(); m.step();
    const i0 = m.poolInputs("FROG")!;
    expect(i0.r1h).toBeNull(); // two ticks of marks: no hour of history yet
    m.impactListed("FROG", 0.01);
    m.step();
    const i1 = m.poolInputs("FROG")!;
    // the mark is in whole minor units (≈ 5e-5 in log at this price); lnV took only the path's own step
    expect((Math.log(i1.ref / 1e8) - i1.lnV) - (Math.log(i0.ref / 1e8) - i0.lnV)).toBeCloseTo(0.01, 3);
  });

  it("random interleave of players, concurrent requests and ticks: supply, cash identity, no overdraw, every tick", async () => {
    const ps = Object.values(await graduate());
    const w0 = await world();
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 90; i++) {
      const who = ps[Math.floor(rnd() * ps.length)]!, r = rnd();
      const m = mark(), qty = 1 + Math.floor(rnd() * 3_000_000);
      const lim = (k: number) => `0.${String(Math.max(1, Math.round(m * k))).padStart(8, "0")}`;
      const act = r < 0.2 ? order(who, "BUY", qty) : r < 0.4 ? order(who, "SELL", qty)
        : r < 0.55 ? order(who, "BUY", qty, { type: "limit", limit: lim(0.99) }) : r < 0.7 ? order(who, "SELL", qty, { type: "limit", limit: lim(1.01) })
        : r < 0.8 ? (async () => { const o = Object.keys((await me(who)).orders)[0]; return o ? cancel(who, o) : null; })()
        : Promise.resolve(null);
      await Promise.all([act, tick()]); // a request racing the clock's sweep (one lock: either order, never both half-done)
      await checks(w0);
    }
    expect((await frog()).pools!.tape.length).toBeGreaterThan(0);
  });

  it("exactly once: two sweeps at one tick act once; a failed save rolls ledgers, book, pools and mark back and the next sweep acts", async () => {
    await graduate();
    for (let i = 0; i < 3; i++) await tick();
    let acted = false;
    for (let tries = 0; tries < 20 && !acted; tries++) {
      const before = await lp();
      store.failNext = true;
      market.step(); // the clock's own sweep (attached) runs this tick and its save fails
      const stepped = mark(); // the tick's own path step, before any fill
      expect(await lp()).toEqual(before); // read in the lock, after that sweep: ledgers, books and pools rolled back
      expect(mark()).toBe(stepped); // no permanent move from an unsaved fill
      await getBroker().sweep(); // the same tick, now saved: the pools act once
      const once = await lp();
      expect(once.coins[0]!.pools!.t).toBe(market.snapshot().tick);
      acted = once.coins[0]!.pools!.tape.at(-1)?.tick === market.snapshot().tick;
      await getBroker().sweep(); // a second sweep at the same tick: nothing
      expect(await lp()).toEqual(once);
    }
    expect(acted).toBe(true);
  });

  it("the event chain on the clock: the listing item → attention and mentions the pools read and save → the saved H the path reads; a failed save pushes no H", async () => {
    await graduate();
    const listed = market.wire().items.filter((i) => i.headlineKey === "wire.news.coinListed");
    expect(listed).toHaveLength(1);
    expect(listed[0]!.causeEventIds).toEqual(["lp-grad:FROG"]);
    const w0 = await world();
    await tick();
    let c = await frog();
    expect(c.pools!.w).toMatchObject({ att: 1.15, ns: 0, m: 0.15, rg: "EXPANSION" });
    // the next game hour: H = hypeStep(H, m, f) with this coin's m; pushed to the path after the save
    const hr = c.pools!.hr, h0 = c.pools!.h;
    while ((await frog()).pools!.hr === hr) await tick();
    c = await frog();
    expect(c.pools!.h).toBeCloseTo(hypeStep(h0, 0.15, 0), 12);
    expect(market.hypeOf("FROG")).toBe(c.pools!.h);
    await checks(w0);
    // a failed save at the next hour boundary: pools, and the path's H, stay as saved
    while (market.snapshot().tick % 30 !== 29) await tick();
    const before = await lp();
    store.failNext = true;
    market.step();
    expect(await lp()).toEqual(before);
    expect(market.hypeOf("FROG")).toBe(before.coins[0]!.pools!.h);
    await getBroker().sweep();
    expect(market.hypeOf("FROG")).toBe((await frog()).pools!.h);
    expect((await frog()).pools!.h).not.toBe(before.coins[0]!.pools!.h);
  });

  it("DEGEN trades in the world: the hype-scaled path gives it hour returns to act on, within its own cash and tokens", async () => {
    await graduate();
    const w0 = await world();
    let degen = 0;
    for (let i = 0; i < 120; i++) { await tick(); degen += (await frog()).pools!.tape.filter((p) => p.pool === "degen" && p.tick === market.snapshot().tick).length; }
    expect(degen).toBeGreaterThan(0);
    await checks(w0);
  });

  it("restart: the pools' accounts and positions survive on disk; the new process (new epoch) acts again; an old save without pools is funded once", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lp-pools-"));
    const file = path.join(dir, "auth.json");
    auth = new AuthService({ store: new FileAuthStore(file) });
    setAuthServiceForTests(auth);
    await graduate();
    // the save as it was before pools existed: graduated, no pool step yet
    expect((await frog()).pools).toBeUndefined();
    for (let i = 0; i < 31; i++) await tick(); // past a game hour boundary
    const saved = (await frog()).pools!;
    expect(saved.funded).toBe(13_605_480);
    resetListingsForTests();
    market = new LiveMarket();
    setLiveMarketForTests(market);
    setBrokerForTests(undefined);
    auth = new AuthService({ store: new FileAuthStore(file) });
    setAuthServiceForTests(auth);
    expect((await frog()).pools).toEqual(saved);
    await get(marketGet, "/api/market"); // a read attaches the sweep; it changes nothing
    expect((await frog()).pools).toEqual(saved);
    // the relist reads the saved H (not H₀) and publishes no listing item again
    expect(saved.h).not.toBe(0.6); // an hour passed: H moved off H₀
    expect(market.hypeOf("FROG")).toBe(saved.h);
    expect(market.wire().items.some((i) => i.headlineKey === "wire.news.coinListed")).toBe(false);
    for (let i = 0; i < 3; i++) await tick();
    const after = (await frog()).pools!;
    expect(after.ep).not.toBe(saved.ep);
    expect(after.funded).toBe(saved.funded);
    expect(after.t).toBe(market.snapshot().tick);
    expect(await supply()).toBe(LP.SUPPLY);
    // tampering with the pools on disk: never repaired, the Launchpad reads unavailable
    for (const bad of [(p: CoinPools) => { p.retail.tokens += 1; }, (p: CoinPools) => { p.value.cash = -1; }, (p: CoinPools) => { (p as unknown as Record<string, unknown>).extra = 1; }]) {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      bad(raw.launchpad.coins[0].pools);
      const f2 = path.join(dir, `bad-${Math.random()}.json`);
      writeFileSync(f2, JSON.stringify(raw));
      const t = new AuthService({ store: new FileAuthStore(f2) });
      setAuthServiceForTests(t);
      expect((await lpGet(new Request("http://localhost/api/launchpad"))).status).toBe(503);
    }
  });

  it("public and read-only: GET /api/launchpad shows NPC accounts and prints only (no player data), and reading twice changes nothing", async () => {
    const { b } = await graduate();
    for (let i = 0; i < 10; i++) await tick();
    const s0 = await lp();
    const pub = JSON.stringify(await get(lpGet, "/api/launchpad"));
    await get(lpGet, "/api/launchpad", b);
    expect(await lp()).toEqual(s0);
    for (const x of ["openOrders", "positions", "acc_", "pnet", "\"bk\"", "\"ep\""]) expect(pub).not.toContain(x);
    expect(JSON.parse(pub).coins[0].grad.npc).toEqual({ h: s0.coins[0]!.pools!.h, funded: 13_605_480, vol: s0.coins[0]!.pools!.vol, pools: { value: s0.coins[0]!.pools!.value, retail: s0.coins[0]!.pools!.retail, degen: s0.coins[0]!.pools!.degen }, tape: s0.coins[0]!.pools!.tape,
      // what the last step read (public world/news inputs: the fresh listing's item, nw 0.5 × 1 × 0.3 = 0.15) and the
      // path multipliers its saved H and regime give: vol × (1 + 2H), EXPANSION 0.90, drift + 3.0 H a game year
      w: { rg: "EXPANSION", f: s0.coins[0]!.pools!.w!.f, att: 1.15, ns: 0, m: 0.15 },
      liq: s0.coins[0]!.pools!.liq ? { ...s0.coins[0]!.pools!.liq } : null,
      path: { hypeVol: 1 + 2 * s0.coins[0]!.pools!.h, regimeVol: 0.9, drift: 3 * s0.coins[0]!.pools!.h } });
  });

  it("determinism: the same seed and the same actions give the same pools (but the epoch name)", async () => {
    const runOnce = async () => {
      store = new Store(new MemoryAuthStore()); auth = new AuthService({ store }); setAuthServiceForTests(auth);
      resetListingsForTests(); market = new LiveMarket(); setLiveMarketForTests(market); setBrokerForTests(undefined); n = 0;
      await graduate();
      for (let i = 0; i < 25; i++) await tick();
      const { ep: _ep, ...rest } = (await frog()).pools!;
      void _ep;
      return rest;
    };
    expect(await runOnce()).toEqual(await runOnce());
  });
});
