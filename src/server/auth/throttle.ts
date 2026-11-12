/**
 * In-memory attempt throttle (single process). Not a substitute for M3 edge limits.
 * Expired buckets are removed. A full map drops zero and low-count entries first.
 * A key at or over its limit inside its window is never evicted. If every slot is
 * a live lockout, a new key is refused.
 *
 * The 3-argument constructor sizes itself from {@link ATTEMPT_THROTTLE_FAILURES_PER_SEC}:
 * a window can create at most floor(G / limit) lockouts, and the map holds one more
 * than that, so lockouts alone cannot fill it. Past G failures in the window, only
 * new keys are refused.
 */

export interface ThrottleBucket {
  count: number;
  resetAtMs: number;
}

/**
 * Stated global ceiling for failed password checks.
 * This 4-core host peaks near 132 scrypt verifies/s with the libuv pool saturated.
 * 200/s is that ceiling rounded up. It is not a one-client serial rate.
 */
export const ATTEMPT_THROTTLE_FAILURES_PER_SEC = 200;

export function attemptThrottleBudget(limit: number, windowMs: number): {
  globalFailureCap: number;
  maxEntries: number;
} {
  const safeLimit = Math.max(1, Math.floor(limit));
  const windowSec = Math.max(windowMs / 1000, 1 / ATTEMPT_THROTTLE_FAILURES_PER_SEC);
  const globalFailureCap = Math.max(safeLimit, Math.ceil(ATTEMPT_THROTTLE_FAILURES_PER_SEC * windowSec));
  const maxEntries = Math.floor(globalFailureCap / safeLimit) + 1;
  return { globalFailureCap, maxEntries };
}

/** Login-shaped map cap: 18,001 for 10 failures / 15 minutes at 200/s. */
export const ATTEMPT_THROTTLE_MAX_ENTRIES = attemptThrottleBudget(10, 15 * 60 * 1000).maxEntries;

export class AttemptThrottle {
  private readonly buckets = new Map<string, ThrottleBucket>();
  private readonly maxEntries: number;
  private readonly globalFailureCap: number;
  private globalFailures = 0;
  private globalResetAt = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
    maxEntries?: number,
    globalFailureCap?: number,
  ) {
    const budget = attemptThrottleBudget(limit, windowMs);
    const cap = maxEntries === undefined || !Number.isFinite(maxEntries) ? budget.maxEntries : Math.floor(maxEntries);
    const failures = globalFailureCap === undefined || !Number.isFinite(globalFailureCap)
      ? budget.globalFailureCap
      : Math.floor(globalFailureCap);
    this.maxEntries = Math.max(1, cap);
    this.globalFailureCap = Math.max(1, failures);
  }

  /** Live buckets, after the last check or hit has dropped expired keys. */
  get size(): number {
    return this.buckets.size;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAtMs) this.buckets.delete(key);
    }
  }

  private rollGlobal(now: number): void {
    if (this.globalResetAt === 0 || now >= this.globalResetAt) {
      this.globalFailures = 0;
      this.globalResetAt = now + this.windowMs;
    }
  }

  private newKeysRefused(now: number): boolean {
    this.rollGlobal(now);
    return this.globalFailures >= this.globalFailureCap;
  }

  private recordFailure(now: number): void {
    this.rollGlobal(now);
    this.globalFailures += 1;
  }

  /** Lowest in-window count under the limit, oldest insertion first. Lockouts are skipped. */
  private evictable(now: number): string | undefined {
    let drop: string | undefined;
    let dropCount = Infinity;
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAtMs) return key;
      if (bucket.count >= this.limit) continue;
      if (bucket.count < dropCount) {
        drop = key;
        dropCount = bucket.count;
      }
    }
    return drop;
  }

  /** Free one slot without touching an in-window lockout. */
  private makeRoom(now: number): boolean {
    while (this.buckets.size >= this.maxEntries) {
      const drop = this.evictable(now);
      if (drop === undefined) return false;
      this.buckets.delete(drop);
    }
    return true;
  }

  /** Retry until the soonest live lockout expires, when a new key cannot be stored. */
  private failClosedRetry(now: number): number {
    let soonest = this.windowMs;
    for (const bucket of this.buckets.values()) {
      const left = bucket.resetAtMs - now;
      if (left > 0 && left < soonest) soonest = left;
    }
    return Math.max(0, soonest);
  }

  private clientId(clientKey: string): string {
    return `c:${clientKey}`;
  }

  /**
   * Returns null if allowed; otherwise retryAfterMs. Does not count the attempt.
   * `clientKey` is an optional second bucket (trusted client IP). A locked client
   * refuses the attempt even when the primary key is new.
   */
  check(key: string, clientKey?: string | null): number | null {
    const now = this.now();
    this.prune(now);
    if (clientKey) {
      const client = this.buckets.get(this.clientId(clientKey));
      if (client && client.count >= this.limit) return Math.max(0, client.resetAtMs - now);
    }
    const b = this.buckets.get(key);
    if (!b) {
      if (this.newKeysRefused(now)) return Math.max(0, this.globalResetAt - now);
      if (!this.makeRoom(now)) return this.failClosedRetry(now);
      this.buckets.set(key, { count: 0, resetAtMs: now + this.windowMs });
      return null;
    }
    if (b.count >= this.limit) return Math.max(0, b.resetAtMs - now);
    return null;
  }

  /** Count one failure. Past the global cap, a key that is not already stored is ignored. */
  hit(key: string, clientKey?: string | null): void {
    const now = this.now();
    this.prune(now);
    const stored = this.bump(key, now);
    const clientStored = clientKey ? this.bump(this.clientId(clientKey), now) : false;
    if (stored || clientStored) this.recordFailure(now);
  }

  private bump(key: string, now: number): boolean {
    const b = this.buckets.get(key);
    if (!b) {
      if (this.newKeysRefused(now)) return false;
      if (!this.makeRoom(now)) return false;
      this.buckets.set(key, { count: 1, resetAtMs: now + this.windowMs });
      return true;
    }
    b.count += 1;
    return true;
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }
}
