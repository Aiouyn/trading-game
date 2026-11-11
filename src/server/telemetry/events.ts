import { analyticsSkipped } from "./context";
import { isAnonId } from "./ids";
import { appendEvent, isConsented, isOptedOut, telemetryDir, TelemetryDirFullError } from "./log";

export const ANALYTICS_EVENTS = [
  "signup",
  "session_start",
  "first_trade",
  "first_wire_open",
  "statement_post",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const CLIENT_EVENTS = ["first_wire_open"] as const;
export type ClientAnalyticsEvent = (typeof CLIENT_EVENTS)[number];

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === "string" && (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

export function isClientAnalyticsEvent(value: unknown): value is ClientAnalyticsEvent {
  return typeof value === "string" && (CLIENT_EVENTS as readonly string[]).includes(value);
}

/**
 * Append a named analytics event. Skips when DNT/GPC is in the request context, when the
 * anon id has not consented (21 opt-in), when it is on the opt-out list, or when there is no log dir.
 * TelemetryDirFullError is rethrown so an HTTP handler can return 503; every other error is swallowed.
 */
export async function recordEvent(event: AnalyticsEvent, anonId: string): Promise<void> {
  try {
    if (!isAnonId(anonId)) return;
    if (!isAnalyticsEvent(event)) return;
    if (!telemetryDir()) return;
    if (analyticsSkipped()) return;
    if (await isOptedOut(anonId)) return;
    if (!(await isConsented(anonId))) return;
    await appendEvent({ event, anonId });
  } catch (err) {
    if (err instanceof TelemetryDirFullError) throw err;
    // telemetry must not fail the product path
  }
}

export function recordEventSafe(event: AnalyticsEvent, anonId: string | null): void {
  if (!anonId) return;
  void recordEvent(event, anonId).catch(() => {});
}
