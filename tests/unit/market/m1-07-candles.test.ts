// M1-07: server candle history. Quote OHLC sampled from the one server clock, volume = executed Broker fills (each fill
// once, a replayed key adds nothing), no history before the first sample, public aggregates only; the signed-in feed
// plots that history and the server's live bar, never the mock's generated bars.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as candlesRoute } from "@/app/api/market/candles/route";
import { POST as placeRoute } from "@/app/api/broker/orders/route";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { AuthService, MemoryAuthStore, SESSION_COOKIE_NAME, setAuthServiceForTests } from "@/server/auth";
import type { AuthStoreSnapshot } from "@/server/auth/store";
import { setBrokerForTests } from "@/server/broker";
import { CANDLE_KEEP, CandleRecorder, getCandles } from "@/server/market/candles";
import { LiveMarket, setLiveMarketForTests } from "@/server/market/clock";
import type { Candle, CandleRes, OrderDraft } from "@/shell/contracts/channels";
import { loadRange, mergeLive, mockHistory, type Bar } from "@/shell/contracts/history";
import { fmt, MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { openChannel, setFeed } from "@/shell/contracts/useChannel";
import type { AssetId } from "@/shell/contracts/orders";
import { portAvalonServer } from "../helpers/portAvalonServer";

/** A clock whose marks and tick the test sets (same snapshot shape as LiveMarket). */
class ControlledMarket {
  private snap: MarketSnapshot;
  private readonly fns = new Set<() => void>();
  constructor(tick = 720 * 38 + 28) { const s = structuredClone(new LiveMarket().snapshot()); this.snap = { ...s, tick }; }
  snapshot(): MarketSnapshot { return structuredClone(this.snap); }
  stop() {}
  onStep(fn: () => void) { this.fns.add(fn); return () => { this.fns.delete(fn); }; }
  step(marks: Record<string, number> = {}) {
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, tick: this.snap.tick + 1, quotes: { ...this.snap.quotes, rows } };
    for (const fn of this.fns) fn();
  }
  set(marks: Record<string, number>) { // same tick, new marks (not a step)
    const rows = { ...this.snap.quotes.rows };
    for (const [id, m] of Object.entries(marks)) rows[id] = { ...rows[id]!, last: fmt(m, 2) };
    this.snap = { ...this.snap, quotes: { ...this.snap.quotes, rows } };
  }
  get tick() { return this.snap.tick; }
  last(id: string) { return Math.round(Number(this.snap.quotes.rows[id]!.last) * 100); }
}
const asMarket = (m: ControlledMarket) => m as unknown as LiveMarket;
const minor = (s: string) => Math.round(Number(s) * 100);

/** OHLC invariants on every bar: l <= min(o, c), h >= max(o, c), l <= h, v a whole number; ascending t on the span. */
function expectWellFormed(bars: Candle[], span: number) {
  let prev = -1;
  for (const b of bars) {
    const [o, h, l, c] = [b.o, b.h, b.l, b.c].map(minor) as [number, number, number, number];
    expect(l).toBeLessThanOrEqual(Math.min(o, c));
    expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
    expect(b.v).toMatch(/^\d+$/);
    expect(b.t % span).toBe(0);
    expect(b.t).toBeGreaterThan(prev);
    prev = b.t;
  }
}

