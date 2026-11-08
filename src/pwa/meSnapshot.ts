// M2-05 offline `me` snapshot (doc 19 Rule 3.17.5: "offline screen shows the last `me` snapshot read-only with its
// tick"; doc 17 §3.19: never market data). One sanitised record of the player's OWN saved server ledger, kept in
// localStorage for the static offline page (public/offline.html, which re-validates it with the same rules).
// Security boundary (docs/v1/PWA.md):
// - Written only from a server ledger adopted by a signed-in feed whose account is the session's current account;
//   a late ledger from a previous account (after sign-out / another sign-in) is refused.
// - Allowlisted fields only: tick, cash, cash held for working orders, positions {asset, qty, avg cost}, working
//   orders {asset, side, type, qty, filled, limit, stop, status}. No marks, values, P/L or net worth (market data),
//   no fills, intents, alerts, order ids, handle, email, session, cookie, token or raw response.
// - Deleted on sign-out, on a definite signed-out answer, and when another account signs in.
import type { BrokerLedgerView } from "@/market/brokerLedger";

export const ME_SNAPSHOT_KEY = "quay.offline.me.v1";
export const ME_SNAPSHOT_LIMITS = { positions: 64, orders: 64, chars: 16384 } as const;

export interface MeSnapshotPosition { asset: string; qty: string; avgCost: string }
export interface MeSnapshotOrder { asset: string; side: "BUY" | "SELL"; type: string; qty: string; filled: string; limit?: string; stop?: string; status: string }
export interface MeSnapshot {
  v: 1;
  acct: string; // opaque server account id: the record's namespace, not a credential
  savedAt: number; // real ms when this device received the ledger
  tick: number;
  cash: number; // cents
  held: number; // cents held by working orders
  positions: MeSnapshotPosition[];
  orders: MeSnapshotOrder[];
}

const ACCT = /^acc_[0-9a-f]{32}$/;
const ASSET = /^[A-Z0-9]{1,12}$/;
const QTY = /^\d{1,12}$/;
const PRICE = /^\d{1,12}(\.\d{1,6})?$/;
const TYPES = ["market", "limit", "stop", "stop_limit"];
const STATUSES = ["PENDING", "WORKING", "PARTIAL", "QUEUED_AUCTION"];
const isInt = (n: unknown, max = Number.MAX_SAFE_INTEGER): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max;
const only = (o: unknown, req: readonly string[], opt: readonly string[] = []): o is Record<string, unknown> =>
  typeof o === "object" && o !== null && !Array.isArray(o) &&
  req.every((k) => Object.hasOwn(o, k)) && Object.keys(o).every((k) => req.includes(k) || opt.includes(k));
const str = (v: unknown, re: RegExp): v is string => typeof v === "string" && re.test(v);

/** Strict reader: null for anything that is not exactly an allowlisted snapshot (unknown keys, bad values, oversize). */
export function parseMeSnapshot(text: string | null): MeSnapshot | null {
  if (typeof text !== "string" || text.length > ME_SNAPSHOT_LIMITS.chars) return null;
  let o: unknown;
  try { o = JSON.parse(text); } catch { return null; }
  if (!only(o, ["v", "acct", "savedAt", "tick", "cash", "held", "positions", "orders"])) return null;
  if (o.v !== 1 || !str(o.acct, ACCT) || !isInt(o.savedAt) || !isInt(o.tick) || !isInt(o.cash) || !isInt(o.held)) return null;
  if (!Array.isArray(o.positions) || o.positions.length > ME_SNAPSHOT_LIMITS.positions) return null;
  if (!Array.isArray(o.orders) || o.orders.length > ME_SNAPSHOT_LIMITS.orders) return null;
  for (const p of o.positions) if (!only(p, ["asset", "qty", "avgCost"]) || !str(p.asset, ASSET) || !str(p.qty, QTY) || !str(p.avgCost, PRICE)) return null;
  for (const r of o.orders) {
    if (!only(r, ["asset", "side", "type", "qty", "filled", "status"], ["limit", "stop"])) return null;
    if (!str(r.asset, ASSET) || (r.side !== "BUY" && r.side !== "SELL") || !TYPES.includes(r.type as string) || !str(r.qty, QTY) || !str(r.filled, QTY) || !STATUSES.includes(r.status as string)) return null;
    if ((r.limit !== undefined && !str(r.limit, PRICE)) || (r.stop !== undefined && !str(r.stop, PRICE))) return null;
  }
  return o as unknown as MeSnapshot;
}

/** The allowlisted record for one server ledger (null when it would not pass the reader). */
export function toMeSnapshot(acct: string, v: BrokerLedgerView, savedAt: number): MeSnapshot | null {
  const snap: MeSnapshot = {
    v: 1, acct, savedAt, tick: v.tick, cash: v.cashCents, held: v.reservedCashCents,
    positions: Object.values(v.positions).map((p) => ({ asset: p.assetId, qty: p.qty, avgCost: p.avgCost })),
    orders: Object.values(v.orders).map((o) => ({
      asset: o.assetId, side: o.side, type: o.type, qty: o.qty, filled: o.filled,
      ...(o.limit !== undefined ? { limit: o.limit } : {}), ...(o.stop !== undefined ? { stop: o.stop } : {}), status: o.status,
    })),
  };
  return parseMeSnapshot(JSON.stringify(snap)) ? snap : null;
}

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
function remove(): void {
  try { storage()?.removeItem(ME_SNAPSHOT_KEY); } catch { /* storage unavailable: nothing was kept */ }
}

/** The account the session currently belongs to (authSession sets it). Only its ledgers may be written. */
let current: string | null = null;

/** Signed in as `acct`: writes allowed for it; a record of any other account (or an unreadable one) is deleted. */
export function snapshotSignedIn(acct: string): void {
  current = ACCT.test(acct) ? acct : null;
  let text: string | null = null;
  try { text = storage()?.getItem(ME_SNAPSHOT_KEY) ?? null; } catch { text = null; }
  if (text === null) return;
  const snap = parseMeSnapshot(text);
  if (!snap || snap.acct !== current) remove();
}
/** Signed out (sign-out, or the server says there is no session): no writes, record deleted. */
export function snapshotSignedOut(): void { current = null; remove(); }
/** Session state unknown (network error): stop writing, keep the record for the offline page. */
export function snapshotUnknown(): void { current = null; }

/** Save the latest own ledger for `acct`; refused unless `acct` is the current account. Returns whether it was kept. */
export function saveMeSnapshot(acct: string, v: BrokerLedgerView, now: number = Date.now()): boolean {
  if (current === null || acct !== current) return false;
  const snap = toMeSnapshot(acct, v, now);
  const s = storage();
  if (!snap || !s) { remove(); return false; } // a ledger we cannot represent never leaves an older one looking current
  try { s.setItem(ME_SNAPSHOT_KEY, JSON.stringify(snap)); return true; } catch { remove(); return false; }
}

export const _snapshotForTests = { reset() { current = null; }, current: () => current };
