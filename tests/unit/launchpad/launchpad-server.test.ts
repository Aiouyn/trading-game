// Launchpad first playable loop through the real routes and AuthService: A launches a fictional coin (reviewed $1,000 fee),
// B finds it and buys and sells it with real ledger cash; the creator earns half the fee; every operation conserves
// game cash (players + curves' real cash + sink). Server-owned validation, idempotency, ordering; GET writes nothing and
// leaks no account id or other account's holdings; a failed save publishes nothing and moves no cash; restart keeps
// everything; an unreadable Launchpad section is preserved, never reset.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as lpGet } from "@/app/api/launchpad/route";
import { POST as launchRoute } from "@/app/api/launchpad/launch/route";
import { POST as tradeRoute } from "@/app/api/launchpad/trade/route";
import { LP, minAfterSlip, quoteBuy, quoteSell } from "@/launchpad/rules";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import type { LaunchpadView } from "@/server/launchpad";

class Store implements AuthStore {
  saves = 0;
  failNext = false;
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> {
    if (this.failNext) { this.failNext = false; return Promise.reject(new Error("disk full")); }
    this.saves++;
    return this.inner.save(s);
  }
}

let now = 1_700_000_000_000;
let n = 0;
const nextKey = () => `lp-test-key-${++n}`;
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
}
const postTo = (route: (r: Request) => Promise<Response>, url: string) => (cookie: string | null, body: Record<string, unknown>, origin = "http://localhost") =>
  route(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
const launchRaw = postTo(launchRoute, "/api/launchpad/launch");
const tradeRaw = postTo(tradeRoute, "/api/launchpad/trade");
const launch = async (cookie: string, b: Record<string, unknown>, key = nextKey()) => (await launchRaw(cookie, { idempotencyKey: key, fee: LP.LAUNCH_FEE, tagline: "tg5", ...b })).json();
const trade = async (cookie: string, b: Record<string, unknown>, key = nextKey()) => (await tradeRaw(cookie, { idempotencyKey: key, ...b })).json();
async function view(cookie?: string): Promise<LaunchpadView> {
  const res = await lpGet(new Request("http://localhost/api/launchpad", { headers: cookie ? { cookie } : {} }));
  expect(res.status).toBe(200);
  return res.json();
}
/** Game cash in the world: every saved ledger + every curve's real cash + the sink. */
async function worldCash(auth: AuthService): Promise<number> {
  const players = await auth.readStandings((rows) => rows.reduce((s, r) => s + r.cashCents, 0));
  return auth.readLaunchpad(null, (lp) => players + lp.coins.reduce((s, c) => s + c.x - LP.X0, 0) + lp.sinkCents);
}

describe("Launchpad first loop (server)", () => {
  let store: Store;
  let auth: AuthService;
  beforeEach(() => {
    now = 1_700_000_000_000;
    store = new Store(new MemoryAuthStore());
    auth = new AuthService({ store, now: () => now });
    setAuthServiceForTests(auth);
    setLiveMarketForTests(new LiveMarket());
  });
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });

  it("A launches, B discovers, buys and sells with real cash; the creator earns half the fee; cash is conserved", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    const start = await worldCash(auth);
    expect(start).toBe(2_000_000);

    const l = await launch(a, { name: "Frog Club", ticker: "FROG" });
    expect(l).toEqual({ status: "accepted", ticker: "FROG", cashCents: 900_000 });

    const vb = await view(b);
    expect(vb.coins.map((c) => [c.ticker, c.name, c.creator, c.mine, c.x, c.sold])).toEqual([["FROG", "Frog Club", "alice", false, LP.X0, 0]]);
    expect(vb.self).toMatchObject({ cashCents: 1_000_000, spendableCents: 1_000_000, holdings: {} });
    expect(JSON.stringify(vb)).not.toMatch(/acc_[0-9a-f]{32}/); // no account id leaves the server
    expect((await view(a)).coins[0]!.mine).toBe(true);

    const q = quoteBuy({ x: LP.X0, sold: 0 }, 50_000);
    if (!q.ok) throw new Error("quote");
    const buy = await trade(b, { ticker: "FROG", side: "buy", amount: 50_000, min: minAfterSlip(q.tokens) });
    expect(buy).toMatchObject({ status: "accepted", side: "buy", tokens: q.tokens, cents: 50_000, fee: 500, cashCents: 950_000, held: q.tokens });
    const after = await view(b);
    expect(after.self!.holdings).toEqual({ FROG: q.tokens });
    expect(after.coins[0]).toMatchObject({ x: LP.X0 + 49_500, sold: q.tokens, holders: 1 });
    expect(after.coins[0]!.tape).toEqual([expect.objectContaining({ side: "buy", tokens: q.tokens, cents: 50_000, creator: false })]);
    const va = await view(a);
    expect(va.self).toMatchObject({ cashCents: 900_250, holdings: {} }); // creator's half of the $5.00 fee; never B's holdings
    expect(await worldCash(auth)).toBe(start);

    const s = quoteSell(after.coins[0]!, q.tokens);
    if (!s.ok) throw new Error("quote");
    const sell = await trade(b, { ticker: "FROG", side: "sell", amount: q.tokens, min: minAfterSlip(s.pay) });
    expect(sell).toMatchObject({ status: "accepted", side: "sell", tokens: q.tokens, cents: s.pay, held: 0 });
    expect(s.pay).toBeLessThan(50_000); // a round trip costs the fees: no free money
    const end = await view(b);
    expect(end.self).toMatchObject({ cashCents: 950_000 + s.pay, holdings: {} });
    expect(end.coins[0]).toMatchObject({ x: LP.X0, sold: 0, holders: 0 });
    expect((await view(a)).self!.cashCents).toBe(900_250 + s.creatorFee);
    expect(await worldCash(auth)).toBe(start);
  });

  it("replays a key's first reply without acting again; the same key for another request is 409", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, { name: "Frog Club", ticker: "FROG" }, "lp-key-launch-1");
    expect(await launch(a, { name: "Frog Club", ticker: "FROG" }, "lp-key-launch-1")).toEqual({ status: "accepted", ticker: "FROG", cashCents: 900_000 });
    expect((await view(a)).coins).toHaveLength(1);
    const body = { ticker: "FROG", side: "buy", amount: 10_000, min: 1 };
    const first = await trade(b, body, "lp-key-buy-1");
    expect(await trade(b, body, "lp-key-buy-1")).toEqual(first);
    expect((await view(b)).self!.cashCents).toBe(990_000);
    const conflict = await tradeRaw(b, { idempotencyKey: "lp-key-buy-1", ...body, amount: 20_000 });
    expect(conflict.status).toBe(409);
    expect((await view(b)).self!.cashCents).toBe(990_000);
  });

  it("refuses with a reason and changes nothing: fee, format, taken/real names, cooldown, cap of 3, cash, slippage, held", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    const lpBefore = await auth.readLaunchpad(null, (lp) => JSON.stringify(lp));
    const code = async (p: Promise<{ code?: string }>) => (await p).code;
    expect(await code(launch(a, { name: "Frog Club", ticker: "FROG", fee: 1 }))).toBe("FEE_CHANGED");
    expect(await code(launch(a, { name: "Frog Club", ticker: "FR" }))).toBe("TICKER_INVALID");
    expect(await code(launch(a, { name: "<b>", ticker: "FROG" }))).toBe("NAME_INVALID");
    expect(await code(launch(a, { name: "Frog Club", ticker: "HALC" }))).toBe("TICKER_TAKEN"); // a Port Avalon listing
    expect(await code(launch(a, { name: "Halcyon Shipping", ticker: "FROG" }))).toBe("NAME_TAKEN");
    expect(await code(launch(a, { name: "Frog Club", ticker: "DOGE" }))).toBe("TICKER_REFUSED");
    expect(await code(launch(a, { name: "D0ge Coin", ticker: "FROG" }))).toBe("NAME_REFUSED");
    expect(await auth.readLaunchpad(null, (lp) => JSON.stringify(lp))).toBe(lpBefore); // (a POST's session refresh may save; the Launchpad and cash do not change)
    expect((await view(a)).self!.cashCents).toBe(1_000_000);

    await launch(a, { name: "Frog Club", ticker: "FROG" });
    expect(await code(launch(b, { name: "frog club", ticker: "FRGG" }))).toBe("NAME_TAKEN");
    const cool = await launch(a, { name: "Toad Club", ticker: "TOAD" });
    expect(cool).toMatchObject({ code: "COOLDOWN", nextAtMs: now + LP.COOLDOWN_MS });
    expect((await view(a)).self!.nextLaunchAtMs).toBe(now + LP.COOLDOWN_MS);
    for (const [name, ticker] of [["Toad Club", "TOAD"], ["Newt Club", "NEWT"]]) {
      now += LP.COOLDOWN_MS;
      expect((await launch(a, { name, ticker })).status).toBe("accepted");
    }
    now += LP.COOLDOWN_MS;
    expect((await view(a)).self!.nextLaunchAtMs).toBeNull();
    expect(await code(launch(a, { name: "Eel Club", ticker: "EELS" }))).toBe("MAX_LIVE");

    expect(await code(trade(b, { ticker: "FROG", side: "buy", amount: 1_000_001, min: 0 }))).toBe("CASH");
    expect(await code(trade(b, { ticker: "FROG", side: "buy", amount: 10_000, min: 10_000_000 }))).toBe("PRICE_MOVED");
    expect(await code(trade(b, { ticker: "FROG", side: "sell", amount: 1, min: 0 }))).toBe("HELD");
    expect(await code(trade(b, { ticker: "NOPE", side: "buy", amount: 10_000, min: 0 }))).toBe("UNKNOWN_COIN");
    expect(await code(trade(b, { ticker: "FROG", side: "buy", amount: 99, min: 0 }))).toBe("MIN");
    expect((await view(b)).self!.cashCents).toBe(1_000_000);
    expect((await view(b)).coins.find((c) => c.ticker === "FROG")!.sold).toBe(0);
  });

  it("the creator can buy their own coin up to 10% of supply; their trades are flagged on the tape", async () => {
    const a = await signUp("alice");
    await launch(a, { name: "Frog Club", ticker: "FROG" });
    const r = await trade(a, { ticker: "FROG", side: "buy", amount: 20_000, min: 0 });
    expect(r.status).toBe("accepted");
    expect((await view(a)).self!.cashCents).toBe(900_000 - 20_000 + 100); // pays the fee, earns its own half
    expect((await view()).coins[0]!.tape[0]!.creator).toBe(true);
    expect((await trade(a, { ticker: "FROG", side: "buy", amount: 800_000, min: 0 })).code).toBe("CREATOR_CAP");
  });

  it("concurrent buys are ordered by the server: cash never goes negative and nothing is lost", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, { name: "Frog Club", ticker: "FROG" });
    const total = await worldCash(auth);
    const replies = await Promise.all([1, 2, 3].map(() => trade(b, { ticker: "FROG", side: "buy", amount: 400_000, min: 0 })));
    expect(replies.map((r) => r.status ?? r.code).sort()).toEqual(["accepted", "accepted", "refused"]);
    const v = await view(b);
    expect(v.self!.cashCents).toBe(200_000);
    expect(v.coins[0]!.sold).toBe(v.self!.holdings.FROG);
    expect(await worldCash(auth)).toBe(total);
  });

  it("spendable cash leaves out cash held by working Broker buy limits", async () => {
    const b = await signUp("bob");
    const a = await signUp("alice");
    await launch(a, { name: "Frog Club", ticker: "FROG" });
    const { POST: place } = await import("@/app/api/broker/orders/route");
    const res = await place(new Request("http://localhost/api/broker/orders", {
      method: "POST", headers: { "content-type": "application/json", cookie: b, origin: "http://localhost" },
      body: JSON.stringify({ idempotencyKey: "lp-broker-limit-1", draft: { assetId: "HALC", side: "BUY", type: "limit", qty: "100", limit: (Number(new LiveMarket().snapshot().quotes.rows.HALC!.last) - 1).toFixed(2), tif: "day" } }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).ledger.reservedCashCents).toBeGreaterThan(0);
    const v = await view(b);
    expect(v.self!.spendableCents).toBeLessThan(v.self!.cashCents);
    expect((await trade(b, { ticker: "FROG", side: "buy", amount: v.self!.spendableCents + 1, min: 0 })).code).toBe("CASH");
  });

  it("GET is read-only and public-safe; guests see coins but no self; writes need a session and same origin", async () => {
    const a = await signUp("alice");
    await launch(a, { name: "Frog Club", ticker: "FROG" });
    const saves = store.saves;
    const guest = await view();
    expect(guest.self).toBeNull();
    expect(guest.coins).toHaveLength(1);
    await view(a);
    expect(store.saves).toBe(saves);
    expect((await tradeRaw(null, { idempotencyKey: nextKey(), ticker: "FROG", side: "buy", amount: 10_000, min: 0 })).status).toBe(401);
    expect((await tradeRaw(a, { idempotencyKey: nextKey(), ticker: "FROG", side: "buy", amount: 10_000, min: 0 }, "http://evil.test")).status).toBe(403);
    expect((await tradeRaw(a, { idempotencyKey: nextKey(), ticker: "FROG", side: "buy", amount: 10_000, min: 0, accountId: "x" })).status).toBe(400);
  });

  it("a failed save publishes no coin and moves no cash; a failed trade save leaves the curve and both ledgers as they were", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    store.failNext = true;
    expect((await launchRaw(a, { idempotencyKey: nextKey(), name: "Frog Club", ticker: "FROG", fee: LP.LAUNCH_FEE, tagline: "tg1" })).status).toBe(500);
    expect((await view(a)).coins).toEqual([]);
    expect((await view(a)).self!.cashCents).toBe(1_000_000);
    expect((await view(a)).self!.nextLaunchAtMs).toBeNull();
    await launch(a, { name: "Frog Club", ticker: "FROG" });
    store.failNext = true;
    expect((await tradeRaw(b, { idempotencyKey: "lp-key-fail-1", ticker: "FROG", side: "buy", amount: 10_000, min: 0 })).status).toBe(500);
    expect((await view(b)).self).toMatchObject({ cashCents: 1_000_000, holdings: {} });
    expect((await view(a)).self!.cashCents).toBe(900_000);
    expect((await view()).coins[0]).toMatchObject({ x: LP.X0, sold: 0, tape: [] });
    // The same key after the failure acts once (nothing of the failed attempt was kept).
    expect((await trade(b, { ticker: "FROG", side: "buy", amount: 10_000, min: 0 }, "lp-key-fail-1")).status).toBe("accepted");
  });
});

