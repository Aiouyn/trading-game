// Order path for the Broker ticket and Open orders (UI cards 4, 5 and 6, Gap 1). The client has no `req` path yet: `FeedTransport` only
// subscribes and resyncs. Until 19 `req` lands (SWAP), this file is the one client door to `preview` and `submit`.
// Engine Dev reviews it alone, so everything it relies on is stated here:
//  - Draft fields mirror `OrderDraft` (channels.ts, 05 Order): assetId, side BUY|SELL, type, qty (decimal string), tif,
//    and `limit` / `stop` for priced types. The ticket builds day drafts only, with a whole-number qty, of four types
//    (`DayDraft`): market (no price), limit (`limit`), stop (`stop`), stop_limit (`stop` and `limit`). Each type carries
//    exactly its own price fields; the types below cannot hold any other combination.
//  - Prices are `PriceText`: the typed string, format-checked (`^\d+([.,]\d+)?$`) with a decimal comma swapped for a
//    point. No rounding, no tick-size or band check, no stop-side check: 05 §3.6.5 says a buy stop triggers when the
//    reference is >= stopPrice and a sell stop when it is <= stopPrice; whether a given stop is on a sensible side, and
//    every price rule, is the server's to judge (it answers with a reasonCode / rejectCode).
//  - SWAP (field names): 05 §3.6 `mkt.order.place` names the prices `limitPrice` / `stopPrice` and the types MARKET |
//    LIMIT | STOP | STOP_LIMIT. This file sends 17 §2.2's `OrderDraft` (`limit` / `stop`, lower-case types) as the 19C
//    gateway contract; the gateway maps one to the other. packages/engine has no order model yet (core intake only).
//  - Every value crossing the boundary is parsed: the draft with `orderDraft` before it leaves, the reply with
//    `previewRes` / an intent id check when it comes back. Nothing here does arithmetic on a contract field.
//  - The IntentResult is not returned here: it arrives on `me.intents` one tick later, as on the server.
//  - Asset ids are opaque: the client checks only that one is not empty. The engine's ids look like `ast_EQ_ADRG`
//    (packages/content), and an id the server does not know comes back as MKT_UNKNOWN_ASSET.
//  - SWAP (intentId): on the real transport the client mints the intentId and sends it inside the submitted intent;
//    core intake dedupes on intentId + actorId + nonce, and that dedupe is what the 17-AT-07 double-submit guard rests
//    on. The mock mints it server-side and this file parses it from the submit reply (`parseIntentId`). This note
//    changes no behaviour; 19 `req` does.
//  - Cancel (card 6): `cancel(orderId)` sends one `mkt.order.cancel` intent for an id read from `me.orders`. The id is
//    opaque (non-empty only). The reply is an intent id, parsed like submit's; the IntentResult arrives on `me.intents`
//    next tick. What a cancel does on a halted, partly filled or already-gone order is ENGINE-TBD (orderPolicy.ts).
import type { OrderDraft, PreviewRes, Side } from "./channels";
import { orderDraft, ParseError, previewRes, str } from "./schema";
import { getFeed } from "./useChannel";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** An asset id, opaque to the client ("ast_EQ_HALC" from the engine, "HALC" in the mock). Not empty. */
export type AssetId = Brand<string, "AssetId">;
/** A whole-number quantity as a decimal string: digits only, not empty. Zero passes: the server answers MKT_BAD_QTY. */
export type WholeQty = Brand<string, "WholeQty">;
/** The id `submit` returns; its result arrives as `me.intents[].intentId`. */
export type IntentId = Brand<string, "IntentId">;

/** An open order id as `me.orders` keys it ("o-12" in the mock). Opaque: not empty, nothing else. */
export type OrderId = Brand<string, "OrderId">;

/** A price as typed, format-checked, with "," rewritten to ".": "42,10" -> "42.10". Never parsed to a number. */
export type PriceText = Brand<string, "PriceText">;

const WHOLE = /^\d+$/;
const PRICE = /^\d+([.,]\d+)?$/;

/** Non-empty only: the format is the server's to judge (MKT_UNKNOWN_ASSET), not the client's. */
export function parseAssetId(raw: string): AssetId | null {
  return raw === "" ? null : (raw as AssetId);
}

/** Non-empty only, like asset ids: the server judges any other id (unknown ids are ENGINE-TBD, orderPolicy.ts). */
export function parseOrderId(raw: string): OrderId | null {
  return raw === "" ? null : (raw as OrderId);
}

/** What the quantity box holds. The client checks the format only; every other rule is the server's `valid`. */
export type QtyInput = { kind: "empty" } | { kind: "notDigits" } | { kind: "whole"; qty: WholeQty };

export function parseQtyInput(text: string): QtyInput {
  if (text === "") return { kind: "empty" };
  return WHOLE.test(text) ? { kind: "whole", qty: text as WholeQty } : { kind: "notDigits" };
}

/** What a price box holds. Format only (card 5): digits, optionally one "." or "," and more digits. */
export type PriceInput = { kind: "empty" } | { kind: "badFormat" } | { kind: "price"; price: PriceText };

export function parsePriceInput(text: string): PriceInput {
  if (text === "") return { kind: "empty" };
  return PRICE.test(text) ? { kind: "price", price: text.replace(",", ".") as PriceText } : { kind: "badFormat" };
}

