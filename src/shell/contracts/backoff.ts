/** Card 19: retry backoff for the signed-in GET /api/market poll after a failed read (server down, 5xx, unreadable). */
export const RETRY_BASE_MS = 1000;
export const RETRY_CAP_MS = 15_000;
/** ±20 % around the doubled delay, so many open tabs do not retry in step. */
export const RETRY_JITTER = 0.2;

/** Wait before the next read after `failures` consecutive failed reads (1 = the first): min(cap, base·2^(n-1)) with
 *  ±RETRY_JITTER jitter, never above the cap. `random` is injectable (Math.random in the app) for deterministic tests. */
export function retryDelayMs(failures: number, random: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(failures));
  const doubled = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.min(n - 1, 30));
  const jittered = doubled * (1 - RETRY_JITTER + 2 * RETRY_JITTER * random());
  return Math.round(Math.min(RETRY_CAP_MS, jittered));
}
