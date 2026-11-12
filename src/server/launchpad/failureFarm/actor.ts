import { isProxy } from "node:util/types";
import {
  ActorBinding,
  BindingError,
  isIssuedActorContext,
  requireBoundActor,
  type ActorContext,
} from "@/server/actor-binding";
import type { FarmCommand } from "./model";

export const MEME_ACTOR_DEFAULT_ENABLED = false;

export type MemeActorOptions = {
  readonly actorGuard?: unknown;
  readonly contexts?: unknown;
  readonly binding?: unknown;
};

export function actorGuardEnabled(options?: { actorGuard?: unknown }): boolean {
  return options != null && typeof options === "object" && !Array.isArray(options)
    && Object.hasOwn(options, "actorGuard") && options.actorGuard === true;
}

function isCommandKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
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

export function parseActorContexts(raw: unknown): Map<string, ActorContext> {
  if (raw === undefined) return new Map();
  if (!isContextsMap(raw)) throw new BindingError("CLAIM_MALFORMED");
  const out = new Map<string, ActorContext>();
  for (const key of Object.keys(raw)) {
    if (!isCommandKey(key)) throw new BindingError("CLAIM_MALFORMED");
    out.set(key, parseActorContext(raw[key]));
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

export function authorizeFarmCommand(command: FarmCommand, options?: MemeActorOptions): void {
  if (!actorGuardEnabled(options)) return;
  const contexts = parseActorContexts(contextsFromOptions(options));
  const context = contexts.get(command.key);
  if (context === undefined) throw new BindingError("MISSING_SESSION");
  requireBoundActor(context, command.wallet);
}

export async function assertLiveFarmCommand(command: FarmCommand, options?: MemeActorOptions): Promise<void> {
  if (!actorGuardEnabled(options)) return;
  const binding = bindingForGuard(options);
  const contexts = parseActorContexts(contextsFromOptions(options));
  const context = contexts.get(command.key);
  if (context === undefined) throw new BindingError("MISSING_SESSION");
  await binding.assertLiveSession(context);
}
