// M1-08: the signed-in Portfolio `me` is the saved server ledger at server marks (no guest fixture, no client
// accounting). Through the real route handlers, AuthService and a test-set market clock; the feed reads them via fetch.
// Checks: fills -> cash / cost basis (fee in cash, not in cost) / value / unrealized P&L / NW, partial and full sells,
// working limits neither double count nor hide holdings, a failed account read says so and recovers, and a feed
// replaced on an account switch cannot install the previous account's ledger.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import type { BrokerLedgerView } from "@/market/brokerLedger";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { AuthService, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests, START_CASH_CENTS } from "@/server/auth";
import { setBrokerForTests } from "@/server/broker";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import type { MeTradingBody, OrderDraft } from "@/shell/contracts/channels";
import { exchangeFeeMinor, fmt, MockFeed, SERVER_QUOTE_POLL_MS, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { openChannel, setFeed, type ChannelStore } from "@/shell/contracts/useChannel";

const fee = (n: number) => exchangeFeeMinor(n, 3);
const minor = (s: string) => Math.round(Number(s) * 100);

async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  const hit = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return hit!.split(";")[0]!;
}
async function place(cookie: string, key: string, draft: OrderDraft) {
  const res = await placeRoute(new Request("http://localhost/api/broker/orders", {
    method: "POST", headers: { "content-type": "application/json", cookie, origin: "http://localhost" }, body: JSON.stringify({ idempotencyKey: `m1-08-key-${key}`, draft }),
  }));
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
}
async function ledger(cookie: string): Promise<BrokerLedgerView> {
  return (await brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie } }))).json();
}
const mkt = (assetId: string, side: "BUY" | "SELL", qty: string): OrderDraft => ({ assetId, side, type: "market", qty, tif: "day" });
const lmt = (assetId: string, side: "BUY" | "SELL", qty: string, limit: string): OrderDraft => ({ assetId, side, type: "limit", qty, limit, tif: "day" });

/** A market clock whose marks the test sets (same snapshot shape as LiveMarket). */
class ControlledMarket {
  private snap: MarketSnapshot;
  private readonly fns = new Set<() => void>();
  constructor() { this.snap = structuredClone(new LiveMarket().snapshot()); }
  snapshot(): MarketSnapshot { return structuredClone(this.snap); }
  stop() {}
  onStep(fn: () => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  onList() { return () => {}; } // L4 listing hook: this stand-in clock lists nothing
  step(marks: Record<string, number> = {}) {
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, tick: this.snap.tick + 1, quotes: { ...this.snap.quotes, rows } };
    for (const fn of this.fns) fn();
  }
  last(id: string) { return minor(this.snap.quotes.rows[id]!.last); }
}

/** Independent valuation of one ledger at given marks (minor units): what Portfolio must show. */
function expected(l: BrokerLedgerView, marks: Record<string, number>) {
  let held = 0;
  const pos: Record<string, { qty: string; avgCost: string; mark: string; value: string; upl: string }> = {};
  for (const p of Object.values(l.positions)) {
    const q = Number(p.qty), m = marks[p.assetId]!, avg = minor(p.avgCost);
    held += q * m;
    pos[p.assetId] = { qty: p.qty, avgCost: p.avgCost, mark: fmt(m, 2), value: fmt(q * m, 2), upl: fmt((m - avg) * q, 2) };
  }
  return { cash: fmt(l.cashCents, 2), nw: fmt(l.cashCents + held, 2), pos };
}
const shown = (b: MeTradingBody) => ({
  cash: b.balances.FDL, nw: b.nw,
  pos: Object.fromEntries(Object.values(b.positions).map((p) => [p.assetId, { qty: p.qty, avgCost: p.avgCost, mark: p.mark, value: p.value, upl: p.upl }])),
});

