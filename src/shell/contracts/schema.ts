// 17B CH-00 runtime schemas: parse at the boundary. Strict (extra keys are rejected, the 19 Rule 3.8.3 allowlist
// analogue), decimal strings for every Money/Price/Qty (G2). Hand-written combinators instead of zod/ts-to-zod
// (no new dependency, see the PR's open question); each schema is checked against channels.ts in both directions
// by tests/unit/17b/CH-00-schema.test.ts, so the two can't drift.
import type {
  AuctionResult, BoardBody, BoardRow, BookBody, Candle, CandleHistoryReq, CandleHistoryRes, CandleRes, CandlesBody, ChannelErr,
  ChannelName, Delta, DeltaOp, DepthLevel, Filing, FilingsBody, IntentResult, MeTradingBody, MyFill, NewsBody, NwBreakdown,
  NwStats, OpenOrder, OrderDraft, Position, PreviewRes, AssetDetail, RestrictedBucket, ServerFrame, Side, Snap, TapeBody,
  TapePrint, TickerBody, TickerRow, TradingState, WireItem, WireKind,
} from "./channels";

export class ParseError extends Error {
  constructor(readonly path: string, msg: string) { super(`${path || "$"}: ${msg}`); }
}
export type Schema<T> = (v: unknown, path?: string) => T;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (p: string, m: string): never => { throw new ParseError(p, m); };

export const DECIMAL = /^-?\d+(\.\d+)?$/;
export const str: Schema<string> = (v, p = "") => (typeof v === "string" ? v : fail(p, "expected string"));
/** Money / Price / Qty / pp strings: decimal strings only (G2, CH-04). */
export const dec: Schema<string> = (v, p = "") => (typeof v === "string" && DECIMAL.test(v) ? v : fail(p, "expected decimal string"));
export const int: Schema<number> = (v, p = "") => (Number.isSafeInteger(v) ? (v as number) : fail(p, "expected integer"));
export const num: Schema<number> = (v, p = "") => (typeof v === "number" && Number.isFinite(v) ? v : fail(p, "expected number"));
export const bool: Schema<boolean> = (v, p = "") => (typeof v === "boolean" ? v : fail(p, "expected boolean"));
export const unknownV: Schema<unknown> = (v) => v;
export const lit = <const L extends readonly (string | number | boolean)[]>(...ls: L): Schema<L[number]> =>
  (v, p = "") => (ls.includes(v as L[number]) ? (v as L[number]) : fail(p, `expected one of ${ls.join("|")}`));
export const nullable = <T>(s: Schema<T>): Schema<T | null> => (v, p = "") => (v === null ? null : s(v, p));
export const arr = <T>(s: Schema<T>): Schema<T[]> => (v, p = "") => (Array.isArray(v) ? v.map((x, i) => s(x, `${p}/${i}`)) : fail(p, "expected array"));
export const rec = <T>(s: Schema<T>): Schema<Record<string, T>> => (v, p = "") => {
  if (!isObj(v)) return fail(p, "expected object");
  const out: Record<string, T> = {};
  for (const [k, x] of Object.entries(v)) out[k] = s(x, `${p}/${k}`);
  return out;
};

type Shape = Record<string, Schema<unknown>>;
type Out<S extends Shape, O extends Shape> = { [K in keyof S]: ReturnType<S[K]> } & { [K in keyof O]?: ReturnType<O[K]> };
/** Strict object: required keys `req`, optional keys `opt` (absent, never undefined); any other key is rejected. */
export function obj<S extends Shape, O extends Shape = Record<never, never>>(req: S, opt?: O): Schema<{ [K in keyof Out<S, O>]: Out<S, O>[K] }> {
  return (v, p = "") => {
    if (!isObj(v)) return fail(p, "expected object");
    for (const k of Object.keys(v)) if (!(k in req) && !(opt && k in opt)) fail(`${p}/${k}`, "key not in contract");
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(req)) out[k] = s(v[k], `${p}/${k}`);
    if (opt) for (const [k, s] of Object.entries(opt)) if (k in v) out[k] = s(v[k], `${p}/${k}`);
    return out as never;
  };
}

// ---- Bodies ----
const tradingState: Schema<TradingState> = lit("CLOSED", "PRE_OPEN", "OPENING_AUCTION", "CONTINUOUS", "CLOSING_AUCTION", "AFTER_HOURS", "HALTED", "VOL_INTERRUPTION", "LIMIT_LOCKED", "SUSPENDED");
const side: Schema<Side> = lit("BUY", "SELL");
const candleRes: Schema<CandleRes> = lit("tick", "hour", "day");

