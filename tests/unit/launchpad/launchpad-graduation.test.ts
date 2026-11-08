// Launchpad graduation (lead-launchpad L4, docs/v1/LAUNCHPAD.md "Graduation"). Hand-worked fixtures:
//   k = 1,500,000 × 1,073,000,000 = 1,609,500,000,000,000. The curve holds 273M tokens once its cash is ceil(k/273M) =
//   5,895,605¢, so a curve that has sold nothing needs 4,395,605¢ net; the least outlay is 4,440,006¢ (fee 44,401¢,
//   creator 22,200¢). Raise R = 4,395,605¢; graduation fee round(1.5% R) = 65,934¢; book = 4,329,671¢ + 200,000,000 tokens.
//   Book k = 865,934,200,000,000. Selling all 800M to it: ceil(k/1e9) = 865,935¢ left, gross 3,463,736¢, Broker fee
//   (3 bp, ≥ 10¢) 1,039¢, pay 3,462,697¢ (the holder's liquidation value). A $100 book buy: fee 10¢, net 9,990¢, tokens
//   200,000,000 − ceil(k/4,339,661) = 460,404; then selling 1,000,000 tokens: gross 21,639¢, fee 10¢, pay 21,629¢.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { GET as boardGet } from "@/app/api/leaderboard/route";
import { GET as lpGet } from "@/app/api/launchpad/route";
import { GET as histGet } from "@/app/api/launchpad/history/route";
import { POST as launchRoute } from "@/app/api/launchpad/launch/route";
import { POST as tradeRoute } from "@/app/api/launchpad/trade/route";
import { modelOf, parseHistory } from "@/apps/launchpad/history";
import { LP, liquidationCents, minAfterSlip, quote } from "@/launchpad/rules";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { marketCashCents } from "@/server/launchpad/state";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";

