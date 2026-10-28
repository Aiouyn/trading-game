// Candle history for the Broker price chart (UI card 7). The client has no `req` path yet: `FeedTransport` only
// subscribes and resyncs, so this file is the one client door to GET /api/v1/history/candles (19 §3.10.1).
// Engine Dev reviews it alone, so everything it relies on is stated here:
//  - packages/engine has no candle model yet. What this file takes from it: a tick is a non-negative safe integer
//    (core/types.ts `Tick`; calendar `ticksToGameDate` throws I0.tick below 0), an hour is 30 ticks and a day 720
//    (calendar/constants.ts TICKS_PER_GAME_HOUR / TICKS_PER_GAME_DAY). Bar spans are those: tick 1, hour 30, day 720.
//  - Bar fields are the 17B contract's `Candle` (channels.ts): `t` (the bar's first tick, span-aligned), o/h/l/c as
//    decimal Price strings, v a decimal Qty string. Nothing here does arithmetic on a price; `t` is a tick.
//  - Every value crossing the boundary is parsed: the request with `candleHistoryReq` before it leaves, the reply
//    with `candleHistoryRes` plus the bar rules below. A reply that breaks any rule is `badReply` and the chart shows
//    its error state, never a partial plot: t >= 0, t on the span, from <= t <= to (from aligned down), strictly
//    ascending, at most 5,000 bars.
//  - Ranges (card 7 Q3): 1H = 30 tick bars, 1D = 720 tick bars, 1W = 168 hour bars, 1Q = 2,184 hour bars, 1Y = 364
//    day bars, All = every day bar, fetched oldest first in calls of at most 5,000 bars. `to` is the live candle's t;
//    from = to - (bars - 1) * span, clamped at tick 0 (there are no ticks before genesis; back-history is ENGINE-TBD).
//    A short reply is plotted as it is, with no padding.
//  - SWAP (transport): replace `mockHistory()` with the 19 `req` / HTTP door. It must answer
//    `candleHistory(req)` with the raw JSON (`unknown`, sync or a Promise); a network failure should reject or
//    return something that does not parse, which reads as `badReply`. Nothing else in the chart changes.
//  - Test hooks (`?history=bad|flaky|hold` via the feed scenario, `window.__quayHistory`) exist only in a QUAY_HOOKS build.
import type { Candle, CandleHistoryReq, CandleRes } from "./channels";
import { candleHistoryReq, candleHistoryRes, ParseError } from "./schema";
import { getFeed } from "./useChannel";
import type { HistoryHook } from "./mockFeed";
import type { AssetId, OrderError, OrderResult } from "./orders";

// Build-time gate, module-local (see mockFeed.ts: an imported const would ship the gated branch).
const MOCK_HOOKS = process.env.QUAY_HOOKS === "1";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** An engine tick: a safe integer >= 0. */
export type GameTick = Brand<number, "GameTick">;
/** A decimal string as the server sent it (Price o/h/l/c, Qty v). */
export type DecText = Brand<string, "DecText">;
/** One parsed bar: `t` is on its resolution's span. */
export interface Bar { readonly t: GameTick; readonly o: DecText; readonly h: DecText; readonly l: DecText; readonly c: DecText; readonly v: DecText }

export const MAX_BARS_PER_CALL = 5000;
/** Ticks per bar (engine calendar: 30 ticks an hour, 720 a day). */
export const SPAN: Readonly<Record<CandleRes, number>> = { tick: 1, hour: 30, day: 720 };

