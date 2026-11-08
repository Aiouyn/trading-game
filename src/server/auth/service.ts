import { hashPassword, hashToken, mintSessionToken, newId, verifyPassword } from "./crypto";
import type { AuthStore } from "./store";
import { AttemptThrottle } from "./throttle";
import { buildPlayerPrivate, clonePlayerPrivate, type PlayerPrivateInput } from "@/server/player";
import type { QuarantinedPlayerRow } from "./store";
import { cloneLaunchpad, coinRows, coinValueCents, emptyLaunchpad, parseLaunchpad, type LpCoinRow, type LpState } from "@/server/launchpad/state";
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

/** One account's standing inputs (M2-03): public handle + saved total cash + held quantities. */
export interface StandingInput {
  readonly accountId: AccountId;
  readonly handle: string;
  readonly handleKey: string;
  readonly cashCents: number;
  readonly positions: readonly { readonly assetId: string; readonly qty: number }[];
  /** Launchpad coins at the indicative liquidation value (cents), read in the same locked step. Only a total. */
  readonly coinCents: number;
}

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
  /** Unloadable ledger rows, preserved verbatim on every persist (never wiped). */
  private quarantinedPlayers: QuarantinedPlayerRow[] = [];
  /** The Launchpad section: parsed, or kept raw (never rewritten or reset) when it could not be parsed. */
  private launchpad: { ok: true; state: LpState } | { ok: false; raw: unknown } = { ok: true, state: emptyLaunchpad() };
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
    this.quarantinedPlayers = snap.quarantinedPlayers;
    const lp = parseLaunchpad(snap.launchpad);
    this.launchpad = lp.ok ? lp : { ok: false, raw: snap.launchpad };
  }

  private async persist(): Promise<void> {
    await this.store.save({
      accounts: [...this.accounts.values()],
      sessions: [...this.sessions.values()],
      players: [...this.players.values()],
      quarantinedPlayers: this.quarantinedPlayers,
      launchpad: this.launchpad.ok ? this.launchpad.state : this.launchpad.raw,
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
      const player = buildPlayerPrivate(accountId, { cashCents: START_CASH_CENTS, positions: {}, openOrders: {} });

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
   * Read-only session check (M2-03 leaderboard): the same validity rules as resolveSession (not revoked, within idle,
   * absolute and stored expiry), but it never refreshes lastSeen or revokes, so a read route writes nothing. An expired
   * session simply reads as signed out here; the next resolveSession revokes it.
   */
  async peekSession(rawToken: string | null | undefined): Promise<AuthSessionView | null> {
    await this.ready;
    if (!rawToken) return null;
    const sessionId = this.tokenIndex.get(hashToken(rawToken));
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || session.revokedAtMs !== null) return null;
    const now = this.now();
    if (now > session.createdAtMs + SESSION_MAX_MS || now > session.lastSeenAtMs + SESSION_IDLE_MS || now > session.expiresAtMs) return null;
    const account = this.accounts.get(session.accountId);
    if (!account) return null;
    return { sessionId: session.sessionId, account: toPublicAccount(account), expiresAtMs: session.expiresAtMs };
  }

  /**
   * Every saved ledger with its public handle, for the world leaderboard (M2-03). `read` runs synchronously inside the
   * service lock, so an order commit or a tick sweep is seen whole or not at all, and the caller can take its quote
   * snapshot in the same step. Read-only: nothing is persisted. Quarantined and ledger-less accounts are left out and
   * counted. Only what ranking needs leaves here (no hash, salt, session or order data).
   */
  async readStandings<T>(read: (rows: readonly StandingInput[], excluded: number) => T): Promise<T> {
    return this.withLock(async () => {
      await this.ready;
      const lp = this.requireLaunchpad(); // coin holdings unknown → the board can't state wealth (503), never cash-only
      const rows: StandingInput[] = [];
      let excluded = 0;
      for (const account of this.accounts.values()) {
        const player = this.players.get(account.accountId);
        if (!player || this.quarantinedPlayers.some((q) => q.accountId === account.accountId)) { excluded++; continue; }
        rows.push({
          accountId: account.accountId, handle: account.handle, handleKey: account.handleKey, cashCents: player.cashCents,
          positions: Object.values(player.positions).map((p) => ({ assetId: p.assetId, qty: Number(p.qty) })),
          coinCents: coinValueCents(coinRows(lp, account.accountId)),
        });
      }
      return read(rows, excluded);
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
    return clonePlayerPrivate(this.requireLedger(accountId));
  }

  private requireLedger(accountId: AccountId): PlayerPrivateRecord {
    if (this.quarantinedPlayers.some((q) => q.accountId === accountId)) {
      throw new AuthError("LEDGER_QUARANTINED", "Saved player ledger could not be loaded; it is preserved for repair.", 409);
    }
    const player = this.players.get(accountId);
    if (!player) throw new AuthError("UNAUTHORIZED", "No player record for this account.", 401);
    return player;
  }

  /**
   * Atomic read-modify-write of the caller's OWN private ledger (M1-03 seam for the M1-06 order door).
   * `mutate` runs inside the service lock against the latest committed record, so concurrent commits
   * (two sessions, two accounts) cannot lose updates. Server-only: no HTTP route exposes this, and the
   * caller can never choose the accountId — it is the session's.
   */
  async updateOwnPrivateState(
    session: AuthSessionView,
    mutate: (current: PlayerPrivateRecord) => PlayerPrivateInput,
  ): Promise<PlayerPrivateRecord> {
    return this.withLock(async () => {
      await this.ready;
      return this.commitOwn(session.account.accountId, mutate);
    });
  }

  /**
   * The Broker's write door: `updateOwnPrivateState` plus the caller's own Launchpad coin rows read in the same locked
   * step, so the reply ledger states cash and coins at one moment. Refuses before any change (503) while the Launchpad
   * section is unavailable: the ledger's wealth could not be stated.
   */
  async updateOwnLedger(
    session: AuthSessionView,
    mutate: (current: PlayerPrivateRecord) => PlayerPrivateInput,
  ): Promise<{ record: PlayerPrivateRecord; coins: LpCoinRow[] }> {
    return this.withLock(async () => {
      await this.ready;
      const lp = this.requireLaunchpad();
      const accountId = session.account.accountId;
      const record = await this.commitOwn(accountId, mutate);
      return { record, coins: coinRows(lp, accountId) };
    });
  }

  /** The caller's own ledger and Launchpad coin rows, read together inside the service lock. */
  async readOwnLedger(session: AuthSessionView): Promise<{ record: PlayerPrivateRecord; coins: LpCoinRow[] }> {
    return this.withLock(async () => {
      await this.ready;
      const lp = this.requireLaunchpad();
      const accountId = session.account.accountId;
      return { record: clonePlayerPrivate(this.requireLedger(accountId)), coins: coinRows(lp, accountId) };
    });
  }

  /** Lock held by the caller. */
  private async commitOwn(accountId: AccountId, mutate: (current: PlayerPrivateRecord) => PlayerPrivateInput): Promise<PlayerPrivateRecord> {
    const current = this.requireLedger(accountId);
    const next = buildPlayerPrivate(accountId, mutate(clonePlayerPrivate(current)));
    this.players.set(accountId, next);
    try {
      await this.persist();
    } catch (err) {
      this.players.set(accountId, current); // memory never runs ahead of disk
      throw err;
    }
    return clonePlayerPrivate(next);
  }

  /**
   * Server-internal market sweep (M1-06 resting limit fills on a server tick). Not reachable from HTTP and never
   * session-chosen: the market clock applies one rule to every loadable ledger. `mutate` returns null for "no change".
   * All changed ledgers commit in one persist; if it fails, every one rolls back (memory never runs ahead of disk).
   * Quarantined accounts are never touched.
   */
  async sweepPrivateStates(mutate: (current: PlayerPrivateRecord) => PlayerPrivateInput | null): Promise<number> {
    return this.withLock(async () => {
      await this.ready;
      const before = new Map<AccountId, PlayerPrivateRecord>();
      const next = new Map<AccountId, PlayerPrivateRecord>();
      for (const [accountId, current] of this.players) {
        if (this.quarantinedPlayers.some((q) => q.accountId === accountId)) continue;
        const input = mutate(clonePlayerPrivate(current));
        if (input === null) continue;
        // Validate every next record before any becomes visible.
        next.set(accountId, buildPlayerPrivate(accountId, input));
        before.set(accountId, current);
      }
      if (next.size === 0) return 0;
      for (const [accountId, record] of next) this.players.set(accountId, record);
      try {
        await this.persist();
      } catch (err) {
        for (const [accountId, record] of before) this.players.set(accountId, record);
        throw err;
      }
      return next.size;
    });
  }

  /**
   * Read the Launchpad inside the service lock (a commit is seen whole or not at all). Read-only: nothing is persisted.
   * `self` is the caller's own ledger (null for a guest, a quarantined or a missing one); no other account's ledger
   * is reachable from here, only public handles.
   */
  async readLaunchpad<T>(
    session: AuthSessionView | null,
    read: (lp: Readonly<LpState>, self: PlayerPrivateRecord | null, handleOf: (id: string) => string | null, now: number) => T,
  ): Promise<T> {
    return this.withLock(async () => {
      await this.ready;
      const lp = this.requireLaunchpad();
      const id = session?.account.accountId;
      const self = id && !this.quarantinedPlayers.some((q) => q.accountId === id) ? this.players.get(id) ?? null : null;
      return read(cloneLaunchpad(lp), self ? clonePlayerPrivate(self) : null, (a) => this.accounts.get(a as AccountId)?.handle ?? null, this.now());
    });
  }

  /**
   * One Launchpad commit for the caller (a launch or a trade), atomic with its cash effects. `decide` runs inside the
   * service lock on copies: the Launchpad, the caller's own ledger, and a read of other loadable ledgers (only ever used
   * by the server's rules, for the creator's fee share; never returned to the caller). It returns the next Launchpad
   * and the next cash of each account it changes, or no `lp` for "no change" (a refusal or a replay). Every next ledger is
   * validated before any becomes visible; everything commits in one persist, and on a failed persist the Launchpad and
   * every ledger roll back (no coin is published and no cash moves).
   */
  async commitLaunchpad<T>(
    session: AuthSessionView,
    decide: (ctx: {
      lp: LpState;
      self: PlayerPrivateRecord;
      ledgerOf: (id: string) => PlayerPrivateRecord | null;
      now: number;
    }) => { result: T; lp?: LpState; cash?: ReadonlyMap<string, number> },
  ): Promise<T> {
    return this.withLock(async () => {
      await this.ready;
      const lpBefore = this.requireLaunchpad();
      const selfId = session.account.accountId;
      const self = this.requireLedger(selfId);
      const ledgerOf = (id: string) => {
        if (this.quarantinedPlayers.some((q) => q.accountId === id)) return null;
        const p = this.players.get(id as AccountId);
        return p ? clonePlayerPrivate(p) : null;
      };
      const out = decide({ lp: cloneLaunchpad(lpBefore), self: clonePlayerPrivate(self), ledgerOf, now: this.now() });
      if (!out.lp) return out.result;
      const before = new Map<AccountId, PlayerPrivateRecord>();
      const next = new Map<AccountId, PlayerPrivateRecord>();
      for (const [id, cashCents] of out.cash ?? []) {
        const current = ledgerOf(id);
        if (!current) throw new AuthError("LEDGER_QUARANTINED", "A ledger this trade pays could not be loaded.", 409);
        next.set(id as AccountId, buildPlayerPrivate(id as AccountId, { ...current, cashCents }));
        before.set(id as AccountId, this.players.get(id as AccountId)!);
      }
      const nextLp = parseLaunchpad(out.lp);
      if (!nextLp.ok) throw new Error(`Launchpad commit failed its own check: ${nextLp.reason}`);
      for (const [id, r] of next) this.players.set(id, r);
      this.launchpad = nextLp;
      try {
        await this.persist();
      } catch (err) {
        for (const [id, r] of before) this.players.set(id, r);
        this.launchpad = { ok: true, state: lpBefore };
        throw err;
      }
      return out.result;
    });
  }

  private requireLaunchpad(): LpState {
    if (!this.launchpad.ok) {
      throw new AuthError("LAUNCHPAD_UNAVAILABLE", "Saved Launchpad data could not be loaded; it is preserved for repair.", 503);
    }
    return this.launchpad.state;
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
