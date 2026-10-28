// Order path for the Broker ticket (UI card 4, Gap 1). The client has no `req` path yet: `FeedTransport` only
// subscribes and resyncs. Until 19 `req` lands (SWAP), this file is the one client door to `preview` and `submit`.
// Engine Dev reviews it alone, so everything it relies on is stated here:
//  - Draft fields mirror `OrderDraft` (channels.ts, 05 Order): assetId, side BUY|SELL, type, qty (decimal string), tif.
//    The ticket only builds market/day drafts with a whole-number qty; the type below cannot hold anything else.
//  - Every value crossing the boundary is parsed: the draft with `orderDraft` before it leaves, the reply with
//    `previewRes` / an intent id check when it comes back. Nothing here does arithmetic on a contract field.
//  - The IntentResult is not returned here: it arrives on `me.intents` one tick later, as on the server.
//  - Asset ids are opaque: the client checks only that one is not empty. The engine's ids look like `ast_EQ_ADRG`
//    (packages/content), and an id the server does not know comes back as MKT_UNKNOWN_ASSET.
//  - SWAP (intentId): on the real transport the client mints the intentId and sends it inside the submitted intent;
//    core intake dedupes on intentId + actorId + nonce, and that dedupe is what the 17-AT-07 double-submit guard rests
//    on. The mock mints it server-side and this file parses it from the submit reply (`parseIntentId`). This note
//    changes no behaviour; 19 `req` does.
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

const WHOLE = /^\d+$/;

/** Non-empty only: the format is the server's to judge (MKT_UNKNOWN_ASSET), not the client's. */
export function parseAssetId(raw: string): AssetId | null {
  return raw === "" ? null : (raw as AssetId);
}

/** What the quantity box holds. The client checks the format only; every other rule is the server's `valid`. */
export type QtyInput = { kind: "empty" } | { kind: "notDigits" } | { kind: "whole"; qty: WholeQty };

export function parseQtyInput(text: string): QtyInput {
  if (text === "") return { kind: "empty" };
  return WHOLE.test(text) ? { kind: "whole", qty: text as WholeQty } : { kind: "notDigits" };
}

/** The only draft this ticket can send: market, day, whole quantity. Assignable to `OrderDraft`. */
export interface MarketDayDraft extends OrderDraft {
  readonly assetId: AssetId;
  readonly side: Side;
  readonly type: "market";
  readonly qty: WholeQty;
  readonly tif: "day";
}

export function marketDayDraft(assetId: AssetId, side: Side, qty: WholeQty): MarketDayDraft {
  return { assetId, side, type: "market", qty, tif: "day" };
}

/** What a transport must answer. Replies are `unknown` on purpose: they are parsed here, never trusted. */
export interface OrderTransport {
  preview(draft: OrderDraft): unknown;
  submit(draft: OrderDraft): unknown;
}

function isOrderTransport(v: unknown): v is OrderTransport {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.preview === "function" && typeof t.submit === "function";
}

function hasOrderDoor(v: unknown): v is { orderDoor(): unknown } {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).orderDoor === "function";
}

/** The mock transport: the page feed's order door (`getFeed()`, a MockFeed in this build), so a placed intent settles
 *  into the same `me` channel the UI reads. A feed without a door is used as the transport itself if it has
 *  preview/submit; otherwise null. SWAP: 19 `req` replaces this. */
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

async function call<T>(draft: MarketDayDraft, transport: OrderTransport | null, send: (t: OrderTransport, d: OrderDraft) => unknown, parse: (raw: unknown) => T): Promise<OrderResult<T>> {
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
export function previewOrder(draft: MarketDayDraft, transport: OrderTransport | null = mockTransport()): Promise<OrderResult<PreviewRes>> {
  return call(draft, transport, (t, d) => t.preview(d), (raw) => previewRes(raw, "preview"));
}

/** Sends the order once. The caller must not call it twice for one Place (17-AT-07). */
export function placeOrder(draft: MarketDayDraft, transport: OrderTransport | null = mockTransport()): Promise<OrderResult<IntentId>> {
  return call(draft, transport, (t, d) => t.submit(d), parseIntentId);
}
