// Launchpad coin price/volume history (docs/v1/LAUNCHPAD.md "Coin price / volume history"). One saved point per executed
// trade, in the trade's own persist: the curve after it and the tape's volume. Replay, refusal and a failed save add no
// point; the public read is read-only and holds no account data; legacy coins are labelled, never back-filled; bounded.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as lpGet } from "@/app/api/launchpad/route";
import { GET as histGet } from "@/app/api/launchpad/history/route";
import { POST as launchRoute } from "@/app/api/launchpad/launch/route";
import { POST as tradeRoute } from "@/app/api/launchpad/trade/route";
import { LP, quoteBuy } from "@/launchpad/rules";
import { W, modelOf, parseHistory, priceStr, spot, stepAt, stepPath, xOf } from "@/apps/launchpad/history";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { parseLaunchpad, recordPoint, type LpCoin } from "@/server/launchpad/state";
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
const key = () => `lp-hist-key-${++n}`;
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
}
const post = (route: (r: Request) => Promise<Response>, url: string, cookie: string, body: Record<string, unknown>) =>
  route(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", cookie }, body: JSON.stringify(body) }));
const launch = async (c: string, ticker = "FROG") => (await post(launchRoute, "/api/launchpad/launch", c, { idempotencyKey: key(), fee: LP.LAUNCH_FEE, tagline: "tg5", name: `${ticker} Club`, ticker })).json();
const trade = async (c: string, side: "buy" | "sell", amount: number, k = key(), ticker = "FROG") =>
  (await post(tradeRoute, "/api/launchpad/trade", c, { idempotencyKey: k, ticker, side, amount, min: 0 })).json();
const hist = async (ticker = "FROG", cookie?: string) => histGet(new Request(`http://localhost/api/launchpad/history?ticker=${ticker}`, { headers: cookie ? { cookie } : {} }));
const histJson = async (ticker = "FROG") => (await hist(ticker)).json();

describe("Launchpad price/volume history", () => {
  let store: Store;
  let auth: AuthService;
  beforeEach(() => {
    store = new Store(new MemoryAuthStore());
    auth = new AuthService({ store });
    setAuthServiceForTests(auth);
    setLiveMarketForTests(new LiveMarket());
  });
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });

  it("a launch starts an empty, complete history; the chart model starts at the launch price only", async () => {
    const a = await signUp("alice");
    await launch(a);
    const h = await histJson();
    expect(h).toMatchObject({ ticker: "FROG", startX: LP.X0, dropped: 0, pts: [] });
    expect(h.since).toBe(h.createdAtMs);
    const m = modelOf(parseHistory(h, "FROG")!);
    expect(m.fromLaunch).toBe(true);
    expect(m.gap).toBeNull();
    expect(m.steps).toEqual([{ n: 0, kind: "launch", atMs: h.createdAtMs, price: spot(LP.X0, 0), cents: 0, tokens: 0 }]);
    expect(priceStr(m.steps[0]!.price)).toBe("$0.00001398"); // the review's starting price
  });

  it("each executed trade adds exactly one point: the curve after it and the tape's volume, matching the trade reply and the board", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    const q = quoteBuy({ x: LP.X0, sold: 0 }, 50_000);
    const buy = await trade(b, "buy", 50_000);
    expect(buy).toMatchObject({ status: "accepted", tokens: q.ok ? q.tokens : -1, cents: 50_000 });
    const sell = await trade(b, "sell", Math.floor(buy.tokens / 2));
    expect(sell.status).toBe("accepted");
    const h = await histJson();
    const board = (await (await lpGet(new Request("http://localhost/api/launchpad"))).json()).coins[0];
    expect(h.pts).toHaveLength(2);
    expect(h.pts.map((p: { side: string; tokens: number; cents: number }) => [p.side, p.tokens, p.cents])).toEqual([["buy", buy.tokens, 50_000], ["sell", sell.tokens, sell.cents]]);
    expect(h.pts[0]).toMatchObject(q.ok ? q.next : {});
    expect(h.pts[1]).toMatchObject({ x: board.x, sold: board.sold }); // the newest point is the curve as saved
    // Same trades, same order, same volumes as the public tape (which is newest first).
    expect([...board.tape].reverse().map((p: { side: string; tokens: number; cents: number; atMs: number }) => [p.side, p.tokens, p.cents, p.atMs]))
      .toEqual(h.pts.map((p: { side: string; tokens: number; cents: number; atMs: number }) => [p.side, p.tokens, p.cents, p.atMs]));
    const m = modelOf(parseHistory(h, "FROG")!);
    expect(m.steps.map((s) => s.kind)).toEqual(["launch", "buy", "sell"]);
    expect(m.steps[1]!.price).toBeGreaterThan(m.steps[0]!.price);
    expect(m.steps[2]!.price).toBeLessThan(m.steps[1]!.price);
    expect(m.volMax).toBe(50_000);
  });

  it("a replay, a refusal and a failed save add no point; the retry after the failure adds one", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    const k = key();
    await trade(b, "buy", 10_000, k);
    await trade(b, "buy", 10_000, k); // replay
    expect((await trade(b, "sell", 10 ** 9)).code).toBe("HELD"); // refusal
    expect((await trade(b, "buy", 50)).code).toBe("MIN");
    expect((await histJson()).pts).toHaveLength(1);
    store.failNext = true;
    const k2 = key();
    const failed = await post(tradeRoute, "/api/launchpad/trade", b, { idempotencyKey: k2, ticker: "FROG", side: "buy", amount: 20_000, min: 0 });
    expect(failed.status).toBeGreaterThanOrEqual(500);
    const after = await histJson();
    expect(after.pts).toHaveLength(1); // nothing published for the unsaved trade
    expect(after.pts[0].cents).toBe(10_000);
    expect((await trade(b, "buy", 20_000, k2)).status).toBe("accepted");
    expect((await histJson()).pts.map((p: { cents: number }) => p.cents)).toEqual([10_000, 20_000]);
  });

  it("the read is public and read-only, holds no account data, and refuses bad or unknown tickers", async () => {
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    await trade(a, "buy", 10_000);
    await trade(b, "buy", 10_000);
    const saves = store.saves;
    const res = await hist("FROG", b);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(store.saves).toBe(saves); // no session refresh, no write
    const ids = await auth.readLaunchpad(null, (lp) => [lp.coins[0]!.creatorId, ...Object.keys(lp.holdings), ...Object.values(lp.receipts).flat().map((r) => r.key)]);
    for (const s of [...ids, "alice", "bob", "acc_", "creator", "holdings", "receipt", "idempotency"]) expect(text).not.toContain(s);
    expect(Object.keys(JSON.parse(text).pts[0]).sort()).toEqual(["atMs", "cents", "side", "sold", "tick", "tokens", "x"]);
    expect((await hist("frog")).status).toBe(400);
    expect((await hist("NOPE")).status).toBe(404);
    expect((await hist("FROGGY")).status).toBe(400);
  });

  it("history survives a restart exactly; a history that drifts from its curve is refused at load (section kept, unavailable)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lp-hist-"));
    const file = path.join(dir, "auth.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a);
    await trade(b, "buy", 30_000);
    const before = await histJson();
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    expect(await histJson()).toEqual(before);
    const raw = JSON.parse(readFileSync(file, "utf8"));
    raw.launchpad.coins[0].hist.pts[0].x += 1;
    writeFileSync(file, JSON.stringify(raw));
    expect(parseLaunchpad(raw.launchpad).ok).toBe(false);
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    expect((await hist()).status).toBe(503);
    expect(JSON.parse(readFileSync(file, "utf8")).launchpad).toEqual(raw.launchpad); // kept verbatim
  });

  it("a legacy coin (saved before history) loads, is labelled, and starts recording at its next trade; never back-filled", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lp-hist-"));
    const file = path.join(dir, "auth.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice"), b = await signUp("bob");
    await launch(a, "FROG");
    await trade(b, "buy", 30_000, key(), "FROG"); // traded before history existed
    await launch(b, "TOAD"); // never traded
    const raw = JSON.parse(readFileSync(file, "utf8"));
    for (const c of raw.launchpad.coins) delete c.hist;
    writeFileSync(file, JSON.stringify(raw));
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const legacy = await histJson("FROG");
    expect(legacy).toMatchObject({ since: null, pts: [] });
    expect(modelOf(parseHistory(legacy, "FROG")!)).toMatchObject({ gap: { kind: "legacy" }, steps: [] });
    await trade(b, "buy", 10_000, key(), "FROG");
    const h = await histJson("FROG");
    expect(h.pts).toHaveLength(1);
    expect(h.since).toBe(h.pts[0].atMs);
    expect(h.since).toBeGreaterThanOrEqual(h.createdAtMs);
    const m = modelOf(parseHistory(h, "FROG")!);
    expect(m.fromLaunch).toBe(false);
    expect(m.steps.map((s) => s.kind)).toEqual(["buy"]); // no invented launch point or earlier trade
    // TOAD never traded: its history is complete from its launch once it trades.
    await trade(a, "buy", 10_000, key(), "TOAD");
    const t = await histJson("TOAD");
    expect(t.since).toBe(t.createdAtMs);
    expect(modelOf(parseHistory(t, "TOAD")!).steps.map((s) => s.kind)).toEqual(["launch", "buy"]);
  });

  it("bounded: at most HIST_KEEP points, older ones dropped and counted", () => {
    const c: LpCoin = { ticker: "FROG", name: "Frog", tagline: "tg1", creatorId: `acc_${"0".repeat(32)}`, createdAtMs: 1, createdTick: 1, x: LP.X0, sold: 0, tape: [], hist: { since: 1, dropped: 0, pts: [] } };
    for (let i = 0; i < LP.HIST_KEEP + 7; i++) recordPoint(c, { tick: i, atMs: 10 + i, side: "buy", tokens: 1, cents: 100, x: LP.X0 + i, sold: i + 1 });
    expect(c.hist!.pts).toHaveLength(LP.HIST_KEEP);
    expect(c.hist!.dropped).toBe(7);
    expect(c.hist!.pts[0]!.tick).toBe(7);
    const m = modelOf({ ticker: "FROG", createdAtMs: 1, startX: LP.X0, since: 1, dropped: 7, pts: c.hist!.pts });
    expect(m.fromLaunch).toBe(false);
    expect(m.steps).toHaveLength(LP.HIST_KEEP);
  });

  it("the price line is steps only (H/V, no diagonal), each price held to the next trade and the newest to the right edge", () => {
    const pts = [1, 2, 3].map((i) => ({ tick: i, atMs: 1 + i, side: "buy" as const, tokens: 5, cents: 100 * i, x: LP.X0 + 1000 * i, sold: 5 * i }));
    const m = modelOf({ ticker: "FROG", createdAtMs: 1, startX: LP.X0, since: 1, dropped: 0, pts });
    const d = stepPath(m);
    expect(d).toMatch(/^M8 [\d.]+(H[\d.]+V[\d.]+){3}H592$/);
    expect(d.endsWith(`H${W - 8}`)).toBe(true);
    expect(stepAt(xOf(2, 4), 4)).toBe(2);
    expect(modelOf({ ticker: "FROG", createdAtMs: 1, startX: LP.X0, since: 1, dropped: 0, pts: [] }).steps).toHaveLength(1);
  });

  it("the client drops a reply for another coin and malformed replies", () => {
    const ok = { ticker: "FROG", createdAtMs: 1, startX: LP.X0, since: 1, dropped: 0, pts: [{ tick: 1, atMs: 2, side: "buy", tokens: 5, cents: 100, x: LP.X0 + 99, sold: 5 }] };
    expect(parseHistory(ok, "FROG")).not.toBeNull();
    expect(parseHistory(ok, "TOAD")).toBeNull();
    expect(parseHistory({ ...ok, pts: [{ ...ok.pts[0], side: "hold" }] }, "FROG")).toBeNull();
    expect(parseHistory({ ...ok, pts: [{ ...ok.pts[0], cents: -1 }] }, "FROG")).toBeNull();
    expect(parseHistory({ ...ok, since: null }, "FROG")).toBeNull(); // points without a start are not drawn
  });
});