/** Fields every day draft shares. Assignable to `OrderDraft`. */
interface DayDraftBase extends OrderDraft {
  readonly assetId: AssetId;
  readonly side: Side;
  readonly qty: WholeQty;
  readonly tif: "day";
}
export interface MarketDayDraft extends DayDraftBase { readonly type: "market"; readonly limit?: never; readonly stop?: never }
export interface LimitDayDraft extends DayDraftBase { readonly type: "limit"; readonly limit: PriceText; readonly stop?: never }
export interface StopDayDraft extends DayDraftBase { readonly type: "stop"; readonly stop: PriceText; readonly limit?: never }
export interface StopLimitDayDraft extends DayDraftBase { readonly type: "stop_limit"; readonly stop: PriceText; readonly limit: PriceText }
/** Every draft this ticket can send. */
export type DayDraft = MarketDayDraft | LimitDayDraft | StopDayDraft | StopLimitDayDraft;
export type DayOrderType = DayDraft["type"];

/** The type and its prices, without asset, side and qty. */
export type OrderTerms =
  | { readonly type: "market" }
  | { readonly type: "limit"; readonly limit: PriceText }
  | { readonly type: "stop"; readonly stop: PriceText }
  | { readonly type: "stop_limit"; readonly stop: PriceText; readonly limit: PriceText };

export function marketDayDraft(assetId: AssetId, side: Side, qty: WholeQty): MarketDayDraft {
  return { assetId, side, type: "market", qty, tif: "day" };
}

/** A day draft with exactly the terms' price fields (no `stop` on a limit, both on a stop limit). */
export function dayDraft(assetId: AssetId, side: Side, qty: WholeQty, terms: OrderTerms): DayDraft {
  switch (terms.type) {
    case "market": return marketDayDraft(assetId, side, qty);
    case "limit": return { assetId, side, type: "limit", qty, limit: terms.limit, tif: "day" };
    case "stop": return { assetId, side, type: "stop", qty, stop: terms.stop, tif: "day" };
    case "stop_limit": return { assetId, side, type: "stop_limit", qty, stop: terms.stop, limit: terms.limit, tif: "day" };
  }
}

/** What a transport must answer. Replies are `unknown` on purpose: they are parsed here, never trusted. */
export interface OrderTransport {
  preview(draft: OrderDraft): unknown;
  submit(draft: OrderDraft): unknown;
  cancel(orderId: OrderId): unknown;
}

function isOrderTransport(v: unknown): v is OrderTransport {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.preview === "function" && typeof t.submit === "function" && typeof t.cancel === "function";
}

function hasOrderDoor(v: unknown): v is { orderDoor(): unknown } {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).orderDoor === "function";
}

/** The mock transport: the page feed's order door (`getFeed()`, a MockFeed in this build), so a placed intent settles
 *  into the same `me` channel the UI reads. A feed without a door is used as the transport itself if it has
 *  preview/submit/cancel; otherwise null. SWAP: 19 `req` replaces this. */
export function mockTransport(): OrderTransport | null {
  const feed: unknown = getFeed();
  const door: unknown = hasOrderDoor(feed) ? feed.orderDoor() : feed;
  return isOrderTransport(door) ? door : null;
}

export type OrderError = { kind: "noTransport" } | { kind: "badReply"; detail: string };
export type OrderResult<T> = { ok: true; value: T } | { ok: false; error: OrderError };

const fail = (error: OrderError): { ok: false; error: OrderError } => ({ ok: false, error });

function parseIntentId(raw: unknown): IntentId {
  const s = str(raw, "intentId");
  if (s === "") throw new ParseError("intentId", "empty");
  return s as IntentId;
}

async function call<T>(draft: DayDraft, transport: OrderTransport | null, send: (t: OrderTransport, d: OrderDraft) => unknown, parse: (raw: unknown) => T): Promise<OrderResult<T>> {
  if (!transport) return fail({ kind: "noTransport" });
  try {
    const raw = await send(transport, orderDraft(draft, "draft"));
    return { ok: true, value: parse(raw) };
  } catch (e) {
    if (e instanceof ParseError) return fail({ kind: "badReply", detail: e.message });
    throw e;
  }
}

/** Advisory estimate (Q14): the placed order re-validates on the server. */
export function previewOrder(draft: DayDraft, transport: OrderTransport | null = mockTransport()): Promise<OrderResult<PreviewRes>> {
  return call(draft, transport, (t, d) => t.preview(d), (raw) => previewRes(raw, "preview"));
}

/** Sends the order once. The caller must not call it twice for one Place (17-AT-07). */
export function placeOrder(draft: DayDraft, transport: OrderTransport | null = mockTransport()): Promise<OrderResult<IntentId>> {
  return call(draft, transport, (t, d) => t.submit(d), parseIntentId);
}

/** Sends one cancel for an open order. The caller must not call it twice for one "Yes, cancel" (card 6, 17-AT-07). */
export async function cancelOrder(orderId: OrderId, transport: OrderTransport | null = mockTransport()): Promise<OrderResult<IntentId>> {
  if (!transport) return fail({ kind: "noTransport" });
  try {
    return { ok: true, value: parseIntentId(await transport.cancel(str(orderId, "orderId") as OrderId)) };
  } catch (e) {
    if (e instanceof ParseError) return fail({ kind: "badReply", detail: e.message });
    throw e;
  }
}