describe("CandleRecorder (quote OHLC + executed volume)", () => {
  it("no history before the first sample; tick bars open at the previous close; hour/day bars aggregate the samples", () => {
    const m = new ControlledMarket(30 * 100 + 28); // two ticks before an hour boundary
    const rec = new CandleRecorder();
    expect(rec.history({ assetId: "HALC", res: "tick", from: 0, to: m.tick })).toEqual([]);
    const p0 = m.last("HALC");
    rec.sample(m.snapshot());
    m.step({ HALC: p0 + 30 }); rec.sample(m.snapshot());
    m.step({ HALC: p0 - 20 }); rec.sample(m.snapshot()); // first tick of the next hour
    m.step({ HALC: p0 + 5 }); rec.sample(m.snapshot());
    const t0 = 30 * 100 + 28;
    const ticks = rec.history({ assetId: "HALC", res: "tick", from: 0, to: m.tick });
    expect(ticks).toEqual([
      { t: t0, o: fmt(p0, 2), h: fmt(p0, 2), l: fmt(p0, 2), c: fmt(p0, 2), v: "0" },
      { t: t0 + 1, o: fmt(p0, 2), h: fmt(p0 + 30, 2), l: fmt(p0, 2), c: fmt(p0 + 30, 2), v: "0" },
      { t: t0 + 2, o: fmt(p0 + 30, 2), h: fmt(p0 + 30, 2), l: fmt(p0 - 20, 2), c: fmt(p0 - 20, 2), v: "0" },
      { t: t0 + 3, o: fmt(p0 - 20, 2), h: fmt(p0 + 5, 2), l: fmt(p0 - 20, 2), c: fmt(p0 + 5, 2), v: "0" },
    ]);
    const hours = rec.history({ assetId: "HALC", res: "hour", from: 0, to: m.tick });
    expect(hours).toEqual([
      { t: 3000, o: fmt(p0, 2), h: fmt(p0 + 30, 2), l: fmt(p0, 2), c: fmt(p0 + 30, 2), v: "0" },
      { t: 3030, o: fmt(p0 + 30, 2), h: fmt(p0 + 30, 2), l: fmt(p0 - 20, 2), c: fmt(p0 + 5, 2), v: "0" },
    ]);
    expect(rec.history({ assetId: "HALC", res: "day", from: 0, to: m.tick })).toHaveLength(1);
    expectWellFormed(ticks, 1); expectWellFormed(hours, 30);
  });

  it("a re-read of the same tick is not a new sample; an older tick is ignored", () => {
    const m = new ControlledMarket();
    const rec = new CandleRecorder();
    rec.sample(m.snapshot());
    const before = rec.history({ assetId: "HALC", res: "tick", from: 0, to: m.tick });
    m.set({ HALC: m.last("HALC") + 500 });
    rec.sample(m.snapshot());
    expect(rec.history({ assetId: "HALC", res: "tick", from: 0, to: m.tick })).toEqual(before);
  });

  it("volume: each fillId once, at its tick's bar in every resolution; unknown asset / bad qty / unsampled tick add nothing", () => {
    const m = new ControlledMarket(720 * 38 + 28);
    const rec = new CandleRecorder();
    rec.sample(m.snapshot());
    m.step(); rec.sample(m.snapshot());
    const t = m.tick;
    rec.recordFills([{ fillId: "x-1", assetId: "HALC", tick: t, qty: "10" }, { fillId: "x-2", assetId: "HALC", tick: t, qty: "5" }]);
    rec.recordFills([{ fillId: "x-1", assetId: "HALC", tick: t, qty: "10" }]); // the same fill again: not counted
    rec.recordFills([{ fillId: "x-3", assetId: "NOPE", tick: t, qty: "9" }, { fillId: "x-4", assetId: "HALC", tick: t, qty: "1.5" }, { fillId: "x-5", assetId: "HALC", tick: t + 50, qty: "7" }]);
    const v = (res: CandleRes) => rec.history({ assetId: "HALC", res, from: 0, to: t + 100 }).map((b) => b.v);
    expect(v("tick")).toEqual(["0", "15"]);
    expect(v("hour")).toEqual(["15"]);
    expect(v("day")).toEqual(["15"]);
    expect(rec.history({ assetId: "MRDN", res: "tick", from: 0, to: t }).map((b) => b.v)).toEqual(["0", "0"]);
  });

  it("revision: each counted fill bumps it once; `since` adds exactly the older bars whose volume changed after it", () => {
    const m = new ControlledMarket(720 * 38 + 28);
    const rec = new CandleRecorder();
    rec.sample(m.snapshot());
    const t0 = m.tick;
    for (let i = 0; i < 10; i++) { m.step(); rec.sample(m.snapshot()); }
    const r0 = rec.revision;
    rec.recordFills([{ fillId: "r-1", assetId: "HALC", tick: t0 + 2, qty: "4" }]);
    const r1 = rec.revision;
    expect(r1).toBe(r0 + 1);
    rec.recordFills([{ fillId: "r-1", assetId: "HALC", tick: t0 + 2, qty: "4" }, { fillId: "r-2", assetId: "HALC", tick: t0 + 99, qty: "4" }]); // replay / unsampled
    expect(rec.revision).toBe(r1);
    const now = m.tick;
    const tv = (since?: number) => rec.history({ assetId: "HALC", res: "tick", from: now, to: now }, since).map((b) => [b.t, b.v]);
    expect(tv()).toEqual([[now, "0"]]);
    expect(tv(r0)).toEqual([[t0 + 2, "4"], [now, "0"]]); // the late bar, oldest first, then the range
    expect(tv(r1)).toEqual([[now, "0"]]); // already seen: not sent again
    expect(rec.history({ assetId: "MRDN", res: "tick", from: now, to: now }, r0).map((b) => b.t)).toEqual([now]); // per asset
    expect(rec.history({ assetId: "HALC", res: "hour", from: now, to: now }, r0)).toHaveLength(1); // same hour bar: in range
  });

  it("from aligns down to the span, to is inclusive, unknown asset or to < from is empty; at most CANDLE_KEEP bars kept", () => {
    const m = new ControlledMarket(100);
    const rec = new CandleRecorder();
    rec.sample(m.snapshot());
    for (let i = 0; i < CANDLE_KEEP + 20; i++) { m.step(); rec.sample(m.snapshot()); }
    const all = rec.history({ assetId: "HALC", res: "tick", from: 0, to: m.tick });
    expect(all).toHaveLength(CANDLE_KEEP);
    expect(all.at(-1)!.t).toBe(m.tick);
    expect(rec.history({ assetId: "HALC", res: "tick", from: m.tick - 2, to: m.tick - 1 }).map((b) => b.t)).toEqual([m.tick - 2, m.tick - 1]);
    expect(rec.history({ assetId: "HALC", res: "hour", from: m.tick - 1, to: m.tick }).map((b) => b.t)).toEqual([m.tick - (m.tick % 30)]);
    expect(rec.history({ assetId: "NOPE", res: "tick", from: 0, to: m.tick })).toEqual([]);
    expect(rec.history({ assetId: "HALC", res: "tick", from: 10, to: 9 })).toEqual([]);
  });
});

