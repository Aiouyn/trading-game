/**
 * Private player ledger fields (M1-03).
 * Auth FileAuthStore persists these; future M1-06 order door commits through AuthService.
 * Not a separate blob store — same store.json players[] array.
 */
import { AuthError, type AccountId, type PlayerPrivateRecord } from "@/server/auth";

const ASSET_ID_RE = /^[A-Z][A-Z0-9]{0,11}$/;
const ORDER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_POSITIONS = 64;
const MAX_OPEN_ORDERS = 128;

export type PlayerPrivateInput = {
  readonly cashCents: number;
  readonly positions: Readonly<Record<string, number>>;
  readonly openOrderIds: readonly string[];
};

/** Boundary parse: unknown JSON → PlayerPrivateRecord or null (skip corrupt row). */
export function parsePlayerPrivateRecord(raw: unknown): PlayerPrivateRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.accountId !== "string" || !o.accountId.startsWith("acc_")) return null;
  try {
    return buildPlayerPrivate(o.accountId as AccountId, {
      cashCents: o.cashCents as number,
      positions: (o.positions ?? {}) as Record<string, number>,
      openOrderIds: (o.openOrderIds ?? []) as string[],
    });
  } catch {
    return null;
  }
}

/** Validate + normalize a private ledger commit (throws AuthError). */
export function buildPlayerPrivate(accountId: AccountId, input: PlayerPrivateInput): PlayerPrivateRecord {
  if (!Number.isInteger(input.cashCents) || input.cashCents < 0 || input.cashCents > Number.MAX_SAFE_INTEGER) {
    throw new AuthError("BAD_REQUEST", "cashCents must be a non-negative safe integer.", 400);
  }
  if (!input.positions || typeof input.positions !== "object" || Array.isArray(input.positions)) {
    throw new AuthError("BAD_REQUEST", "positions must be an object.", 400);
  }
  if (!Array.isArray(input.openOrderIds)) {
    throw new AuthError("BAD_REQUEST", "openOrderIds must be an array.", 400);
  }
  const posKeys = Object.keys(input.positions);
  if (posKeys.length > MAX_POSITIONS) {
    throw new AuthError("BAD_REQUEST", "Too many positions.", 400);
  }
  const positions: Record<string, number> = {};
  for (const assetId of posKeys) {
    if (!ASSET_ID_RE.test(assetId)) {
      throw new AuthError("BAD_REQUEST", `Invalid assetId: ${assetId}.`, 400);
    }
    const qty = input.positions[assetId];
    if (!Number.isInteger(qty) || (qty as number) <= 0 || (qty as number) > 1_000_000_000) {
      throw new AuthError("BAD_REQUEST", `Invalid qty for ${assetId}.`, 400);
    }
    positions[assetId] = qty as number;
  }
  if (input.openOrderIds.length > MAX_OPEN_ORDERS) {
    throw new AuthError("BAD_REQUEST", "Too many open orders.", 400);
  }
  const openOrderIds: string[] = [];
  const seen = new Set<string>();
  for (const id of input.openOrderIds) {
    if (typeof id !== "string" || !ORDER_ID_RE.test(id)) {
      throw new AuthError("BAD_REQUEST", "Invalid openOrderId.", 400);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    openOrderIds.push(id);
  }
  return { accountId, cashCents: input.cashCents, positions, openOrderIds };
}

export { cashCentsToMoney } from "@/shell/cashFormat";
