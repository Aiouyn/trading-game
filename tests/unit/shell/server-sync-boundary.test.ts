// L4 signed-in server-sync loading boundary (docs/v1/LAUNCHPAD.md, AC 1-8): the signed-in network half
// (serverSync.ts) is a lazy chunk. A guest never loads it; a signed-in feed reads /api/market in parallel with it;
// one poller; a failed load is not kept and is retried; a feed that was swapped (sign-out, account switch) while the
// chunk loaded does nothing with it; an order that cannot reach the half was not sent. Real half, real parsers:
// the mock below only counts loads, holds them, or fails them.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveMarket } from "@/server/market/clock";
import type { DayDraft } from "@/shell/contracts/orders";
import { SERVER_QUOTE_POLL_MS, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";

// A fresh module graph per test, so each test sees the half's first load (as a fresh page does).
let MockFeed: typeof import("@/shell/contracts/mockFeed").MockFeed;
let openChannel: typeof import("@/shell/contracts/useChannel").openChannel;
let setFeed: typeof import("@/shell/contracts/useChannel").setFeed;
let placeOrder: typeof import("@/shell/contracts/orders").placeOrder;

const chunk = vi.hoisted(() => ({ loads: 0, fail: false, gate: null as Promise<void> | null, settled: [] as Promise<unknown>[] }));
/** The half's chunk: counted, holdable and failable; otherwise the real module. Registered per test (doMock), so each
 *  test sees a first load as a fresh page does. */
const chunkFactory = (real: () => Promise<unknown>) => {
  chunk.loads += 1;
  const load = (async () => {
    if (chunk.gate) await chunk.gate;
    if (chunk.fail) throw new Error("chunk load failed");
    return real();
  })();
  chunk.settled.push(load.catch(() => undefined));
  return load;
};

let calls: { url: string; at: number }[] = [];
let snap: ReturnType<LiveMarket["snapshot"]>;
const ledger = { tick: 0, cashCents: 1_000_000, reservedCashCents: 0, positions: {}, orders: {}, fills: [], intents: [], coins: [] };
const urls = (u: string) => calls.filter((c) => c.url === u).length;
/** Holds the next chunk load until `release()`. */
function hold() {
  let release!: () => void;
  chunk.gate = new Promise<void>((ok) => { release = () => { chunk.gate = null; ok(); }; });
  return release;
}
const flush = async () => { for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0); };
/** Waits (real time) for the feed's pending half load to settle, then runs the steps it queued. */
const landed = async () => { await flush(); await Promise.all(chunk.settled); await flush(); };

beforeEach(async () => {
  vi.resetModules();
  vi.doMock("@/shell/contracts/serverSync", chunkFactory as never);
  ({ MockFeed } = await import("@/shell/contracts/mockFeed"));
  ({ openChannel, setFeed } = await import("@/shell/contracts/useChannel"));
  ({ placeOrder } = await import("@/shell/contracts/orders"));
  chunk.loads = 0; chunk.fail = false; chunk.gate = null; chunk.settled = []; calls = [];
  vi.useFakeTimers();
  const market = new LiveMarket();
  market.step();
  snap = market.snapshot();
  ledger.tick = snap.tick;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push({ url, at: chunk.loads });
    if (url === "/api/market") return Response.json(snap);
    if (url === "/api/broker/me") return Response.json(ledger);
    return new Response(null, { status: 404 });
  }));
});
afterEach(() => { vi.doUnmock("@/shell/contracts/serverSync"); setFeed(null); vi.useRealTimers(); vi.unstubAllGlobals(); });

const signedIn = () => new MockFeed({ empty: true, seed: 17 }, { authoritativeQuotes: true });

describe("guest fallback", () => {
  it("a guest feed never loads the half and makes no server read; its demo publishes as before", async () => {
    const feed = new MockFeed({ seed: 3 });
    const t = openChannel(feed, "ticker:wl_default");
    const me = openChannel(feed, "me");
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + feed.tickMs * 2);
    expect(t.get().state).toBe("live");
    expect(me.get().state).toBe("live");
    expect(chunk.loads).toBe(0);
    expect(calls).toEqual([]);
    t.close(); me.close();
  });
});

