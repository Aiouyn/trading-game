// 17B CH-00: mock feed + channel store (CH-01 … CH-04), with a fake clock at 1,000 ms per tick.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelName, MeTradingBody, TickerBody } from "@/shell/contracts/channels";
import { DeltaError, applyOps, deepEqual, diffOps } from "@/shell/contracts/delta";
import { DEFAULT_SCENARIO, MockFeed, SNAP_DELAY_MS, exchangeFeeMinor, fmt, scenarioFromQuery } from "@/shell/contracts/mockFeed";
import { openChannel, staleAfterMs, type FeedTransport } from "@/shell/contracts/useChannel";
import { parseFrame } from "@/shell/contracts/schema";
import { intentLog } from "@/shell/intentLog";

const TICK = 1000;
const CHANNELS: ChannelName[] = ["ticker:wl_default", "book:HALC", "tape:HALC", "candles:HALC:tick", "candles:HALC:hour", "candles:GX:day", "me", "news", "filings", "board:nw:global"];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const feedOf = (s = {}) => new MockFeed(s, { tickMs: TICK });
/** Record raw frames exactly as delivered. */
function record(feed: FeedTransport, ch: ChannelName) {
  const frames: unknown[] = [];
  const off = feed.subscribe(ch, (f) => frames.push(f));
  return { frames, off };
}

describe("CH-01 loading → live; snap + per-tick deltas reproduce the server state", () => {
  it("ticker:wl_default over 100 ticks", () => {
    const feed = feedOf();
    const store = openChannel(feed, "ticker:wl_default");
    expect(store.get()).toEqual({ state: "loading", body: null, tick: null });
    vi.advanceTimersByTime(SNAP_DELAY_MS);
    expect(store.get().state).toBe("live");
    expect(Object.keys((store.get().body as TickerBody).rows)).toHaveLength(8);
    for (let n = 1; n <= 100; n++) {
      vi.advanceTimersByTime(TICK);
      const v = store.get();
      expect(v.state).toBe("live");
      expect(v.tick).toBe(feed.tick);
      expect(v.body).toEqual(feed.body("ticker:wl_default"));
    }
    store.close();
  });

  it.each(CHANNELS)("%s: applying 100 ticks of deltas to the snap equals the full state", (ch) => {
    const feed = feedOf({ tier: "terminal" });
    const { frames, off } = record(feed, ch);
    feed.submit({ assetId: "HALC", side: "BUY", type: "market", qty: "100", tif: "day" });
    vi.advanceTimersByTime(SNAP_DELAY_MS + 100 * TICK);
    off();
    const [snap, ...deltas] = frames.map(parseFrame);
    expect(snap!.t).toBe("snap");
    expect(deltas).toHaveLength(100);
    let body = (snap as { body: unknown }).body;
    deltas.forEach((d, i) => {
      expect(d.t).toBe("delta");
      if (d.t !== "delta") return;
      expect(d.seq).toBe(i + 2);
      body = applyOps(body, d.ops);
    });
    expect(body).toEqual(feed.body(ch));
  });

  it("is deterministic from the seed", () => {
    const run = (seed: number) => { const f = feedOf({ seed }); const r = record(f, "book:HALC"); vi.advanceTimersByTime(SNAP_DELAY_MS + 30 * TICK); r.off(); return JSON.stringify(r.frames); };
    expect(run(17)).toBe(run(17));
    expect(run(17)).not.toBe(run(18));
  });

  it("rings diff to ins + trim (tape keepLast 200)", () => {
    const feed = feedOf();
    const { frames, off } = record(feed, "tape:HALC");
    vi.advanceTimersByTime(SNAP_DELAY_MS + 205 * TICK);
    off();
    const last = parseFrame(frames.at(-1));
    expect(last.t === "delta" && last.ops.map((o) => o.op)).toEqual(["ins", "trim"]);
    expect((feed.body("tape:HALC") as { prints: unknown[] }).prints).toHaveLength(200);
  });
});

