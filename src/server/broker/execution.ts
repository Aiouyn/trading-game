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
import { MAX_FILLS, MAX_IDEMPOTENCY, MAX_INTENTS, type PlayerPrivateInput } from "@/server/player/privateState";
import { feeOf, fillOnBook, type BookAccount, type DepthInputs } from "./book";
import type { IntentResult, MyFill, OrderDraft } from "@/shell/contracts/channels";
import { FEE_BP, fmt, nextLot, type Lot } from "@/shell/contracts/mockFeed";
import { ORDER_POLICY } from "@/shell/contracts/orderPolicy";

/** Same bound as the ledger schema (privateState MAX_OPEN_ORDERS). */
export const MAX_WORKING_ORDERS = 128;
const QTY_RE = /^[1-9]\d{0,8}$/;

export type RejectCode =
  | "MKT_UNKNOWN_ASSET" | "MKT_BAD_QTY" | "MKT_BAD_PRICE" | "MKT_ORDER_TYPE_UNSUPPORTED" | "MKT_HALTED"
  | "MKT_INSUFFICIENT_BP" | "MKT_NO_LOCATE" | "MKT_TOO_MANY_ORDERS" | "MKT_NO_LIQUIDITY";

export type { BookAccount } from "./book";

export interface IdSource { next(kind: "o" | "x" | "i"): string }

/** Server marks at one tick, in minor units. */
export interface ServerQuote { readonly tick: number; depthInputs?(assetId: string): DepthInputs | null; last(assetId: string): number | null; tradable(assetId: string): boolean }

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

/** `book`: a listed coin's next book (and `move`, its fill's permanent impact, applied once the decision is saved). */
export type Decision = { readonly next: PlayerPrivateInput; readonly result: IntentResult; readonly replayed: boolean; readonly book?: BookAccount; readonly move?: number };

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
/** Cash a working buy limit holds back: remaining × limit in cents (what a buyer pays: any part of a cent up) + its fee
 *  at that notional. */
export function reservedCashCents(rec: PlayerPrivateRecord | PlayerPrivateInput): number {
  let held = 0;
  for (const o of Object.values(rec.openOrders)) {
    if (o.side !== "BUY" || o.limit === undefined) continue; // the server never fills an unpriced (stop) order
    held += holdCents(ASSET_BY_ID[o.assetId]!, remainingOf(o), limitMinor(o));
  }
  return held;
}
const holdCents = (a: AssetFixture, qty: number, limit: number) => { const n = notionalCents(a, "BUY", qty, limit); return n + feeOf(n); };
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

/** Journal of every decided key (not the last-50 receipt ring). Old saves have only the ring. */
function idempotencyOf(rec: Pick<PlayerPrivateRecord, "intents" | "idempotency">): readonly PersistedIntent[] {
  return rec.idempotency ?? rec.intents ?? [];
}

/** A key already decided: the stored result (same request) or 409 (same key, different request). */
function replayOf(rec: PlayerPrivateRecord, key: string, fingerprint: string): IntentResult | null {
  const hit = idempotencyOf(rec).find((x) => x.key === key);
  if (!hit) return null;
  if (hit.fingerprint !== fingerprint) {
    throw new AuthError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different request.", 409);
  }
  return hit.result;
}

