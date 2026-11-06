/**
 * Private player ledger (M1-03): boundary validation + on-disk schema migration.
 * Stored in the auth FileAuthStore (`store.json` players[]); no separate blob store.
 * Payload reuses the domain contract types (channels.ts Position / OpenOrder) and the
 * contract runtime schema for OpenOrder, plus ledger invariants the wire schema doesn't express.
 */
import {
  AuthError,
  PLAYER_PRIVATE_SCHEMA_VERSION,
  type AccountId,
  type PersistedOpenOrder,
  type PersistedPosition,
  type PlayerPrivateRecord,
} from "@/server/auth/types";
import { dec, obj, openOrder as openOrderSchema, str, ParseError } from "@/shell/contracts/schema";

const ASSET_ID_RE = /^[A-Z][A-Z0-9]{0,11}$/;
const ORDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Non-negative decimal string, ≤ 18 integer digits and ≤ 8 fractional digits. */
const UDEC_RE = /^\d{1,18}(\.\d{1,8})?$/;
const MAX_POSITIONS = 64;
const MAX_OPEN_ORDERS = 128;
const ORDER_TYPES = new Set(["market", "limit", "stop", "stop_limit"]);
const ORDER_TIFS = new Set(["day", "gtc", "ioc", "fok"]);

/** What a service-side commit supplies; `v`/`accountId` are owned by the service, never the caller. */
export type PlayerPrivateInput = {
  readonly cashCents: number;
  readonly positions: Readonly<Record<string, PersistedPosition>>;
  readonly openOrders: Readonly<Record<string, PersistedOpenOrder>>;
};

const persistedPositionSchema = obj({ assetId: str, qty: dec, avgCost: dec });

const bad = (msg: string): never => {
  throw new AuthError("BAD_REQUEST", msg, 400);
};

/** Compare two non-negative decimal strings (UDEC_RE) exactly, without float rounding. */
export function compareUDec(a: string, b: string): -1 | 0 | 1 {
  const [ai = "", af = ""] = a.split(".");
  const [bi = "", bf = ""] = b.split(".");
  const aInt = ai.replace(/^0+(?=\d)/, "");
  const bInt = bi.replace(/^0+(?=\d)/, "");
  if (aInt.length !== bInt.length) return aInt.length < bInt.length ? -1 : 1;
  const w = Math.max(af.length, bf.length);
  const x = aInt + af.padEnd(w, "0");
  const y = bInt + bf.padEnd(w, "0");
  return x === y ? 0 : x < y ? -1 : 1;
}

function udec(v: string, field: string, opts: { positive?: boolean } = {}): string {
  if (!UDEC_RE.test(v)) bad(`${field} must be a non-negative decimal string.`);
  if (opts.positive && compareUDec(v, "0") <= 0) bad(`${field} must be > 0.`);
  return v;
}

function parseWith<T>(schema: (v: unknown, p?: string) => T, raw: unknown, path: string): T {
  try {
    return schema(raw, path);
  } catch (err) {
    if (err instanceof ParseError) bad(err.message);
    throw err;
  }
}

function buildPosition(key: string, raw: unknown): PersistedPosition {
  const p = parseWith(persistedPositionSchema, raw, `positions/${key}`);
  if (!ASSET_ID_RE.test(p.assetId)) bad(`Invalid assetId: ${p.assetId}.`);
  if (p.assetId !== key) bad(`positions key ${key} does not match assetId ${p.assetId}.`);
  return {
    assetId: p.assetId,
    qty: udec(p.qty, `positions/${key}/qty`, { positive: true }),
    avgCost: udec(p.avgCost, `positions/${key}/avgCost`),
  };
}

function buildOpenOrder(key: string, raw: unknown): PersistedOpenOrder {
  const o = parseWith(openOrderSchema, raw, `openOrders/${key}`);
  const at = `openOrders/${key}`;
  if (!ORDER_ID_RE.test(o.orderId)) bad("Invalid orderId.");
  if (o.orderId !== key) bad(`openOrders key ${key} does not match orderId.`);
  if (!ASSET_ID_RE.test(o.assetId)) bad(`Invalid assetId: ${o.assetId}.`);
  if (!ORDER_TYPES.has(o.type)) bad(`${at}/type must be market|limit|stop|stop_limit.`);
  if (!ORDER_TIFS.has(o.tif)) bad(`${at}/tif must be day|gtc|ioc|fok.`);
  udec(o.qty, `${at}/qty`, { positive: true });
  udec(o.filled, `${at}/filled`);
  udec(o.avgPrice, `${at}/avgPrice`);
  // An open order has remaining > 0; fully filled orders leave the open book (history is M1-06/M1-08).
  if (compareUDec(o.filled, o.qty) >= 0) bad(`${at}: filled must be < qty for an open order.`);
  const hasFill = compareUDec(o.filled, "0") > 0;
  if (o.status === "PARTIAL" && !hasFill) bad(`${at}: PARTIAL requires filled > 0.`);
  if (!hasFill && compareUDec(o.avgPrice, "0") !== 0) bad(`${at}: avgPrice must be 0 before any fill.`);
  if (hasFill && compareUDec(o.avgPrice, "0") <= 0) bad(`${at}: avgPrice must be > 0 after a fill.`);
  const needsLimit = o.type === "limit" || o.type === "stop_limit";
  const needsStop = o.type === "stop" || o.type === "stop_limit";
  if (needsLimit !== (o.limit !== undefined)) bad(`${at}: limit ${needsLimit ? "required" : "not allowed"} for ${o.type}.`);
  if (needsStop !== (o.stop !== undefined)) bad(`${at}: stop ${needsStop ? "required" : "not allowed"} for ${o.type}.`);
  if (o.limit !== undefined) udec(o.limit, `${at}/limit`, { positive: true });
  if (o.stop !== undefined) udec(o.stop, `${at}/stop`, { positive: true });
  if (o.placedTick < 0) bad(`${at}: placedTick must be >= 0.`);
  const out: PersistedOpenOrder = {
    orderId: o.orderId,
    assetId: o.assetId,
    side: o.side,
    type: o.type,
    qty: o.qty,
    filled: o.filled,
    tif: o.tif,
    status: o.status,
    placedTick: o.placedTick,
    avgPrice: o.avgPrice,
    ...(o.limit !== undefined ? { limit: o.limit } : {}),
    ...(o.stop !== undefined ? { stop: o.stop } : {}),
  };
  return out;
}

