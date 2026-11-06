/**
 * M1-01 account/session foundation types.
 * Compatible with a later Better Auth migration (T19C-02); no stub identity.
 */

import type { OpenOrder, Position } from "@/shell/contracts/channels";
import { PORT_AVALON_WORLD_ID, type WorldId } from "@/shell/worldIdentity";

export type AccountId = string & { readonly __brand: "AccountId" };
export type SessionId = string & { readonly __brand: "SessionId" };
export type { WorldId };
export { PORT_AVALON_WORLD_ID };

export interface AccountRecord {
  readonly accountId: AccountId;
  readonly handle: string;
  /** Lowercased handle for uniqueness checks. */
  readonly handleKey: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly createdAtMs: number;
  readonly worldId: WorldId;
}

export interface SessionRecord {
  readonly sessionId: SessionId;
  readonly accountId: AccountId;
  /** SHA-256 hex of the raw cookie token; raw token never persisted. */
  readonly tokenHash: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly lastSeenAtMs: number;
  readonly revokedAtMs: number | null;
}

/**
 * Durable lot: the non-derived subset of the domain `me.positions` row (channels.ts Position).
 * mark/value/upl/pnlPct/weightPct are quote-derived (M1-05/M1-08); pledged/lent are out of V1 scope (always 0 on read).
 */
export type PersistedPosition = Pick<Position, "assetId" | "qty" | "avgCost">;

/**
 * Durable resting order: exactly the domain `me.orders` row (channels.ts OpenOrder); remaining = qty − filled.
 * Ownership is the enclosing PlayerPrivateRecord.accountId (records are keyed and session-gated per account).
 */
export type PersistedOpenOrder = OpenOrder;

/** On-disk private ledger schema. v1 (M1-01/early M1-03) = {cashCents, positions: qty map, openOrderIds}. */
export const PLAYER_PRIVATE_SCHEMA_VERSION = 2 as const;

/** Private player ledger (M1-03 durable; M1-06 order door mutates via AuthService.updateOwnPrivateState). */
export interface PlayerPrivateRecord {
  readonly v: typeof PLAYER_PRIVATE_SCHEMA_VERSION;
  readonly accountId: AccountId;
  readonly cashCents: number;
  /** Keyed by assetId. */
  readonly positions: Readonly<Record<string, PersistedPosition>>;
  /** Keyed by orderId. */
  readonly openOrders: Readonly<Record<string, PersistedOpenOrder>>;
}

export interface PublicAccount {
  readonly accountId: AccountId;
  readonly handle: string;
  readonly createdAtMs: number;
  readonly worldId: WorldId;
}

export interface AuthSessionView {
  readonly sessionId: SessionId;
  readonly account: PublicAccount;
  readonly expiresAtMs: number;
}

export type AuthErrorCode =
  | "HANDLE_TAKEN"
  | "HANDLE_INVALID"
  | "PASSWORD_WEAK"
  | "BAD_CREDENTIALS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "LEDGER_QUARANTINED"
  | "UNSUPPORTED_DEPLOY";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(code: AuthErrorCode, message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export function toPublicAccount(account: AccountRecord): PublicAccount {
  return {
    accountId: account.accountId,
    handle: account.handle,
    createdAtMs: account.createdAtMs,
    worldId: account.worldId,
  };
}
