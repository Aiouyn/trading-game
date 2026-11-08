// M2-03: GET /api/leaderboard ranks every saved account by the Portfolio net worth (total cash + holdings at the
// server mark, src/market/valuation.ts) at one quote snapshot. Through the real routes, AuthService and a market clock
// whose marks the test sets. Checks: fresh accounts are $10,000.00 and tie deterministically; trades and quote moves
// change the rank; the NW equals what Portfolio's `me` shows; working limits neither drop nor double; rows carry only
// rank / public handle / NW / self; the route writes nothing and needs a live session; concurrent commits are seen
// whole; a restart on the same store gives the same board.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as brokerMe } from "@/app/api/broker/me/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import { GET as boardRoute } from "@/app/api/leaderboard/route";
import { LEADERBOARD_TOP, parseLeaderboard, type LeaderboardView } from "@/market/leaderboard";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { AuthService, FileAuthStore, MemoryAuthStore, SESSION_COOKIE_NAME, SESSION_IDLE_MS, setAuthServiceForTests, type AuthStore, type AuthStoreSnapshot, type StandingInput } from "@/server/auth";
import { setBrokerForTests } from "@/server/broker";
import { buildLeaderboard } from "@/server/leaderboard/board";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import type { MeTradingBody, OrderDraft } from "@/shell/contracts/channels";
import { exchangeFeeMinor, fmt, MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { openChannel, setFeed } from "@/shell/contracts/useChannel";
import "@/shell/contracts/serverSync"; // the lazy signed-in half, evaluated up front: fixed fake-clock steps must not race its real module load

const fee = (n: number) => exchangeFeeMinor(n, 3);

class ControlledMarket {
  private snap: MarketSnapshot;
  constructor() { this.snap = structuredClone(new LiveMarket().snapshot()); }
  snapshot(): MarketSnapshot { return structuredClone(this.snap); }
  stop() {}
  onStep() { return () => {}; }
  onList() { return () => {}; }
  set(marks: Record<string, number>) {
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, tick: this.snap.tick + 1, quotes: { ...this.snap.quotes, rows } };
  }
  last(id: string) { return Math.round(Number(this.snap.quotes.rows[id]!.last) * 100); }
}

/** Counts store saves (the route must make none). */
class CountingStore implements AuthStore {
  saves = 0;
  constructor(private readonly inner: AuthStore) {}
  load(): Promise<AuthStoreSnapshot> { return this.inner.load(); }
  save(s: AuthStoreSnapshot): Promise<void> { this.saves++; return this.inner.save(s); }
}

let now = 1_700_000_000_000;
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0]!;
}
async function place(cookie: string, key: string, draft: OrderDraft) {
  const res = await placeRoute(new Request("http://localhost/api/broker/orders", {
    method: "POST", headers: { "content-type": "application/json", cookie, origin: "http://localhost" }, body: JSON.stringify({ idempotencyKey: `m2-03-key-${key}`, draft }),
  }));
  expect(res.status).toBe(200);
  return res.json();
}
async function boardRaw(cookie?: string): Promise<Response> {
  return boardRoute(new Request("http://localhost/api/leaderboard", { headers: cookie ? { cookie } : {} }));
}
async function board(cookie: string): Promise<LeaderboardView> {
  const res = await boardRaw(cookie);
  expect(res.status).toBe(200);
  const v = parseLeaderboard(await res.json());
  expect(v).not.toBeNull();
  return v!;
}
const mkt = (assetId: string, side: "BUY" | "SELL", qty: string): OrderDraft => ({ assetId, side, type: "market", qty, tif: "day" });
const lmt = (assetId: string, side: "BUY" | "SELL", qty: string, limit: string): OrderDraft => ({ assetId, side, type: "limit", qty, limit, tif: "day" });
const table = (v: LeaderboardView) => v.rows.map((r) => `${r.rank} ${r.handle} ${r.nw}${r.self ? " *" : ""}`);

