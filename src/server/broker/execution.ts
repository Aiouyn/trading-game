// M1-06 server Broker door: pure decisions over one player's saved ledger (PlayerPrivateRecord) at one server quote.
// Reuses the mock's trading rules (exchange fee, lot averaging, NPC liquidity at the server mark); the server decides
// every price and fill, never the client payload. Callers run these inside AuthService's lock, so each decision sees
// the latest committed ledger and its cash / holding checks are atomic with the write.
import { ASSET_BY_ID, type AssetFixture } from "@/market/catalog";
import type { BrokerLedgerView } from "@/market/brokerLedger";
import { isListed } from "@/market/listings";
import { centsOf } from "@/market/valuation";
import { parseMinor, type MarketSnapshot } from "@/market/quoteSnapshot";
import { AuthError, type PersistedIntent, type PersistedOpenOrder, type PersistedPosition, type PlayerPrivateRecord } from "@/server/auth/types";
import { MAX_FILLS, MAX_INTENTS, type PlayerPrivateInput } from "@/server/player/privateState";
import type { IntentResult, MyFill, OrderDraft } from "@/shell/contracts/channels";
import { exchangeFeeMinor, FEE_BP, fmt, nextLot, type Lot } from "@/shell/contracts/mockFeed";
import { ORDER_POLICY } from "@/shell/contracts/orderPolicy";

/** Same bound as the ledger schema (privateState MAX_OPEN_ORDERS). */
export const MAX_WORKING_ORDERS = 128;
const QTY_RE = /^[1-9]\d{0,8}$/;

export type RejectCode =
  | "MKT_UNKNOWN_ASSET" | "MKT_BAD_QTY" | "MKT_BAD_PRICE" | "MKT_ORDER_TYPE_UNSUPPORTED" | "MKT_HALTED"
  | "MKT_INSUFFICIENT_BP" | "MKT_NO_LOCATE" | "MKT_TOO_MANY_ORDERS" | "MKT_NO_LIQUIDITY" | "MKT_MARKET_ONLY";

/** L4: a listed coin's liquidity book account (cents, tokens), seeded at graduation and owned by no player. Every Broker
 *  fill on the coin is against it at the server mark: a buy takes tokens from it, a sale takes cash from it, and a fill
 *  it cannot cover is partial (or refused when nothing fills); no token or cent is minted. */
export interface BookAccount { readonly cash: number; readonly tokens: number }

export interface IdSource { next(kind: "o" | "x" | "i"): string }

/** Server marks at one tick, in minor units. */
export interface ServerQuote { readonly tick: number; last(assetId: string): number | null; tradable(assetId: string): boolean }

export function quoteFromSnapshot(snap: MarketSnapshot): ServerQuote {
  return {
    tick: snap.tick,
    last: (id) => {
      const a = ASSET_BY_ID[id], row = snap.quotes.rows[id];
      if (!a || !row) return null;
      const m = parseMinor(row.last, a.displayDecimals);
      return m !== null && m > 0 ? m : null;
    },
    tradable: (id) => snap.quotes.rows[id]?.state === "CONTINUOUS" && snap.quotes.rows[id]?.halted === false,
  };
}

export type Decision = { readonly next: PlayerPrivateInput; readonly result: IntentResult; readonly replayed: boolean; readonly book?: BookAccount };