class Store implements AuthStore {
  failNext = false;
  saves = 0;
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> {
    if (this.failNext) { this.failNext = false; return Promise.reject(new Error("disk full")); }
    this.saves++;
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
type Body = { side: "buy" | "sell"; amount: number; min?: number; mode?: "curve" | "pool"; k?: string; ticker?: string };
const tradeRes = (c: string, b: Body) => post(tradeRoute, "/api/launchpad/trade", c, { idempotencyKey: b.k ?? key(), ticker: b.ticker ?? "FROG", side: b.side, amount: b.amount, min: b.min ?? 0, ...(b.mode ? { mode: b.mode } : {}) });
const trade = async (c: string, b: Body) => (await tradeRes(c, b)).json();
const get = async (route: (r: Request) => Promise<Response>, url: string, c?: string) => (await route(new Request(`http://localhost${url}`, { headers: c ? { cookie: c } : {} }))).json();
const coinView = async (ticker = "FROG") => (await get(lpGet, "/api/launchpad")).coins.find((c: { ticker: string }) => c.ticker === ticker);

describe("Launchpad graduation", () => {
  let store: Store;
  let auth: AuthService;
  beforeEach(() => {
    store = new Store(new MemoryAuthStore());
    auth = new AuthService({ store });
    setAuthServiceForTests(auth);
    setLiveMarketForTests(new LiveMarket());
  });
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });
  const setCash = (cents: number) => auth.sweepPrivateStates((cur) => ({ ...cur, cashCents: cents }));
  /** Σ player cash + Σ live curves' real cash + Σ books' cash + sink. */
  const world = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + r.cashCents, 0)))
    + (await auth.readLaunchpad(null, (lp) => lp.coins.reduce((s, c) => s + marketCashCents(c), 0) + lp.sinkCents));
  const lp = () => auth.readLaunchpad(null, (s) => s);
  const cash = async (c: string) => (await get(brokerMe, "/api/broker/me", c)).cashCents as number;

  it("before → threshold → after (hand-worked): the crossing buy is clipped, graduates once, conserves cash and tokens", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    expect((await launch(a)).status).toBe("accepted");
    await setCash(10_000_000);
    const total = await world();
    const before = await coinView();
    expect(before).toMatchObject({ pool: null, grad: null, sold: 0 });
    // The client's review of a $100,000 buy says what the server will do: the last 800M tokens for $44,400.06.
    const rq = quote(before, "buy", 10_000_000);
    expect(rq).toMatchObject({ ok: true, mode: "curve", tokens: 800_000_000, cents: 4_440_006, fee: 44_401, creatorFee: 22_200, graduates: true });
    const r = await trade(b, { side: "buy", amount: 10_000_000, min: minAfterSlip(800_000_000), mode: "curve" });
    expect(r).toEqual({ status: "accepted", ticker: "FROG", side: "buy", mode: "curve", tokens: 800_000_000, cents: 4_440_006, fee: 44_401, cashCents: 5_559_994, held: 800_000_000, graduated: true });
    expect(await cash(b)).toBe(5_559_994);
    expect(await cash(a)).toBe(10_022_200);
    const after = await coinView();
    expect(after).toMatchObject({ x: 5_895_605, sold: 800_000_000, pool: { cash: 4_329_671, tokens: 200_000_000 }, grad: { raise: 4_395_605, fee: 65_934 } });
    const s = await lp();
    expect(s.sinkCents).toBe(100_000 + (44_401 - 22_200) + 65_934);
    expect(s.holdings[Object.keys(s.holdings)[0]!]!.FROG! + s.coins[0]!.pool!.tokens).toBe(LP.SUPPLY);
    expect(await world()).toBe(total);
    // Wealth reads the book now: B's coins are worth what selling all 800M to the book would pay.
    const me = await get(brokerMe, "/api/broker/me", b);
    expect(me.coins).toEqual([{ ticker: "FROG", qty: 800_000_000, value: 3_462_697, cost: 4_440_006 }]);
    expect(liquidationCents(after, 800_000_000)).toBe(3_462_697);
    expect((await get(boardGet, "/api/leaderboard", b)).self.nw).toBe(((5_559_994 + 3_462_697) / 100).toFixed(2));
    // History: the crossing trade on the curve, then the graduation step at the book's seed price.
    const h = await get(histGet, "/api/launchpad/history?ticker=FROG");
    expect(h.grad).toMatchObject({ at: 1, cash: 4_329_671, tokens: 200_000_000 });
    expect(h.pts).toHaveLength(1);
    expect(h.pts[0]).not.toHaveProperty("pc");
    expect(modelOf(parseHistory(h, "FROG")!).steps.map((x) => `${x.kind}:${x.market}`)).toEqual(["launch:curve", "buy:curve", "graduation:pool"]);
  });

  it("after graduation: trades use the book (Broker fee to the sink, no creator share); a curve review is refused MODE_CHANGED", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    await trade(b, { side: "buy", amount: 10_000_000, mode: "curve" });
    const total = await world();
    const aCash = await cash(a), sink0 = (await lp()).sinkCents;
    expect(await trade(c, { side: "buy", amount: 10_000, mode: "curve" })).toMatchObject({ status: "refused", code: "MODE_CHANGED" });
    expect(await trade(c, { side: "buy", amount: 10_000 })).toMatchObject({ status: "refused", code: "MODE_CHANGED" }); // an old client (no mode)
    expect(await cash(c)).toBe(10_000_000);
    const buy = await trade(c, { side: "buy", amount: 10_000, min: minAfterSlip(460_404), mode: "pool" });
    expect(buy).toMatchObject({ status: "accepted", mode: "pool", tokens: 460_404, cents: 10_000, fee: 10, graduated: false });
    expect((await coinView()).pool).toEqual({ cash: 4_339_661, tokens: 199_539_596 });
    const sell = await trade(b, { side: "sell", amount: 1_000_000, min: minAfterSlip(21_629), mode: "pool" });
    expect(sell).toMatchObject({ status: "accepted", mode: "pool", tokens: 1_000_000, cents: 21_629, fee: 10 });
    expect((await coinView()).pool).toEqual({ cash: 4_318_022, tokens: 200_539_596 });
    expect(await cash(a)).toBe(aCash); // the creator's share ended at graduation
    expect((await lp()).sinkCents).toBe(sink0 + 20);
    expect(await world()).toBe(total);
    const s = await lp();
    const held = Object.values(s.holdings).reduce((t, h) => t + (h.FROG ?? 0), 0);
    expect(held + s.coins[0]!.pool!.tokens).toBe(LP.SUPPLY);
    // History: book points carry the book after each trade; prices come from the book.
    const h = await get(histGet, "/api/launchpad/history?ticker=FROG");
    expect(h.pts.slice(1)).toEqual([
      expect.objectContaining({ side: "buy", tokens: 460_404, cents: 10_000, pc: 4_339_661, pt: 199_539_596 }),
      expect.objectContaining({ side: "sell", tokens: 1_000_000, cents: 21_629, pc: 4_318_022, pt: 200_539_596 }),
    ]);
    const m = modelOf(parseHistory(h, "FROG")!);
    expect(m.steps.map((x) => x.kind)).toEqual(["launch", "buy", "graduation", "buy", "sell"]);
    expect(m.steps[4]!.price).toBeCloseTo(4_318_022 / (100 * 200_539_596), 15);
  });

  it("a partial crossing: the second buyer gets exactly the tokens left and pays only for them", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    const first = await trade(b, { side: "buy", amount: 2_000_000, mode: "curve" });
    expect(first.graduated).toBe(false);
    const left = 800_000_000 - first.tokens;
    const v = await coinView();
    // Before: B's coins are valued against the curve (the same function the board and Portfolio use).
    expect((await get(brokerMe, "/api/broker/me", b)).coins[0].value).toBe(liquidationCents(v, first.tokens));
    const q = quote(v, "buy", 5_000_000);
    expect(q).toMatchObject({ ok: true, tokens: left, graduates: true });
    const r = await trade(c, { side: "buy", amount: 5_000_000, min: minAfterSlip(left), mode: "curve" });
    expect(r).toMatchObject({ status: "accepted", tokens: left, graduated: true, cents: q.ok ? q.cents : -1 });
    expect(r.cents).toBeLessThan(5_000_000);
    expect(await cash(c)).toBe(10_000_000 - r.cents);
    const g = await coinView();
    expect(g.sold).toBe(800_000_000);
    // After: the same holding is valued against the book, and the board's NW is cash + that value.
    const bv = liquidationCents(g, first.tokens);
    expect(bv).toBeGreaterThan(0);
    expect((await get(brokerMe, "/api/broker/me", b)).coins[0].value).toBe(bv);
    expect((await get(boardGet, "/api/leaderboard", b)).self.nw).toBe(((10_000_000 - first.cents + bv) / 100).toFixed(2));
  });

  it("exactly once: replay returns the first reply and graduates nothing again; concurrent crossing buys graduate once", async () => {
    const a = await signUp("alice"), b = await signUp("bob"), c = await signUp("carol");
    await launch(a);
    await setCash(10_000_000);
    const total = await world();
    const k = key();
    const [rb, rc] = await Promise.all([
      trade(b, { side: "buy", amount: 9_000_000, mode: "curve", k }),
      trade(c, { side: "buy", amount: 9_000_000, mode: "curve" }),
    ]);
    const winners = [rb, rc].filter((x) => x.status === "accepted");
    expect(winners).toHaveLength(1);
    expect(winners[0]!.graduated).toBe(true);
    expect([rb, rc].filter((x) => x.code === "MODE_CHANGED")).toHaveLength(1);
    const s1 = await lp();
    const cashBefore = [await cash(b), await cash(c)];
    if (rb.status === "accepted") expect(await trade(b, { side: "buy", amount: 9_000_000, mode: "curve", k })).toEqual(rb);
    else expect(await trade(b, { side: "buy", amount: 9_000_000, mode: "curve", k })).toEqual(rb); // the refusal is not a receipt: still refused
    const s2 = await lp();
    expect(s2).toEqual(s1); // nothing saved again: same coin, book, sink, tape, history, receipts
    expect([await cash(b), await cash(c)]).toEqual(cashBefore);
    expect(s2.sinkCents).toBe(s1.sinkCents);
    expect(s2.coins[0]!.grad).toEqual(s1.coins[0]!.grad);
    expect(s2.coins[0]!.hist!.pts).toHaveLength(1);
    expect(await world()).toBe(total);
  });

  it("a failed save on the crossing buy leaves the coin live and nothing charged; the retry graduates once", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    await setCash(10_000_000);
    const total = await world();
    const k = key();
    store.failNext = true;
    const res = await tradeRes(b, { side: "buy", amount: 9_000_000, mode: "curve", k });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await coinView()).toMatchObject({ pool: null, grad: null, sold: 0 });
    expect(await cash(b)).toBe(10_000_000);
    expect((await lp()).sinkCents).toBe(100_000);
    expect(await world()).toBe(total);
    const r = await trade(b, { side: "buy", amount: 9_000_000, mode: "curve", k });
    expect(r).toMatchObject({ status: "accepted", graduated: true, cents: 4_440_006 });
    expect((await lp()).sinkCents).toBe(100_000 + 22_201 + 65_934);
    expect(await world()).toBe(total);
  });

  it("restart keeps the graduated coin exactly; a tampered graduation record or token count is refused at load (kept, unavailable)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lp-grad-"));
    const file = path.join(dir, "auth.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    const fresh = new AuthService({ store: new FileAuthStore(file) });
    await fresh.sweepPrivateStates((cur) => ({ ...cur, cashCents: 10_000_000 }));
    setAuthServiceForTests(fresh);
    await trade(b, { side: "buy", amount: 9_000_000, mode: "curve" });
    await trade(b, { side: "sell", amount: 1_000_000, mode: "pool" });
    const view = await get(lpGet, "/api/launchpad", b), hist = await get(histGet, "/api/launchpad/history?ticker=FROG");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    expect(await get(lpGet, "/api/launchpad", b)).toEqual(view);
    expect(await get(histGet, "/api/launchpad/history?ticker=FROG")).toEqual(hist);
    for (const tamper of [
      (c: { grad: { fee: number } }) => { c.grad.fee += 1; },
      (c: { pool: { tokens: number } }) => { c.pool.tokens += 1; },
      (c: { pool?: unknown }) => { delete c.pool; },
    ]) {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const good = structuredClone(raw);
      tamper(raw.launchpad.coins[0]);
      writeFileSync(file, JSON.stringify(raw));
      setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
      expect((await (await lpGet(new Request("http://localhost/api/launchpad"))).status)).toBe(503);
      writeFileSync(file, JSON.stringify(good));
    }
  });

  it("public reads carry the curve, book, raise and fee only; MAX_LIVE counts live coins, not graduated ones", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    await setCash(10_000_000);
    expect((await get(lpGet, "/api/launchpad", a)).self.live).toBe(1);
    await trade(b, { side: "buy", amount: 9_000_000, mode: "curve" });
    const view = await get(lpGet, "/api/launchpad", a);
    expect(view.self.live).toBe(0);
    const coin = view.coins[0];
    expect(Object.keys(coin.pool).sort()).toEqual(["cash", "tokens"]);
    expect(Object.keys(coin.grad).sort()).toEqual(["atMs", "fee", "raise"]);
    const h = await get(histGet, "/api/launchpad/history?ticker=FROG");
    expect(Object.keys(h.grad).sort()).toEqual(["at", "atMs", "cash", "tokens"]);
    const ids = await auth.readLaunchpad(null, (s) => [s.coins[0]!.creatorId, ...Object.keys(s.holdings)]);
    const text = JSON.stringify([await get(lpGet, "/api/launchpad"), h]);
    // The creator's handle is public (L1: a public role); holders, ids and holdings are not.
    for (const s of [...ids, "bob", "acc_", "holdings", "receipt"]) expect(text).not.toContain(s);
  });
});
