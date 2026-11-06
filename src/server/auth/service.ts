import { hashPassword, hashToken, mintSessionToken, newId, verifyPassword } from "./crypto";
import type { AuthStore } from "./store";
import { AttemptThrottle } from "./throttle";
import { buildPlayerPrivate, type PlayerPrivateInput } from "@/server/player";
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
/** Bound scrypt work; rejects absurd bodies. */
export const MAX_PASSWORD_LEN = 128;

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
  /** Serializes mutating ops so async scrypt cannot race handle uniqueness / file writes. */
  private queue: Promise<void> = Promise.resolve();
  /** Failed login attempts per handleKey (10 / 15 min). M3 owns real edge rate limits. */
  private readonly loginThrottle = new AttemptThrottle(10, 15 * 60 * 1000);
  /** Register attempts per handleKey (10 / 15 min) to blunt stuffing. */
  private readonly registerThrottle = new AttemptThrottle(10, 15 * 60 * 1000);

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => Date.now());
    this.worldId = options.worldId ?? PORT_AVALON_WORLD_ID;
    this.ready = this.reload();
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
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

  private assertPassword(password: string): void {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LEN) {
      throw new AuthError("PASSWORD_WEAK", `Password must be at least ${MIN_PASSWORD_LEN} characters.`, 400);
    }
    if (password.length > MAX_PASSWORD_LEN) {
      throw new AuthError("PASSWORD_WEAK", `Password must be at most ${MAX_PASSWORD_LEN} characters.`, 400);
    }
  }

  async register(input: { handle: string; password: string }): Promise<{ view: AuthSessionView; rawToken: string }> {
    return this.withLock(async () => {
      await this.ready;
      const handle = input.handle.trim();
      if (!HANDLE_RE.test(handle)) {
        throw new AuthError("HANDLE_INVALID", "Handle must be 3–32 chars, start with a letter, and use only letters, digits, underscore.", 400);
      }
      this.assertPassword(input.password);
      const handleKey = handle.toLowerCase();
      const retry = this.registerThrottle.check(handleKey);
      if (retry !== null) {
        throw new AuthError("RATE_LIMITED", "Too many account attempts. Try again later.", 429, retry);
      }
      this.registerThrottle.hit(handleKey);
      if (this.handleIndex.has(handleKey)) {
        throw new AuthError("HANDLE_TAKEN", "That handle is already taken.", 409);
      }

      const { hash, salt } = await hashPassword(input.password);
      // Re-check after await: another waiter could have claimed the handle if lock were absent; keep for clarity.
      if (this.handleIndex.has(handleKey)) {
        throw new AuthError("HANDLE_TAKEN", "That handle is already taken.", 409);
      }
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
    });
  }

  async login(input: { handle: string; password: string }): Promise<{ view: AuthSessionView; rawToken: string }> {
    return this.withLock(async () => {
      await this.ready;
      // Bound scrypt DoS only; short/wrong passwords still map to BAD_CREDENTIALS.
      if (typeof input.password === "string" && input.password.length > MAX_PASSWORD_LEN) {
        throw new AuthError("PASSWORD_WEAK", `Password must be at most ${MAX_PASSWORD_LEN} characters.`, 400);
      }
      const handleKey = input.handle.trim().toLowerCase();
      const retry = this.loginThrottle.check(handleKey || "unknown");
      if (retry !== null) {
        throw new AuthError("RATE_LIMITED", "Too many sign-in attempts. Try again later.", 429, retry);
      }
      const accountId = this.handleIndex.get(handleKey);
      if (!accountId) {
        this.loginThrottle.hit(handleKey || "unknown");
        await verifyPassword(input.password, "0".repeat(128), "00".repeat(16)).catch(() => false);
        throw new AuthError("BAD_CREDENTIALS", "Invalid handle or password.", 401);
      }
      const account = this.accounts.get(accountId);
      if (!account) {
        this.loginThrottle.hit(handleKey);
        throw new AuthError("BAD_CREDENTIALS", "Invalid handle or password.", 401);
      }

      const ok = await verifyPassword(input.password, account.passwordHash, account.passwordSalt);
      if (!ok) {
        this.loginThrottle.hit(handleKey);
        throw new AuthError("BAD_CREDENTIALS", "Invalid handle or password.", 401);
      }

      this.loginThrottle.clear(handleKey);
      const session = await this.createSession(account.accountId);
      await this.persist();
      return session;
    });
  }

  async logout(rawToken: string | null | undefined): Promise<void> {
    return this.withLock(async () => {
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
    });
  }

  /**
   * Resolve a live session from the raw cookie token.
   * Rolling idle expiry: lastSeen advances; absolute max from createdAt still enforced.
   */
  async resolveSession(rawToken: string | null | undefined): Promise<AuthSessionView | null> {
    return this.withLock(async () => {
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
    });
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

  /**
   * Commit own private ledger (M1-03). Isolation-gated; durable via AuthStore.
   * Future M1-06 order door calls this after atomic cash/holding checks — not a client cheat path.
   */
  async commitOwnPrivateState(session: AuthSessionView, input: PlayerPrivateInput): Promise<PlayerPrivateRecord> {
    return this.withLock(async () => {
      await this.ready;
      const accountId = session.account.accountId;
      if (!this.players.has(accountId)) {
        throw new AuthError("UNAUTHORIZED", "No player record for this account.", 401);
      }
      const next = buildPlayerPrivate(accountId, input);
      this.players.set(accountId, next);
      await this.persist();
      return {
        accountId: next.accountId,
        cashCents: next.cashCents,
        positions: { ...next.positions },
        openOrderIds: [...next.openOrderIds],
      };
    });
  }

  /** Convenience: mutate own cash only (preserves positions/orders) under one lock. */
  async setOwnCashCents(session: AuthSessionView, cashCents: number): Promise<PlayerPrivateRecord> {
    return this.withLock(async () => {
      await this.ready;
      const accountId = session.account.accountId;
      const current = this.players.get(accountId);
      if (!current) throw new AuthError("UNAUTHORIZED", "No player record for this account.", 401);
      const next = buildPlayerPrivate(accountId, {
        cashCents,
        positions: current.positions,
        openOrderIds: current.openOrderIds,
      });
      this.players.set(accountId, next);
      await this.persist();
      return {
        accountId: next.accountId,
        cashCents: next.cashCents,
        positions: { ...next.positions },
        openOrderIds: [...next.openOrderIds],
      };
    });
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