function cookieFrom(res: Response): string {
  const hit = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!hit) throw new Error("missing session cookie");
  return hit.split(";")[0]!;
}
async function signUp(handle: string): Promise<string> {
  const res = await register(new Request("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, password: "password1" }),
  }));
  expect(res.status).toBe(201);
  return cookieFrom(res);
}
const place = (cookie: string, key: string, draft: OrderDraft) => placeRoute(new Request("http://localhost/api/broker/orders", {
  method: "POST", headers: { "content-type": "application/json", cookie, origin: "http://localhost" }, body: JSON.stringify({ idempotencyKey: key, draft }),
}));
const getCandlesRoute = async (qs: string) => { const r = await candlesRoute(new Request(`http://localhost/api/market/candles?${qs}`)); return { status: r.status, body: await r.json() as { bars: Candle[] } }; };

describe("GET /api/market/candles + Broker fills (real routes, memory auth)", () => {
  let market: ControlledMarket;
  beforeEach(() => {
    setAuthServiceForTests(new AuthService({ store: new MemoryAuthStore() }));
    market = new ControlledMarket();
    setLiveMarketForTests(asMarket(market));
    setBrokerForTests(undefined);
  });
  afterEach(() => {
    setBrokerForTests(undefined);
    setLiveMarketForTests(undefined);
    setAuthServiceForTests(undefined);
  });

  it("validates the query (400) and answers the contract shape with no account fields", async () => {
    for (const qs of ["", "assetId=HALC&res=tick&from=0&to=1&since=x", "assetId=HALC&res=tick&from=0&to=1&since=-1", "assetId=HALC&res=minute&from=0&to=1", "assetId=HALC&res=tick&from=-1&to=1", "assetId=HALC&res=tick&from=0", "assetId=HALC&res=tick&from=a&to=1"]) {
      expect((await getCandlesRoute(qs)).status, qs).toBe(400);
    }
    const ok = await getCandlesRoute(`assetId=HALC&res=tick&from=0&to=${market.tick}`);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body)).toEqual(["bars"]);
    expect(ok.body.bars).toHaveLength(1);
    expect(Object.keys(ok.body.bars[0]!).sort()).toEqual(["c", "h", "l", "o", "t", "v"]);
    const r = await candlesRoute(new Request(`http://localhost/api/market/candles?assetId=HALC&res=tick&from=0&to=${market.tick}&since=0`));
    expect(r.headers.get("x-candle-rev")).toMatch(/^\d+$/);
    expect(Object.keys(await r.json() as object)).toEqual(["bars"]);
  });

  it("market fills add their quantity to the bar once; a replayed idempotency key adds nothing; swept limits count at their tick", async () => {
    await getCandlesRoute(`assetId=HALC&res=tick&from=0&to=${market.tick}`); // first read: the history samples this clock
    const a = await signUp("CandleA");
    const b = await signUp("CandleB");
    const t0 = market.tick;
    expect((await place(a, "candle-key-0001", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" })).status).toBe(200);
    expect((await place(a, "candle-key-0001", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" })).status).toBe(200); // replay
    expect((await place(b, "candle-key-0002", { assetId: "HALC", side: "BUY", type: "market", qty: "3", tif: "day" })).status).toBe(200);
    // A buy limit below the mark rests, then fills when the next tick reaches it.
    const p = market.last("HALC");
    expect((await place(b, "candle-key-0003", { assetId: "HALC", side: "BUY", type: "limit", qty: "4", limit: fmt(p - 100, 2), tif: "day" })).status).toBe(200);
    market.step({ HALC: p - 150 });
    await vi.waitFor(async () => {
      const bars = (await getCandlesRoute(`assetId=HALC&res=tick&from=${t0}&to=${market.tick}`)).body.bars;
      expect(bars.map((x) => [x.t, x.v])).toEqual([[t0, "13"], [t0 + 1, "4"]]);
    });
    const hour = (await getCandlesRoute(`assetId=HALC&res=hour&from=${t0}&to=${market.tick}`)).body.bars;
    expect(hour.reduce((n, x) => n + Number(x.v), 0)).toBe(17);
    // Other assets: no executions, no volume. The quote moved anyway.
    expect((await getCandlesRoute(`assetId=MRDN&res=tick&from=${t0}&to=${market.tick}`)).body.bars.map((x) => x.v)).toEqual(["0", "0"]);
  });

  it("a rejected order executes nothing and adds no volume", async () => {
    await getCandlesRoute(`assetId=HALC&res=tick&from=0&to=${market.tick}`);
    const a = await signUp("CandleC");
    const r = await place(a, "candle-key-0009", { assetId: "HALC", side: "SELL", type: "market", qty: "5", tif: "day" }); // nothing to sell
    expect((await r.json()).result.status).toBe("REJECTED");
    expect((await getCandlesRoute(`assetId=HALC&res=tick&from=0&to=${market.tick}`)).body.bars.map((x) => x.v)).toEqual(["0"]);
  });

  it("getCandles binds to one clock: a swapped clock starts a new history (no carry-over)", () => {
    const one = getCandles(asMarket(market));
    expect(getCandles(asMarket(market))).toBe(one);
    const other = new ControlledMarket(5);
    expect(getCandles(asMarket(other))).not.toBe(one);
    expect(getCandles(asMarket(other)).history({ assetId: "HALC", res: "tick", from: 0, to: 10 }).map((x) => x.t)).toEqual([5]);
  });
});

describe("signed-in feed: server history and live bar only", () => {
  afterEach(() => { setFeed(null); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("history comes from /api/market/candles (never the mock's generated bars); the live candle is the server's bar", async () => {
    const live = new LiveMarket({ tickMs: 1000 });
    const rec = new CandleRecorder();
    rec.sample(live.snapshot());
    const seen: string[] = [];
    const stub = portAvalonServer({ market: live, other: (url) => {
      seen.push(url);
      const q = new URL(url, "http://localhost").searchParams;
      if (url.includes("/api/market/candles")) return Response.json({ bars: rec.history({ assetId: q.get("assetId")!, res: q.get("res") as CandleRes, from: Number(q.get("from")), to: Number(q.get("to")) }) });
      return new Response(null, { status: 404 });
    } });
    vi.stubGlobal("fetch", stub);
    const feed = new MockFeed({ empty: true }, { authoritativeQuotes: true });
    setFeed(feed);
    // Before any server read: nothing to plot, and the mock would have generated nothing either way for `empty`.
    const t = live.snapshot().tick;
    const transport = mockHistory()!;
    const r = await loadRange("HALC" as AssetId, "1D", t as never, transport);
    expect(r.ok && r.value.map((b) => b.t)).toEqual([t]);
    expect(seen.some((u) => u.includes(`/api/market/candles?assetId=HALC&res=tick&from=${t - 719}&to=${t}`))).toBe(true);
    // A non-empty guest-style feed in signed-in mode still asks the server (a fixture never reaches a signed-in chart).
    const ch = openChannel(feed, "candles:HALC:tick");
    const ticker = openChannel(feed, "ticker:wl_default");
    await vi.waitFor(() => expect(ch.get().state).toBe("live"));
    expect(ch.get().body!.live).toEqual(rec.history({ assetId: "HALC", res: "tick", from: t, to: t })[0]);
    ch.close(); ticker.close();
    live.stop();
    void SNAP_DELAY_MS;
  });

  it("a fill in a bar's last second still reaches the chart: the closed bar's final values, then the next bar", async () => {
    const m = new ControlledMarket();
    const rec = new CandleRecorder();
    rec.sample(m.snapshot());
    const reads: string[] = [];
    vi.stubGlobal("fetch", portAvalonServer({ market: asMarket(m), other: (url) => {
      const q = new URL(url, "http://localhost").searchParams;
      reads.push(`${q.get("from")}-${q.get("to")}`);
      return Response.json({ bars: rec.history({ assetId: q.get("assetId")!, res: q.get("res") as CandleRes, from: Number(q.get("from")), to: Number(q.get("to")) }) });
    } }));
    const feed = new MockFeed({ empty: true }, { authoritativeQuotes: true });
    setFeed(feed);
    const t0 = m.tick;
    const ch = openChannel(feed, "candles:MRDN:tick");
    const ticker = openChannel(feed, "ticker:wl_default");
    await vi.waitFor(() => expect(ch.get().body?.live).toMatchObject({ t: t0, v: "0" }));
    // The fill lands at t0 and the clock steps before the feed's next read.
    rec.recordFills([{ fillId: "late-1", assetId: "MRDN", tick: t0, qty: "3" }]);
    m.step();
    rec.sample(m.snapshot());
    const frames: Candle[] = [ch.get().body!.live];
    const off = ch.listen(() => { const b = ch.get().body?.live; const p = frames.at(-1); if (b && (!p || p.t !== b.t || p.v !== b.v)) frames.push(b); });
    await vi.waitFor(() => expect(ch.get().body?.live.t).toBe(t0 + 1), { timeout: 4_000 });
    off();
    expect(frames.map((b) => [b.t, b.v])).toEqual([[t0, "0"], [t0, "3"], [t0 + 1, "0"]]);
    expect(reads).toContain(`${t0}-${t0 + 1}`); // bounded: the closed bar and the new one
    ch.close(); ticker.close();
  });

  it("a failed history read is an error (Retry), not a demo plot", async () => {
    vi.stubGlobal("fetch", portAvalonServer({ other: () => new Response(null, { status: 500 }) }));
    setFeed(new MockFeed({}, { authoritativeQuotes: true }));
    const r = await loadRange("HALC" as AssetId, "1H", 100 as never);
    expect(r.ok).toBe(false);
  });
});

/** Memory store that holds the save carrying `key` (the order's own persist in flight) until the test commits or fails it;
 *  other saves (e.g. a session touch) pass. */
class GatedStore extends MemoryAuthStore {
  private gate: Promise<void> | null = null;
  private fail = false;
  private key = "";
  waiting = 0;
  hold(key: string, opts: { fail?: boolean } = {}): () => void {
    this.key = key;
    let open!: () => void;
    this.gate = new Promise<void>((r) => { open = r; });
    this.fail = opts.fail ?? false;
    return () => { this.gate = null; open(); };
  }
  override async save(snapshot: AuthStoreSnapshot): Promise<void> {
    if (this.gate && JSON.stringify(snapshot).includes(this.key)) {
      const fail = this.fail;
      this.waiting += 1;
      await this.gate;
      this.waiting -= 1;
      if (fail) throw new Error("injected save failure");
    }
    return super.save(snapshot);
  }
}

describe("late save across a bar boundary (real place + candles routes, real signed-in feed)", () => {
  let market: ControlledMarket;
  let store: GatedStore;
  let reads: string[];
  beforeEach(() => {
    store = new GatedStore();
    setAuthServiceForTests(new AuthService({ store }));
    market = new ControlledMarket();
    setLiveMarketForTests(asMarket(market));
    setBrokerForTests(undefined);
    reads = [];
    vi.stubGlobal("fetch", portAvalonServer({ market: asMarket(market), other: (url) => {
      if (!url.includes("/api/market/candles")) return new Response(null, { status: 404 });
      reads.push(url);
      return candlesRoute(new Request(new URL(url, "http://localhost")));
    } }));
  });
  afterEach(() => {
    setFeed(null); vi.unstubAllGlobals();
    setBrokerForTests(undefined); setLiveMarketForTests(undefined); setAuthServiceForTests(undefined);
  });

  /** Opens the HALC tick channel and records every distinct live frame; `polls(n)` waits for n more candle reads. */
  async function watch() {
    const before = (await getCandlesRoute(`assetId=HALC&res=tick&from=0&to=${market.tick}`)).body.bars; // the chart's history
    const feed = new MockFeed({ empty: true }, { authoritativeQuotes: true });
    setFeed(feed);
    const ch = openChannel(feed, "candles:HALC:tick");
    const ticker = openChannel(feed, "ticker:wl_default");
    const frames: Candle[] = [];
    const off = ch.listen(() => { const b = ch.get().body?.live; const p = frames.at(-1); if (b && (!p || JSON.stringify(p) !== JSON.stringify(b))) frames.push(b); });
    await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0));
    const polls = async (n: number) => { const k = reads.length + n; await vi.waitFor(() => expect(reads.length).toBeGreaterThanOrEqual(k), { timeout: 6_000 }); };
    const done = () => { off(); ch.close(); ticker.close(); };
    // What the chart shows: the history folded with every frame (PriceChart's merge).
    const shown = () => frames.reduce<readonly Candle[]>((bars, f) => mergeLive(bars as never, f as never) as unknown as readonly Candle[], before);
    return { frames, polls, done, shown };
  }
  const tv = (bars: readonly Candle[]) => bars.map((b) => [b.t, b.v]);
  const server = async (from: number) => (await getCandlesRoute(`assetId=HALC&res=tick&from=${from}&to=${market.tick}`)).body.bars;

  it("a trade decided at T whose save commits after T closed (and after the feed re-read T) shows in T exactly once", async () => {
    const a = await signUp("Straddle1");
    const t0 = market.tick;
    const w = await watch();
    const release = store.hold("straddle-0001");
    const pending = place(a, "straddle-0001", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" });
    await vi.waitFor(() => expect(store.waiting).toBe(1)); // decided at t0, save in flight
    market.step(); // T closes while the save is held
    await vi.waitFor(() => expect(w.frames.at(-1)?.t).toBe(t0 + 1), { timeout: 4_000 }); // the feed advanced past T
    await w.polls(2); // and kept reading T+1 before the commit
    expect(tv(w.frames)).toEqual([[t0, "0"], [t0 + 1, "0"]]);
    release();
    expect((await pending).status).toBe(200);
    expect(tv(await server(t0))).toEqual([[t0, "10"], [t0 + 1, "0"]]);
    await vi.waitFor(() => expect(tv(w.frames)).toEqual([[t0, "0"], [t0 + 1, "0"], [t0, "10"], [t0 + 1, "0"]]), { timeout: 4_000 });
    // A replayed key and a rejected order add nothing: no further correction frames.
    expect((await place(a, "straddle-0001", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" })).status).toBe(200);
    const b = await signUp("Straddle2");
    const rej = await place(b, "straddle-0002", { assetId: "HALC", side: "SELL", type: "market", qty: "5", tif: "day" });
    expect((await rej.json()).result.status).toBe("REJECTED");
    await w.polls(3);
    w.done();
    expect(tv(w.frames)).toEqual([[t0, "0"], [t0 + 1, "0"], [t0, "10"], [t0 + 1, "0"]]); // the correction exactly once
    expect(tv(w.shown()).slice(-2)).toEqual([[t0, "10"], [t0 + 1, "0"]]); // the chart's bars equal the server's
    expect(tv(w.shown()).slice(-2)).toEqual(tv(await server(t0)));
    expect(w.shown().reduce((n, x) => n + Number(x.v), 0)).toBe(10); // net volume: the one executed fill
    expect(reads.filter((u) => u.includes("since=")).length).toBeGreaterThan(0);
  }, 20_000);

  it("fault injection: a save that fails after T closed adds no volume, live or on the server", async () => {
    const a = await signUp("Straddle3");
    const t0 = market.tick;
    const w = await watch();
    const release = store.hold("straddle-0003", { fail: true });
    const pending = place(a, "straddle-0003", { assetId: "HALC", side: "BUY", type: "market", qty: "10", tif: "day" });
    await vi.waitFor(() => expect(store.waiting).toBe(1));
    market.step();
    await vi.waitFor(() => expect(w.frames.at(-1)?.t).toBe(t0 + 1), { timeout: 4_000 });
    const rev = (await candlesRoute(new Request(`http://localhost/api/market/candles?assetId=HALC&res=tick&from=${t0}&to=${market.tick}`))).headers.get("x-candle-rev");
    release();
    expect((await pending).status).not.toBe(200); // the save failed: the order did not happen
    await w.polls(3);
    w.done();
    expect(tv(w.frames)).toEqual([[t0, "0"], [t0 + 1, "0"]]);
    expect(tv(await server(t0))).toEqual([[t0, "0"], [t0 + 1, "0"]]);
    expect((await candlesRoute(new Request(`http://localhost/api/market/candles?assetId=HALC&res=tick&from=${t0}&to=${market.tick}`))).headers.get("x-candle-rev")).toBe(rev);
    expect(w.shown().reduce((n, x) => n + Number(x.v), 0)).toBe(0);
  }, 20_000);
});

describe("mergeLive: a late correction replaces its bar in place", () => {
  const bar = (t: number, v: string) => ({ t, o: "1.00", h: "1.00", l: "1.00", c: "1.00", v }) as unknown as Bar;
  it("older same-t bar replaced; unknown older t ignored; newer appended", () => {
    const h = [bar(1, "0"), bar(2, "0"), bar(3, "0")];
    expect(tv2(mergeLive(h, bar(2, "7")))).toEqual([[1, "0"], [2, "7"], [3, "0"]]);
    expect(mergeLive(h, bar(0, "7"))).toBe(h);
    expect(mergeLive([bar(1, "0"), bar(3, "0")], bar(2, "7"))).toEqual([bar(1, "0"), bar(3, "0")]);
    expect(tv2(mergeLive(h, bar(4, "1")))).toEqual([[1, "0"], [2, "0"], [3, "0"], [4, "1"]]);
  });
  const tv2 = (bars: readonly { t: number; v: string }[]) => bars.map((b) => [b.t, b.v]);
});