export const tickerRow: Schema<TickerRow> = obj({ assetId: str, last: dec, chg: nullable(dec), chgPct: nullable(dec), vol: dec, state: tradingState, halted: bool });
export const tickerBody: Schema<TickerBody> = obj({ listId: str, rows: rec(tickerRow) });

const depthLevel: Schema<DepthLevel> = obj({ price: dec, qty: dec });
const auctionResult: Schema<AuctionResult> = obj({
  assetId: str, tick: int, kind: lit("TICK", "OPEN", "CLOSE", "REOPEN", "VOL_INTERRUPTION"), price: dec, qty: dec, imbalance: dec,
  aggressorSide: lit("BUY", "SELL", "NONE"), bandClamped: bool, fillsCount: int,
});
export const bookBody: Schema<BookBody> = obj(
  { assetId: str, tick: int, bids: arr(depthLevel), asks: arr(depthLevel), last: nullable(auctionResult) },
  { indicative: obj({ price: dec, imbalance: dec }) },
);

const tapePrint: Schema<TapePrint> = obj({ assetId: str, tick: int, price: dec, qty: dec, aggressor: lit("BUY", "SELL", "NONE"), block: bool, deferred: bool });
export const tapeBody: Schema<TapeBody> = obj({ assetId: str, prints: arr(tapePrint) });

export const candle: Schema<Candle> = obj({ t: int, o: dec, h: dec, l: dec, c: dec, v: dec });
export const candlesBody: Schema<CandlesBody> = obj({ assetId: str, res: candleRes, live: candle });
export const candleHistoryReq: Schema<CandleHistoryReq> = obj({ assetId: str, res: candleRes, from: int, to: int });
export const candleHistoryRes: Schema<CandleHistoryRes> = obj({ bars: arr(candle) });

const position: Schema<Position> = obj({ assetId: str, qty: dec, avgCost: dec, mark: dec, value: dec, upl: dec, pledgedQty: dec, lentQty: dec });
const openOrder: Schema<OpenOrder> = obj(
  { orderId: str, assetId: str, side, type: str, qty: dec, filled: dec, tif: str, status: lit("PENDING", "WORKING", "PARTIAL", "QUEUED_AUCTION"), placedTick: int, avgPrice: dec },
  { limit: dec, stop: dec },
);
const myFill: Schema<MyFill> = obj({
  fillId: str, tick: int, assetId: str, orderId: str, side, qty: dec, price: dec, fee: dec, feeCcy: str,
  liquidity: lit("MAKER", "TAKER", "AUCTION"), counterpartyKind: lit("PLAYER", "NPC"),
});
export const intentResult: Schema<IntentResult> = obj(
  { intentId: str, tick: int, status: lit("ACCEPTED", "REJECTED", "PARTIAL", "QUEUED_NEXT") },
  { rejectCode: str, rejectParams: rec(str), effects: arr(str) },
);
const restricted: Schema<RestrictedBucket> = obj({ reason: str, amount: dec, untilRealMs: nullable(int) });
const nwStats: Schema<NwStats> = obj({ window: str, drawdownReal: dec, sharpe: nullable(dec), twrIdx: dec, bench: dec });
const share = obj({ key: str, value: dec, sharePct: dec });
const nwBreakdown: Schema<NwBreakdown> = obj({ byClass: arr(share), byCcy: arr(share), liabilities: dec });
export const meBody: Schema<MeTradingBody> = obj(
  {
    balances: rec(dec), nw: dec, nwi: dec, restricted: arr(restricted), positions: rec(position), orders: rec(openOrder),
    fills: arr(myFill), margin: nullable(rec(dec)), holds: rec(unknownV), intents: arr(intentResult), alerts: arr(unknownV),
  },
  { nwStats, nwBreakdown },
);

