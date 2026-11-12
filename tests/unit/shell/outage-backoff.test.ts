// Card 19: /api/market retry backoff (pure schedule), the signed-in feed's connection flag, the store mirror, and the
// guest feed staying out of it (Gatekeeper (c) reset, (d) guest).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGuestDemo, applySignedInDemo } from "@/shell/accountDemoBoundary";
import { RETRY_BASE_MS, RETRY_CAP_MS, RETRY_JITTER, retryDelayMs } from "@/shell/contracts/backoff";
import { MockFeed, SERVER_QUOTE_POLL_MS } from "@/shell/contracts/mockFeed";
import { getFeed, openChannel, setFeed } from "@/shell/contracts/useChannel";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";

describe("retryDelayMs", () => {
  it("doubles from 1 s and caps at 15 s (no jitter at random = 0.5)", () => {
    expect([RETRY_BASE_MS, RETRY_CAP_MS, RETRY_JITTER]).toEqual([1000, 15000, 0.2]);
    expect([1, 2, 3, 4, 5, 6, 12].map((n) => retryDelayMs(n, () => 0.5))).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });
  it("jitters ±20 % and never exceeds the cap", () => {
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n, () => 0))).toEqual([800, 1600, 3200, 6400]);
    expect([1, 2, 3, 4].map((n) => retryDelayMs(n, () => 0.999999))).toEqual([1200, 2400, 4800, 9600]);
    expect(retryDelayMs(5, () => 0)).toBe(12000);
    expect(retryDelayMs(5, () => 0.999999)).toBe(15000);
    expect(retryDelayMs(40, () => 0.999999)).toBe(15000);
  });
  it("treats 0 or fewer failures as the first retry", () => {
    expect(retryDelayMs(0, () => 0.5)).toBe(1000);
  });
});

describe("signed-in feed connection flag and retry cadence", () => {
  let down = false;
  const reads: number[] = [];
  let market: LiveMarket;
  beforeEach(() => {
    vi.useFakeTimers();
    down = false;
    reads.length = 0;
    market = new LiveMarket();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/api/market")) reads.push(Date.now());
      if (down) throw new TypeError("Failed to fetch");
      return Response.json(market.snapshot());
    }));
  });
  afterEach(() => { setFeed(null); setLiveMarketForTests(undefined); vi.unstubAllGlobals(); vi.useRealTimers(); });

  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  async function liveFeed() {
    const flags: string[] = [];
    const feed = new MockFeed({ empty: true, nw: "10000.00", seed: 1 }, { authoritativeQuotes: true, random: () => 0.5 });
    feed.onConnection = (c) => flags.push(c);
    const off = feed.subscribe("ticker:wl_default", () => {});
    await feed.serverSync(); // the signed-in server half is a lazy chunk (serverSync.ts): let it land first
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    expect(feed.hasAdoptedQuotes).toBe(true);
    return { feed, flags, off };
  }
  const gaps = (xs: number[]) => xs.slice(1).map((t, i) => t - xs[i]!);

  it("a failed read after adopt flags reconnecting at once; the next good read clears it", async () => {
    const { feed, flags, off } = await liveFeed();
    expect(flags).toEqual([]);
    expect(feed.connection).toBe("live");
    down = true;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 50);
    expect(flags).toEqual(["reconnecting"]);
    expect(feed.connection).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(4000);
    expect(flags, "more failures do not re-announce").toEqual(["reconnecting"]);
    down = false;
    await vi.advanceTimersByTimeAsync(16_000);
    expect(flags).toEqual(["reconnecting", "live"]);
    expect(feed.connection).toBe("live");
    off();
  });

  it("a non-2xx read after adopt counts as a failure too", async () => {
    const { feed, off } = await liveFeed();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 50);
    expect(feed.connection).toBe("reconnecting");
    off();
  });

  it("healthy reads every SERVER_QUOTE_POLL_MS; during the outage the gaps follow 1, 2, 4, 8, 15, 15 s", async () => {
    const { off } = await liveFeed();
    reads.length = 0;
    await vi.advanceTimersByTimeAsync(3 * SERVER_QUOTE_POLL_MS + 10);
    expect(gaps(reads)).toEqual([SERVER_QUOTE_POLL_MS, SERVER_QUOTE_POLL_MS]);
    down = true;
    reads.length = 0;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 1000 + 2000 + 4000 + 8000 + 15000 + 15000 + 10);
    expect(gaps(reads)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
    off();
  });

  it("(c) the backoff resets after a success: the next blip retries after 1 s, not 15 s", async () => {
    const { feed, off } = await liveFeed();
    down = true;
    await vi.advanceTimersByTimeAsync(1000 + 1000 + 2000 + 4000 + 8000 + 15000 + 10); // deep in the backoff
    down = false;
    await vi.advanceTimersByTimeAsync(15_000 + 10);
    expect(feed.connection).toBe("live");
    reads.length = 0;
    await vi.advanceTimersByTimeAsync(2 * SERVER_QUOTE_POLL_MS + 10);
    expect(gaps(reads), "healthy again").toEqual([SERVER_QUOTE_POLL_MS]);
    down = true;
    reads.length = 0;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 1000 + 2000 + 10);
    expect(gaps(reads), "second blip starts again at 1 s").toEqual([1000, 2000]);
    expect(feed.connection).toBe("reconnecting");
    off();
  });

  it("a failure before the first adopt leaves the flag alone", async () => {
    down = true;
    const flags: string[] = [];
    const feed = new MockFeed({ empty: true, nw: "10000.00", seed: 1 }, { authoritativeQuotes: true, random: () => 0.5 });
    feed.onConnection = (c) => flags.push(c);
    const off = feed.subscribe("ticker:wl_default", () => {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(feed.hasAdoptedQuotes).toBe(false);
    expect(flags).toEqual([]);
    off();
  });

  it("unsubscribing ends the retry loop", async () => {
    const { off } = await liveFeed();
    down = true;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 10);
    off();
    reads.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads).toEqual([]);
  });

  it("applySignedInDemo mirrors the feed's flag into channels.system.connection and ignores a swapped-out feed", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applySignedInDemo(store, "acc_outage", 1, { cashCents: 1_000_000 });
    const feed = getFeed() as MockFeed;
    const off = feed.subscribe("ticker:wl_default", () => {});
    await feed.serverSync();
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    expect(feed.hasAdoptedQuotes).toBe(true);
    expect(store.getState().channels.system.connection).toBe("live");
    down = true;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS + 50);
    expect(store.getState().channels.system.connection).toBe("reconnecting");
    down = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getState().channels.system.connection).toBe("live");
    // swap the feed (sign-out): the old feed's late reports no longer reach the store
    applyGuestDemo(store);
    feed.onConnection?.("reconnecting");
    expect(store.getState().channels.system.connection).toBe("live");
    off();
  });

  it("(d) the guest feed never polls /api/market or touches the flag", async () => {
    const store = createShellStore(mockChannels(new URLSearchParams()));
    applyGuestDemo(store);
    const feed = getFeed() as MockFeed;
    const flags: string[] = [];
    feed.onConnection = (c) => flags.push(c);
    down = true;
    const off = feed.subscribe("ticker:wl_default", () => {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reads).toEqual([]);
    expect(flags).toEqual([]);
    expect(store.getState().channels.system.connection).toBe("live");
    off(); feed.stop();
  });
});

