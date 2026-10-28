// Order history (UI card 8): the client contract for GET /api/v1/orders/me (channels.ts `OrderHistoryRow`, params
// status / from / to / cursor). ENGINE-TBD: no engine or gateway serves it yet; the mock server (mockFeed.ts
// `orderHistory`) stands in, and no UI reads it yet (card 8 Gap 1: the Orders tab shows open orders and fills only).
// Engine Dev reviews it alone, so everything it relies on is stated here:
//  - The rules Engine has not set (page size, reply shape, the id of a rejected place, avgPrice with no fills) are
//    `ORDER_HISTORY_POLICY` in orderPolicy.ts, the card 6 seam. No other file names a default.
//  - Every value crossing the boundary is parsed: the request with `orderHistoryReq` before it leaves, the reply with
//    `orderHistoryRes` plus the page rules below. A reply that breaks any rule is `badReply`, never a partial page:
//    at most `pageSize` rows, newest first (tick never increases down the page), every tick inside from..to, every
//    status the one asked for (when one is), `rejectCode` only on REJECTED. Money and quantities stay strings.
//  - SWAP (transport): replace `mockOrderHistory()` with the 19 HTTP door. It must answer `ordersHistory(req)` with the
//    raw JSON (`unknown`, sync or a Promise); a network failure should reject or return something that does not
//    parse, which reads as `badReply`. Nothing else changes.
import type { OrderHistoryRow, Tick } from "./channels";
import { ORDER_HISTORY_POLICY, type OrderHistoryPolicy } from "./orderPolicy";
import type { OrderError, OrderResult } from "./orders";
import { arr, dec, int, lit, nullable, obj, ParseError, str, type Schema } from "./schema";
import { getFeed } from "./useChannel";

export type HistoryStatus = OrderHistoryRow["status"];
export const HISTORY_STATUSES = ["FILLED", "CANCELLED", "REJECTED", "EXPIRED"] as const satisfies readonly HistoryStatus[];

/** The params of GET /api/v1/orders/me. `cursor` is the previous page's `nextCursor`, opaque to the client. */
export interface OrderHistoryReq { readonly status?: HistoryStatus; readonly from?: Tick; readonly to?: Tick; readonly cursor?: string }
export interface OrderHistoryRes { readonly rows: readonly OrderHistoryRow[]; readonly nextCursor: string | null }

const status: Schema<HistoryStatus> = lit(...HISTORY_STATUSES);
const tick: Schema<Tick> = (v, p = "") => {
  const n = int(v, p);
  if (n < 0) throw new ParseError(p, "expected a tick (safe integer >= 0)");
  return n;
};
export const orderHistoryReq: Schema<OrderHistoryReq> = obj({}, { status, from: tick, to: tick, cursor: str });
export const orderHistoryRow: Schema<OrderHistoryRow> = obj(
  { orderId: str, assetId: str, side: lit("BUY", "SELL"), type: str, qty: dec, filled: dec, avgPrice: dec, status, tick },
  { rejectCode: str },
);
export const orderHistoryRes: Schema<OrderHistoryRes> = obj({ rows: arr(orderHistoryRow), nextCursor: nullable(str) });

/** A reply: the schema, then the page rules (header). Throws ParseError. */
export function parseOrderHistory(raw: unknown, req: OrderHistoryReq, policy: OrderHistoryPolicy = ORDER_HISTORY_POLICY): OrderHistoryRes {
  const res = orderHistoryRes(raw, "history");
  if (res.rows.length > policy.pageSize) throw new ParseError("history/rows", `more than ${policy.pageSize} rows`);
  let prev = Number.POSITIVE_INFINITY;
  res.rows.forEach((r, i) => {
    const at = `history/rows/${i}`;
    if (r.tick > prev) throw new ParseError(`${at}/tick`, "not newest first");
    prev = r.tick;
    if ((req.from !== undefined && r.tick < req.from) || (req.to !== undefined && r.tick > req.to)) throw new ParseError(`${at}/tick`, "outside the request");
    if (req.status !== undefined && r.status !== req.status) throw new ParseError(`${at}/status`, `not ${req.status}`);
    if ((r.rejectCode !== undefined) !== (r.status === "REJECTED")) throw new ParseError(`${at}/rejectCode`, "rejectCode only on REJECTED");
  });
  return res;
}

/** What a transport must answer. The reply is `unknown` on purpose: it is parsed here, never trusted. */
export interface OrderHistoryTransport { ordersHistory(req: OrderHistoryReq): unknown }

const isOrderHistoryTransport = (v: unknown): v is OrderHistoryTransport =>
  typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).ordersHistory === "function";

/** The mock transport: the page feed's `ordersHistory` (`getFeed()`, a MockFeed in this build); null if it has none. */
export function mockOrderHistory(): OrderHistoryTransport | null {
  const feed: unknown = getFeed();
  return isOrderHistoryTransport(feed) ? feed : null;
}

const fail = (error: OrderError): { ok: false; error: OrderError } => ({ ok: false, error });

/** One page (the card's contract, after orders.ts / history.ts): the request parsed before it leaves, the reply after. */
export async function loadOrderHistory(req: OrderHistoryReq = {}, transport: OrderHistoryTransport | null = mockOrderHistory(),
  policy: OrderHistoryPolicy = ORDER_HISTORY_POLICY): Promise<OrderResult<OrderHistoryRes>> {
  if (!transport) return fail({ kind: "noTransport" });
  try {
    return { ok: true, value: parseOrderHistory(await transport.ordersHistory(orderHistoryReq(req, "req")), req, policy) };
  } catch (e) {
    return fail({ kind: "badReply", detail: e instanceof Error ? e.message : "transport failed" });
  }
}
