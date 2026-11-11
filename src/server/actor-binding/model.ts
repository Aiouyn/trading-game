import { createHash } from "node:crypto";
import type { AccountId, SessionId } from "@/server/auth";
import { canonical, isPlainObject } from "./json";

/** Domain-separated so the character id does not leak or equal the auth account id. */
export const ACTOR_ID_DOMAIN = "port-avalon.actor-binding.v1";

export type ActorId = string & { readonly __brand: "ActorId" };

export type ActorContext = {
  readonly actorId: ActorId;
  readonly accountId: AccountId;
  readonly sessionId: SessionId;
  readonly boundAtMs: number;
};

export type BindingRecord = {
  readonly accountId: AccountId;
  readonly actorId: ActorId;
  readonly boundAtMs: number;
};

export type BindingCheckpoint = {
  readonly v: 1;
  readonly bindings: readonly BindingRecord[];
  readonly sha256: string;
};

export type BindingErrorCode =
  | "ACTOR_BINDING_DISABLED"
  | "MISSING_SESSION"
  | "MALFORMED_SESSION"
  | "SESSION_REJECTED"
  | "CLAIM_MISSING"
  | "CLAIM_MALFORMED"
  | "ACTOR_MISMATCH"
  | "INVALID_ACCOUNT_ID"
  | "INVALID_BINDING_CHECKPOINT"
  | "ACTOR_REMAP";

export type ActorField = "actor" | "account" | "wallet";

export type TokenClass = "MISSING" | "MALFORMED" | "PRESENT";

export class BindingError extends Error {
  readonly code: BindingErrorCode;

  constructor(code: BindingErrorCode, message = code) {
    super(message);
    this.name = "BindingError";
    this.code = code;
  }
}

export function isAccountId(value: unknown): value is AccountId {
  return typeof value === "string" && /^acc_[0-9a-f]{32}$/.test(value);
}

export function isActorId(value: unknown): value is ActorId {
  return typeof value === "string" && /^chr_[0-9a-f]{32}$/.test(value);
}

export function actorIdFor(accountId: string): ActorId {
  if (!isAccountId(accountId)) throw new BindingError("INVALID_ACCOUNT_ID");
  const hex = createHash("sha256")
    .update(ACTOR_ID_DOMAIN)
    .update("\0")
    .update(accountId)
    .digest("hex")
    .slice(0, 32);
  return `chr_${hex}` as ActorId;
}

export function classifyToken(raw: unknown): TokenClass {
  if (raw === null || raw === undefined) return "MISSING";
  if (typeof raw !== "string") return "MALFORMED";
  if (raw.length === 0) return "MISSING";
  if (raw.length > 256 || raw !== raw.trim() || /[\u0000-\u001f\u007f]/.test(raw)) return "MALFORMED";
  return "PRESENT";
}

export function requireBoundActor(context: ActorContext, claimed: unknown): ActorId {
  if (claimed === undefined || claimed === null || claimed === "") {
    throw new BindingError("CLAIM_MISSING");
  }
  if (typeof claimed !== "string" || !isActorId(claimed)) {
    throw new BindingError("CLAIM_MALFORMED");
  }
  if (claimed !== context.actorId) {
    throw new BindingError("ACTOR_MISMATCH");
  }
  return context.actorId;
}

export function claimedActorOf(command: unknown, field: ActorField = "actor"): unknown {
  if (!isPlainObject(command)) throw new BindingError("CLAIM_MALFORMED");
  return command[field];
}

export function authorizeClaimed(context: ActorContext, command: unknown, field: ActorField = "actor"): ActorId {
  return requireBoundActor(context, claimedActorOf(command, field));
}

export function checkpointDigest(bindings: readonly BindingRecord[]): string {
  return createHash("sha256").update(canonical({ v: 1, bindings: sortBindings(bindings) })).digest("hex");
}

export function sortBindings(bindings: readonly BindingRecord[]): BindingRecord[] {
  return [...bindings].sort((a, b) => (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0));
}

export function makeCheckpoint(bindings: readonly BindingRecord[]): BindingCheckpoint {
  const sorted = sortBindings(bindings);
  return { v: 1, bindings: sorted, sha256: checkpointDigest(sorted) };
}

export function parseCheckpoint(raw: unknown): BindingCheckpoint {
  if (!isPlainObject(raw)) throw new BindingError("INVALID_BINDING_CHECKPOINT");
  const keys = Object.keys(raw);
  if (keys.length !== 3 || raw.v !== 1 || !Array.isArray(raw.bindings) || typeof raw.sha256 !== "string") {
    throw new BindingError("INVALID_BINDING_CHECKPOINT");
  }
  if (!/^[0-9a-f]{64}$/.test(raw.sha256)) throw new BindingError("INVALID_BINDING_CHECKPOINT");
  const bindings = raw.bindings.map(parseRecord);
  const seenAccounts = new Set<string>();
  const seenActors = new Set<string>();
  for (const row of bindings) {
    if (seenAccounts.has(row.accountId) || seenActors.has(row.actorId)) {
      throw new BindingError("INVALID_BINDING_CHECKPOINT");
    }
    if (actorIdFor(row.accountId) !== row.actorId) throw new BindingError("ACTOR_REMAP");
    seenAccounts.add(row.accountId);
    seenActors.add(row.actorId);
  }
  const checkpoint = makeCheckpoint(bindings);
  if (checkpoint.sha256 !== raw.sha256) throw new BindingError("INVALID_BINDING_CHECKPOINT");
  return checkpoint;
}

function parseRecord(raw: unknown): BindingRecord {
  if (!isPlainObject(raw)) throw new BindingError("INVALID_BINDING_CHECKPOINT");
  const keys = Object.keys(raw);
  if (keys.length !== 3 || !isAccountId(raw.accountId) || !isActorId(raw.actorId)) {
    throw new BindingError("INVALID_BINDING_CHECKPOINT");
  }
  if (typeof raw.boundAtMs !== "number" || !Number.isSafeInteger(raw.boundAtMs) || raw.boundAtMs < 0) {
    throw new BindingError("INVALID_BINDING_CHECKPOINT");
  }
  return { accountId: raw.accountId, actorId: raw.actorId, boundAtMs: raw.boundAtMs };
}
