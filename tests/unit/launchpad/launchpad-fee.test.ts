// Owner decision 2026-11-08: new accounts launch immediately (no rank / account-age gate) for a $1,000 game-money fee.
// The fee is one authoritative constant: debited exactly once in one persist, from spendable cash only (cash held by
// working Broker buy limits is never spent and cash never goes negative), into the sink (conservation). A replay does not
// charge again; a stale client fee is refused; a failed save changes nothing. Coins and receipts saved under the old
// $100 fee load as saved: nothing is re-charged or reinterpreted.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import { GET as boardGet } from "@/app/api/leaderboard/route";
import { GET as lpGet } from "@/app/api/launchpad/route";
import { POST as launchRoute } from "@/app/api/launchpad/launch/route";
import { POST as tradeRoute } from "@/app/api/launchpad/trade/route";
import { LPS } from "@/apps/launchpad/strings";
import { LP } from "@/launchpad/rules";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";

/** Counts saves that change the Launchpad section or any cash (session refreshes may save too). */
class Store implements AuthStore {
  failNext = false;
  moneySaves = 0;
  private last = "";
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> {
    if (this.failNext) { this.failNext = false; return Promise.reject(new Error("disk full")); }
    const money = JSON.stringify([s.launchpad ?? null, s.players.map((p) => [p.accountId, p.cashCents])]);
    if (money !== this.last) { if (this.last) this.moneySaves++; this.last = money; }
    return this.inner.save(s);
  }
}

let n = 0;
const key = () => `lp-fee-key-${++n}`;
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
}
const post = (route: (r: Request) => Promise<Response>, url: string, cookie: string, body: Record<string, unknown>) =>
  route(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", cookie }, body: JSON.stringify(body) }));
const launchBody = (k: string, ticker = "FROG", fee: number = LP.LAUNCH_FEE) => ({ idempotencyKey: k, fee, tagline: "tg5", name: `${ticker} Club`, ticker });
const launch = async (c: string, k = key(), ticker = "FROG", fee: number = LP.LAUNCH_FEE) => (await post(launchRoute, "/api/launchpad/launch", c, launchBody(k, ticker, fee))).json();
const get = async (route: (r: Request) => Promise<Response>, url: string, c: string) => (await route(new Request(`http://localhost${url}`, { headers: { cookie: c, origin: "http://localhost" } }))).json();
const me = (c: string) => get(brokerMe, "/api/broker/me", c);
const lpView = (c: string) => get(lpGet, "/api/launchpad", c);
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

describe("Launchpad $1,000 launch fee (owner decision)", () => {
  let store: Store;
  let auth: AuthService;
  beforeEach(() => {
    store = new Store(new MemoryAuthStore());
    auth = new AuthService({ store });
    setAuthServiceForTests(auth);
    setLiveMarketForTests(new LiveMarket());
  });
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });
  const sink = () => auth.readLaunchpad(null, (lp) => lp.sinkCents);
  const setCash = (cents: number) => auth.sweepPrivateStates((cur) => ({ ...cur, cashCents: cents }));

  it("one constant: $1,000.00 (100,000 cents); copy and server refusals name the same amount", async () => {
    expect(LP.LAUNCH_FEE).toBe(100_000);
    expect(LPS.limits).toContain(usd(LP.LAUNCH_FEE));
    expect(LPS.launchCash("$5.00")).toContain(usd(LP.LAUNCH_FEE));
    const a = await signUp("alice");
    expect((await launch(a, key(), "FROG", 10_000)).message).toContain(usd(LP.LAUNCH_FEE));
  });

  it("a new account launches immediately: exactly 100,000¢ debited in one money save, into the sink; header/board/Portfolio read $9,000", async () => {
    const a = await signUp("alice");
    const before = store.moneySaves;
    const k = key();
    expect(await launch(a, k)).toEqual({ status: "accepted", ticker: "FROG", cashCents: 900_000 });
    expect(store.moneySaves - before).toBe(1);
    expect(await sink()).toBe(100_000);
    const m = await me(a);
    expect(m.cashCents).toBe(900_000);
    expect(m.coins).toEqual([]); // the creator holds none at launch; nothing else counts toward wealth
    expect((await get(boardGet, "/api/leaderboard", a)).self.nw).toBe("9000.00");
    // Replay: the stored reply, no second debit, no second save.
    const saves = store.moneySaves;
    expect(await launch(a, k)).toEqual({ status: "accepted", ticker: "FROG", cashCents: 900_000 });
    expect(store.moneySaves).toBe(saves);
    expect((await me(a)).cashCents).toBe(900_000);
    expect(await sink()).toBe(100_000);
    expect((await lpView(a)).coins).toHaveLength(1);
  });

  it("a stale client fee ($100) is refused and charges nothing", async () => {
    const a = await signUp("alice");
    const r = await launch(a, key(), "FROG", 10_000);
    expect(r.code).toBe("FEE_CHANGED");
    expect((await me(a)).cashCents).toBe(1_000_000);
    expect(await sink()).toBe(0);
  });

  it("exactly $1,000.00 spendable launches to $0.00; $999.99 is refused unchanged", async () => {
    const a = await signUp("alice");
    await setCash(99_999);
    expect((await launch(a)).code).toBe("CASH");
    expect((await me(a)).cashCents).toBe(99_999);
    expect(await sink()).toBe(0);
    expect((await lpView(a)).coins).toEqual([]);
    await setCash(100_000);
    expect(await launch(a)).toMatchObject({ status: "accepted", cashCents: 0 });
    expect((await me(a)).cashCents).toBe(0);
    expect(await sink()).toBe(100_000);
  });

  it("cash held by a working Broker buy limit is never spent: spendable one cent short is refused; exactly enough leaves the held cash", async () => {
    const a = await signUp("alice");
    const last = Number(new LiveMarket().snapshot().quotes.rows.HALC!.last);
    const res = await post(placeRoute, "/api/broker/orders", a, { idempotencyKey: key(), draft: { assetId: "HALC", side: "BUY", type: "limit", qty: "100", limit: (last - 1).toFixed(2), tif: "day" } });
    expect(res.status).toBe(200);
    const held = (await res.json()).ledger.reservedCashCents as number;
    expect(held).toBeGreaterThan(0);
    await setCash(held + 99_999);
    expect((await launch(a)).code).toBe("CASH");
    expect((await me(a)).cashCents).toBe(held + 99_999);
    await setCash(held + 100_000);
    expect(await launch(a)).toMatchObject({ status: "accepted", cashCents: held });
    const m = await me(a);
    expect(m.cashCents).toBe(held);
    expect(m.reservedCashCents).toBe(held); // the working order is still fully covered; nothing negative
  });

  it("a failed save changes nothing; the same key then charges once; game cash is conserved (players + curves + sink)", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    const world = async () => (await auth.readStandings((rows) => rows.reduce((s, r) => s + r.cashCents, 0))) + (await auth.readLaunchpad(null, (lp) => lp.coins.reduce((s, c) => s + c.x - LP.X0, 0) + lp.sinkCents));
    const start = await world();
    store.failNext = true;
    const k = key();
    expect((await post(launchRoute, "/api/launchpad/launch", a, launchBody(k))).status).toBe(500);
    expect((await me(a)).cashCents).toBe(1_000_000);
    expect(await sink()).toBe(0);
    expect((await lpView(a)).coins).toEqual([]);
    expect(await launch(a, k)).toMatchObject({ status: "accepted", cashCents: 900_000 });
    expect(await world()).toBe(start);
    expect((await (await post(tradeRoute, "/api/launchpad/trade", b, { idempotencyKey: key(), ticker: "FROG", side: "buy", amount: 50_000, min: 0 })).json()).status).toBe("accepted");
    expect(await world()).toBe(start);
    expect(await sink()).toBe(100_000 + 250);
  });
});

