import {
  BindingError,
  actorIdFor,
  isAccountId,
  isActorId,
  isPlainJson,
  isPlainObject,
  requireBoundActor,
  type ActorContext,
} from "@/server/actor-binding";
import type { Command } from "./model";
import { id } from "./model";

export const FX_ACTOR_DEFAULT_ENABLED = false;

export type FxActorOptions = {
  readonly actorGuard?: unknown;
  readonly contexts?: unknown;
};

export function actorGuardEnabled(options?: { actorGuard?: unknown }): boolean {
  return options?.actorGuard === true;
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && /^ses_[0-9a-f]{32}$/.test(value);
}

export function parseActorContext(raw: unknown): ActorContext {
  if (!isPlainObject(raw)) throw new BindingError("CLAIM_MALFORMED");
  const keys = Object.keys(raw);
  if (
    keys.length !== 4
    || !isActorId(raw.actorId)
    || !isAccountId(raw.accountId)
    || !isSessionId(raw.sessionId)
    || typeof raw.boundAtMs !== "number"
    || !Number.isSafeInteger(raw.boundAtMs)
    || raw.boundAtMs < 0
  ) {
    throw new BindingError("CLAIM_MALFORMED");
  }
  if (actorIdFor(raw.accountId) !== raw.actorId) throw new BindingError("ACTOR_MISMATCH");
  return {
    actorId: raw.actorId,
    accountId: raw.accountId,
    sessionId: raw.sessionId as ActorContext["sessionId"],
    boundAtMs: raw.boundAtMs,
  };
}

export function parseActorContexts(raw: unknown): Map<string, ActorContext> {
  if (raw === undefined) return new Map();
  if (!isPlainObject(raw) || !isPlainJson(raw)) throw new BindingError("CLAIM_MALFORMED");
  const out = new Map<string, ActorContext>();
  for (const [key, value] of Object.entries(raw)) {
    if (!id(key)) throw new BindingError("CLAIM_MALFORMED");
    out.set(key, parseActorContext(value));
  }
  return out;
}

export function authorizeFxCommands(commands: readonly Command[], options?: FxActorOptions): void {
  if (!actorGuardEnabled(options)) return;
  const contexts = parseActorContexts(options?.contexts);
  for (const command of commands) {
    const context = contexts.get(command.id);
    if (context === undefined) throw new BindingError("MISSING_SESSION");
    requireBoundActor(context, command.account);
  }
}