// ---- ledger <-> integer helpers ----
function integrity(msg: string): never {
  throw new AuthError("LEDGER_QUARANTINED", `Saved ledger is not tradable: ${msg}`, 409);
}
function lotOf(p: PersistedPosition | undefined): Lot | null {
  if (!p) return null;
  const a = ASSET_BY_ID[p.assetId];
  if (!a || !/^\d+$/.test(p.qty)) integrity(`position ${p.assetId}`);
  const qty = Number(p.qty), avgCost = parseMinor(p.avgCost, a.displayDecimals);
  if (!Number.isSafeInteger(qty) || avgCost === null || avgCost < 0) integrity(`position ${p.assetId}`);
  return { qty, avgCost };
}
function positionOf(a: AssetFixture, lot: Lot): PersistedPosition {
  return { assetId: a.assetId, qty: String(lot.qty), avgCost: fmt(lot.avgCost, a.displayDecimals) };
}
function remainingOf(o: PersistedOpenOrder): number {
  return Number(o.qty) - Number(o.filled);
}
function limitMinor(o: PersistedOpenOrder): number {
  const a = ASSET_BY_ID[o.assetId];
  const m = a && o.limit !== undefined ? parseMinor(o.limit, a.displayDecimals) : null;
  if (m === null || m <= 0) integrity(`order ${o.orderId}`);
  return m;
}
const feeOf = (notional: number) => exchangeFeeMinor(notional, FEE_BP.taker);

/** Cash a working buy limit holds back: remaining × limit + its fee at that notional. */
export function reservedCashCents(rec: PlayerPrivateRecord | PlayerPrivateInput): number {
  let held = 0;
  for (const o of Object.values(rec.openOrders)) {
    if (o.side !== "BUY" || o.limit === undefined) continue; // the server never fills an unpriced (stop) order
    const n = remainingOf(o) * limitMinor(o);
    held += n + feeOf(n);
  }
  return held;
}
/** Units a working sell limit holds back from further sells. */
export function reservedQty(rec: PlayerPrivateRecord | PlayerPrivateInput, assetId: string): number {
  let held = 0;
  for (const o of Object.values(rec.openOrders)) if (o.side === "SELL" && o.assetId === assetId) held += remainingOf(o);
  return held;
}

/** Canonical request text an idempotency key is bound to. */
export function placeFingerprint(d: OrderDraft): string {
  return JSON.stringify(["place", d.assetId, d.side, d.type, d.qty, d.limit ?? null, d.stop ?? null, d.tif]);
}
export function cancelFingerprint(orderId: string): string {
  return JSON.stringify(["cancel", orderId]);
}

/** A key already decided: the stored result (same request) or 409 (same key, different request). */
function replayOf(rec: PlayerPrivateRecord, key: string, fingerprint: string): IntentResult | null {
  const hit = rec.intents?.find((x) => x.key === key);
  if (!hit) return null;
  if (hit.fingerprint !== fingerprint) {
    throw new AuthError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request.", 409);
  }
  return hit.result;
}

function withIntent(base: PlayerPrivateInput, rec: PlayerPrivateRecord, intent: PersistedIntent): PlayerPrivateInput {
  return { ...base, fills: base.fills ?? rec.fills ?? [], intents: [...(rec.intents ?? []), intent].slice(-MAX_INTENTS) };
}
const asInput = (rec: PlayerPrivateRecord): PlayerPrivateInput => ({
  cashCents: rec.cashCents, positions: rec.positions, openOrders: rec.openOrders, fills: rec.fills ?? [], intents: rec.intents ?? [],
});

/** A fill's notional in cents: price × qty in the asset's minor unit, converted (identity for the dp-2 catalog; a buy of a
 *  listed coin pays any part of a cent, a sale receives it rounded half up, so the book never pays out more than it has). */
export const notionalCents = (a: AssetFixture, side: "BUY" | "SELL", qty: number, px: number) => centsOf(a.displayDecimals, px * qty, side === "BUY");

