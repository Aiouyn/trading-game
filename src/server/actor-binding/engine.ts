import { tokenFromRequest, type AuthSessionView } from "@/server/auth";
import {
  actorIdFor,
  authorizeClaimed,
  BindingError,
  classifyToken,
  isAccountId,
  isIssuedActorContext,
  issueActorContext,
  makeCheckpoint,
  parseCheckpoint,
  type ActorContext,
  type ActorField,
  type BindingCheckpoint,
  type BindingRecord,
} from "./model";
import type { BindingStore } from "./store";

export const ACTOR_BINDING_DEFAULT_ENABLED = false;

/** The exported session lookup surface; callers inject AuthService and do not touch auth internals. */
export type SessionLookup = {
  resolveSession(rawToken: string | null | undefined): Promise<AuthSessionView | null>;
  peekSession(rawToken: string | null | undefined): Promise<AuthSessionView | null>;
};

export class ActorBinding {
  private queue: Promise<void> = Promise.resolve();
  private bindings = new Map<string, BindingRecord>();
  private readonly tokens = new WeakMap<ActorContext, string>();

  private constructor(
    private readonly auth: SessionLookup,
    private readonly store: BindingStore,
    private readonly now: () => number,
  ) {}

  static async open(
    auth: SessionLookup,
    store: BindingStore,
    options?: { enabled?: unknown; now?: () => number },
  ): Promise<ActorBinding> {
    // Own properties only: a polluted Object.prototype must not enable binding or inject a clock.
    const own = (key: "enabled" | "now"): boolean => options !== undefined && options !== null && Object.hasOwn(options, key);
    const enabled = own("enabled") ? options?.enabled : ACTOR_BINDING_DEFAULT_ENABLED;
    if (enabled !== true) throw new BindingError("ACTOR_BINDING_DISABLED");
    const loaded = await store.load();
    const binding = new ActorBinding(auth, store, (own("now") && typeof options?.now === "function" ? options.now : () => Date.now()));
    if (loaded !== null) {
      for (const row of parseCheckpoint(loaded).bindings) binding.bindings.set(row.accountId, row);
    } else {
      await store.save(makeCheckpoint([]));
    }
    return binding;
  }

  snapshot(): BindingCheckpoint {
    return makeCheckpoint([...this.bindings.values()]);
  }

  async bindToken(rawToken: unknown, options?: { refresh?: boolean }): Promise<ActorContext> {
    return this.enqueue(() => this.bindTokenLocked(rawToken, options));
  }

  async bindRequest(request: Request, options?: { refresh?: boolean }): Promise<ActorContext> {
    return this.bindToken(tokenFromRequest(request), options);
  }

  async authorizeCommand(
    rawToken: unknown,
    command: unknown,
    field: ActorField = "actor",
    options?: { refresh?: boolean },
  ): Promise<{ context: ActorContext; actorId: ActorContext["actorId"] }> {
    const context = await this.bindToken(rawToken, options);
    return { context, actorId: authorizeClaimed(context, command, field) };
  }

  private async bindTokenLocked(rawToken: unknown, options?: { refresh?: boolean }): Promise<ActorContext> {
    const kind = classifyToken(rawToken);
    if (kind === "MISSING") throw new BindingError("MISSING_SESSION");
    if (kind === "MALFORMED") throw new BindingError("MALFORMED_SESSION");
    const token = rawToken as string;
    const view = options?.refresh === true ? await this.auth.resolveSession(token) : await this.auth.peekSession(token);
    if (!view) throw new BindingError("SESSION_REJECTED");
    return this.remember(view, token);
  }

  /**
   * Re-peek the session that issued this context. Call immediately before a
   * guarded engine write. Logout, expiry, a missing token, or a session/account
   * mismatch fail closed as SESSION_REJECTED. A context not issued by ActorBinding
   * is FORGED_CONTEXT.
   */
  async assertLiveSession(context: ActorContext): Promise<void> {
    if (!isIssuedActorContext(context)) throw new BindingError("FORGED_CONTEXT");
    const token = this.tokens.get(context);
    if (token === undefined) throw new BindingError("SESSION_REJECTED");
    const view = await this.auth.peekSession(token);
    if (!view || view.sessionId !== context.sessionId || view.account.accountId !== context.accountId) {
      throw new BindingError("SESSION_REJECTED");
    }
  }

  private async remember(view: AuthSessionView, token: string): Promise<ActorContext> {
    const accountId = view.account.accountId;
    if (!isAccountId(accountId)) throw new BindingError("INVALID_ACCOUNT_ID");
    const actorId = actorIdFor(accountId);
    const existing = this.bindings.get(accountId);
    if (existing) {
      if (existing.actorId !== actorId) throw new BindingError("ACTOR_REMAP");
      return this.issue({ actorId, accountId, sessionId: view.sessionId, boundAtMs: existing.boundAtMs }, token);
    }
    const record: BindingRecord = { accountId, actorId, boundAtMs: this.now() };
    this.bindings.set(accountId, record);
    await this.store.save(this.snapshot());
    return this.issue({ ...record, sessionId: view.sessionId }, token);
  }

  private issue(context: ActorContext, token: string): ActorContext {
    const issued = issueActorContext(context);
    this.tokens.set(issued, token);
    return issued;
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
