// 17B CH-00 CH-05: frames are parsed at the boundary; schemas match channels.ts exactly and reject extra keys.
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type * as C from "@/shell/contracts/channels";
import * as S from "@/shell/contracts/schema";
import { MockFeed, SNAP_DELAY_MS } from "@/shell/contracts/mockFeed";
import { openChannel, type FeedTransport } from "@/shell/contracts/useChannel";

type Out<F> = F extends S.Schema<infer T> ? T : never;

describe("schema types equal the contract types (both directions)", () => {
  it("bodies, req ops and frames", () => {
    expectTypeOf<Out<typeof S.tickerBody>>().toEqualTypeOf<C.TickerBody>();
    expectTypeOf<Out<typeof S.bookBody>>().toEqualTypeOf<C.BookBody>();
    expectTypeOf<Out<typeof S.tapeBody>>().toEqualTypeOf<C.TapeBody>();
    expectTypeOf<Out<typeof S.candlesBody>>().toEqualTypeOf<C.CandlesBody>();
    expectTypeOf<Out<typeof S.meBody>>().toEqualTypeOf<C.MeTradingBody>();
    expectTypeOf<Out<typeof S.newsBody>>().toEqualTypeOf<C.NewsBody>();
    expectTypeOf<Out<typeof S.filingsBody>>().toEqualTypeOf<C.FilingsBody>();
    expectTypeOf<Out<typeof S.boardBody>>().toEqualTypeOf<C.BoardBody>();
    expectTypeOf<Out<typeof S.orderDraft>>().toEqualTypeOf<C.OrderDraft>();
    expectTypeOf<Out<typeof S.previewRes>>().toEqualTypeOf<C.PreviewRes>();
    expectTypeOf<Out<typeof S.assetDetail>>().toEqualTypeOf<C.AssetDetail>();
    expectTypeOf<Out<typeof S.candleHistoryReq>>().toEqualTypeOf<C.CandleHistoryReq>();
    expectTypeOf<Out<typeof S.candleHistoryRes>>().toEqualTypeOf<C.CandleHistoryRes>();
    expectTypeOf<Out<typeof S.intentResult>>().toEqualTypeOf<C.IntentResult>();
    expectTypeOf(S.parseFrame).returns.toEqualTypeOf<C.ServerFrame>();
  });
});

describe("CH-05 every mock frame passes; extra keys are rejected", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("100 ticks of every channel, every scenario", () => {
    const chans: C.ChannelName[] = ["ticker:wl_default", "book:ORCA", "tape:ORCA", "candles:ORCA:hour", "me", "news", "filings", "board:nw:global"];
    for (const sc of [{}, { tier: "terminal" as const, halt: "ORCA" }, { feed: "stale" as const }, { empty: true }]) {
      const f = new MockFeed(sc, { tickMs: 1000 });
      const stores = chans.map((ch) => openChannel(f, ch));
      const raws: unknown[] = [];
      const offs = chans.map((ch) => f.subscribe(ch, (r) => raws.push(r)));
      f.submit({ assetId: "MRDN", side: "BUY", type: "market", qty: "10", tif: "day" });
      vi.advanceTimersByTime(SNAP_DELAY_MS + 100_000);
      for (const r of raws) expect(() => S.parseFrame(r)).not.toThrow();
      for (const s of stores) { expect(["live", "stale"]).toContain(s.get().state); s.close(); }
      offs.forEach((o) => o());
    }
  });

  const row = { assetId: "A", last: "1.00", chg: null, chgPct: null, vol: "0", state: "CONTINUOUS", halted: false };
  it("rejects extra keys, non-decimal money and unknown frames", () => {
    expect(() => S.tickerRow({ ...row, ownerGroupId: "g1" })).toThrow(/ownerGroupId: key not in contract/);
    expect(() => S.tickerRow({ ...row, last: 1 })).toThrow(/last: expected decimal string/);
    expect(() => S.tickerRow({ ...row, last: "1e3" })).toThrow(S.ParseError);
    expect(() => S.parseFrame({ t: "snap", ch: "ticker:wl", seq: 1, tick: 1, body: { listId: "wl", rows: {} }, extra: 1 })).toThrow(/extra/);
    expect(() => S.parseFrame({ t: "snap", ch: "evil:x", seq: 1, tick: 1, body: {} })).toThrow(/unknown channel/);
    expect(() => S.parseFrame({ t: "nope" })).toThrow();
    expect(() => S.parseFrame({ t: "delta", ch: "me", seq: 2, tick: 1, ops: [{ op: "move", path: "/a" }] })).toThrow(/unknown delta op/);
    expect(() => S.parseFrame({ t: "err", ch: "me", code: "CHANNEL_DENIED", entity: "HALC" })).toThrow(/entity/);
    expect(S.tickerRow(row)).toEqual(row);
  });

  it("rejects a MISSING required field, one case per parsed shape", () => {
    const { last: _l, ...noLast } = row; void _l;
    expect(() => S.tickerRow(noLast)).toThrow(/last: missing required key/); // ticker row
    expect(() => S.tickerRow({ ...row, chg: undefined })).toThrow(S.ParseError); // nullable ≠ optional
    expect(() => S.parseFrame({ t: "snap", ch: "ticker:wl", tick: 1, body: { listId: "wl", rows: {} } })).toThrow(/seq: missing required key/); // envelope
    expect(() => S.parseFrame({ t: "snap", ch: "ticker:wl", seq: 1, tick: 1 })).toThrow(/body: missing required key/);
    expect(() => S.parseFrame({ t: "err", ch: "me" })).toThrow(/code: missing required key/); // error frame
    expect(() => S.parseFrame({ t: "delta", ch: "me", seq: 2, tick: 1 })).toThrow(/ops: missing required key/); // delta
    expect(() => S.parseFrame({ t: "delta", ch: "me", seq: 2, tick: 1, ops: [{ op: "set", path: "/nw" }] })).toThrow(/v: missing required key/); // delta op
  });

  it("a delta that would add a non-contract key never reaches the UI (store resyncs)", () => {
    let push: (r: unknown) => void = () => {};
    const resync = vi.fn();
    const t: FeedTransport = { tickMs: 1000, subscribe: (_c, fn) => { push = fn; return () => {}; }, resync };
    const store = openChannel(t, "ticker:wl");
    push({ t: "snap", ch: "ticker:wl", seq: 1, tick: 1, body: { listId: "wl", rows: { A: row } } });
    push({ t: "delta", ch: "ticker:wl", seq: 2, tick: 2, ops: [{ op: "set", path: "/rows/A/actorId", v: "x" }] });
    expect(store.get().body).toEqual({ listId: "wl", rows: { A: row } });
    expect(store.get().state).toBe("stale");
    expect(resync).toHaveBeenCalled();
    push({ t: "snap", ch: "ticker:wl", seq: 3, tick: 2, body: { listId: "wl", rows: { A: { ...row, extra: 1 } } } });
    expect(store.get().body).toEqual({ listId: "wl", rows: { A: row } }); // malformed snap dropped too
    store.close();
  });
});