/** Book one fill on the ledger: lot, cash, fills ring. Caller has already checked cash / holdings. */
function bookFill(
  ledger: PlayerPrivateInput, a: AssetFixture, orderId: string, side: "BUY" | "SELL", qty: number, px: number,
  liquidity: MyFill["liquidity"], tick: number, ids: IdSource,
): { next: PlayerPrivateInput; fill: MyFill } {
  const notional = notionalCents(a, side, qty, px), fee = feeOf(notional);
  const cashCents = side === "BUY" ? ledger.cashCents - notional - fee : ledger.cashCents + notional - fee;
  const lot = nextLot(lotOf(ledger.positions[a.assetId]), side, qty, px);
  const positions: Record<string, PersistedPosition> = { ...ledger.positions };
  if (lot === null) delete positions[a.assetId]; else positions[a.assetId] = positionOf(a, lot);
  const fill: MyFill = {
    fillId: ids.next("x"), tick, assetId: a.assetId, orderId, side, qty: String(qty), price: fmt(px, a.displayDecimals),
    fee: fmt(fee, 2), feeCcy: a.ccy, liquidity, counterpartyKind: "NPC",
  };
  return { next: { ...ledger, cashCents, positions, fills: [...(ledger.fills ?? []), fill].slice(-MAX_FILLS) }, fill };
}

/**
 * Decide one place intent. Business refusals are REJECTED results (stored, so a retry gets the same answer); only a
 * reused key with a different request throws (409).
 */
export function decidePlace(rec: PlayerPrivateRecord, key: string, draft: OrderDraft, quote: ServerQuote, ids: IdSource, book?: BookAccount): Decision {
  const fingerprint = placeFingerprint(draft);
  const prior = replayOf(rec, key, fingerprint);
  if (prior) return { next: asInput(rec), result: prior, replayed: true };

  const intentId = ids.next("i");
  const reject = (rejectCode: RejectCode): Decision => {
    const result: IntentResult = { intentId, tick: quote.tick, status: "REJECTED", rejectCode };
    return { next: withIntent(asInput(rec), rec, { key, fingerprint, result }), result, replayed: false };
  };
  const accept = (next: PlayerPrivateInput, effects: string[]): Decision => {
    const result: IntentResult = { intentId, tick: quote.tick, status: "ACCEPTED", effects };
    return { next: withIntent(next, rec, { key, fingerprint, result }), result, replayed: false };
  };

  const a = ASSET_BY_ID[draft.assetId];
  if (!a) return reject("MKT_UNKNOWN_ASSET");
  if (isListed(a.assetId)) return placeListed(rec, draft, a, quote, ids, book, reject, accept);
  if (draft.type !== "market" && draft.type !== "limit") return reject("MKT_ORDER_TYPE_UNSUPPORTED");
  if (draft.tif !== "day" || draft.stop !== undefined) return reject("MKT_ORDER_TYPE_UNSUPPORTED");
  if (!QTY_RE.test(draft.qty)) return reject("MKT_BAD_QTY");
  const qty = Number(draft.qty);
  let limit: number | null = null;
  if (draft.type === "limit") {
    limit = draft.limit === undefined ? null : parseMinor(draft.limit, a.displayDecimals);
    if (limit === null || limit <= 0 || !Number.isSafeInteger(limit * qty * FEE_BP.taker)) return reject("MKT_BAD_PRICE");
  } else if (draft.limit !== undefined) return reject("MKT_BAD_PRICE");
  const last = quote.last(a.assetId);
  if (last === null) return reject("MKT_UNKNOWN_ASSET");
  if (!quote.tradable(a.assetId)) return reject("MKT_HALTED");
  if (!Number.isSafeInteger(last * qty * FEE_BP.taker)) return reject("MKT_BAD_QTY");

  const ledger = asInput(rec);
  const spendable = rec.cashCents - reservedCashCents(rec);
  const sellable = (lotOf(rec.positions[a.assetId])?.qty ?? 0) - reservedQty(rec, a.assetId);
  // Marketable now (market, or a limit at/through the server mark): fills at the server mark as taker, never worse
  // than its limit. Otherwise a limit rests WORKING with its cash or units held back.
  const marketable = limit === null || (draft.side === "BUY" ? limit >= last : limit <= last);
  if (marketable) {
    const notional = last * qty, fee = feeOf(notional);
    if (draft.side === "BUY" && notional + fee > spendable) return reject("MKT_INSUFFICIENT_BP");
    if (draft.side === "SELL" && qty > sellable) return reject("MKT_NO_LOCATE");
    if (draft.side === "SELL" && rec.cashCents + notional - fee < 0) return reject("MKT_INSUFFICIENT_BP");
    const orderId = ids.next("o");
    const { next, fill } = bookFill(ledger, a, orderId, draft.side, qty, last, "TAKER", quote.tick, ids);
    return accept(next, [`fill:${fill.fillId}`]);
  }
  if (Object.keys(rec.openOrders).length >= MAX_WORKING_ORDERS) return reject("MKT_TOO_MANY_ORDERS");
  if (draft.side === "BUY") {
    const n = limit! * qty;
    if (n + feeOf(n) > spendable) return reject("MKT_INSUFFICIENT_BP");
  } else if (qty > sellable) return reject("MKT_NO_LOCATE");
  const orderId = ids.next("o");
  const order: PersistedOpenOrder = {
    orderId, assetId: a.assetId, side: draft.side, type: "limit", qty: String(qty), filled: "0", limit: fmt(limit!, a.displayDecimals),
    tif: "day", status: "WORKING", placedTick: quote.tick, avgPrice: fmt(0, a.displayDecimals),
  };
  return accept({ ...ledger, openOrders: { ...rec.openOrders, [orderId]: order } }, [`order:${orderId}`]);
}

