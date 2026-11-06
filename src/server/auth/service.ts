import { hashPassword, hashToken, mintSessionToken, newId, verifyPassword } from "./crypto";
import type { AuthStore } from "./store";
import {
  AuthError,
  PORT_AVALON_WORLD_ID,
  toPublicAccount,
  type AccountId,
  type AccountRecord,
  type AuthSessionView,
  type PlayerPrivateRecord,
  type SessionId,
  type SessionRecord,
} from "./types";

/** Match T19C session_idle_days / session_max_days defaults (real days). */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000;

/** V1 start cash placeholder — M2-02 displays $10k; isolation tests need a private field. */
export const START_CASH_CENTS = 1_000_000;

const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/;
const MIN_PASSWORD_LEN = 8;

export interface AuthServiceOptions {
  readonly store: AuthStore;
  readonly now?: () => number;
  readonly worldId?: typeof PORT_AVALON_WORLD_ID;
}

export class AuthService {
  private readonly store: AuthStore;
  private readonly now: () => number;
  private readonly worldId: typeof PORT_AVALON_WORLD_ID;
  private accounts = new Map<AccountId, AccountRecord>();
  private handleIndex = new Map<string, AccountId>();
  private sessions = new Map<SessionId, SessionRecord>();
  private tokenIndex = new Map<string, SessionId>();
  private players = new Map<AccountId, PlayerPrivateRecord>();
  private ready: Promise<void>;

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => Date.now());
    this.worldId = options.worldId ?? PORT_AVALON_WORLD_ID;
    this.ready = this.reload();
  }

  async reload(): Promise<void> {
    const snap = await this.store.load();
    this.accounts = new Map(snap.accounts.map((a) => [a.accountId, a]));
    this.handleIndex = new Map(snap.accounts.map((a) => [a.handleKey, a.accountId]));
    this.sessions = new Map(snap.sessions.map((s) => [s.sessionId, s]));
    this.tokenIndex = new Map(snap.sessions.filter((s) => s.revokedAtMs === null).map((s) => [s.tokenHash, s.sessionId]));
    this.players = new Map(snap.players.map((p) => [p.accountId, p]));
  }

  private async persist(): Promise<void> {
    await this.store.save({
      accounts: [...this.accounts.values()],
      sessions: [...this.sessions.values()],
      players: [...this.players.values()],
    });
  }

  async register(input: { handle: string; password: string }): Promise<{ view: AuthSessionView; rawToken: string }> {
    await this.ready;
    const handle = input.handle.trim();
    if (!HANDLE_RE.test(handle)) {
      throw new AuthError("HANDLE_INVALID", "Handle must be 3–32 chars, start with a letter, and use only letters, digits, underscore.", 400);
    }
    if (typeof input.password !== "string" || input.password.length < MIN_PASSWORD_LEN) {
      throw new AuthError("PASSWORD_WEAK", `Password must be at least ${MIN_PASSWORD_LEN} characters.`, 400);
    }
    const handleKey = handle.toLowerCase();
    if (this.handleIndex.has(handleKey)) {
      throw new AuthError("HANDLE_TAKEN", "That handle is already taken.", 409);
    }

    const { hash, salt } = await hashPassword(input.password);
    const accountId = newId("acc") as AccountId;
    const createdAtMs = this.now();
    const account: AccountRecord = {
      accountId,
      handle,
      handleKey,
      passwordHash: hash,
      passwordSalt: salt,
      createdAtMs,
      worldId: this.worldId,
    };
    const player: PlayerPrivateRecord = {
      accountId,
      cashCents: START_CASH_CENTS,
      positions: {},
      openOrderIds: [],
    };

    this.accounts.set(accountId, account);
    this.handleIndex.set(handleKey, accountId);
    this.players.set(accountId, player);

    const session = await this.createSession(accountId);
    await this.persist();
    return session;
  }

  async login(input: { handle: string; password: string }): Promise<{ view: AuthSessionView; rawToken: string }> {
    await this.ready;
    const handleKey = input.handle.trim().toLowerCase();
    const accountId = this.handleIndex.get(handleKey);
    if (!accountId) {
      // Constant-ish work path: still hash against a dummy to reduce timing oracle on missing handle.
      await hashPassword(input.password).catch(() => undefined);
      throw new AuthError("BAD_CREDENTIALS", "Invalid handle or password.", 401);
    }
    const account = this.accounts.get(accountId);
    if (!account) throw new AuthError("BAD_CREDENTIALS", "Invalid handle or password.", 401);

    const ok = await verifyPassword(input.password, account.passwordHash, account.passwordSalt);
    if (!ok) throw new AuthError("BAD_CREDENTIALS", "Invalid handle or password.", 401);

    const session = await this.createSession(account.accountId);
    await this.persist();
    return session;
  }

  async logout(rawToken: string | null | undefined): Promise<void> {
    await this.ready;
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);
    const sessionId = this.tokenIndex.get(tokenHash);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAtMs !== null) return;
    const revoked: SessionRecord = { ...session, revokedAtMs: this.now() };
    this.sessions.set(sessionId, revoked);
    this.tokenIndex.delete(tokenHash);
    await this.persist();
  }

  /**
   * Resolve a live session from the raw cookie token.
   * Rolling idle expiry: lastSeen advances; absolute max from createdAt still enforced.
   */
  async resolveSession(rawToken: string | null | undefined): Promise<AuthSessionView | null> {
    await this.ready;
    if (!rawToken) return null;
    const tokenHash = hashToken(rawToken);
    const sessionId = this.tokenIndex.get(tokenHash);
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAtMs !== null) return null;

    const now = this.now();
    const absoluteExpiry = session.createdAtMs + SESSION_MAX_MS;
    const idleExpiry = session.lastSeenAtMs + SESSION_IDLE_MS;
    if (now > absoluteExpiry || now > idleExpiry || now > session.expiresAtMs) {
      const revoked: SessionRecord = { ...session, revokedAtMs: now };
      this.sessions.set(sessionId, revoked);
      this.tokenIndex.delete(tokenHash);
      await this.persist();
      return null;
    }

    const refreshed: SessionRecord = {
      ...session,
      lastSeenAtMs: now,
      expiresAtMs: Math.min(now + SESSION_IDLE_MS, absoluteExpiry),
    };
    this.sessions.set(sessionId, refreshed);
    await this.persist();

    const account = this.accounts.get(session.accountId);
    if (!account) return null;
    return {
      sessionId: refreshed.sessionId,
      account: toPublicAccount(account),
      expiresAtMs: refreshed.expiresAtMs,
    };
  }

  /**
   * Player isolation boundary: private cash/positions/orders only for the session's own accountId.
   * Requesting another accountId is always FORBIDDEN — never return cross-player private state.
   */
  async getPlayerPrivate(session: AuthSessionView, accountId: AccountId): Promise<PlayerPrivateRecord> {
    await this.ready;
    if (session.account.accountId !== accountId) {
      throw new AuthError("FORBIDDEN", "Player isolation: cannot access another player's private state.", 403);
    }
    const player = this.players.get(accountId);
    if (!player) throw new AuthError("UNAUTHORIZED", "No player record for this account.", 401);
    return {
      accountId: player.accountId,
      cashCents: player.cashCents,
      positions: { ...player.positions },
      openOrderIds: [...player.openOrderIds],
    };
  }

  /** Test/helper: mutate own private cash only through the isolation gate. */
  async setOwnCashCents(session: AuthSessionView, cashCents: number): Promise<PlayerPrivateRecord> {
    await this.ready;
    if (!Number.isInteger(cashCents) || cashCents < 0) {
      throw new AuthError("BAD_REQUEST", "cashCents must be a non-negative integer.", 400);
    }
    const current = await this.getPlayerPrivate(session, session.account.accountId);
    const next: PlayerPrivateRecord = { ...current, cashCents };
    this.players.set(session.account.accountId, next);
    await this.persist();
    return next;
  }

  private async createSession(accountId: AccountId): Promise<{ view: AuthSessionView; rawToken: string }> {
    const account = this.accounts.get(accountId);
    if (!account) throw new AuthError("UNAUTHORIZED", "Account missing.", 401);
    const { rawToken, tokenHash } = mintSessionToken();
    const now = this.now();
    const sessionId = newId("ses") as SessionId;
    const session: SessionRecord = {
      sessionId,
      accountId,
      tokenHash,
      createdAtMs: now,
      lastSeenAtMs: now,
      expiresAtMs: Math.min(now + SESSION_IDLE_MS, now + SESSION_MAX_MS),
      revokedAtMs: null,
    };
    this.sessions.set(sessionId, session);
    this.tokenIndex.set(tokenHash, sessionId);
    return {
      rawToken,
      view: {
        sessionId,
        account: toPublicAccount(account),
        expiresAtMs: session.expiresAtMs,
      },
    };
  }
}