describe("CH-02 stale after 2 missed ticks; a fresh snap returns to live", () => {
  it("?feed=stale script", () => {
    const feed = feedOf({ feed: "stale" });
    const store = openChannel(feed, "ticker:wl_default");
    vi.advanceTimersByTime(SNAP_DELAY_MS);
    expect(store.get().state).toBe("live");
    vi.advanceTimersByTime(2 * TICK); // ticks 1, 2 delivered
    expect(store.get().state).toBe("live");
    const lastTick = store.get().tick;
    vi.advanceTimersByTime(2 * TICK); // ticks 3, 4 missed: 2 missed ticks, not yet past the slack
    expect(store.get().state).toBe("live");
    vi.advanceTimersByTime(staleAfterMs(TICK) - 2 * TICK); // past 2 missed ticks + slack
    expect(store.get().state).toBe("stale");
    expect(store.get().tick).toBe(lastTick); // last good body kept, flagged stale
    vi.advanceTimersByTime(2 * TICK); // tick 6: fresh snap
    expect(store.get().state).toBe("live");
    expect(store.get().body).toEqual(feed.body("ticker:wl_default"));
    store.close();
  });

  it("a seq gap marks stale and resyncs to a fresh snap", () => {
    let push: (r: unknown) => void = () => {};
    const resync = vi.fn();
    const t: FeedTransport = { tickMs: TICK, subscribe: (_c, fn) => { push = fn; return () => {}; }, resync };
    const store = openChannel(t, "filings");
    push({ t: "snap", ch: "filings", seq: 1, tick: 5, body: { items: [] } });
    push({ t: "delta", ch: "filings", seq: 3, tick: 6, ops: [] });
    expect(store.get().state).toBe("stale");
    expect(resync).toHaveBeenCalledWith("filings");
    push({ t: "snap", ch: "filings", seq: 4, tick: 7, body: { items: [] } });
    expect(store.get().state).toBe("live");
    store.close();
  });
});

describe("CH-03 denied / error carry no body and no entity hint", () => {
  it.each([["denied", "denied"], ["error", "error"]] as const)("?feed=%s", (mode, state) => {
    const feed = feedOf({ feed: mode });
    const store = openChannel(feed, "book:HALC");
    vi.advanceTimersByTime(SNAP_DELAY_MS + 5 * TICK);
    expect(store.get()).toEqual({ state, body: null, tick: null });
    expect(JSON.stringify(store.get())).not.toContain("HALC");
    store.close();
  });
  it("the denied frame itself names only the channel and the code", () => {
    const feed = feedOf({ feed: "denied" });
    const { frames } = record(feed, "me");
    vi.advanceTimersByTime(SNAP_DELAY_MS);
    expect(frames).toEqual([{ t: "err", ch: "me", code: "CHANNEL_DENIED" }]);
  });
  it("?feed=loading never leaves loading", () => {
    const store = openChannel(feedOf({ feed: "loading" }), "news");
    vi.advanceTimersByTime(10 * TICK);
    expect(store.get().state).toBe("loading");
    store.close();
  });
});

describe("CH-04 every Money / Price / Qty is a decimal string", () => {
  const DEC = /^-?\d+(\.\d+)?$/;
  const FIELDS = new Set(["last", "chg", "vol", "price", "qty", "imbalance", "o", "h", "l", "c", "v", "avgCost", "mark", "value", "upl", "pledgedQty", "lentQty", "pnlPct", "weightPct", "filled", "limit", "stop", "avgPrice", "fee", "nw", "amount", "estFill", "buyingPowerAfter", "impactMoney", "total", "firstTradeCapRemaining"]);
  const walk = (v: unknown, key: string, bad: string[]) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key, bad));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => (k === "balances" ? Object.values(x as object).forEach((b) => walk(b, "amount", bad)) : walk(x, k, bad)));
    else if (FIELDS.has(key) && v !== null && !(typeof v === "string" && DEC.test(v))) bad.push(`${key}=${JSON.stringify(v)}`);
  };
  it("fixtures, every channel body over 50 ticks, previews and candle history", () => {
    for (const s of [{}, { tier: "terminal" as const }, { halt: "HALC", thin: "VOLT" }, { empty: true }]) {
      const feed = feedOf(s);
      const bad: string[] = [];
      feed.submit({ assetId: "HALC", side: "SELL", type: "market", qty: "50", tif: "day" });
      feed.submit({ assetId: "MRDN", side: "BUY", type: "limit", qty: "10", limit: "18.00", tif: "gtc" });
      for (let i = 0; i < 50; i++) { feed.advance(); CHANNELS.forEach((ch) => walk(feed.body(ch), "", bad)); }
      walk(feed.preview({ assetId: "HALC", side: "BUY", type: "market", qty: "1000", tif: "day" }), "", bad);
      walk(feed.candleHistory({ assetId: "HALC", res: "hour", from: 0, to: 3000 }), "", bad);
      expect(bad).toEqual([]);
    }
  });
  it("fmt formats minor units without floats", () => {
    expect([fmt(4218, 2), fmt(-5, 2), fmt(0, 2), fmt(7, 0), fmt(-0, 4)]).toEqual(["42.18", "-0.05", "0.00", "7", "0.0000"]);
  });
});