/**
 * L4: one market order on a coin listed at graduation, filled now at the server mark (its meme-template path) against
 * the coin's book account. Market orders only (no resting order can be reserved against a book other players move).
 * The fill is the requested qty or what the book can cover (partial); none refuses MKT_NO_LIQUIDITY. The same lot,
 * fee and fills rules as every other asset (bookFill); the book moves by exactly the cash and tokens the ledger did.
 */
function placeListed(
  rec: PlayerPrivateRecord, draft: OrderDraft, a: AssetFixture, quote: ServerQuote, ids: IdSource, book: BookAccount | undefined,
  reject: (c: RejectCode) => Decision, accept: (next: PlayerPrivateInput, effects: string[]) => Decision,
): Decision {
  if (draft.type !== "market") return reject("MKT_MARKET_ONLY"); // explicit: a listed coin takes market orders only
  if (draft.tif !== "day" || draft.stop !== undefined) return reject("MKT_ORDER_TYPE_UNSUPPORTED");
  if (draft.limit !== undefined) return reject("MKT_BAD_PRICE");
  if (!QTY_RE.test(draft.qty)) return reject("MKT_BAD_QTY");
  const last = quote.last(a.assetId);
  if (last === null || !book) return reject("MKT_UNKNOWN_ASSET");
  if (!quote.tradable(a.assetId)) return reject("MKT_HALTED");
  const want = Number(draft.qty);
  if (!Number.isSafeInteger(last * want)) return reject("MKT_BAD_QTY");
  const spendable = rec.cashCents - reservedCashCents(rec);
  const sellable = lotOf(rec.positions[a.assetId])?.qty ?? 0; // no resting orders on a listed coin
  if (draft.side === "SELL" && want > sellable) return reject("MKT_NO_LOCATE");
  // What the book can cover: its tokens for a buy; for a sale, the most whose proceeds its cash pays (price × qty never
  // above its cash in the minor unit, so the half-up cents are not either).
  const qty = Math.min(want, draft.side === "BUY" ? book.tokens : Math.floor((book.cash * 10 ** (a.displayDecimals - 2)) / last));
  if (qty <= 0) return reject("MKT_NO_LIQUIDITY");
  const notional = notionalCents(a, draft.side, qty, last), fee = feeOf(notional);
  if (notional < 1) return reject("MKT_BAD_QTY"); // worth less than half a cent: nothing to pay or receive
  if (draft.side === "BUY" && notional + fee > spendable) return reject("MKT_INSUFFICIENT_BP");
  if (draft.side === "SELL" && rec.cashCents + notional - fee < 0) return reject("MKT_INSUFFICIENT_BP");
  const { next, fill } = bookFill(asInput(rec), a, ids.next("o"), draft.side, qty, last, "TAKER", quote.tick, ids);
  const d = accept(next, [`fill:${fill.fillId}`]);
  const nextBook = draft.side === "BUY" ? { cash: book.cash + notional, tokens: book.tokens - qty } : { cash: book.cash - notional, tokens: book.tokens + qty };
  return { ...d, book: nextBook };
}