describe("inherited names are not contract keys (Object.hasOwn, QA #34)", () => {
  const NAMES = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];
  // JSON.parse makes every key an own property, including "__proto__".
  const j = (s: string) => JSON.parse(s) as unknown;
  it.each(NAMES)("rejects extra envelope key %s", (k) => {
    expect(() => S.parseFrame(j(`{"t":"err","ch":"me","code":"INTERNAL","${k}":1}`))).toThrow(/key not in contract/);
    expect(() => S.parseFrame(j(`{"t":"snap","ch":"ticker:wl","seq":1,"tick":1,"body":{"listId":"wl","rows":{}},"${k}":1}`))).toThrow(/key not in contract/);
    expect(() => S.parseFrame(j(`{"t":"delta","ch":"me","seq":2,"tick":1,"ops":[],"${k}":1}`))).toThrow(/key not in contract/);
  });
  it.each(NAMES)("rejects extra delta-op key %s", (k) => {
    for (const op of ['{"op":"set","path":"/a","v":1', '{"op":"del","path":"/a"', '{"op":"ins","path":"/a","idx":0,"v":1', '{"op":"trim","path":"/a","keepLast":1']) {
      expect(() => S.parseFrame(j(`{"t":"delta","ch":"me","seq":2,"tick":1,"ops":[${op},"${k}":1}]}`))).toThrow(/key not in contract/);
    }
  });
  it.each(NAMES)("rejects extra body key %s", (k) => {
    expect(() => S.parseFrame(j(`{"t":"snap","ch":"ticker:wl","seq":1,"tick":1,"body":{"listId":"wl","rows":{},"${k}":1}}`))).toThrow(/key not in contract/);
  });
  it.each(NAMES)("an inherited name never satisfies a required key (%s)", (k) => {
    const schema = S.obj({ [k]: S.int });
    expect(() => schema(j("{}"))).toThrow(/missing required key/);
  });
  it("a record keeps an own __proto__ key as data and never swaps the prototype", () => {
    const out = S.rec(S.int)(j('{"__proto__":{"polluted":1},"a":1}'.replace('{"polluted":1}', "5")));
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("QA #34 round 2: optional-key schemas and inherited-name deltas", () => {
  const j = (s: string) => JSON.parse(s) as unknown;
  it("an opt-bearing schema rejects an inherited name as an extra key (boardRow via board body)", () => {
    const row = '{"rank":1,"handle":"a","country":"PA","constructor":1}';
    expect(() => S.parseFrame(j(`{"t":"snap","ch":"board:nwi:global","seq":1,"tick":1,"body":{"boardId":"nwi","scope":"global","rows":[${row}]}}`))).toThrow(/constructor: key not in contract/);
    expect(() => S.obj({ a: S.int }, { b: S.int })(j('{"a":1,"constructor":2}'))).toThrow(/constructor: key not in contract/);
  });
});