function withIntent(base: PlayerPrivateInput, rec: PlayerPrivateRecord, intent: PersistedIntent): PlayerPrivateInput {
  const journal = base.idempotency ?? idempotencyOf(rec);
  if (journal.some((x) => x.key === intent.key)) {
    return { ...base, fills: base.fills ?? rec.fills ?? [], intents: base.intents ?? rec.intents ?? [], idempotency: journal };
  }
  if (journal.length >= MAX_IDEMPOTENCY) {
    throw new AuthError("IDEMPOTENCY_JOURNAL_FULL", "Idempotency journal is full.", 503);
  }
  return {
    ...base,
    fills: base.fills ?? rec.fills ?? [],
    intents: [...(base.intents ?? rec.intents ?? []), intent].slice(-MAX_INTENTS),
    idempotency: [...journal, intent],
  };
}
const asInput = (rec: PlayerPrivateRecord): PlayerPrivateInput => ({
  cashCents: rec.cashCents, positions: rec.positions, openOrders: rec.openOrders, fills: rec.fills ?? [],
  intents: rec.intents ?? [], idempotency: idempotencyOf(rec),
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
 * L4: one order on a coin listed at graduation, against the coin's book account (src/server/broker/book.ts: the p10
 * supply-account path, priced with spread + impact, bounded by the book's tokens and cash and the per-tick cap). Order
 * types as every asset of this door: market and limit, day. A market order fills now what the book allows (partial) or
 * is refused MKT_NO_LIQUIDITY; it never rests (as every market order here). A limit fills now what the book allows within
 * its limit and rests the rest WORKING (PARTIAL after a fill) with the usual hold; the sweep fills it later (sweepListed).
 * The fee is paid to the book; the book moves by exactly what the ledger did.
 */
function placeListed(
  rec: PlayerPrivateRecord, draft: OrderDraft, a: AssetFixture, quote: ServerQuote, ids: IdSource, book: BookAccount | undefined,
  reject: (c: RejectCode) => Decision, accept: (next: PlayerPrivateInput, effects: string[]) => Decision,
): Decision {
  if (draft.type !== "market" && draft.type !== "limit") return reject("MKT_ORDER_TYPE_UNSUPPORTED");
  if (draft.tif !== "day" || draft.stop !== undefined) return reject("MKT_ORDER_TYPE_UNSUPPORTED");
  if (!QTY_RE.test(draft.qty)) return reject("MKT_BAD_QTY");
  const want = Number(draft.qty);
  let limit: number | null = null;
  if (draft.type === "limit") {
    limit = draft.limit === undefined ? null : parseMinor(draft.limit, a.displayDecimals);
    if (limit === null || limit <= 0 || !Number.isSafeInteger(limit * want * 2)) return reject("MKT_BAD_PRICE");
  } else if (draft.limit !== undefined) return reject("MKT_BAD_PRICE");
  const last = quote.last(a.assetId);
  if (last === null || !book) return reject("MKT_UNKNOWN_ASSET");
  if (!quote.tradable(a.assetId)) return reject("MKT_HALTED");
  if (!Number.isSafeInteger(last * want * 2)) return reject("MKT_BAD_QTY"); // a priced fill stays a safe integer
  const spendable = rec.cashCents - reservedCashCents(rec);
  const sellable = (lotOf(rec.positions[a.assetId])?.qty ?? 0) - reservedQty(rec, a.assetId);
  if (draft.side === "SELL" && want > sellable) return reject("MKT_NO_LOCATE");
  if (draft.side === "BUY" && limit !== null && holdCents(a, want, limit) > spendable) return reject("MKT_INSUFFICIENT_BP");
  const fill = fillOnBook(a, draft.side, want, last, book, quote.tick, limit, quote.depthInputs?.(a.assetId) ?? undefined);
  const rest = want - (fill?.qty ?? 0);
  if (!fill && limit === null) return reject("MKT_NO_LIQUIDITY");
  if (rest > 0 && limit !== null && Object.keys(rec.openOrders).length >= MAX_WORKING_ORDERS) return reject("MKT_TOO_MANY_ORDERS");
  if (fill && draft.side === "BUY" && fill.notional + fill.fee + (rest > 0 && limit !== null ? holdCents(a, rest, limit) : 0) > spendable) return reject("MKT_INSUFFICIENT_BP");
  if (fill && draft.side === "SELL" && rec.cashCents + fill.notional - fill.fee < 0) return reject("MKT_INSUFFICIENT_BP");
  const orderId = ids.next("o");
  let next = asInput(rec);
  const effects: string[] = [];
  if (fill) {
    const b = bookFill(next, a, orderId, draft.side, fill.qty, fill.px, "TAKER", quote.tick, ids);
    next = b.next;
    effects.push(`fill:${b.fill.fillId}`);
  }
  if (rest > 0 && limit !== null) {
    const order: PersistedOpenOrder = {
      orderId, assetId: a.assetId, side: draft.side, type: "limit", qty: String(want), filled: String(fill?.qty ?? 0), limit: fmt(limit, a.displayDecimals),
      tif: "day", status: fill ? "PARTIAL" : "WORKING", placedTick: quote.tick, avgPrice: fmt(fill?.px ?? 0, a.displayDecimals),
    };
    next = { ...next, openOrders: { ...next.openOrders, [orderId]: order } };
    effects.push(`order:${orderId}`);
  }
  const d = accept(next, effects);
  return fill ? { ...d, book: fill.book, move: fill.move } : d;
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
    .filter((o) => o.type === "limit" && (o.status === "WORKING" || o.status === "PARTIAL") && !isListed(o.assetId)) // listed: sweepListed
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

const byAge = (x: PersistedOpenOrder, y: PersistedOpenOrder) => x.placedTick - y.placedTick || (x.orderId < y.orderId ? -1 : x.orderId > y.orderId ? 1 : 0);

/** One sweep's work on listed coins: the ledgers it changed, the books it moved, and each fill's permanent impact. */
export interface ListedSweep<K extends string = string> { readonly ledgers: Map<K, PlayerPrivateInput>; readonly books: Map<string, BookAccount>; readonly moves: { assetId: string; move: number }[] }

/**
 * L4: one server tick over every resting limit on a listed coin, across all accounts, oldest first (placed tick, order
 * id), each against its coin's book (fillOnBook: priced, bounded, within the limit). A fill the book cannot cover fully is
 * partial and the rest keeps working (PARTIAL), its hold shrinking with it; nothing fillable leaves it as it is. The
 * holds guarantee the cash and units; a ledger somehow short is left working rather than overdrawn. Pure.
 */
export function sweepListed<K extends string>(ledgers: ReadonlyMap<K, PlayerPrivateRecord>, books: ReadonlyMap<string, BookAccount>, quote: ServerQuote, ids: IdSource): ListedSweep<K> {
  const out: ListedSweep<K> = { ledgers: new Map(), books: new Map(), moves: [] };
  const due: { owner: K; o: PersistedOpenOrder }[] = [];
  for (const [owner, rec] of ledgers) {
    for (const o of Object.values(rec.openOrders)) if (o.type === "limit" && isListed(o.assetId) && books.has(o.assetId)) due.push({ owner, o });
  }
  due.sort((x, y) => byAge(x.o, y.o) || (x.owner < y.owner ? -1 : 1));
  for (const { owner, o } of due) {
    try { sweepOne(owner, o); } catch (err) {
      if (!(err instanceof AuthError)) throw err; // an untradable ledger (integrity) is left as it is, as in sweepLedger
    }
  }
  return out;

  function sweepOne(owner: K, o: PersistedOpenOrder): void {
    const a = ASSET_BY_ID[o.assetId];
    const last = a ? quote.last(a.assetId) : null;
    if (!a || last === null || !quote.tradable(a.assetId)) return;
    const ledger = out.ledgers.get(owner) ?? asInput(ledgers.get(owner)!);
    const book = out.books.get(a.assetId) ?? books.get(a.assetId)!;
    const fill = fillOnBook(a, o.side, remainingOf(o), last, book, quote.tick, limitMinor(o), quote.depthInputs?.(a.assetId) ?? undefined);
    if (!fill) return;
    const openOrders = { ...ledger.openOrders };
    delete openOrders[o.orderId];
    const without = { ...ledger, openOrders };
    if (o.side === "BUY" && without.cashCents - fill.notional - fill.fee < 0) return;
    if (o.side === "SELL" && ((lotOf(without.positions[a.assetId])?.qty ?? 0) < fill.qty || without.cashCents + fill.notional - fill.fee < 0)) return;
    let next = bookFill(without, a, o.orderId, o.side, fill.qty, fill.px, "MAKER", quote.tick, ids).next;
    const filled = Number(o.filled) + fill.qty;
    if (filled < Number(o.qty)) {
      const avg = Math.round((Number(o.filled) * (parseMinor(o.avgPrice, a.displayDecimals) ?? 0) + fill.qty * fill.px) / filled);
      next = { ...next, openOrders: { ...next.openOrders, [o.orderId]: { ...o, filled: String(filled), status: "PARTIAL", avgPrice: fmt(avg, a.displayDecimals) } } };
    }
    out.ledgers.set(owner, next);
    out.books.set(a.assetId, fill.book);
    out.moves.push({ assetId: a.assetId, move: fill.move });
  }
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