describe("mock scenarios, intents and req ops", () => {
  it("halt / thin / tier shape the book and ticker", () => {
    const feed = feedOf({ halt: "HALC", thin: "VOLT", tier: "terminal" });
    feed.advance();
    const t = feed.body("ticker:wl_default") as TickerBody;
    expect(t.rows.HALC).toMatchObject({ state: "HALTED", halted: true });
    expect(t.rows.MRDN).toMatchObject({ state: "CONTINUOUS", halted: false });
    expect(feed.body("book:HALC")).toMatchObject({ bids: [], asks: [] });
    expect((feed.body("book:VOLT") as { bids: unknown[] }).bids).toHaveLength(1);
    expect((feed.body("book:MRDN") as { bids: unknown[] }).bids).toHaveLength(10);
    expect((feedOf().body("book:MRDN") as { bids: unknown[] }).bids).toHaveLength(3);
  });
  it("pricedInBand only for Terminal (Q6)", () => {
    const has = (tier: "free" | "terminal") => JSON.stringify(feedOf({ tier }).body("news")).includes("pricedInBand");
    expect([has("free"), has("terminal")]).toEqual([false, true]);
  });
  it("an intent is logged and its IntentResult + MyFill land on `me` one tick later", () => {
    const feed = feedOf();
    const before = intentLog().length;
    const id = feed.submit({ assetId: "MRDN", side: "BUY", type: "market", qty: "100", tif: "day" });
    expect(intentLog().length).toBe(before + 1);
    expect(intentLog().at(-1)).toMatchObject({ kind: "mkt.order.place", payload: { intentId: id, assetId: "MRDN", qty: "100" } });
    expect((feed.body("me") as MeTradingBody).intents).toEqual([]);
    feed.advance();
    const me = feed.body("me") as MeTradingBody;
    expect(me.intents).toEqual([expect.objectContaining({ intentId: id, status: "ACCEPTED", tick: feed.tick })]);
    expect(me.fills).toEqual([expect.objectContaining({ assetId: "MRDN", side: "BUY", qty: "100", tick: feed.tick })]);
    expect(me.positions.MRDN!.qty).toBe("100");
  });
  it("?reject=CODE rejects; a halted asset queues a market order for the reopen (E-98 (1)); oversell is MKT_NO_LOCATE (E-96 (4))", () => {
    const f = feedOf({ reject: "MKT_INSUFFICIENT_BP" });
    f.submit({ assetId: "MRDN", side: "BUY", type: "market", qty: "1", tif: "day" });
    f.advance();
    expect((f.body("me") as MeTradingBody).intents[0]).toMatchObject({ status: "REJECTED", rejectCode: "MKT_INSUFFICIENT_BP" });
    expect((f.body("me") as MeTradingBody).fills).toEqual([]);
    const h = feedOf({ halt: "HALC" });
    h.submit({ assetId: "HALC", side: "SELL", type: "market", qty: "1", tif: "day" });
    h.advance();
    const hm = h.body("me") as MeTradingBody;
    const orderId = hm.intents[0]!.effects![0]!.replace("order:", "");
    expect(hm.intents[0]).toMatchObject({ status: "ACCEPTED", effects: [`order:${orderId}`] });
    expect(hm.orders[orderId]).toMatchObject({ assetId: "HALC", side: "SELL", type: "market", qty: "1", filled: "0", tif: "day", status: "QUEUED_AUCTION" });
    expect(hm.fills).toEqual([]);
    const o = feedOf({ empty: true });
    o.submit({ assetId: "HALC", side: "SELL", type: "market", qty: "1", tif: "day" });
    o.advance();
    const om = o.body("me") as MeTradingBody;
    expect(om.intents[0]).toMatchObject({ status: "REJECTED", rejectCode: "MKT_NO_LOCATE" });
    expect(om.positions).toEqual({});
  });
  it("?empty=1 has no positions, orders, fills, news or filings", () => {
    const f = feedOf({ empty: true });
    expect(f.body("me")).toMatchObject({ positions: {}, orders: {}, fills: [] });
    expect(f.body("news")).toEqual({ items: [] });
    expect(f.body("filings")).toEqual({ items: [] });
  });
  it("intent.preview is a fixed table against server state, advisory with computedAtTick", () => {
    const f = feedOf();
    const draft = { assetId: "HALC", side: "BUY", type: "market", qty: "400", tif: "day" } as const;
    const p = f.preview(draft);
    // Pinned literals (QA #84 M7/M8): cash FDL 324,714.15 at the opening marks. Fee per Quant E-96 (2): taker 3 bp,
    // minimum 0.10, half-even. A buy spends notional + fee + impact; a sell adds its net proceeds.
    expect(f.body("me")).toMatchObject({ balances: { FDL: "324714.15" } });
    expect(p).toEqual({ valid: true, price: "42.18", estFill: "42.18", fee: "5.06", impactBp: "1", impactMoney: "1.69", total: "16878.75",
      buyingPowerAfter: "307835.40", computedAtTick: f.tick, firstTradeCapRemaining: null });
    expect(f.preview({ ...draft, side: "SELL", qty: "40" })).toMatchObject({ fee: "0.51", impactMoney: "0.17", total: "1686.52", buyingPowerAfter: "326400.67" });
    expect(f.preview({ ...draft, qty: "3" })).toMatchObject({ fee: "0.10", impactMoney: "0.01", total: "126.65", buyingPowerAfter: "324587.50" });
    // Halted: the order waits for the reopen auction, so the estimate uses the 1 bp auction rate.
    expect(feedOf({ halt: "HALC" }).preview(draft)).toMatchObject({ fee: "1.69", total: "16875.38", buyingPowerAfter: "307838.77" });
    expect(f.preview(draft)).toEqual(p);
    expect(f.preview({ ...draft, qty: "2000" }).impactBp).toBe("4");
    const halted = feedOf({ halt: "HALC" }).preview(draft);
    expect(halted.valid).toBe(true);
    expect(halted).not.toHaveProperty("reasonCode");
    expect(feedOf({ empty: true }).preview({ ...draft, side: "SELL", qty: "1" })).toMatchObject({ valid: false, reasonCode: "MKT_NO_LOCATE" });
    expect(f.preview({ ...draft, qty: "0" })).toMatchObject({ valid: false, reasonCode: "MKT_BAD_QTY" });
  });
  it("asset.detail exposes only public 05 §2.2 fields; candle history aligns and caps", () => {
    const f = feedOf();
    expect(Object.keys(f.assetDetail("HALC")!).sort()).toEqual(["assetId", "bloc", "ccy", "class", "displayDecimals", "licenseTier", "name", "qtyDecimals", "sector", "ticker", "tradingState"]);
    expect(f.assetDetail("NOPE")).toBeNull();
    const h = f.candleHistory({ assetId: "HALC", res: "hour", from: 7, to: 400 }).bars;
    expect(h.every((b) => b.t % 30 === 0)).toBe(true);
    expect(f.candleHistory({ assetId: "HALC", res: "tick", from: 0, to: 9000 }).bars).toHaveLength(5000);
    expect(f.candleHistory({ assetId: "HALC", res: "day", from: 0, to: 7200 })).toEqual(feedOf().candleHistory({ assetId: "HALC", res: "day", from: 0, to: 7200 }));
  });
});