describe("Launchpad persistence", () => {
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });

  it("restart on the same file keeps coins, holdings, tape and cash", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "lp-")), "auth.json");
    setLiveMarketForTests(new LiveMarket());
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, { name: "Frog Club", ticker: "FROG" });
    await trade(b, { ticker: "FROG", side: "buy", amount: 30_000, min: 0 });
    const before = [await view(a), await view(b)];
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    expect([await view(a), await view(b)]).toEqual(before);
    expect(before[1]!.self!.holdings.FROG).toBeGreaterThan(0);
  });

  it("an unreadable Launchpad section is kept verbatim and reads as unavailable (503); accounts keep working", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "lp-")), "auth.json");
    setLiveMarketForTests(new LiveMarket());
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice");
    await launch(a, { name: "Frog Club", ticker: "FROG" });
    const raw = JSON.parse(readFileSync(file, "utf8"));
    raw.launchpad.coins[0].sold = 5; // tokens sold no longer match tokens held
    writeFileSync(file, JSON.stringify(raw));
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const res = await lpGet(new Request("http://localhost/api/launchpad", { headers: { cookie: a } }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("LAUNCHPAD_UNAVAILABLE");
    expect((await launchRaw(a, { idempotencyKey: nextKey(), name: "Toad Club", ticker: "TOAD", fee: LP.LAUNCH_FEE, tagline: "tg1" })).status).toBe(503);
    await signUp("carol"); // another write persists the store
    expect(JSON.parse(readFileSync(file, "utf8")).launchpad).toEqual(raw.launchpad);
  });
});