describe("immediate Broker readiness", () => {
  it("the first /api/market read leaves before the half has loaded, and that one reply is the first live quote", async () => {
    const release = hold();
    const feed = signedIn();
    const t = openChannel(feed, "ticker:wl_default");
    await flush();
    expect(urls("/api/market")).toBe(1); // already in flight while the chunk is held
    expect(t.get().state).toBe("loading"); // no constructor book flashes as live
    release();
    await landed();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    expect(t.get().state).toBe("live");
    expect(t.get().tick).toBe(snap.tick);
    expect(urls("/api/market")).toBe(1); // the early read was used, not repeated
    t.close();
  });
});

describe("duplicate mount", () => {
  it("two ticker views and two `me` views opened during the load share one poller and the ledger reads of one view", async () => {
    const release = hold();
    const feed = signedIn();
    const views = [openChannel(feed, "ticker:wl_default"), openChannel(feed, "ticker:wl_default"), openChannel(feed, "me"), openChannel(feed, "me")];
    await flush();
    release();
    await landed();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    expect(chunk.loads).toBe(1);
    expect(urls("/api/market")).toBe(1);
    // The subscribe read, and the re-read the first new server tick asks for (M1-06), coalesced: the same as one view.
    expect(urls("/api/broker/me")).toBe(2);
    expect(views.map((v) => v.get().state)).toEqual(["live", "live", "live", "live"]);
    const before = urls("/api/market");
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS * 3);
    expect(urls("/api/market") - before).toBe(3); // one read per poll, not one per view
    views.forEach((v) => v.close());
    const stopped = calls.length;
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS * 3);
    expect(calls.length).toBe(stopped);
  });
});

describe("auth switch / sign-out during the lazy load", () => {
  it("the swapped-out feed reads no ledger and runs no poll when its chunk lands; the new account's feed does", async () => {
    const release = hold();
    const a = signedIn();
    setFeed(a);
    const meA = openChannel(a, "me");
    const tA = openChannel(a, "ticker:wl_default");
    await flush();
    meA.close(); tA.close(); // the account boundary closes the old views and swaps the feed
    const b = new MockFeed({ seed: 3 }); // signed out: the guest demo
    setFeed(b);
    release();
    await landed();
    await vi.advanceTimersByTimeAsync(SERVER_QUOTE_POLL_MS * 3);
    expect(urls("/api/broker/me")).toBe(0);
    expect(urls("/api/market")).toBe(1); // only the read that left before the swap
    expect(a.adoptedLedger()).toBe(false);
    expect(a.adoptedServerTick()).toBeNull();
    const meB = openChannel(b, "me");
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    expect(meB.get().state).toBe("live"); // the guest demo, untouched by A's late chunk
    expect(calls.length).toBe(1);
    meB.close();
  });
});

describe("failed import, then retry", () => {
  it("a failed load errors `me` (nothing shown yet), is not kept, and the next poll / Retry loads it and goes live", async () => {
    chunk.fail = true;
    const feed = signedIn();
    const me = openChannel(feed, "me");
    await landed();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    expect(me.get().state).toBe("error");
    expect(feed.adoptedLedger()).toBe(false);
    const failedLoads = chunk.loads;
    expect(failedLoads).toBeGreaterThan(0);
    chunk.fail = false;
    feed.resync("me"); // Retry
    await landed();
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS);
    expect(chunk.loads).toBeGreaterThan(failedLoads); // imported again, not a cached rejection
    expect(feed.adoptedLedger()).toBe(true);
    expect(me.get().state).toBe("live");
    me.close();
  });
});

describe("offline and an unloadable half", () => {
  const draft = { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" } as DayDraft;
  it("an order whose half cannot load reports not sent (offline) and posts nothing", async () => {
    chunk.fail = true;
    setFeed(new MockFeed({ empty: true, seed: 3 }, { authoritativeQuotes: true, autoStart: false }));
    const r = placeOrder(draft);
    await landed();
    expect(await r).toEqual({ ok: false, error: { kind: "offline" } });
    expect(calls.filter((c) => c.url.startsWith("/api/broker/orders"))).toEqual([]);
  });
  it("known offline with the half loaded: still no POST (the half's offline guard is unchanged)", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const feed = new MockFeed({ empty: true, seed: 3 }, { authoritativeQuotes: true, autoStart: false });
    await feed.serverSync();
    setFeed(feed);
    expect(await placeOrder(draft)).toEqual({ ok: false, error: { kind: "offline" } });
    expect(calls.filter((c) => c.url.startsWith("/api/broker/orders"))).toEqual([]);
  });
});
