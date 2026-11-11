export type Limit = { n: number; windowMs: number };

const DEFAULTS: Record<string, Limit> = {
  error: { n: 30, windowMs: 60_000 },
  event: { n: 30, windowMs: 60_000 },
  feedback: { n: 8, windowMs: 60_000 },
  optout: { n: 8, windowMs: 60_000 },
};

const hits = new Map<string, number[]>();
let limits: Record<string, Limit> = { ...DEFAULTS };

export function setTelemetryLimits(next: Partial<Record<string, Limit>>): void {
  const merged: Record<string, Limit> = { ...limits };
  for (const [k, v] of Object.entries(next)) {
    if (v) merged[k] = v;
  }
  limits = merged;
}

export function resetTelemetryLimits(): void {
  hits.clear();
  limits = { ...DEFAULTS };
}

export function clientKey(request: Request): string {
  if (process.env.QUAY_TRUST_PROXY === "1") {
    const fwd = request.headers.get("x-forwarded-for");
    const first = fwd?.split(",")[0]?.trim();
    if (first) return first;
  }
  return "local";
}

/** Returns retry-after ms when over the limit, else null. */
export function checkTelemetryRate(kind: string, request: Request, now = Date.now()): number | null {
  const limit = limits[kind] ?? DEFAULTS.error;
  const key = `${kind}:${clientKey(request)}`;
  const start = now - limit.windowMs;
  const prev = (hits.get(key) ?? []).filter((t) => t > start);
  if (prev.length >= limit.n) {
    hits.set(key, prev);
    return prev[0]! + limit.windowMs - now;
  }
  prev.push(now);
  hits.set(key, prev);
  return null;
}
