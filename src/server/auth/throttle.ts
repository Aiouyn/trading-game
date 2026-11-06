/** Tiny in-memory attempt throttle (single process). Not a substitute for M3 rate limits. */

export interface ThrottleBucket {
  count: number;
  resetAtMs: number;
}

export class AttemptThrottle {
  private readonly buckets = new Map<string, ThrottleBucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns null if allowed; otherwise retryAfterMs. */
  check(key: string): number | null {
    const now = this.now();
    const b = this.buckets.get(key);
    if (!b || now >= b.resetAtMs) {
      this.buckets.set(key, { count: 0, resetAtMs: now + this.windowMs });
      return null;
    }
    if (b.count >= this.limit) return Math.max(0, b.resetAtMs - now);
    return null;
  }

  hit(key: string): void {
    const now = this.now();
    const b = this.buckets.get(key);
    if (!b || now >= b.resetAtMs) {
      this.buckets.set(key, { count: 1, resetAtMs: now + this.windowMs });
      return;
    }
    b.count += 1;
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }
}
