// Launchpad coins in actual account wealth (same unit, before Gatekeeper). One valuation (old p10 L8.1: holdings at
// liquidation, after the exit fee and price impact) is read with the cash ledger in one locked step and added once:
// the Broker ledger Portfolio and the header NW adopt, and the world leaderboard. The creator's fee share counts once
// (as cash); the board leaks no holding; a failed save keeps cost basis and cash together; a concurrent Broker order and
// Launchpad buy cannot both spend the same cash; restart keeps cost basis; an unavailable Launchpad never yields a
// cash-only wealth (503 before any write).
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
import { LP, liquidationCents, quoteBuy } from "@/launchpad/rules";
import { parseBrokerLedger, type BrokerLedgerView } from "@/market/brokerLedger";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot } from "@/server/auth";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import type { LaunchpadView } from "@/server/launchpad";
import { fmt } from "@/shell/contracts/mockFeed";

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
const key = () => `lp-wealth-key-${++n}`;
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
}
const post = (route: (r: Request) => Promise<Response>, url: string, cookie: string, body: Record<string, unknown>) =>
  route(new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", cookie }, body: JSON.stringify(body) }));
const launch = async (c: string, ticker: string) => (await post(launchRoute, "/api/launchpad/launch", c, { idempotencyKey: key(), fee: LP.LAUNCH_FEE, tagline: "tg5", name: `${ticker} Club`, ticker })).json();
const trade = async (c: string, b: Record<string, unknown>) => (await post(tradeRoute, "/api/launchpad/trade", c, { idempotencyKey: key(), min: 0, ...b })).json();
const get = (route: (r: Request) => Promise<Response>, url: string, cookie: string) => route(new Request(`http://localhost${url}`, { headers: { cookie } }));
async function me(c: string): Promise<BrokerLedgerView> {
  const res = await get(brokerMe, "/api/broker/me", c);
  expect(res.status).toBe(200);
  const v = parseBrokerLedger(await res.json()); // the client's strict boundary accepts it
  expect(v).not.toBeNull();
  return v!;
}
async function board(c: string) {
  const res = await get(boardGet, "/api/leaderboard", c);
  expect(res.status).toBe(200);
  return res.json() as Promise<{ rows: { handle: string; nw: string }[]; self: { nw: string } | null }>;
}
async function lpView(c?: string): Promise<LaunchpadView> {
  return (await lpGet(new Request("http://localhost/api/launchpad", { headers: c ? { cookie: c } : {} }))).json();
}
/** Net worth exactly as the signed-in feed computes it for a ledger with no market positions: cash + Σ coin value. */
const nwOf = (v: BrokerLedgerView) => v.cashCents + v.coins.reduce((s, c) => s + c.value, 0);

describe("Launchpad coins in account wealth", () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(new MemoryAuthStore());
    setAuthServiceForTests(new AuthService({ store }));
    setLiveMarketForTests(new LiveMarket());
  });
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });

  it("A creates, B buys: Broker ledger (Portfolio/header) and leaderboard agree; creator fee counted once; sell → NW correct", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, "FROG");
    const q = quoteBuy({ x: LP.X0, sold: 0 }, 50_000);
    if (!q.ok) throw new Error("quote");
    expect((await trade(b, { ticker: "FROG", side: "buy", amount: 50_000 })).status).toBe("accepted");

    const curve = (await lpView()).coins[0]!;
    const value = liquidationCents(curve, q.tokens);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(50_000); // the estimate is after the exit fee and impact, below what it cost
    const vb = await me(b);
    expect(vb.cashCents).toBe(950_000);
    expect(vb.coins).toEqual([{ ticker: "FROG", qty: q.tokens, value: value, cost: 50_000 }]);
    const va = await me(a);
    expect(va.cashCents).toBe(900_250); // launch fee gone, half of B's $5.00 fee in, as cash
    expect(va.coins).toEqual([]); // the creator's fee is not counted again as a coin value or a share of the curve

    const bb = await board(b), ba = await board(a);
    expect(bb.self!.nw).toBe(fmt(nwOf(vb), 2));
    expect(ba.self!.nw).toBe(fmt(nwOf(va), 2));
    expect(bb.rows.map((r) => [r.handle, r.nw])).toEqual([["bob", fmt(950_000 + value, 2)], ["alice", "9002.50"]]);
    const text = JSON.stringify(ba);
    expect(text).not.toMatch(/FROG|coins|qty|cost|acc_[0-9a-f]{32}/); // only handles, NW and ranks leave
    expect(text).not.toContain(String(q.tokens));

    // Partial sell: cost basis leaves pro rata; full sell: no coin row, NW is cash.
    const half = Math.floor(q.tokens / 2);
    const s1 = await trade(b, { ticker: "FROG", side: "sell", amount: half });
    expect(s1.status).toBe("accepted");
    const mid = await me(b);
    expect(mid.cashCents).toBe(950_000 + s1.cents);
    expect(mid.coins[0]).toMatchObject({ qty: q.tokens - half, cost: 50_000 - Math.round((50_000 * half) / q.tokens), value: liquidationCents((await lpView()).coins[0]!, q.tokens - half) });
    expect((await board(b)).self!.nw).toBe(fmt(nwOf(mid), 2));
    const s2 = await trade(b, { ticker: "FROG", side: "sell", amount: q.tokens - half });
    expect(s2.status).toBe("accepted");
    const end = await me(b);
    expect(end.coins).toEqual([]);
    expect(end.cashCents).toBe(950_000 + s1.cents + s2.cents);
    expect((await board(b)).self!.nw).toBe(fmt(end.cashCents, 2));
  });

  it("a Broker order reply carries the same coin rows (no drop when Portfolio adopts it)", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, "FROG");
    await trade(b, { ticker: "FROG", side: "buy", amount: 20_000 });
    const res = await post(placeRoute, "/api/broker/orders", b, { idempotencyKey: key(), draft: { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" } });
    expect(res.status).toBe(200);
    const reply = await res.json();
    expect(parseBrokerLedger(reply.ledger)!.coins).toEqual((await me(b)).coins);
  });

  it("a failed trade save keeps cost basis, holdings and cash together", async () => {
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, "FROG");
    await trade(b, { ticker: "FROG", side: "buy", amount: 20_000 });
    const before = await me(b);
    store.failNext = true;
    expect((await post(tradeRoute, "/api/launchpad/trade", b, { idempotencyKey: key(), ticker: "FROG", side: "buy", amount: 30_000, min: 0 })).status).toBe(500);
    expect(await me(b)).toEqual(before);
    store.failNext = true;
    expect((await post(tradeRoute, "/api/launchpad/trade", b, { idempotencyKey: key(), ticker: "FROG", side: "sell", amount: before.coins[0]!.qty, min: 0 })).status).toBe(500);
    expect(await me(b)).toEqual(before);
  });

  for (const lpFirst of [false, true]) {
    it(`a concurrent Broker buy and Launchpad buy cannot both spend the same cash (${lpFirst ? "Launchpad" : "Broker"} first)`, async () => {
      const a = await signUp("alice");
      const b = await signUp("bob");
      await launch(a, "FROG");
      const last = Number(new LiveMarket().snapshot().quotes.rows.HALC!.last);
      const qty = Math.floor(800_000 / (last * 100)); // a market buy of ~$8,000 of HALC
      const placeIt = () => post(placeRoute, "/api/broker/orders", b, { idempotencyKey: key(), draft: { assetId: "HALC", side: "BUY", type: "market", qty: String(qty), tif: "day" } }).then((r) => r.json());
      const buyIt = () => trade(b, { ticker: "FROG", side: "buy", amount: 800_000 });
      const [order, buy] = lpFirst ? await Promise.all([buyIt(), placeIt()]).then(([x, y]) => [y, x]) : await Promise.all([placeIt(), buyIt()]);
      const v = await me(b);
      // The server orders them under one lock: the first spends the cash, the second is refused.
      expect(order.result.status).toBe(lpFirst ? "REJECTED" : "ACCEPTED");
      expect(lpFirst ? buy.status : buy.code).toBe(lpFirst ? "accepted" : "CASH");
      expect(Object.keys(v.positions).length > 0).toBe(!lpFirst);
      expect(v.coins.length).toBe(lpFirst ? 1 : 0);
      expect(v.cashCents).toBeGreaterThanOrEqual(0);
      expect(v.cashCents).toBeLessThan(250_000);
    });
  }
});