describe("reconnect does not publish the pre-outage book", () => {
  // M1-05 sameBook flake: after offline, player A was live at tick 27702 while B and GET /api/market were at 27704.
  // The online handler asked for a fresh read while one was still in flight, that read was dropped, and resync
  // replayed the cached snap so the Broker looked live on the stale book.
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  type NetListener = () => void;
  const listeners: Record<"online" | "offline", Set<NetListener>> = { online: new Set(), offline: new Set() };

  beforeEach(() => {
    vi.useFakeTimers();
    listeners.online.clear();
    listeners.offline.clear();
    vi.stubGlobal("window", {
      addEventListener: (type: "online" | "offline", fn: NetListener) => { listeners[type].add(fn); },
      removeEventListener: (type: "online" | "offline", fn: NetListener) => { listeners[type].delete(fn); },
    });
  });
  afterEach(() => {
    setFeed(null);
    setLiveMarketForTests(undefined);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function hungReconnect(steps = 2) {
    const market = new LiveMarket();
    let onLine = true;
    vi.stubGlobal("navigator", { get onLine() { return onLine; } });
    const slots: { resolve: (r: Response) => void; reject: (e: unknown) => void }[] = [];
    let hold = false;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.endsWith("/api/market")) return Promise.resolve(new Response("no", { status: 404 }));
      if (!hold) return Promise.resolve(Response.json(market.snapshot()));
      return new Promise<Response>((resolve, reject) => { slots.push({ resolve, reject }); });
    }));
    const feed = new MockFeed({ empty: true, nw: "10000.00", seed: 1 }, { authoritativeQuotes: true, random: () => 0.5 });
    const store = openChannel(feed, "ticker:wl_default");
    await feed.serverSync();
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    expect(store.get().state).toBe("live");
    const adopted = feed.tick;

    hold = true;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS);
    await flush();
    expect(slots).toHaveLength(1);

    const stale = market.snapshot();
    expect(stale.tick).toBe(adopted);
    for (let i = 0; i < steps; i++) market.step();
    const fresh = market.snapshot();
    expect(fresh.tick).toBe(adopted + steps);

    onLine = false;
    for (const fn of listeners.offline) fn();
    expect(store.get().state).toBe("stale");
    onLine = true;
    for (const fn of listeners.online) fn();
    await flush();
    return { feed, store, slots, stale, fresh, adopted, market };
  }

  it("an in-flight read that resolves with the pre-outage book does not become the live book", async () => {
    const { feed, store, slots, stale, fresh, adopted } = await hungReconnect();
    // Back online, still on the outage book, and not live on it: the fresh read has not landed.
    expect(store.get().state).toBe("stale");
    expect(store.get().tick).toBe(adopted);

    slots[0]!.resolve(Response.json(stale));
    await flush();
    // The replacement read is already in flight. No poll interval and no backoff wait.
    expect(slots).toHaveLength(2);
    expect(feed.tick).toBe(adopted);
    expect(store.get().state).toBe("stale");

    slots[1]!.resolve(Response.json(fresh));
    await flush();
    expect(feed.tick).toBe(fresh.tick);
    expect(feed.body("ticker:wl_default")).toEqual(fresh.quotes);
    expect(store.get()).toMatchObject({ state: "live", tick: fresh.tick });
    store.close();
  });

  it("an in-flight read that fails as the browser comes back retries at once", async () => {
    const { feed, store, slots, fresh, adopted } = await hungReconnect();
    expect(store.get().state).toBe("stale");
    slots[0]!.reject(new TypeError("Failed to fetch"));
    await flush();
    expect(slots).toHaveLength(2);
    expect(feed.tick).toBe(adopted);
    slots[1]!.resolve(Response.json(fresh));
    await flush();
    expect(feed.connection).toBe("live");
    expect(feed.tick).toBe(fresh.tick);
    expect(store.get()).toMatchObject({ state: "live", tick: fresh.tick });
    store.close();
  });

  it("an in-flight tick between the adopted book and the server is not what goes live", async () => {
    // Gatekeeper: adopted 27700, held body 27701, server 27703 must not go live at 27701.
    const { feed, store, slots, adopted, market } = await hungReconnect(0);
    market.step();
    const mid = market.snapshot();
    expect(mid.tick).toBe(adopted + 1);
    market.step();
    market.step();
    const server = market.snapshot();
    expect(server.tick).toBe(adopted + 3);
    slots[0]!.resolve(Response.json(mid));
    await flush();
    expect(feed.tick).toBe(adopted);
    expect(store.get().state).toBe("stale");
    expect(slots).toHaveLength(2);
    slots[1]!.resolve(Response.json(server));
    await flush();
    expect(feed.tick).toBe(server.tick);
    expect(store.get()).toMatchObject({ state: "live", tick: server.tick });
    store.close();
  });
});

