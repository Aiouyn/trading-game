import { tokenFromRequest } from "@/server/auth/http";
import { hashSessionToken, isAnonId } from "./ids";

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

export function trustedClientIp(request: Request): string | null {
  if (process.env.QUAY_TRUST_PROXY !== "1") return null;
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || null;
}

export function clientKey(request: Request, anonId?: string): string {
  const parts: string[] = [];
  const token = tokenFromRequest(request);
  if (token) parts.push(`s:${hashSessionToken(token)}`);
  if (anonId && isAnonId(anonId)) parts.push(`a:${anonId}`);
  const ip = trustedClientIp(request);
  if (ip) parts.push(`ip:${ip}`);
  return parts.length > 0 ? parts.join("|") : "anon-missing";
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