/** Decide one cancel. Only the caller's own open orders exist here; any other id is "unknown" (ORDER_POLICY Gap 1). */
export function decideCancel(rec: PlayerPrivateRecord, key: string, orderId: string, tick: number, ids: IdSource): Decision {
  const fingerprint = cancelFingerprint(orderId);
  const prior = replayOf(rec, key, fingerprint);
  if (prior) return { next: asInput(rec), result: prior, replayed: true };
  const intentId = ids.next("i");
  const o = Object.hasOwn(rec.openOrders, orderId) ? rec.openOrders[orderId] : undefined;
  let result: IntentResult;
  let next = asInput(rec);
  if (!o) {
    const u = ORDER_POLICY.cancelUnknown;
    result = u.status === "ACCEPTED" ? { intentId, tick, status: "ACCEPTED" } : { intentId, tick, status: "REJECTED", rejectCode: u.code };
  } else {
    const openOrders = { ...rec.openOrders };
    delete openOrders[orderId];
    next = { ...next, openOrders };
    result = { intentId, tick, status: "ACCEPTED", effects: [`order:${orderId}`] };
  }
  return { next: withIntent(next, rec, { key, fingerprint, result }), result, replayed: false };
}

/**
 * One server tick over one ledger: every working limit the mark has reached fills in full at its limit (maker, NPC
 * liquidity), oldest first. Null when nothing fills. Reservations guarantee the cash / units are there; a lot that is
 * somehow short is left working rather than overdrawn.
 */
export function sweepLedger(rec: PlayerPrivateRecord, quote: ServerQuote, ids: IdSource): PlayerPrivateInput | null {
  const due = Object.values(rec.openOrders)
    .filter((o) => o.type === "limit" && (o.status === "WORKING" || o.status === "PARTIAL"))
    .sort((x, y) => x.placedTick - y.placedTick || (x.orderId < y.orderId ? -1 : x.orderId > y.orderId ? 1 : 0));
  let ledger = asInput(rec);
  let changed = false;
  for (const o of due) {
    const a = ASSET_BY_ID[o.assetId];
    const last = a ? quote.last(a.assetId) : null;
    if (!a || last === null || !quote.tradable(a.assetId)) continue;
    const px = limitMinor(o);
    if (!(o.side === "BUY" ? last <= px : last >= px)) continue;
    const qty = remainingOf(o);
    const openOrders = { ...ledger.openOrders };
    delete openOrders[o.orderId];
    const without = { ...ledger, openOrders };
    if (o.side === "BUY" && without.cashCents - px * qty - feeOf(px * qty) < 0) continue;
    if (o.side === "SELL" && (lotOf(without.positions[a.assetId])?.qty ?? 0) < qty) continue;
    if (o.side === "SELL" && without.cashCents + px * qty - feeOf(px * qty) < 0) continue;
    ledger = bookFill(without, a, o.orderId, o.side, qty, px, "MAKER", quote.tick, ids).next;
    changed = true;
  }
  return changed ? ledger : null;
}

/** The caller's own ledger as the Broker reads it, with its Launchpad coin rows (read in the same locked step). */
export function ledgerView(rec: PlayerPrivateRecord, tick: number, coins: BrokerLedgerView["coins"]): BrokerLedgerView {
  return {
    tick,
    cashCents: rec.cashCents,
    reservedCashCents: reservedCashCents(rec),
    positions: rec.positions,
    orders: rec.openOrders,
    fills: rec.fills ?? [],
    intents: (rec.intents ?? []).map((x) => x.result),
    coins,
  };
}