describe("history saved under the old $100 fee", () => {
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });

  it("loads as saved: no re-charge, the old receipt replays its old reply, coins and holdings are untouched", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "lpfee-")), "auth.json");
    setLiveMarketForTests(new LiveMarket());
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, "lp-old-launch-1");
    await post(tradeRoute, "/api/launchpad/trade", b, { idempotencyKey: key(), ticker: "FROG", side: "buy", amount: 50_000, min: 0 });
    // Rewrite the file as the previous build saved it: a $100 launch (cash, sink and receipt as they were then).
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const aId = raw.accounts.find((x: { handle: string }) => x.handle === "alice").accountId;
    raw.players.find((p: { accountId: string }) => p.accountId === aId).cashCents += 90_000;
    raw.launchpad.sinkCents -= 90_000;
    const rec = raw.launchpad.receipts[aId][0];
    rec.fp = JSON.stringify(["launch", "FROG Club", "FROG", "tg5", 10_000]);
    rec.reply = { status: "accepted", ticker: "FROG", cashCents: 990_000 };
    writeFileSync(file, JSON.stringify(raw));
    const coinsBefore = raw.launchpad.coins, holdingsBefore = raw.launchpad.holdings, costsBefore = raw.launchpad.costs;

    const auth = new AuthService({ store: new FileAuthStore(file) });
    setAuthServiceForTests(auth);
    expect((await me(a)).cashCents).toBe(990_250); // old $100 fee + creator half of B's $5.00 fee, as saved
    expect(await launch(a, "lp-old-launch-1", "FROG", 10_000)).toEqual({ status: "accepted", ticker: "FROG", cashCents: 990_000 }); // old reply, no charge
    expect((await me(a)).cashCents).toBe(990_250);
    const lp = await auth.readLaunchpad(null, (s) => s);
    expect(lp.sinkCents).toBe(raw.launchpad.sinkCents);
    expect(lp.coins).toEqual(coinsBefore);
    expect(lp.holdings).toEqual(holdingsBefore);
    expect(lp.costs).toEqual(costsBefore);
    expect((await me(b)).coins).toHaveLength(1);
  });
});
