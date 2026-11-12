/**
 * Mutation caps for routes that had no limiter (M3-05).
 * The bucket map lives in this file. AttemptThrottle does not evict, and this
 * limiter must keep working without edits to auth or telemetry. The window
 * check then hit matches AttemptThrottle. forwardedClientFromRight is the hop
 * parser to share later with telemetry's trustedClientIp, which still reads
 * the leftmost hop.
 */
import { assertLocalSingleProcessAuth } from "@/server/auth/deploy";
import { tokenFromRequest } from "@/server/auth/http";
import { getAuthService } from "@/server/auth/instance";
import { AuthError } from "@/server/auth/types";

export const MUTATION_SESSION_LIMIT_DEFAULT = 120;
export const MUTATION_IP_LIMIT_DEFAULT = 240;
export const MUTATION_WINDOW_MS_DEFAULT = 60_000;
export const MUTATION_MAX_KEYS_DEFAULT = 4096;
/** 1 = the rightmost X-Forwarded-For hop, the address our proxy appended. */
export const MUTATION_TRUSTED_PROXY_HOPS_DEFAULT = 1;

const MAX_LIMIT = 1_000_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

interface Slot {
  count: number;
  resetAtMs: number;
  /** Limit captured when this window opened. Eviction will not drop a live slot at or over it. */
  limit: number;
}

interface Charge {
  readonly key: string;
  readonly limit: number;
}

let clock: () => number = () => Date.now();
let slots: Map<string, Slot> | null = null;
let sessionLimit = MUTATION_SESSION_LIMIT_DEFAULT;
let ipLimit = MUTATION_IP_LIMIT_DEFAULT;
let windowMs = MUTATION_WINDOW_MS_DEFAULT;
let maxKeys = MUTATION_MAX_KEYS_DEFAULT;

/** Positive integer env, or `fallback` when the variable is missing or not usable. */
function readPositiveInt(name: string, fallback: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) return fallback;
  return n;
}

function ensure(): Map<string, Slot> {
  if (!slots) {
    slots = new Map();
    sessionLimit = readPositiveInt("QUAY_MUTATION_SESSION_LIMIT", MUTATION_SESSION_LIMIT_DEFAULT, MAX_LIMIT);
    ipLimit = readPositiveInt("QUAY_MUTATION_IP_LIMIT", MUTATION_IP_LIMIT_DEFAULT, MAX_LIMIT);
    windowMs = readPositiveInt("QUAY_MUTATION_WINDOW_MS", MUTATION_WINDOW_MS_DEFAULT, MAX_WINDOW_MS);
    maxKeys = readPositiveInt("QUAY_MUTATION_MAX_KEYS", MUTATION_MAX_KEYS_DEFAULT, MAX_LIMIT);
  }
  return slots;
}

/** Drop buckets so the next check reads the current env and clock. */
export function resetMutationLimits(): void {
  slots = null;
}

/** Tests advance time without sleeping. Passing null restores Date.now and drops buckets. */
export function setMutationLimitNowForTests(now: (() => number) | null): void {
  clock = now ?? (() => Date.now());
  resetMutationLimits();
}

/** How many buckets are stored, including ones whose window has not been touched since it expired. */
export function mutationBucketCountForTests(): number {
  return slots?.size ?? 0;
}

/**
 * Client address from X-Forwarded-For, counting `hops` in from the right.
 * hops 1 is the rightmost value (appended by the proxy closest to us).
 * A chain shorter than `hops` uses that rightmost value, not a left-hand spoof.
 * Named for a later merge with telemetry's trustedClientIp.
 */
export function forwardedClientFromRight(header: string | null, hops = MUTATION_TRUSTED_PROXY_HOPS_DEFAULT): string | null {
  if (!header) return null;
  const parts = header.split(",").map((part) => part.trim()).filter((part) => part.length > 0 && part.length <= 64);
  if (parts.length === 0) return null;
  const n = Number.isInteger(hops) && hops >= 1 ? hops : MUTATION_TRUSTED_PROXY_HOPS_DEFAULT;
  const index = parts.length - n;
  return parts[index >= 0 ? index : parts.length - 1] ?? null;
}