describe("M2-03 net-worth leaderboard (server)", () => {
  let market: ControlledMarket;
  let store: CountingStore;
  let auth: AuthService;

  beforeEach(() => {
    now = 1_700_000_000_000;
    store = new CountingStore(new MemoryAuthStore());
    auth = new AuthService({ store, now: () => now });
    setAuthServiceForTests(auth);
    market = new ControlledMarket();
    setLiveMarketForTests(market as unknown as LiveMarket);
    setBrokerForTests(undefined);
  });
  afterEach(() => {
    setFeed(null);
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fresh accounts: $10,000.00 each (not a fixture), one shared rank, listed by handle whatever the signup order", async () => {
    const c = await signUp("carl");
    await signUp("Alice");
    const b = await signUp("bob");
    const v = await board(b);
    expect(table(v)).toEqual(["1 Alice 10000.00", "1 bob 10000.00 *", "1 carl 10000.00"]);
    expect(v.players).toBe(3);
    expect(v.self).toEqual({ rank: 1, handle: "bob", nw: "10000.00", self: true });
    expect(v.tick).toBe(market.snapshot().tick);
    expect(table(await board(c))).toEqual(["1 Alice 10000.00", "1 bob 10000.00", "1 carl 10000.00 *"]); // same order, other self
  });

  it("a trade and then quote moves change the rank; the NW is total cash + holdings at the mark (fee in cash)", async () => {
    const a = await signUp("PlayerA");
    const b = await signUp("PlayerB");
    const h0 = market.last("HALC");
    await place(a, "a1", mkt("HALC", "BUY", "10"));
    const cashA = 1_000_000 - 10 * h0 - fee(10 * h0);
    // At the fill mark A is below B by exactly the fee.
    expect(table(await board(b))).toEqual(["1 PlayerB 10000.00 *", `2 PlayerA ${fmt(cashA + 10 * h0, 2)}`]);
    market.set({ HALC: h0 + 50 }); // +$5.00 on 10 shares beats the fee: A leads
    expect(table(await board(a))).toEqual([`1 PlayerA ${fmt(cashA + 10 * (h0 + 50), 2)} *`, "2 PlayerB 10000.00"]);
    market.set({ HALC: h0 - 50 });
    const down = await board(a);
    expect(table(down)).toEqual(["1 PlayerB 10000.00", `2 PlayerA ${fmt(cashA + 10 * (h0 - 50), 2)} *`]);
    expect(down.self!.rank).toBe(2);
  });

  it("the board's NW for an account equals Portfolio's `me` NW at the same server tick", async () => {
    const a = await signUp("Same");
    await place(a, "s1", mkt("HALC", "BUY", "7"));
    await place(a, "s2", mkt("MRDN", "BUY", "3"));
    await place(a, "s3", lmt("HALC", "SELL", "2", "9999.00")); // rests: the 2 units stay held
    await place(a, "s4", lmt("MRDN", "BUY", "1", "1.00")); // rests: holds cash, still the player's
    market.set({ HALC: market.last("HALC") + 37, MRDN: market.last("MRDN") - 11 });
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/market") return Response.json(market.snapshot());
      if (input === "/api/broker/me") return brokerMe(new Request("http://localhost/api/broker/me", { headers: { cookie: a } }));
      return new Response(null, { status: 404 });
    }));
    const feed = new MockFeed({ empty: true, seed: 17 }, { authoritativeQuotes: true });
    setFeed(feed);
    const me = openChannel(feed, "me");
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    const body = me.get().body as MeTradingBody;
    const meTick = me.get().tick;
    me.close();
    vi.useRealTimers();
    const v = await board(a);
    expect(v.self!.nw).toBe(body.nw);
    expect(v.tick).toBe(meTick);
    expect(body.positions.HALC!.qty).toBe("7"); // the sell-limit units are in both
    expect(Number(body.balances.FDL)).toBeGreaterThan(0);
  });

  it("rows carry only rank, public handle, NW and self: no account id, cash, holdings, orders, hash, salt or session", async () => {
    const a = await signUp("PrivA");
    await place(a, "p1", mkt("HALC", "BUY", "2"));
    const res = await boardRaw(a);
    const text = await res.text();
    const raw = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(["players", "rows", "self", "tick", "worldId"]);
    for (const r of raw.rows as Record<string, unknown>[]) expect(Object.keys(r).sort()).toEqual(["handle", "nw", "rank", "self"]);
    const snap = await (store as unknown as { inner: AuthStore }).inner.load();
    const secrets = [
      ...snap.accounts.flatMap((x) => [x.accountId, x.passwordHash, x.passwordSalt, x.handleKey === x.handle ? "" : x.handleKey]),
      ...snap.sessions.flatMap((x) => [x.sessionId, x.tokenHash]),
      a.split("=")[1]!, "cashCents", "positions", "avgCost", "orders", "password",
    ].filter(Boolean);
    for (const s of secrets) expect(text, s).not.toContain(s);
  });

  it("read-only: no store write, no session refresh; signed out or expired -> 401 with no write", async () => {
    const a = await signUp("ReadOnly");
    const before = store.saves;
    const sess = (await (store as unknown as { inner: AuthStore }).inner.load()).sessions[0]!;
    for (let i = 0; i < 5; i++) await board(a);
    expect(store.saves).toBe(before);
    expect((await (store as unknown as { inner: AuthStore }).inner.load()).sessions[0]).toEqual(sess);
    expect((await boardRaw()).status).toBe(401);
    expect((await boardRaw("quay_sid=not-a-real-token")).status).toBe(401);
    now += SESSION_IDLE_MS + 1;
    expect((await boardRaw(a)).status).toBe(401);
    expect(store.saves).toBe(before);
  });

  it("concurrent order commits and signups: every board sees each ledger whole (before or after), never half", async () => {
    const a = await signUp("Racer");
    const h0 = market.last("HALC");
    const states = new Set([fmt(1_000_000, 2)]);
    let cash = 1_000_000;
    const jobs: Promise<unknown>[] = [];
    const boards: Promise<LeaderboardView>[] = [];
    for (let i = 0; i < 6; i++) {
      cash -= h0 + fee(h0);
      states.add(fmt(cash + (i + 1) * h0, 2));
      jobs.push(place(a, `r${i}`, mkt("HALC", "BUY", "1")));
      jobs.push(signUp(`Late${i}x`));
      boards.push(board(a));
    }
    await Promise.all(jobs);
    for (const v of await Promise.all(boards)) {
      expect(states.has(v.self!.nw), `${v.self!.nw} not in ${[...states].join(",")}`).toBe(true);
      expect(v.rows.every((r) => r.handle === "Racer" || r.nw === "10000.00")).toBe(true);
    }
    expect((await board(a)).players).toBe(7);
  });

  it("a commit still being saved is not shown; if that save fails the board never showed it (memory ahead of disk)", async () => {
    const a = await signUp("Pending");
    let gate: () => void = () => {};
    const inner = (store as unknown as { inner: AuthStore }).inner;
    const realSave = inner.save.bind(inner);
    let held = false;
    // Only the save that carries the trade's fill hangs, then fails (the session refresh before it saves normally).
    inner.save = async (snap) => {
      if (!snap.players.some((p) => (p.fills ?? []).length > 0)) return realSave(snap);
      held = true;
      await new Promise<void>((r) => { gate = r; });
      throw new Error("disk full");
    };
    const trade = placeRoute(new Request("http://localhost/api/broker/orders", {
      method: "POST", headers: { "content-type": "application/json", cookie: a, origin: "http://localhost" },
      body: JSON.stringify({ idempotencyKey: "m2-03-key-pending1", draft: mkt("HALC", "BUY", "10") }),
    }));
    for (let i = 0; i < 50 && !held; i++) await new Promise((r) => setTimeout(r, 10)); // the trade is inside its save
    expect(held).toBe(true);
    const read = board(a);
    await new Promise((r) => setTimeout(r, 20));
    gate();
    expect((await trade).status).toBeGreaterThanOrEqual(500);
    inner.save = realSave;
    expect((await read).self!.nw).toBe("10000.00"); // the rolled-back trade never appeared
  });

  it("restart on the same file store: same accounts, same board at the same marks", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "m2-03-"));
    const file = path.join(dir, "store.json");
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file), now: () => now }));
    const a = await signUp("Keep1");
    const b = await signUp("Keep2");
    await place(a, "k1", mkt("HALC", "BUY", "5"));
    market.set({ HALC: market.last("HALC") + 100 });
    const v1 = await board(b);
    setAuthServiceForTests(new AuthService({ store: new FileAuthStore(file), now: () => now })); // a new process
    const v2 = await board(b);
    expect(table(v2)).toEqual(table(v1));
    expect(v2.players).toBe(2);
  });

  it("top rows are capped and the caller's own row still comes back; ties share rank 1,2,2,4", () => {
    const snap = market.snapshot();
    const mk = (id: string, cash: number): StandingInput => ({ accountId: id as StandingInput["accountId"], handle: id, handleKey: id.toLowerCase(), cashCents: cash, positions: [], coinCents: 0 });
    const v = buildLeaderboard([mk("Dd", 100), mk("Aa", 500), mk("Cc", 300), mk("Bb", 300)], snap, "Dd", 2);
    expect(v.rows.map((r) => [r.rank, r.handle])).toEqual([[1, "Aa"], [2, "Bb"]]);
    expect(v.self).toEqual({ rank: 4, handle: "Dd", nw: "1.00", self: true });
    expect(buildLeaderboard([mk("Dd", 100), mk("Aa", 500), mk("Cc", 300), mk("Bb", 300)], snap, null).rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(LEADERBOARD_TOP).toBe(100);
    // An unknown asset cannot be valued: that account is not ranked (no guess), the rest are.
    const odd = buildLeaderboard([{ ...mk("Zz", 1), positions: [{ assetId: "NOPE", qty: 1 }] }, mk("Aa", 5)], snap, "Zz");
    expect([odd.players, odd.self, odd.rows.map((r) => r.handle)]).toEqual([1, null, ["Aa"]]);
  });
});
