import { randomBytes } from "node:crypto";
import { tokenFromRequest } from "@/server/auth/http";
import { hashSessionToken, isAnonId } from "./ids";

/** HttpOnly guest session. Distinguishes browsers that have no auth cookie and no trusted IP. */
export const TELEMETRY_GUEST_COOKIE = "quay_tel";
const GUEST_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** Per-client buckets, plus the global key. Kept under the AttemptThrottle cap. */
const MAX_RATE_KEYS = 4096;

export type Limit = { n: number; windowMs: number };

const DEFAULTS: Record<string, Limit> = {
  error: { n: 30, windowMs: 60_000 },
  event: { n: 30, windowMs: 60_000 },
  feedback: { n: 8, windowMs: 60_000 },
  optout: { n: 8, windowMs: 60_000 },
  consent: { n: 8, windowMs: 60_000 },
};

/** Process-wide backstop so a swarm of distinct client keys cannot fill the disk unbounded. */
const GLOBAL_DEFAULTS: Record<string, Limit> = {
  error: { n: 120, windowMs: 60_000 },
  event: { n: 120, windowMs: 60_000 },
  feedback: { n: 32, windowMs: 60_000 },
  optout: { n: 32, windowMs: 60_000 },
  consent: { n: 32, windowMs: 60_000 },
};

const hits = new Map<string, number[]>();
let limits: Record<string, Limit> = { ...DEFAULTS };
let globalLimits: Record<string, Limit> = { ...GLOBAL_DEFAULTS };

export function setTelemetryLimits(next: Partial<Record<string, Limit>>): void {
  const merged: Record<string, Limit> = { ...limits };
  for (const [k, v] of Object.entries(next)) {
    if (v) merged[k] = v;
  }
  limits = merged;
}

export function setTelemetryGlobalLimits(next: Partial<Record<string, Limit>>): void {
  const merged: Record<string, Limit> = { ...globalLimits };
  for (const [k, v] of Object.entries(next)) {
    if (v) merged[k] = v;
  }
  globalLimits = merged;
}

export function resetTelemetryLimits(): void {
  hits.clear();
  limits = { ...DEFAULTS };
  globalLimits = { ...GLOBAL_DEFAULTS };
}

export function readTelemetryGuestId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== TELEMETRY_GUEST_COOKIE) continue;
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep the raw token
    }
    return GUEST_ID_RE.test(value) ? value : null;
  }
  return null;
}

export function mintTelemetryGuestId(): string {
  return randomBytes(16).toString("hex");
}

export function telemetryGuestCookieHeader(id: string, secure: boolean): string {
  const parts = [
    `${TELEMETRY_GUEST_COOKIE}=${id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=31536000",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Client address our proxy appended. The left hops are whatever the caller sent
 * and are not the bucket key.
 */
export function trustedClientIp(request: Request): string | null {
  if (process.env.QUAY_TRUST_PROXY !== "1") return null;
  const fwd = request.headers.get("x-forwarded-for");
  if (!fwd) return null;
  const hops = fwd.split(",").map((hop) => hop.trim()).filter((hop) => hop.length > 0);
  return hops.length > 0 ? hops[hops.length - 1]! : null;
}

export function clientKey(request: Request, anonId?: string): string {
  const parts: string[] = [];
  const token = tokenFromRequest(request);
  if (token) parts.push(`s:${hashSessionToken(token)}`);
  if (anonId && isAnonId(anonId)) parts.push(`a:${anonId}`);
  const ip = trustedClientIp(request);
  if (ip) parts.push(`ip:${ip}`);
  if (parts.length > 0) return parts.join("|");
  const guest = readTelemetryGuestId(request.headers.get("cookie"));
  if (guest) return `g:${hashSessionToken(guest)}`;
  return "anon-missing";
}

function enforceRateKeyBound(now: number, protect: string): void {
  let horizon = 0;
  for (const limit of Object.values(limits)) horizon = Math.max(horizon, limit.windowMs);
  for (const limit of Object.values(globalLimits)) horizon = Math.max(horizon, limit.windowMs);
  const cutoff = now - horizon;
  for (const [key, times] of hits) {
    let write = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i]! > cutoff) times[write++] = times[i]!;
    }
    if (write === 0) hits.delete(key);
    else if (write !== times.length) times.length = write;
  }
  while (hits.size > MAX_RATE_KEYS) {
    let drop: string | undefined;
    for (const key of hits.keys()) {
      if (key === protect || key.endsWith(":global")) continue;
      drop = key;
      break;
    }
    if (drop === undefined) break;
    hits.delete(drop);
  }
}

function overLimit(bucket: string, limit: Limit, now: number): number | null {
  const start = now - limit.windowMs;
  const prev = (hits.get(bucket) ?? []).filter((t) => t > start);
  if (prev.length >= limit.n) {
    hits.set(bucket, prev);
    return prev[0]! + limit.windowMs - now;
  }
  prev.push(now);
  hits.set(bucket, prev);
  return null;
}

/** Returns retry-after ms when over the per-client or global cap, else null. */
export function checkTelemetryRate(
  kind: string,
  request: Request,
  anonId?: string,
  now = Date.now(),
): number | null {
  const per = limits[kind] ?? DEFAULTS.error;
  const glob = globalLimits[kind] ?? GLOBAL_DEFAULTS.error;
  const key = `${kind}:${clientKey(request, anonId)}`;
  enforceRateKeyBound(now, key);
  const perRetry = overLimit(key, per, now);
  if (perRetry !== null) return perRetry;
  const globalRetry = overLimit(`${kind}:global`, glob, now);
  if (globalRetry !== null) {
    // Do not keep the per-client slot we just reserved if the global cap refuses the write.
    const prev = hits.get(key) ?? [];
    prev.pop();
    hits.set(key, prev);
    return globalRetry;
  }
  return null;
}
