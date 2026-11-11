// M2-05 known-offline boundary: while the browser reports offline every channel view is stale (Broker freezes
// Review / Place) and the order door sends nothing; a request lost in flight is "unknown", never retried once the
// browser reports offline, and never re-sent on reconnect. Online transient retries are unchanged (m1-06 test).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { ORDER_SEND_ATTEMPTS } from "@/shell/contracts/serverSync";
import { placeOrder, cancelOrder, parseOrderId, type DayDraft } from "@/shell/contracts/orders";
import { openChannel, setFeed } from "@/shell/contracts/useChannel";

let online = true;
let win: EventTarget;
const goOffline = () => { online = false; win.dispatchEvent(new Event("offline")); };
const goOnline = () => { online = true; win.dispatchEvent(new Event("online")); };
beforeEach(() => {
  online = true;
  win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { get onLine() { return online; } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setFeed(null); });

describe("channel views while the browser reports offline", () => {
  it("live → stale on offline, frames that still arrive stay stale, online asks a fresh snap and the next frame is live", async () => {
    vi.useFakeTimers();
    const feed = new MockFeed({ seed: 3 });
    const resync = vi.spyOn(feed, "resync");
    const store = openChannel(feed, "ticker:wl_default");
    await vi.advanceTimersByTimeAsync(SNAP_DELAY_MS + 50);
    const live = store.get().state;
    goOffline();
    const off = store.get().state;
    await vi.advanceTimersByTimeAsync(feed.tickMs * 3); // the local clock keeps emitting ticks
    const stillOff = store.get().state;
    const tickWhileOff = store.get().tick;
    goOnline();
    await vi.advanceTimersByTimeAsync(feed.tickMs * 2);
    expect([live, off, stillOff]).toEqual(["live", "stale", "stale"]);
    expect(tickWhileOff).not.toBeNull();
    expect(resync).toHaveBeenCalledWith("ticker:wl_default");
    expect(store.get().state).toBe("live");
    store.close();
  });
});

describe("the signed-in order door", () => {
  const draft = { assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" } as DayDraft;
  const posts: { url: string; key: unknown; t: number }[] = [];
  function door(onOrder: () => Promise<Response>) {
    posts.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url, key: JSON.parse(String(init.body)).idempotencyKey, t: Date.now() });
        return onOrder();
      }
      return new Response(null, { status: 404 });
    }));
    const feed = new MockFeed({ empty: true, seed: 3 }, { authoritativeQuotes: true, autoStart: false });
    setFeed(feed);
  }

  it("known offline: Place sends no POST and reports offline (nothing reached the server)", async () => {
    door(async () => new Response(null, { status: 500 }));
    goOffline();
    expect(await placeOrder(draft)).toEqual({ ok: false, error: { kind: "offline" } });
    expect(await cancelOrder(parseOrderId("ord_1")!)).toEqual({ ok: false, error: { kind: "offline" } });
    expect(posts).toHaveLength(0);
  });

  it("network lost in flight, then the browser reports offline: one POST, outcome unknown, nothing re-sent on reconnect", async () => {
    vi.useFakeTimers();
    door(async () => { goOffline(); throw new TypeError("network down"); });
    const r = placeOrder(draft);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await r).toEqual({ ok: false, error: { kind: "unknown" } });
    goOnline();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(posts.map((p) => p.url)).toEqual(["/api/broker/orders"]);
  });

  it("online transient network errors still retry with the same key; all lost → unknown (may have committed), not 'failed'", async () => {
    vi.useFakeTimers();
    door(async () => { throw new TypeError("network blip"); });
    const r = placeOrder(draft);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await r).toEqual({ ok: false, error: { kind: "unknown" } });
    expect(posts).toHaveLength(ORDER_SEND_ATTEMPTS);
    expect(new Set(posts.map((p) => p.key)).size).toBe(1);
  });

  it("online 5xx stays the existing definite failure after the same-key retries", async () => {
    vi.useFakeTimers();
    door(async () => new Response(null, { status: 503 }));
    const r = placeOrder(draft);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await r).toMatchObject({ ok: false, error: { kind: "badReply" } });
    expect(posts).toHaveLength(ORDER_SEND_ATTEMPTS);
  });

  it("IDEMPOTENCY_JOURNAL_FULL is not retried and is reported as journalFull", async () => {
    door(async () => new Response(JSON.stringify({ error: { code: "IDEMPOTENCY_JOURNAL_FULL", message: "Idempotency journal is full." } }), { status: 503, headers: { "content-type": "application/json" } }));
    expect(await placeOrder(draft)).toEqual({ ok: false, error: { kind: "journalFull" } });
    expect(posts).toHaveLength(1);
  });
});