describe("Launchpad wealth persistence and unavailability", () => {
  afterEach(() => { setLiveMarketForTests(undefined); setAuthServiceForTests(undefined); });

  it("restart keeps cost basis; the Broker ledger and board read the same after a new process", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "lpw-")), "auth.json");
    setLiveMarketForTests(new LiveMarket());
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice");
    const b = await signUp("bob");
    await launch(a, "FROG");
    await trade(b, { ticker: "FROG", side: "buy", amount: 30_000 });
    const before = [await me(b), await board(b)];
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const after = [await me(b), await board(b)];
    expect({ ...after[0], tick: 0 }).toEqual({ ...before[0], tick: 0 });
    expect(after[1]).toEqual(before[1]);
    expect((before[0] as BrokerLedgerView).coins[0]!.cost).toBe(30_000);
  });

  it("an unavailable Launchpad: Broker ledger, Broker order and board refuse (503) rather than state cash-only wealth", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "lpw-")), "auth.json");
    setLiveMarketForTests(new LiveMarket());
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file) }));
    const a = await signUp("alice");
    await launch(a, "FROG");
    await trade(a, { ticker: "FROG", side: "buy", amount: 10_000 });
    const raw = JSON.parse(readFileSync(file, "utf8"));
    raw.launchpad.costs = {}; // cost basis no longer matches holdings
    writeFileSync(file, JSON.stringify(raw));
    const auth = new AuthService({ store: new FileAuthStore(file) });
    setAuthServiceForTests(auth);
    for (const res of [await get(brokerMe, "/api/broker/me", a), await get(boardGet, "/api/leaderboard", a)]) {
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("LAUNCHPAD_UNAVAILABLE");
    }
    const res = await post(placeRoute, "/api/broker/orders", a, { idempotencyKey: key(), draft: { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" } });
    expect(res.status).toBe(503);
    const cash = JSON.parse(readFileSync(file, "utf8"));
    expect(cash.launchpad).toEqual(raw.launchpad); // preserved verbatim for repair
    expect(await auth.readStandings(() => 1).catch((e: { code?: string }) => e.code)).toBe("LAUNCHPAD_UNAVAILABLE");
  });
});