describe("M1-08 Portfolio = server ledger at server marks", () => {
  let market: ControlledMarket;
  let meFails: null | "500" | "bad" | "net" = null;
  let marketFails: null | "500" | "bad" | "net" = null;
  let cookie = "";
  let stores: ChannelStore<unknown>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
    market = new ControlledMarket();
    setLiveMarketForTests(market as unknown as LiveMarket);
    setBrokerForTests(undefined);
    meFails = null;
    marketFails = null;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/market") {
        if (marketFails === "500") return new Response("{}", { status: 500 });
        if (marketFails === "bad") return Response.json({ tick: "x" });
        if (marketFails === "net") throw new TypeError("network down");
        return Response.json(market.snapshot());
      }
      if (input === "/api/broker/me") {
        if (meFails === "500") return new Response("{}", { status: 500 });
        if (meFails === "bad") return Response.json({ cashCents: -1 });
        if (meFails === "net") throw new TypeError("network down");
        return brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie } }));
      }
      return new Response(null, { status: 404 });
    }));
  });
  afterEach(() => {
    stores.forEach((s) => s.close()); stores = [];
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    setFeed(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function openMe() {
    const feed = new MockFeed({ empty: true, seed: 17 }, { authoritativeQuotes: true });
    setFeed(feed);
    const me = openChannel(feed, "me");
    stores.push(me as ChannelStore<unknown>);
    return { feed, me };
  }
  /** One server tick and the feed's poll + ledger read after it. */
  async function tick(marks: Record<string, number> = {}) {
    market.step(marks);
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 50);
  }

  it("buys, a quote change, a partial and a full sell: cash, cost basis, value, unrealized P&L and NW match the fills", async () => {
    cookie = await signUp("PfMath");
    const h0 = market.last("HALC"), m0 = market.last("MRDN");
    await place(cookie, "k1", mkt("HALC", "BUY", "5"));
    await place(cookie, "k2", mkt("MRDN", "BUY", "2"));
    const l1 = await ledger(cookie);
    // The fee is paid from cash; the cost basis is the fill price (the server's lot rule), not price + fee.
    expect(l1.cashCents).toBe(START_CASH_CENTS - 5 * h0 - fee(5 * h0) - 2 * m0 - fee(2 * m0));
    expect(l1.positions.HALC).toEqual({ assetId: "HALC", qty: "5", avgCost: fmt(h0, 2) });
    const { me } = openMe();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    expect(me.get().state).toBe("live");
    expect(shown(me.get().body as MeTradingBody)).toEqual(expected(l1, { HALC: h0, MRDN: m0 }));

    // The server mark moves: value, P&L and NW follow; cash and cost do not.
    await tick({ HALC: h0 + 137, MRDN: m0 - 41 });
    expect(shown(me.get().body as MeTradingBody)).toEqual(expected(l1, { HALC: h0 + 137, MRDN: m0 - 41 }));
    expect((me.get().body as MeTradingBody).positions.HALC!.upl).toBe(fmt(137 * 5, 2));

    // Partial sell at the new mark: qty 3, same cost basis, cash + proceeds - fee (read back after the next tick).
    await place(cookie, "k3", mkt("HALC", "SELL", "2"));
    await tick();
    const l2 = await ledger(cookie);
    expect(l2.cashCents).toBe(l1.cashCents + 2 * (h0 + 137) - fee(2 * (h0 + 137)));
    expect(l2.positions.HALC).toEqual({ assetId: "HALC", qty: "3", avgCost: fmt(h0, 2) });
    expect(shown(me.get().body as MeTradingBody)).toEqual(expected(l2, { HALC: h0 + 137, MRDN: m0 - 41 }));

    // Sell everything: no positions, NW = cash (the empty state, no leftover row).
    await place(cookie, "k4", mkt("HALC", "SELL", "3"));
    await place(cookie, "k5", mkt("MRDN", "SELL", "2"));
    await tick();
    const b = me.get().body as MeTradingBody;
    const l3 = await ledger(cookie);
    expect(b.positions).toEqual({});
    expect(b.nw).toBe(fmt(l3.cashCents, 2));
    expect(b.balances.FDL).toBe(fmt(l3.cashCents, 2));
  });

  it("working limits: held buy cash stays in cash and NW once (not subtracted, not added); units in a sell limit stay held", async () => {
    cookie = await signUp("PfHold");
    const h0 = market.last("HALC");
    await place(cookie, "k1", mkt("HALC", "BUY", "5"));
    const { me } = openMe();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    const before = me.get().body as MeTradingBody;
    await place(cookie, "k2", lmt("HALC", "BUY", "3", fmt(Math.max(1, h0 - 1000), 2))); // rests under the mark
    await place(cookie, "k3", lmt("HALC", "SELL", "2", fmt(h0 + 5000, 2))); // rests over the mark
    await tick();
    const l = await ledger(cookie);
    expect(l.reservedCashCents).toBeGreaterThan(0);
    expect(Object.values(l.orders).map((o) => [o.side, o.status])).toEqual([["BUY", "WORKING"], ["SELL", "WORKING"]]);
    const b = me.get().body as MeTradingBody;
    expect(Object.keys(b.orders)).toHaveLength(2);
    expect(b.positions.HALC!.qty).toBe("5"); // the 2 offered are still owned: not gone, not doubled
    expect(b.balances.FDL).toBe(before.balances.FDL); // resting orders move no cash
    expect(shown(b)).toEqual(expected(l, { HALC: h0 }));
    expect(b.nw).toBe(before.nw);
    // The reserve only limits what can still be spent (the server's check), it is not a second balance.
    const over = await place(cookie, "k4", mkt("HALC", "BUY", String(Math.floor((l.cashCents - l.reservedCashCents) / h0) + 1)));
    expect(over.result).toMatchObject({ status: "REJECTED", rejectCode: "MKT_INSUFFICIENT_BP" });
  });

  it("a failed first account read is an error (not an endless skeleton, not a demo); the next read replaces it with the server ledger", async () => {
    cookie = await signUp("PfFail");
    for (const mode of ["500", "bad", "net"] as const) {
      meFails = mode;
      const { me } = openMe();
      await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
      expect(me.get(), mode).toEqual({ state: "error", body: null, tick: null });
      meFails = null;
      await tick();
      expect(me.get().state, mode).toBe("live");
      expect((me.get().body as MeTradingBody).balances).toEqual({ FDL: fmt(START_CASH_CENTS, 2) });
    }
    // An adopted ledger is kept through a later failed read (no flip to error, no demo values).
    meFails = "500";
    const { me } = openMe();
    meFails = null;
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    meFails = "500";
    await tick();
    expect(me.get().state).toBe("live");
    expect((me.get().body as MeTradingBody).nw).toBe(fmt(START_CASH_CENTS, 2));
  });

  it("a failed first quote read (500 / bad body / network) is an error too, and the next good quote read restores the true NW", async () => {
    cookie = await signUp("PfQuote");
    const h0 = market.last("HALC");
    await place(cookie, "k1", mkt("HALC", "BUY", "5"));
    for (const mode of ["500", "bad", "net"] as const) {
      marketFails = mode;
      const { me } = openMe();
      await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
      expect(me.get(), mode).toEqual({ state: "error", body: null, tick: null });
      // Still failing a poll later: still an error, never a body priced at the constructor book.
      await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 50);
      expect(me.get(), mode).toEqual({ state: "error", body: null, tick: null });
      marketFails = null;
      await tick({ HALC: h0 + 25 });
      expect(me.get().state, mode).toBe("live");
      expect(shown(me.get().body as MeTradingBody), mode).toEqual(expected(await ledger(cookie), { HALC: h0 + 25 }));
    }
  });

  it("Retry on a quote-failed me reads the quotes again (not only the ledger)", async () => {
    cookie = await signUp("PfRetry");
    marketFails = "500";
    const { feed, me } = openMe();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    expect(me.get().state).toBe("error");
    const calls = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls;
    const before = calls.filter(([u]) => u === "/api/market").length;
    marketFails = null;
    feed.resync("me");
    await vi.advanceTimersByTimeAsync(50); // well inside the 1 s poll: only Retry can have read
    expect(calls.filter(([u]) => u === "/api/market").length).toBe(before + 1);
    expect(me.get().state).toBe("live");
  });

  it("an account switch replaces the feed: a read the old account started cannot install its holdings on the new one", async () => {
    const a = await signUp("PfA");
    const b = await signUp("PfB");
    await place(a, "ka", mkt("HALC", "BUY", "4"));
    cookie = a;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const realFetch = globalThis.fetch as (i: string) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/broker/me" && cookie === a) { const res = await brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie: a } })); await gate; return res; }
      return realFetch(input);
    }));
    openMe(); // A's feed: its ledger read is held in flight
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    cookie = b; // sign-out / sign-in: the shell installs a new feed for B
    const { me: meB } = openMe();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    release();
    await tick();
    const body = meB.get().body as MeTradingBody;
    expect(meB.get().state).toBe("live");
    expect(body.positions).toEqual({});
    expect(body.balances.FDL).toBe(fmt(START_CASH_CENTS, 2));
  });
});
