import legacyTape from "./legacy-seed17.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as marketGet } from "@/app/api/market/route";
import * as marketRoute from "@/app/api/market/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as me } from "@/app/api/auth/me/route";
import { ASSETS } from "@/market/catalog";
import { storyAt } from "@/market/wireStories";
import { DEMO_CRISIS_HALF_LIFE_DAYS } from "@/server/market/shockFeed";
import { parseMarketSnapshot } from "@/market/quoteSnapshot";
import { settingsStrings } from "@/apps/settings/strings";
import {
  AuthService,
  MemoryAuthStore,
  SESSION_COOKIE_NAME,
  setAuthServiceForTests,
} from "@/server/auth";
import { getLiveMarket, LiveMarket, setLiveMarketForTests, shouldAutostartClock } from "@/server/market/clock";
import { applySignedInDemo } from "@/shell/accountDemoBoundary";
import { FEED_TICK_MS, MockFeed, SERVER_QUOTE_POLL_MS, SNAP_DELAY_MS, START_TICK } from "@/shell/contracts/mockFeed";
import { ShockFeed } from "@/server/market/shockFeed";
import { authoritativeQuoteProvenance, getFeed, openChannel, setFeed, staleAfterMs } from "@/shell/contracts/useChannel";
import { PORT_AVALON_MARKET_SEED, PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";
import { createShellStore } from "@/shell/store";
import { mockChannels } from "@/shell/mockChannels";

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const list = raw.length ? raw : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  const hit = list.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!hit) throw new Error("missing session cookie");
  return hit.split(";")[0]!;
}

