// Card 19: /api/market retry backoff (pure schedule), the signed-in feed's connection flag, the store mirror, and the
// guest feed staying out of it (Gatekeeper (c) reset, (d) guest).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGuestDemo, applySignedInDemo } from "@/shell/accountDemoBoundary";
import { RETRY_BASE_MS, RETRY_CAP_MS, RETRY_JITTER, retryDelayMs } from "@/shell/contracts/backoff";
import { MockFeed, SERVER_QUOTE_POLL_MS } from "@/shell/contracts/mockFeed";
import { getFeed, setFeed } from "@/shell/contracts/useChannel";
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
