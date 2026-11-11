/**
 * Per-player and per-trusted-IP cap for mutating routes that had no limiter (M3-05).
 * Reuses AttemptThrottle (login/register) and telemetry's trusted-IP rule. In-memory,
 * one process: the same shape as those limiters, not a new framework. Vercel and
 * QUAY_AUTH_MULTI_PROCESS already fail closed before a mutation runs.
 */
import { AttemptThrottle } from "@/server/auth/throttle";
import { assertLocalSingleProcessAuth } from "@/server/auth/deploy";
import { AuthError } from "@/server/auth/types";
import { tokenFromRequest } from "@/server/auth/http";
import { getAuthService } from "@/server/auth/instance";
import { hashSessionToken } from "@/server/telemetry/ids";
import { trustedClientIp } from "@/server/telemetry/ratelimit";

export const MUTATION_SESSION_LIMIT_DEFAULT = 120;
export const MUTATION_IP_LIMIT_DEFAULT = 240;
export const MUTATION_WINDOW_MS_DEFAULT = 60_000;

const MAX_LIMIT = 1_000_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

let clock: () => number = () => Date.now();
let sessionThrottle: AttemptThrottle | null = null;
let ipThrottle: AttemptThrottle | null = null;

/** Positive integer env, or `fallback` when the variable is missing or not usable. */
function readPositiveInt(name: string, fallback: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) return fallback;
  return n;
}

function buckets(): { session: AttemptThrottle; ip: AttemptThrottle } {
  if (!sessionThrottle || !ipThrottle) {
    const windowMs = readPositiveInt("QUAY_MUTATION_WINDOW_MS", MUTATION_WINDOW_MS_DEFAULT, MAX_WINDOW_MS);
    sessionThrottle = new AttemptThrottle(
      readPositiveInt("QUAY_MUTATION_SESSION_LIMIT", MUTATION_SESSION_LIMIT_DEFAULT, MAX_LIMIT),
      windowMs,
      () => clock(),
    );
    ipThrottle = new AttemptThrottle(
      readPositiveInt("QUAY_MUTATION_IP_LIMIT", MUTATION_IP_LIMIT_DEFAULT, MAX_LIMIT),
      windowMs,
      () => clock(),
    );
  }
  return { session: sessionThrottle, ip: ipThrottle };
}

/** Drop buckets so the next check reads the current env and clock. */
export function resetMutationLimits(): void {
  sessionThrottle = null;
  ipThrottle = null;
}

/** Tests advance time without sleeping. Passing null restores Date.now and drops buckets. */
export function setMutationLimitNowForTests(now: (() => number) | null): void {
  clock = now ?? (() => Date.now());
  resetMutationLimits();
}

/**
 * Count one mutation. Throws 429 before the caller writes.
 * Player key is the account when the cookie is live, else the token hash, else one shared anonymous bucket.
 * IP is counted only for a trusted forwarded client (QUAY_TRUST_PROXY=1).
 */
export async function assertMutationAllowed(request: Request): Promise<void> {
  assertLocalSingleProcessAuth();
  const token = tokenFromRequest(request);
  const session = await getAuthService().peekSession(token);
  const playerKey = session
    ? `p:${session.account.accountId}`
    : token
      ? `t:${hashSessionToken(token)}`
      : "anon";
  const ip = trustedClientIp(request);
  const { session: players, ip: ips } = buckets();
  const playerRetry = players.check(playerKey);
  if (playerRetry !== null) throw limited(playerRetry);
  if (ip) {
    const ipRetry = ips.check(ip);
    if (ipRetry !== null) throw limited(ipRetry);
  }
  players.hit(playerKey);
  if (ip) ips.hit(ip);
}

function limited(retryAfterMs: number): AuthError {
  return new AuthError("RATE_LIMITED", "Too many requests. Try again later.", 429, retryAfterMs);
}