describe("M1-05 authoritative live ticks", () => {
  beforeEach(() => {
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
    setLiveMarketForTests(undefined);
  });
  afterEach(() => {
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
    setFeed(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // M1-09: the server is the seeded walk PLUS the Wire stories' effects, applied at their ticks. The reference feed gets
  // exactly the scheduled effects (storyAt) and must then equal the server at every tick; the legacy tape still holds
  // for every asset no story has moved yet.
  it("seed 17 matches the eight-asset tape at ticks 0, 1, 3 and 20, including NMBS and VRDN beside it", () => {
    const market = new LiveMarket();
    const feed = new ShockFeed({ seed: PORT_AVALON_MARKET_SEED }, { autoStart: false });
    const moved = new Set<string>();
    for (let step = 0; step <= 20; step++) {
      const snap = market.snapshot();
      expect(snap.tick).toBe(START_TICK + step);
      expect(snap.worldId).toBe(PORT_AVALON_WORLD_ID);
      expect(snap.marketSeed).toBe(PORT_AVALON_MARKET_SEED);
      expect(snap.tickMs).toBe(FEED_TICK_MS);
      expect(Object.keys(snap.quotes.rows).sort()).toEqual(ASSETS.map((a) => a.assetId).sort());
      expect(snap.quotes).toEqual(feed.body("ticker:wl_default"));
      expect(parseMarketSnapshot(snap)).toEqual(snap);
      const golden = legacyTape.find((sample) => sample.tick === step);
      // legacy-seed17.json is the MockFeed (no ERP) tape, shared with m1-04. Intended ERP diffs vs that tape
      // (calibration size 0.10; direction from owner card answer to t125s460, 2026-11-10 11:02 Europe/Paris):
      //   tick 3  GX last 4201.46→4201.47, chg 27.13→27.14
      //   tick 20 GX last 4190.94→4190.98, chg 16.61→16.65
      // tick 0 and 1 unchanged (accrual has not yet printed a minor). Unmoved non-GX fields still match the tape.
      const erpAdjust: Record<number, Record<string, { last: string; chg: string }>> = {
        3: { GX: { last: "4201.47", chg: "27.14" } },
        20: { GX: { last: "4190.98", chg: "16.65" } },
      };
      if (golden) {
        const rows = Object.fromEntries(Object.entries(golden.body.rows).filter(([id]) => !moved.has(id)));
        for (const [id, patch] of Object.entries(erpAdjust[step] ?? {})) {
          if (rows[id]) rows[id] = { ...rows[id], ...patch };
        }
        expect(snap.quotes.rows).toMatchObject(rows);
      }
      if (golden && moved.size === 0 && !erpAdjust[step]) expect(snap.quotes).toMatchObject(golden.body);
      market.step();
      feed.advance();
      for (const e of storyAt(PORT_AVALON_MARKET_SEED, feed.tick)?.effects ?? []) {
        const st = storyAt(PORT_AVALON_MARKET_SEED, feed.tick)!;
        expect(feed.applyShock(e.assetId, e.bp, st.crisis ? DEMO_CRISIS_HALF_LIFE_DAYS : undefined)).not.toBeNull();
        moved.add(e.assetId);
      }
    }
    expect(moved.size).toBeGreaterThan(0); // stories did move prices inside the window
    expect(moved.size).toBeLessThan(ASSETS.length); // and the tape is still checked for the rest
  });

  it("same seed stays identical and a different seed diverges; reads do not step", () => {
    const a = new LiveMarket({ seed: 17 });
    const b = new LiveMarket({ seed: 17 });
    const other = new LiveMarket({ seed: 18 });
    expect(a.snapshot().quotes).not.toEqual(other.snapshot().quotes);
    for (let i = 0; i < 12; i++) {
      const before = a.snapshot();
      for (let n = 0; n < 25; n++) a.snapshot();
      expect(a.snapshot()).toEqual(before);
      expect(a.snapshot()).toEqual(b.snapshot());
      a.step();
      b.step();
      other.step();
    }
    expect(a.snapshot().quotes).toEqual(b.snapshot().quotes);
    expect(a.snapshot().quotes).not.toEqual(other.snapshot().quotes);
  });

  it("one interval advances once per cadence even if start and reads repeat", async () => {
    vi.useFakeTimers();
    const market = new LiveMarket({ tickMs: 5000 });
    market.start();
    market.start();
    const t0 = market.snapshot().tick;
    await vi.advanceTimersByTimeAsync(4999);
    expect(market.snapshot().tick).toBe(t0);
    await vi.advanceTimersByTimeAsync(1);
    expect(market.snapshot().tick).toBe(t0 + 1);
    for (let n = 0; n < 40; n++) market.snapshot();
    await vi.advanceTimersByTimeAsync(5000);
    expect(market.snapshot().tick).toBe(t0 + 2);
    market.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(market.snapshot().tick).toBe(t0 + 2);
  });

  it("GET /api/market is shared, read-only, and does not multiply the clock", async () => {
    vi.useFakeTimers();
    const market = new LiveMarket({ tickMs: 5000 });
    market.start();
    setLiveMarketForTests(market);
    const regA = await register(new Request("http://localhost/api/auth/register", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ handle: "TickA", password: "password1" }),
    }));
    const regB = await register(new Request("http://localhost/api/auth/register", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ handle: "TickB", password: "password1" }),
    }));
    expect(regA.status).toBe(201);
    expect(regB.status).toBe(201);
    const cookieA = cookieFrom(regA);
    const cookieB = cookieFrom(regB);
    const t0 = market.snapshot().tick;
    const reads = await Promise.all([marketGet(), marketGet(), marketGet()]);
    const bodies = await Promise.all(reads.map((r) => r.json()));
    expect(reads.every((r) => r.status === 200)).toBe(true);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(market.snapshot().tick).toBe(t0);
    expect(Object.keys(bodies[0] as object).sort()).toEqual(["fear", "marketSeed", "quotes", "riskAppetite", "tick", "tickMs", "worldId"]);
    await vi.advanceTimersByTimeAsync(5000);
    const againA = await (await marketGet()).json();
    const againB = await (await marketGet()).json();
    expect(againA).toEqual(againB);
    expect(againA.tick).toBe(t0 + 1);
    expect(againA.quotes).not.toEqual((bodies[0] as { quotes: unknown }).quotes);

    const meA = await (await me(new Request("http://localhost/api/auth/me", { headers: { cookie: cookieA, origin: "http://localhost" } }))).json() as {
      account: { accountId: string }; player: { cashCents: number; accountId: string };
    };
    const meB = await (await me(new Request("http://localhost/api/auth/me", { headers: { cookie: cookieB, origin: "http://localhost" } }))).json() as {
      account: { accountId: string }; player: { cashCents: number; accountId: string };
    };
    expect(meA.account.accountId).not.toBe(meB.account.accountId);
    expect(meA.player.accountId).toBe(meA.account.accountId);
    expect(meB.player.accountId).toBe(meB.account.accountId);
    expect(meA.player.cashCents).toBe(1_000_000);
    expect(meB.player.cashCents).toBe(1_000_000);
    expect("POST" in marketRoute).toBe(false);
    market.stop();
  });

  it("the production singleton starts exactly one clock", () => {
    vi.useFakeTimers();
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(shouldAutostartClock()).toBe(true);
      setLiveMarketForTests(undefined);
      const a = getLiveMarket();
      const b = getLiveMarket();
      expect(a).toBe(b);
      const t0 = a.snapshot().tick;
      vi.advanceTimersByTime(FEED_TICK_MS);
      expect(a.snapshot().tick).toBe(t0 + 1);
      expect(b.snapshot().tick).toBe(t0 + 1);
    } finally {
      env.NODE_ENV = prev;
      setLiveMarketForTests(undefined);
    }
  });

  it("two clients adopt one snapshot; private ledgers stay apart; local advance and local intents do nothing", async () => {
    const market = new LiveMarket();
    market.step();
    const snap = market.snapshot();
    const a = new MockFeed({ empty: true, seed: 17 }, { authoritativeQuotes: true, autoStart: false });
    const b = new MockFeed({ empty: true, seed: 99 }, { authoritativeQuotes: true, autoStart: false });
    // The signed-in network half (serverSync.ts) loads lazily; these steps run in it.
    const [sa, sb] = [await a.serverSync(), await b.serverSync()];
    expect(sa.adoptAuthoritativeQuotes({ worldId: "other" })).toBe(false);
    expect(a.tick).toBe(START_TICK);
    expect(sa.adoptAuthoritativeQuotes(snap)).toBe(true);
    expect(sb.adoptAuthoritativeQuotes(snap)).toBe(true);
    const ledger = (cashCents: number) => ({ tick: snap.tick, cashCents, reservedCashCents: 0, positions: {}, orders: {}, fills: [], intents: [], coins: [] });
    expect(sa.adoptLedger(ledger(1_000_000))).toBe(true);
    expect(sb.adoptLedger(ledger(2_500_000))).toBe(true);
    expect(a.body("ticker:wl_default")).toEqual(snap.quotes);
    expect(b.body("ticker:wl_default")).toEqual(snap.quotes);
    expect(a.tick).toBe(snap.tick);
    a.advance();
    b.advance();
    expect(a.tick).toBe(snap.tick);
    expect(a.body("ticker:wl_default")).toEqual(b.body("ticker:wl_default"));
    expect((a.body("me") as { nw: string }).nw).toBe("10000.00");
    expect((b.body("me") as { nw: string }).nw).toBe("25000.00");

    // M1-06: a signed-in feed never books a local intent; only a server ledger moves `me`.
    a.submit({ assetId: "HALC", side: "BUY", type: "market", qty: "2", tif: "day" });
    market.step();
    const next = market.snapshot();
    expect(sa.adoptAuthoritativeQuotes(next)).toBe(true);
    expect(sb.adoptAuthoritativeQuotes(next)).toBe(true);
    expect(a.body("ticker:wl_default")).toEqual(b.body("ticker:wl_default"));
    expect((a.body("me") as { positions: Record<string, unknown> }).positions.HALC).toBeUndefined();
    expect((a.body("me") as { nw: string }).nw).toBe("10000.00");
    expect((b.body("me") as { nw: string }).nw).toBe("25000.00");
  });

  it("an authoritative feed polls the server book and does not run its own price clock", async () => {
    vi.useFakeTimers();
    const market = new LiveMarket();
    market.step();
    let snap = market.snapshot();
    const fetchMock = vi.fn(async () => Response.json(snap));
    vi.stubGlobal("fetch", fetchMock);
    const feed = new MockFeed({ empty: true, nw: "10000.00", seed: 1 }, { authoritativeQuotes: true });
    const frames: { t?: string; tick?: number }[] = [];
    const off = feed.subscribe("ticker:wl_default", (raw) => frames.push(raw as { t?: string; tick?: number }));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    expect(feed.tick).toBe(snap.tick);
    expect(feed.body("ticker:wl_default")).toEqual(snap.quotes);
    expect(frames.some((f) => f.t === "snap" && f.tick === snap.tick)).toBe(true);
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(FEED_TICK_MS);
    expect(market.snapshot().tick).toBe(snap.tick);
    expect(feed.tick).toBe(snap.tick);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);

    market.step();
    snap = market.snapshot();
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(feed.tick).toBe(snap.tick);
    expect(feed.body("ticker:wl_default")).toEqual(snap.quotes);
    off();
    const afterStop = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS * 3);
    expect(fetchMock.mock.calls.length).toBe(afterStop);
  });

  it("signed-in demo attaches the shared seed on an authoritative feed", () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_tick", PORT_AVALON_MARKET_SEED, { cashCents: 1_000_000 });
    const feed = getFeed() as MockFeed;
    expect(feed.authoritativeQuotes).toBe(true);
    expect(feed.scenario.seed).toBe(PORT_AVALON_MARKET_SEED);
    expect(feed.scenario.empty).toBe(true);
    expect(authoritativeQuoteProvenance(null)).toBeNull();
    expect(feed.adoptedServerTick()).toBeNull();
    expect(authoritativeQuoteProvenance(feed.tick)).toBeNull();
    setFeed(new MockFeed({ seed: PORT_AVALON_MARKET_SEED }, { autoStart: false }));
    expect(authoritativeQuoteProvenance(4)).toBeNull();
  });

  it("a guest feed still publishes its local book after the snap delay", async () => {
    vi.useFakeTimers();
    const feed = new MockFeed({ seed: PORT_AVALON_MARKET_SEED }, { autoStart: false });
    setFeed(feed);
    const frames: { t?: string; tick?: number }[] = [];
    feed.subscribe("ticker:wl_default", (raw) => frames.push(raw as { t?: string; tick?: number }));
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS - 1);
    expect(frames).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(frames[0]).toMatchObject({ t: "snap", tick: START_TICK });
    expect(authoritativeQuoteProvenance(START_TICK)).toBeNull();
  });

  it("a late or rejected first /api/market does not publish the constructor book as the server tick", async () => {
    vi.useFakeTimers();
    const market = new LiveMarket();
    market.step();
    const snap = market.snapshot();
    expect(snap.tick).not.toBe(START_TICK);

    type Pending = { resolve: (r: Response) => void; reject: (err: Error) => void };
    const pending: Pending[] = [];
    let failNext = false;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve, reject) => {
      if (failNext) {
        failNext = false;
        reject(new Error("market down"));
        return;
      }
      pending.push({ resolve, reject });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const feed = new MockFeed({ empty: true, nw: "10000.00", seed: 1 }, { authoritativeQuotes: true });
    setFeed(feed);
    const localBook = JSON.stringify(feed.body("ticker:wl_default"));
    const store = openChannel(feed, "ticker:wl_default");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 25);
    expect(store.get().state).toBe("loading");
    expect(store.get().body).toBeNull();
    expect(store.get().tick).toBeNull();
    expect(feed.adoptedServerTick()).toBeNull();
    expect(authoritativeQuoteProvenance(START_TICK)).toBeNull();
    expect(authoritativeQuoteProvenance(snap.tick)).toBeNull();
    expect(JSON.stringify(feed.body("ticker:wl_default"))).toBe(localBook);

    expect(pending).toHaveLength(1);
    pending[0]!.reject(new Error("market down"));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS);
    expect(store.get().state).toBe("loading");
    expect(feed.adoptedServerTick()).toBeNull();
    expect(JSON.stringify(feed.body("ticker:wl_default"))).toBe(localBook);

    const retry = pending[pending.length - 1];
    expect(retry).toBeTruthy();
    expect(pending.length).toBeGreaterThan(1);
    retry!.resolve(Response.json(snap));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const live = store.get();
    expect(live.state).toBe("live");
    expect(live.tick).toBe(snap.tick);
    expect(live.body).toEqual(snap.quotes);
    expect(JSON.stringify(live.body)).not.toBe(localBook);
    expect(feed.adoptedServerTick()).toBe(snap.tick);
    expect(authoritativeQuoteProvenance(live.tick)).toEqual({ worldId: PORT_AVALON_WORLD_ID, tick: snap.tick });
    expect(authoritativeQuoteProvenance(START_TICK)).toBeNull();

    failNext = true;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(store.get().state).toBe("live");
    expect(store.get().body).toEqual(snap.quotes);
    await vi.advanceTimersByTimeAsync(staleAfterMs(FEED_TICK_MS));
    const stale = store.get();
    expect(stale.state).toBe("stale");
    expect(stale.tick).toBe(snap.tick);
    expect(stale.body).toEqual(snap.quotes);
    expect(authoritativeQuoteProvenance(snap.tick)).toEqual({ worldId: PORT_AVALON_WORLD_ID, tick: snap.tick });
    store.close();
  });

  it("discloses what is saved and executed, keeps guests as demo, and does not claim that refresh resets quotes", () => {
    const en = settingsStrings("en").accountDisclaimer;
    expect(en).toMatch(/saved on the server/);
    expect(en).toMatch(/priced and filled by the server/);
    expect(en).toMatch(/Signed out, the Broker is a demo and its trades are not saved/);
    expect(en).toMatch(/refresh does not reset them/);
    expect(en).not.toMatch(/ticks also reset/i);
    expect(en).not.toMatch(/still a demo/i);
    const fr = settingsStrings("fr").accountDisclaimer;
    expect(fr).toMatch(/démo/);
    expect(fr).toMatch(/ne sont pas enregistrés/);
    expect(fr).toMatch(/rechargement ne les remet pas à zéro/);
  });
});
