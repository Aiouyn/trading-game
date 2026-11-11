import { tokenFromRequest, type AuthSessionView } from "@/server/auth";
import {
  actorIdFor,
  authorizeClaimed,
  BindingError,
  classifyToken,
  isAccountId,
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
    const enabled = options?.enabled ?? ACTOR_BINDING_DEFAULT_ENABLED;
    if (enabled !== true) throw new BindingError("ACTOR_BINDING_DISABLED");
    const loaded = await store.load();
    const binding = new ActorBinding(auth, store, options?.now ?? (() => Date.now()));
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
    const view = options?.refresh === false ? await this.auth.peekSession(token) : await this.auth.resolveSession(token);
    if (!view) throw new BindingError("SESSION_REJECTED");
    return this.remember(view);
  }

  private async remember(view: AuthSessionView): Promise<ActorContext> {
    const accountId = view.account.accountId;
    if (!isAccountId(accountId)) throw new BindingError("INVALID_ACCOUNT_ID");
    const actorId = actorIdFor(accountId);
    const existing = this.bindings.get(accountId);
    if (existing) {
      if (existing.actorId !== actorId) throw new BindingError("ACTOR_REMAP");
      return { actorId, accountId, sessionId: view.sessionId, boundAtMs: existing.boundAtMs };
    }
    const record: BindingRecord = { accountId, actorId, boundAtMs: this.now() };
    this.bindings.set(accountId, record);
    await this.store.save(this.snapshot());
    return { ...record, sessionId: view.sessionId };
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