function trustedForwardedClient(request: Request): string | null {
  if (process.env.QUAY_TRUST_PROXY !== "1") return null;
  const hops = readPositiveInt("QUAY_TRUSTED_PROXY_HOPS", MUTATION_TRUSTED_PROXY_HOPS_DEFAULT, 16);
  return forwardedClientFromRight(request.headers.get("x-forwarded-for"), hops);
}

function evictExpired(map: Map<string, Slot>, now: number): void {
  for (const [key, slot] of map) {
    if (now >= slot.resetAtMs) map.delete(key);
  }
}

function atLimit(slot: Slot, now: number): boolean {
  return now < slot.resetAtMs && slot.count >= slot.limit;
}

/**
 * Drop the lowest-count live windows that are still under their limit until `map.size <= max`.
 * Keys in `keep` stay. A live at-limit window is never dropped. Returns false when at-limit
 * keys (or kept keys) still fill the map.
 */
function evictUnderLimit(map: Map<string, Slot>, max: number, now: number, keep: ReadonlySet<string>): boolean {
  if (map.size <= max) return true;
  const victims = [...map.entries()]
    .filter(([key, slot]) => !keep.has(key) && !atLimit(slot, now))
    .sort((a, b) => a[1].count - b[1].count || a[1].resetAtMs - b[1].resetAtMs);
  for (const [key] of victims) {
    if (map.size <= max) return true;
    map.delete(key);
  }
  return map.size <= max;
}

function soonestAtLimitRetry(map: Map<string, Slot>, now: number): number {
  let best = windowMs;
  for (const slot of map.values()) {
    if (atLimit(slot, now)) best = Math.min(best, slot.resetAtMs - now);
  }
  return Math.max(0, best);
}

function retryOf(slot: Slot | undefined, limit: number, now: number): number | null {
  if (!slot || now >= slot.resetAtMs) return null;
  if (slot.count >= limit) return Math.max(0, slot.resetAtMs - now);
  return null;
}

function commit(map: Map<string, Slot>, key: string, limit: number, now: number): void {
  const slot = map.get(key);
  if (slot && now < slot.resetAtMs) {
    slot.count += 1;
    return;
  }
  map.set(key, { count: 1, resetAtMs: now + windowMs, limit });
}

/**
 * Count one mutation. Throws 429 before the caller writes.
 * A live session is keyed by account. An invalid or missing cookie is keyed by
 * the trusted client IP, never by a hash of the cookie. With no trusted IP,
 * those requests share one anon bucket.
 */
export async function assertMutationAllowed(request: Request): Promise<void> {
  assertLocalSingleProcessAuth();
  const token = tokenFromRequest(request);
  const session = await getAuthService().peekSession(token);
  const ip = trustedForwardedClient(request);
  const map = ensure();
  const now = clock();
  const charges: Charge[] = [];
  if (session) {
    charges.push({ key: `p:${session.account.accountId}`, limit: sessionLimit });
    if (ip) charges.push({ key: `ip:${ip}`, limit: ipLimit });
  } else {
    charges.push({ key: ip ? `ip:${ip}` : "anon", limit: ip ? ipLimit : sessionLimit });
  }
  evictExpired(map, now);
  for (const charge of charges) {
    const retry = retryOf(map.get(charge.key), charge.limit, now);
    if (retry !== null) throw limited(retry);
  }
  const fresh = charges.filter((charge) => !map.has(charge.key)).length;
  if (fresh > 0 && map.size + fresh > maxKeys) {
    const keep = new Set(charges.map((charge) => charge.key));
    if (!evictUnderLimit(map, maxKeys - fresh, now, keep)) throw limited(soonestAtLimitRetry(map, now));
  }
  for (const charge of charges) commit(map, charge.key, charge.limit, now);
}

function limited(retryAfterMs: number): AuthError {
  return new AuthError("RATE_LIMITED", "Too many requests. Try again later.", 429, retryAfterMs);
}