const wireKind: Schema<WireKind> = lit("NEWS", "RUMOR", "FILING", "VERDICT", "MARKET", "PURCHASE", "ALLIANCE", "STATEMENT", "OUTLET", "CHAPTER", "RECORD", "RANK", "PHILANTHROPY", "WORLD_EVENT", "DAILY_CLOSE");
const wireItem: Schema<WireItem> = obj(
  { id: str, kind: wireKind, headlineKey: str, entities: arr(obj({ id: str, kind: str, label: str })), tick: int, breaking: bool, causeEventIds: arr(str) },
  {
    slots: rec(str), sourceRecord: obj({ hits: int, resolved: int }), sourceBand: lit("low", "mixed", "solid"),
    pricedInBand: lit("early", "mid", "late", "done"), pricedInAsOf: int, filingId: str, outletId: str, body: rec(str),
  },
);
export const newsBody: Schema<NewsBody> = obj({ items: arr(wireItem) });
const filing: Schema<Filing> = obj({
  id: str, type: lit("ownership_5pct", "quarterly_holdings", "insider", "company_statement", "fund_disclosure", "regulatory"),
  filer: obj({ id: str, label: str }), subject: obj({ id: str, label: str }), tick: int, fields: rec(str),
});
export const filingsBody: Schema<FilingsBody> = obj({ items: arr(filing) });
const boardRow: Schema<BoardRow> = obj({ rank: int, handle: str, country: str }, { nwiBand: str, npc: bool });
export const boardBody: Schema<BoardBody> = obj({ boardId: str, scope: str, rows: arr(boardRow) });

// ---- req ops ----
export const orderDraft: Schema<OrderDraft> = obj(
  { assetId: str, side, type: lit("market", "limit", "stop", "stop_limit"), qty: dec, tif: lit("day", "gtc", "ioc", "fok") },
  { limit: dec, stop: dec },
);
export const previewRes: Schema<PreviewRes> = obj(
  { price: dec, estFill: dec, fee: dec, valid: bool, buyingPowerAfter: dec, impactBp: dec, impactMoney: dec, total: dec, firstTradeCapRemaining: nullable(dec), computedAtTick: int },
  { reasonCode: str, marginAfter: dec },
);
export const assetDetail: Schema<AssetDetail> = obj(
  { assetId: str, ticker: str, name: str, class: str, sector: str, bloc: str, ccy: str, displayDecimals: int, qtyDecimals: int, licenseTier: str, tradingState },
  { stateUntilTick: int },
);

/** Schema for the body a channel carries. */
export function bodySchema(ch: ChannelName): Schema<unknown> {
  const head = ch.split(":")[0];
  switch (head) {
    case "ticker": return tickerBody;
    case "book": return bookBody;
    case "tape": return tapeBody;
    case "candles": return candlesBody;
    case "me": return meBody;
    case "news": return newsBody;
    case "filings": return filingsBody;
    default: return boardBody;
  }
}

const CHANNEL = /^(ticker:[\w-]+|book:[\w-]+|tape:[\w-]+|candles:[\w-]+:(tick|hour|day)|me|news|filings|board:[\w-]+:[\w-]+)$/;
export const isChannelName = (v: string): v is ChannelName => CHANNEL.test(v);
const channel: Schema<string> = (v, p = "") => (typeof v === "string" && CHANNEL.test(v) ? v : fail(p, "unknown channel"));

const path: Schema<string> = (v, p = "") => (typeof v === "string" && /^(\/[\w.-]+)+$/.test(v) ? v : fail(p, "bad delta path"));
const deltaOp: Schema<DeltaOp> = (v, p = "") => {
  const op = isObj(v) ? v.op : undefined;
  switch (op) {
    case "set": return obj({ op: lit("set"), path, v: unknownV })(v, p) as DeltaOp;
    case "del": return obj({ op: lit("del"), path })(v, p);
    case "ins": return obj({ op: lit("ins"), path, idx: int, v: unknownV })(v, p) as DeltaOp;
    case "trim": return obj({ op: lit("trim"), path, keepLast: int })(v, p);
    default: return fail(`${p}/op`, "unknown delta op");
  }
};
const snapEnv = obj({ t: lit("snap"), ch: channel, seq: int, tick: int, body: unknownV });
const deltaEnv: Schema<Delta> = obj({ t: lit("delta"), ch: channel, seq: int, tick: int, ops: arr(deltaOp) });
const errEnv: Schema<ChannelErr> = obj({ t: lit("err"), ch: channel, code: lit("CHANNEL_DENIED", "INTERNAL") });

/**
 * Parse one raw server frame. Snap bodies are validated against the channel's body schema here; delta ops are
 * structurally validated here and the patched body is re-validated by the consumer (useChannel) after applying.
 */
export function parseFrame(raw: unknown): ServerFrame {
  const t = isObj(raw) ? raw.t : undefined;
  if (t === "snap") {
    const f = snapEnv(raw);
    return { ...f, body: bodySchema(f.ch as ChannelName)(f.body, "/body") } as Snap<unknown>;
  }
  if (t === "delta") return deltaEnv(raw);
  if (t === "err") return errEnv(raw);
  return fail("/t", "unknown frame type");
}