describe("URL scenario (build-gated)", () => {
  it("parses the documented params and ignores junk", () => {
    expect(scenarioFromQuery(new URLSearchParams("feed=stale&halt=HALC&thin=VOLT&tier=terminal&empty=1&reject=MKT_INSUFFICIENT_BP&seed=9&nw=200000&pledge=HALC:40")))
      .toEqual({ seed: 9, feed: "stale", halt: "HALC", thin: "VOLT", tier: "terminal", empty: true, reject: "MKT_INSUFFICIENT_BP", nw: "200000", pledge: { assetId: "HALC", qty: 40 }, replyMs: 0, cancelReject: null, cancelKeep: null, partFill: null, cancelGone: false });
    expect(scenarioFromQuery(new URLSearchParams("replyMs=1500")).replyMs).toBe(1500);
    expect(scenarioFromQuery(new URLSearchParams("cancelReject=MKT_ORDER_NOT_FOUND")).cancelReject).toBe("MKT_ORDER_NOT_FOUND");
    for (const junk of ["x", "<x>", "mkt_x", "A"]) expect(scenarioFromQuery(new URLSearchParams(`cancelReject=${junk}`)).cancelReject).toBeNull();
    expect(scenarioFromQuery(new URLSearchParams("cancelKeep=QUEUED_AUCTION&partFill=18&cancelGone=1"))).toMatchObject({ cancelKeep: "QUEUED_AUCTION", partFill: 18, cancelGone: true });
    for (const junk of ["CANCELLED", "working", "x"]) expect(scenarioFromQuery(new URLSearchParams(`cancelKeep=${junk}`)).cancelKeep).toBeNull();
    for (const junk of ["0", "-3", "1.5", "x"]) expect(scenarioFromQuery(new URLSearchParams(`partFill=${junk}`)).partFill).toBeNull();
    expect(scenarioFromQuery(new URLSearchParams("cancelGone=yes")).cancelGone).toBe(false);
    for (const junk of ["-5", "1.5", "x", "60001"]) expect(scenarioFromQuery(new URLSearchParams(`replyMs=${junk}`)).replyMs).toBe(0);
    expect(scenarioFromQuery(new URLSearchParams("feed=boom&halt=ZZZ&reject=<x>&seed=-1&nw=1e9&pledge=ZZZ:4"))).toEqual(DEFAULT_SCENARIO);
    expect(scenarioFromQuery(new URLSearchParams("pledge=HALC:0")).pledge).toBeNull();
  });
  it("QUAY_HOOKS=0 compiles the overrides out: the URL is ignored", async () => {
    vi.resetModules(); vi.stubEnv("QUAY_HOOKS", "0");
    const m = await import("@/shell/contracts/mockFeed");
    const c = await import("@/shell/mockChannels");
    expect(m.scenarioFromQuery(new URLSearchParams("feed=denied&halt=HALC"))).toEqual(m.DEFAULT_SCENARIO);
    expect(c.mockChannels(new URLSearchParams("rank=R6&halted=1&load=fail&conn=reconnecting"))).toEqual(c.defaultChannels());
    vi.unstubAllEnvs(); vi.resetModules();
  });
});