describe("a slow quote read after online still becomes live", () => {
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  type NetListener = () => void;
  const listeners: Record<"online" | "offline", Set<NetListener>> = { online: new Set(), offline: new Set() };
  const latency = SERVER_QUOTE_POLL_MS + 500;

  beforeEach(() => {
    vi.useFakeTimers();
    listeners.online.clear();
    listeners.offline.clear();
    vi.stubGlobal("window", {
      addEventListener: (type: "online" | "offline", fn: NetListener) => { listeners[type].add(fn); },
      removeEventListener: (type: "online" | "offline", fn: NetListener) => { listeners[type].delete(fn); },
    });
  });
  afterEach(() => {
    setFeed(null);
    setLiveMarketForTests(undefined);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function onlineWithSlowReads(body: () => unknown) {
    const market = new LiveMarket();
    let onLine = true;
    let delay = 0;
    vi.stubGlobal("navigator", { get onLine() { return onLine; } });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.endsWith("/api/market")) return Promise.resolve(new Response("no", { status: 404 }));
      const reply = () => Response.json(delay === 0 ? market.snapshot() : body());
      if (delay === 0) return Promise.resolve(reply());
      return new Promise<Response>((resolve) => { setTimeout(() => resolve(reply()), delay); });
    }));
    const feed = new MockFeed({ empty: true, nw: "10000.00", seed: 1 }, { authoritativeQuotes: true, random: () => 0.5 });
    const store = openChannel(feed, "ticker:wl_default");
    await feed.serverSync();
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    expect(store.get().state).toBe("live");
    delay = latency;
    onLine = false;
    for (const fn of listeners.offline) fn();
    expect(store.get().state).toBe("stale");
    onLine = true;
    for (const fn of listeners.online) fn();
    await flush();
    return { market, feed, store };
  }

  it("goes live within one read and one poll when each read outlasts the poll", async () => {
    const { market, store } = await onlineWithSlowReads(() => market.snapshot());
    const server = market.snapshot().tick;
    await vi.advanceTimersByTimeAsync(latency + SERVER_QUOTE_POLL_MS);
    await flush();
    expect(store.get()).toMatchObject({ state: "live", tick: server });
    store.close();
  });

  it("adopts a restarted server three ticks lower within one read and one poll", async () => {
    const { market, feed, store } = await onlineWithSlowReads(() => ({ ...market.snapshot(), tick: feed.adoptedServerTick()! - 3 }));
    const restarted = feed.adoptedServerTick()! - 3;
    await vi.advanceTimersByTimeAsync(latency + SERVER_QUOTE_POLL_MS);
    await flush();
    expect(store.get()).toMatchObject({ state: "live", tick: restarted });
    store.close();
  });
});
