/**
 * M1-01 account/session foundation types.
 * Compatible with a later Better Auth migration (T19C-02); no stub identity.
 */

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

/** Private player ledger (M1-03 durable; M1-06 order door commits here). */
export interface PlayerPrivateRecord {
  readonly accountId: AccountId;
  readonly cashCents: number;
  readonly positions: Readonly<Record<string, number>>;
  readonly openOrderIds: readonly string[];
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