describe("delta ops", () => {
  it("diff then apply round-trips, including del and rings", () => {
    const a = { rows: { A: { x: "1" }, B: { x: "2" } }, items: [1, 2, 3] };
    const b = { rows: { A: { x: "5" }, C: { x: "9" } }, items: [2, 3, 4, 5] };
    const ops = diffOps(a, b, new Set(["/items"]));
    expect(ops).toEqual([
      { op: "del", path: "/rows/B" }, { op: "set", path: "/rows/A/x", v: "5" }, { op: "set", path: "/rows/C", v: { x: "9" } },
      { op: "ins", path: "/items", idx: 3, v: 4 }, { op: "ins", path: "/items", idx: 4, v: 5 }, { op: "trim", path: "/items", keepLast: 4 },
    ]);
    expect(deepEqual(applyOps(a, ops), b)).toBe(true);
    expect(a.rows.B).toEqual({ x: "2" }); // immutable
  });
  it("unappliable ops throw (the client then resyncs)", () => {
    expect(() => applyOps({ a: 1 }, [{ op: "set", path: "/b/c", v: 1 }])).toThrow(DeltaError);
    expect(() => applyOps({ a: [] }, [{ op: "ins", path: "/a", idx: 3, v: 1 }])).toThrow(DeltaError);
    expect(() => applyOps({ a: 1 }, [{ op: "del", path: "/z" }])).toThrow(DeltaError);
  });
});