function plainObject(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) bad(`${field} must be an object.`);
  return v as Record<string, unknown>;
}

/** Validate + normalize a private ledger commit (throws AuthError BAD_REQUEST). */
export function buildPlayerPrivate(accountId: AccountId, input: PlayerPrivateInput): PlayerPrivateRecord {
  if (!Number.isSafeInteger(input.cashCents) || input.cashCents < 0) {
    bad("cashCents must be a non-negative safe integer.");
  }
  const rawPositions = plainObject(input.positions, "positions");
  const rawOrders = plainObject(input.openOrders, "openOrders");
  const posKeys = Object.keys(rawPositions);
  const orderKeys = Object.keys(rawOrders);
  if (posKeys.length > MAX_POSITIONS) bad("Too many positions.");
  if (orderKeys.length > MAX_OPEN_ORDERS) bad("Too many open orders.");
  // Null-prototype maps: an own "__proto__" key stays data (and then fails the key/id match).
  const positions: Record<string, PersistedPosition> = Object.create(null);
  for (const k of posKeys) positions[k] = buildPosition(k, rawPositions[k]);
  const openOrders: Record<string, PersistedOpenOrder> = Object.create(null);
  for (const k of orderKeys) openOrders[k] = buildOpenOrder(k, rawOrders[k]);
  return { v: PLAYER_PRIVATE_SCHEMA_VERSION, accountId, cashCents: input.cashCents, positions: { ...positions }, openOrders: { ...openOrders } };
}

/** Deep copy so callers never alias the service's in-memory record. */
export function clonePlayerPrivate(p: PlayerPrivateRecord): PlayerPrivateRecord {
  const positions: Record<string, PersistedPosition> = {};
  for (const [k, v] of Object.entries(p.positions)) positions[k] = { ...v };
  const openOrders: Record<string, PersistedOpenOrder> = {};
  for (const [k, v] of Object.entries(p.openOrders)) openOrders[k] = { ...v };
  return { v: p.v, accountId: p.accountId, cashCents: p.cashCents, positions, openOrders };
}

export type ParsedPlayerRow =
  | { readonly ok: true; readonly record: PlayerPrivateRecord; readonly migratedFrom: 1 | null }
  | { readonly ok: false; readonly reason: string };

/**
 * Boundary parse of one stored players[] row (v2, or legacy v1 migrated in place).
 * Legacy v1 rows migrate only when lossless: a v1 qty map has no cost basis and v1 openOrderIds
 * have no order payload, so non-empty v1 lots/orders cannot be reconstructed and are refused
 * (the caller quarantines the raw row verbatim instead of inventing avgCost or dropping it).
 */
export function parsePlayerPrivateRow(raw: unknown): ParsedPlayerRow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "row is not an object" };
  const o = raw as Record<string, unknown>;
  if (typeof o.accountId !== "string" || !o.accountId.startsWith("acc_")) return { ok: false, reason: "bad accountId" };
  const accountId = o.accountId as AccountId;
  try {
    if (o.v === PLAYER_PRIVATE_SCHEMA_VERSION) {
      return {
        ok: true,
        migratedFrom: null,
        record: buildPlayerPrivate(accountId, {
          cashCents: o.cashCents as number,
          positions: o.positions as Record<string, PersistedPosition>,
          openOrders: o.openOrders as Record<string, PersistedOpenOrder>,
        }),
      };
    }
    if (o.v === undefined) {
      const legacyPositions = o.positions ?? {};
      const legacyOrderIds = o.openOrderIds ?? [];
      if (!legacyPositions || typeof legacyPositions !== "object" || Array.isArray(legacyPositions)) {
        return { ok: false, reason: "v1 positions is not an object" };
      }
      if (!Array.isArray(legacyOrderIds)) return { ok: false, reason: "v1 openOrderIds is not an array" };
      if (Object.keys(legacyPositions).length > 0) {
        return { ok: false, reason: "v1 positions have no cost basis; cannot migrate losslessly" };
      }
      if (legacyOrderIds.length > 0) {
        return { ok: false, reason: "v1 openOrderIds have no order payload; cannot reconstruct open orders" };
      }
      return {
        ok: true,
        migratedFrom: 1,
        record: buildPlayerPrivate(accountId, { cashCents: o.cashCents as number, positions: {}, openOrders: {} }),
      };
    }
    return { ok: false, reason: `unknown schema version ${String(o.v)}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "invalid row" };
  }
}
