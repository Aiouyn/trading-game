import { isProxy } from "node:util/types";
import {
  ActorBinding,
  BindingError,
  isIssuedActorContext,
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

function isContextsMap(raw: unknown): raw is Record<string, unknown> {
  // The map itself must be a literal object. A Proxy or null-prototype map is CLAIM_MALFORMED.
  // Context *values* are classified separately so Object.create/Proxy/null-proto contexts are FORGED_CONTEXT.
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && !isProxy(raw)
    && Object.getPrototypeOf(raw) === Object.prototype;
}

/**
 * Check only the shape of the map, without running getters. A Proxy, null-prototype, array or
 * getter map is CLAIM_MALFORMED. Each value is classified by parseActorContext, so Object.create,
 * Proxy, null-prototype or spread contexts are FORGED_CONTEXT (Gatekeeper q3).
 */
export function parseActorContexts(raw: unknown): Map<string, ActorContext> {
  if (raw === undefined) return new Map();
  if (!isContextsMap(raw)) throw new BindingError("CLAIM_MALFORMED");
  const out = new Map<string, ActorContext>();
  for (const key of Reflect.ownKeys(raw)) {
    const d = Object.getOwnPropertyDescriptor(raw, key);
    if (typeof key !== "string" || !id(key) || !d || d.enumerable !== true || !("value" in d)) {
      throw new BindingError("CLAIM_MALFORMED");
    }
    out.set(key, parseActorContext(d.value));
  }
  return out;
}

/** Own-property only: a prototype-poisoned options bag must not smuggle contexts. */
export function contextsFromOptions(options?: { contexts?: unknown }): unknown {
  if (options != null && typeof options === "object" && !Array.isArray(options)
    && Object.hasOwn(options, "contexts")) {
    return options.contexts;
  }
  return undefined;
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
  const contexts = parseActorContexts(contextsFromOptions(options));
  for (const command of commands) {
    const context = contexts.get(command.id);
    if (context === undefined) throw new BindingError("MISSING_SESSION");
    requireBoundActor(context, command.account);
  }
}

export async function assertLiveFxCommands(commands: readonly Command[], options?: FxActorOptions): Promise<void> {
  if (!actorGuardEnabled(options)) return;
  const binding = bindingForGuard(options);
  const contexts = parseActorContexts(contextsFromOptions(options));
  for (const command of commands) {
    const context = contexts.get(command.id);
    if (context === undefined) throw new BindingError("MISSING_SESSION");
    await binding.assertLiveSession(context);
  }
}
