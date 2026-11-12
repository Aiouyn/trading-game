/**
 * In-memory attempt throttle (single process). Not a substitute for M3 edge limits.
 * Expired buckets are removed. A full map drops zero and low-count entries first.
 * A key at or over its limit inside its window is never evicted. If every slot is
 * a live lockout, a new key is refused.
 */

export interface ThrottleBucket {
  count: number;
  resetAtMs: number;
}

/** Hard cap shared by login, telemetry, and mutation limiters. Under 5,000. */
export const ATTEMPT_THROTTLE_MAX_ENTRIES = 4096;

export class AttemptThrottle {
  private readonly buckets = new Map<string, ThrottleBucket>();
  private readonly maxEntries: number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
    maxEntries: number = ATTEMPT_THROTTLE_MAX_ENTRIES,
  ) {
    const cap = Number.isFinite(maxEntries) ? Math.floor(maxEntries) : ATTEMPT_THROTTLE_MAX_ENTRIES;
    this.maxEntries = Math.min(ATTEMPT_THROTTLE_MAX_ENTRIES, Math.max(1, cap));
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

  /** Returns null if allowed; otherwise retryAfterMs. Does not count the attempt. */
  check(key: string): number | null {
    const now = this.now();
    this.prune(now);
    const b = this.buckets.get(key);
    if (!b) {
      if (!this.makeRoom(now)) return this.failClosedRetry(now);
      this.buckets.set(key, { count: 0, resetAtMs: now + this.windowMs });
      return null;
    }
    if (b.count >= this.limit) return Math.max(0, b.resetAtMs - now);
    return null;
  }

  hit(key: string): void {
    const now = this.now();
    this.prune(now);
    const b = this.buckets.get(key);
    if (!b) {
      if (!this.makeRoom(now)) return;
      this.buckets.set(key, { count: 1, resetAtMs: now + this.windowMs });
      return;
    }
    b.count += 1;
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }
}
