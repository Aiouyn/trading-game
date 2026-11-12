/**
 * In-memory attempt throttle (single process). Not a substitute for M3 edge limits.
 * Expired buckets are removed, and the map never grows past {@link ATTEMPT_THROTTLE_MAX_ENTRIES}.
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

  /** Make one free slot for a new key. Oldest insertion is dropped first. */
  private makeRoom(): void {
    while (this.buckets.size >= this.maxEntries) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }

  /** Returns null if allowed; otherwise retryAfterMs. Does not count the attempt. */
  check(key: string): number | null {
    const now = this.now();
    this.prune(now);
    const b = this.buckets.get(key);
    if (!b) {
      this.makeRoom();
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
      this.makeRoom();
      this.buckets.set(key, { count: 1, resetAtMs: now + this.windowMs });
      return;
    }
    b.count += 1;
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }
}
