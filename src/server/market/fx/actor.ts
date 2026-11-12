import {
  ActorBinding,
  BindingError,
  isIssuedActorContext,
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
  readonly binding?: unknown;
};

export function actorGuardEnabled(options?: { actorGuard?: unknown }): boolean {
  return options != null && typeof options === "object" && !Array.isArray(options)
    && Object.hasOwn(options, "actorGuard") && options.actorGuard === true;
}

export function parseActorContext(raw: unknown): ActorContext {
  if (!isIssuedActorContext(raw)) throw new BindingError("FORGED_CONTEXT");
  return raw;
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

export function bindingForGuard(options?: { binding?: unknown }): ActorBinding {
  if (options != null && typeof options === "object" && !Array.isArray(options)
    && Object.hasOwn(options, "binding") && options.binding instanceof ActorBinding) {
    return options.binding;
  }
  throw new BindingError("SESSION_REJECTED");
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

export async function assertLiveFxCommands(commands: readonly Command[], options?: FxActorOptions): Promise<void> {
  if (!actorGuardEnabled(options)) return;
  const binding = bindingForGuard(options);
  const contexts = parseActorContexts(options?.contexts);
  for (const command of commands) {
    const context = contexts.get(command.id);
    if (context === undefined) throw new BindingError("MISSING_SESSION");
    await binding.assertLiveSession(context);
  }
}