export const CHART_RANGES = ["1H", "1D", "1W", "1Q", "1Y", "All"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const DEFAULT_RANGE: ChartRange = "1D";
/** Card 7 Q3. `bars: null` = all of it, paged. */
const PLAN: Readonly<Record<ChartRange, { res: CandleRes; bars: number | null }>> = {
  "1H": { res: "tick", bars: 30 }, "1D": { res: "tick", bars: 720 },
  "1W": { res: "hour", bars: 168 }, "1Q": { res: "hour", bars: 2184 },
  "1Y": { res: "day", bars: 364 }, All: { res: "day", bars: null },
};
export const resOf = (range: ChartRange): CandleRes => PLAN[range].res;

export function parseTick(v: unknown, path = "t"): GameTick {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new ParseError(path, "expected a tick (safe integer >= 0)");
  return v as GameTick;
}
const onSpan = (t: number, res: CandleRes): boolean => t % SPAN[res] === 0;

export interface HistoryReq { readonly assetId: AssetId; readonly res: CandleRes; readonly from: GameTick; readonly to: GameTick }

/** The calls for one range, oldest first. `liveT` is the live candle's t (on the span of the range's resolution). */
export function rangeRequests(assetId: AssetId, range: ChartRange, liveT: GameTick): HistoryReq[] {
  const { res, bars } = PLAN[range];
  const span = SPAN[res];
  if (bars !== null) return [{ assetId, res, from: Math.max(0, liveT - (bars - 1) * span) as GameTick, to: liveT }];
  const reqs: HistoryReq[] = [];
  for (let from = 0; from <= liveT; from += MAX_BARS_PER_CALL * span) {
    reqs.push({ assetId, res, from: from as GameTick, to: Math.min(liveT, from + (MAX_BARS_PER_CALL - 1) * span) as GameTick });
  }
  return reqs;
}

/** One bar, checked against its resolution. Used for history bars and the live candle alike. */
export function parseBar(c: Candle, res: CandleRes, path = "bar"): Bar {
  const t = parseTick(c.t, `${path}/t`);
  if (!onSpan(t, res)) throw new ParseError(`${path}/t`, `not on the ${res} span`);
  return c as unknown as Bar;
}

/** A history reply: the schema, then the bar rules (header). Throws ParseError. */
export function parseHistory(raw: unknown, req: HistoryReq): Bar[] {
  const { bars } = candleHistoryRes(raw, "history");
  if (bars.length > MAX_BARS_PER_CALL) throw new ParseError("history/bars", `more than ${MAX_BARS_PER_CALL} bars`);
  const lo = req.from - (req.from % SPAN[req.res]);
  let prev = -1;
  return bars.map((c, i) => {
    const b = parseBar(c, req.res, `history/bars/${i}`);
    if (b.t < lo || b.t > req.to) throw new ParseError(`history/bars/${i}/t`, "outside the request");
    if (b.t <= prev) throw new ParseError(`history/bars/${i}/t`, "not ascending");
    prev = b.t;
    return b;
  });
}

/** What a transport must answer. The reply is `unknown` on purpose: it is parsed here, never trusted. */
export interface HistoryTransport { candleHistory(req: CandleHistoryReq): unknown }

const isHistoryTransport = (v: unknown): v is HistoryTransport =>
  typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).candleHistory === "function";

/** QUAY_HOOKS only: the feed scenario's `?history=bad` (every reply malformed), `flaky` (the first one), `hold` (never answers). */
function historyHook(feed: object): HistoryHook {
  const sc = (feed as { scenario?: { history?: HistoryHook } }).scenario;
  return sc?.history ?? null;
}
interface HistoryLog { reqs: CandleHistoryReq[] }
function hookLog(): HistoryLog | null {
  if (!MOCK_HOOKS || typeof window === "undefined") return null;
  const w = window as Window & { __quayHistory?: HistoryLog };
  return (w.__quayHistory ??= { reqs: [] });
}

/** The mock transport: the page feed's `candleHistory` (`getFeed()`, a MockFeed in this build); null if it has none. */
export function mockHistory(): HistoryTransport | null {
  const feed: unknown = getFeed();
  if (!isHistoryTransport(feed)) return null;
  if (!MOCK_HOOKS) return feed;
  const hook = historyHook(feed);
  const log = hookLog();
  return {
    candleHistory(req) {
      log?.reqs.push(req);
      if (hook === "hold") return new Promise<never>(() => {});
      if (hook === "bad" || (hook === "flaky" && log?.reqs.length === 1)) return { bars: [{ t: req.to, o: "1", h: "1", l: "1", c: "x", v: "0" }] };
      return feed.candleHistory(req);
    },
  };
}

export type HistoryResult = OrderResult<Bar[]>;
const fail = (error: OrderError): { ok: false; error: OrderError } => ({ ok: false, error });

/** One call (the card's contract, after orders.ts): the request parsed before it leaves, the reply after. */
export async function loadCandles(req: HistoryReq, transport: HistoryTransport | null = mockHistory()): Promise<HistoryResult> {
  if (!transport) return fail({ kind: "noTransport" });
  try {
    return { ok: true, value: parseHistory(await transport.candleHistory(candleHistoryReq(req, "req")), req) };
  } catch (e) {
    return fail({ kind: "badReply", detail: e instanceof Error ? e.message : "transport failed" });
  }
}

/** Every call of a range, oldest first, one at a time; the first failure fails the range (no partial plot). */
export async function loadRange(assetId: AssetId, range: ChartRange, liveT: GameTick, transport: HistoryTransport | null = mockHistory()): Promise<HistoryResult> {
  const out: Bar[] = [];
  for (const req of rangeRequests(assetId, range, liveT)) {
    const r = await loadCandles(req, transport);
    if (!r.ok) return r;
    for (const b of r.value) out.push(b);
  }
  return { ok: true, value: out };
}

/** The live candle onto the plotted bars: same t replaces the last bar, a newer t appends, an older one is dropped. */
export function mergeLive(bars: readonly Bar[], live: Bar): readonly Bar[] {
  const last = bars[bars.length - 1];
  if (!last || live.t > last.t) return [...bars, live];
  if (live.t === last.t) return [...bars.slice(0, -1), live];
  return bars;
}