describe("applyOps never treats inherited names as present (QA #34 round 2)", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])("del /%s on a body that doesn't own it throws and leaves the prototype alone", async (k) => {
    const { applyOps, DeltaError } = await import("@/shell/contracts/delta");
    const body = { a: 1 };
    expect(() => applyOps(body, [{ op: "del", path: `/${k}` }])).toThrow(DeltaError);
    expect(() => applyOps({ n: { a: 1 } }, [{ op: "del", path: `/n/${k}` }])).toThrow(DeltaError);
    expect(Object.getPrototypeOf(body)).toBe(Object.prototype);
    expect(typeof ({} as Record<string, unknown>).constructor).toBe("function");
  });
});

describe("applyOps mid-path walk follows own keys only (QA #34 round 3)", () => {
  const frame = (path: string) => JSON.parse(`{"body":{"a":{"b":1}},"ops":[{"op":"set","path":"${path}","v":"yes"}]}`) as { body: Record<string, unknown>; ops: import("@/shell/contracts/channels").DeltaOp[] };
  it.each(["/__proto__/polluted", "/a/__proto__/polluted", "/constructor/prototype/x", "/a/constructor/prototype/x"])("set %s throws DeltaError and pollutes nothing", async (path) => {
    const { applyOps, DeltaError } = await import("@/shell/contracts/delta");
    const f = frame(path);
    expect(() => applyOps(f.body, f.ops)).toThrow(DeltaError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).x).toBeUndefined();
    expect(Object.getPrototypeOf(f.body)).toBe(Object.prototype);
  });
});

describe("exchange fee (Quant E-96 (2)) and the order door", () => {
  it("fee = max(0.10, rate x notional), half-even to the cent", () => {
    expect(exchangeFeeMinor(12_654, 3)).toBe(10); // 3 HALC at 42.18: 0.038 -> the 0.10 minimum
    expect(exchangeFeeMinor(100_000, 3)).toBe(30); // 100 at 10.00 -> 0.30 (errata example)
    expect(exchangeFeeMinor(50_000_000, 3)).toBe(15_000);
    expect(exchangeFeeMinor(2_550_000, 1)).toBe(255);
    expect(exchangeFeeMinor(55_000, 1)).toBe(10); // 5.5 -> minimum
    expect(exchangeFeeMinor(250_000, 1)).toBe(25);
    expect(exchangeFeeMinor(125_000, 1)).toBe(12); // 12.5 -> 12 (even)
    expect(exchangeFeeMinor(135_000, 1)).toBe(14); // 13.5 -> 14 (even)
  });
  it("a filled market buy pays notional + the taker fee from cash; the fill reports that fee", () => {
    const f = feedOf();
    f.submit({ assetId: "HALC", side: "BUY", type: "market", qty: "40", tif: "day" });
    f.advance();
    const me = f.body("me") as MeTradingBody;
    const fill = me.fills.at(-1)!;
    const px = Math.round(Number(fill.price) * 100);
    expect(fill.fee).toBe(fmt(exchangeFeeMinor(px * 40, 3), 2));
    expect(Math.round(Number(me.balances.FDL) * 100)).toBe(32_471_415 - px * 40 - exchangeFeeMinor(px * 40, 3));
  });
  it("?replyMs holds the submit reply but logs the intent at once", async () => {
    const door = feedOf({ replyMs: 1500 }).orderDoor();
    const before = intentLog().length;
    const reply = door.submit({ assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" });
    expect(intentLog().length).toBe(before + 1);
    expect(reply).toBeInstanceOf(Promise);
    let got: string | null = null;
    void Promise.resolve(reply).then((id) => { got = id; });
    await vi.advanceTimersByTimeAsync(1499);
    expect(got).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(got).toMatch(/^i-\d+$/);
    expect(typeof feedOf().orderDoor().submit({ assetId: "HALC", side: "BUY", type: "market", qty: "1", tif: "day" })).toBe("string");
  });
});
