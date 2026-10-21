// Alert / world-event feed (17A T6). Typed at the boundary: raw messages are parsed into a discriminated union and
// anything malformed is dropped (never trusted into the UI). The mock source scripts events from the URL.
// TODO(17A T6): Engine wires the real alert / world-event feed into `subscribeFeed` (trigger: the engine's
// notification channel exists). Until then only the mock source below emits.
import { useEffect, useSyncExternalStore } from "react";
import { isAppId, type AppId } from "./registry";
import type { Alert, WorldEvent } from "@/components/shell/Banner";

export type FeedEvent =
  | { kind: "alert"; alert: Alert }
  | { kind: "alert-resolved"; id: string }
  | { kind: "world-event"; event: WorldEvent }
  | { kind: "world-event-ended" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const pct = (v: unknown): v is string => typeof v === "string" && /^[-+]?\d+(\.\d+)?$/.test(v);
const href = (v: unknown): v is string => typeof v === "string" && /^\/[\w/?=&.-]*$/.test(v); // in-app deep links only

/** Parse one raw feed message. Returns null for anything that doesn't match the schema exactly. */
export function parseFeedEvent(raw: unknown): FeedEvent | null {
  if (!isObj(raw)) return null;
  switch (raw.kind) {
    case "alert": {
      const a = raw.alert;
      if (!isObj(a) || !str(a.id) || (a.priority !== "P0" && a.priority !== "P1") || !str(a.text)) return null;
      const act = a.action;
      if (!isObj(act) || !str(act.label) || !href(act.href)) return null;
      return { kind: "alert", alert: { id: a.id, priority: a.priority, text: a.text, action: { label: act.label, href: act.href } } };
    }
    case "alert-resolved":
      return str(raw.id) ? { kind: "alert-resolved", id: raw.id } : null;
    case "world-event": {
      const e = raw.event;
      if (!isObj(e) || !str(e.name) || !Number.isInteger(e.day) || (e.day as number) < 0 || !str(e.index) || !pct(e.sincePct) || !pct(e.todayPct)) return null;
      return { kind: "world-event", event: { name: e.name, day: e.day as number, index: e.index, sincePct: e.sincePct, todayPct: e.todayPct } };
    }
    case "world-event-ended":
      return { kind: "world-event-ended" };
    default:
      return null;
  }
}

export interface FeedState { alerts: Alert[]; world: WorldEvent | null }
export const EMPTY_FEED: FeedState = { alerts: [], world: null };

export function reduceFeed(s: FeedState, e: FeedEvent): FeedState {
  switch (e.kind) {
    case "alert": return s.alerts.some((a) => a.id === e.alert.id) ? s : { ...s, alerts: [...s.alerts, e.alert] };
    case "alert-resolved": return { ...s, alerts: s.alerts.filter((a) => a.id !== e.id) };
    case "world-event": return { ...s, world: e.event };
    case "world-event-ended": return { ...s, world: null };
  }
}

/** A feed source delivers raw (unparsed) messages. */
export type FeedSource = (emit: (raw: unknown) => void) => () => void;

/** Mock source: `?alerts=p0,p1,p0b&world=crash` (dev / e2e only). Raw objects, parsed like the real feed. */
export function mockFeedSource(q: URLSearchParams): FeedSource {
  const MOCK: Record<string, unknown> = {
    p0: { kind: "alert", alert: { id: "m-p0", priority: "P0", text: "Margin call: equity below maintenance on 2 positions", action: { label: "Open Risk", href: "/risk" } } },
    p0b: { kind: "alert", alert: { id: "m-p0b", priority: "P0", text: "Second P0 (queued)", action: { label: "Open Broker", href: "/broker" } } },
    p1: { kind: "alert", alert: { id: "m-p1", priority: "P1", text: "Order partly filled: 400 of 1,000 GX", action: { label: "Open Broker", href: "/broker" } } },
    bad: { kind: "alert", alert: { id: "m-bad", priority: "P9", text: "malformed", action: { label: "x", href: "javascript:alert(1)" } } },
    p1b: { kind: "alert", alert: { id: "m-p1b", priority: "P1", text: "Price alert: GX crossed 4,200", action: { label: "Open Markets", href: "/markets" } } },
    crash: { kind: "world-event", event: { name: "Crash", day: 3, index: "GX", sincePct: "-18.40", todayPct: "-2.10" } },
  };
  const keys = [...(q.get("alerts") ?? "").split(","), q.get("world") ?? ""].filter(Boolean);
  return (emit) => { keys.forEach((k) => MOCK[k] !== undefined && emit(MOCK[k])); return () => {}; };
}

// One feed per page: a tiny external store so the desktop slots and the phone stack read the same state.
let state: FeedState = EMPTY_FEED;
const subs = new Set<() => void>();
/** Parse at the boundary, then reduce; malformed messages are dropped. */
export function dispatchFeed(raw: unknown): void {
  const e = parseFeedEvent(raw);
  if (!e) return;
  const next = reduceFeed(state, e);
  if (next !== state) { state = next; subs.forEach((f) => f()); }
}
export const useFeedState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => EMPTY_FEED);

/** Connect the shell to a source (resets state for this page). */
export function useFeed(source: FeedSource): FeedState {
  useEffect(() => { state = EMPTY_FEED; subs.forEach((f) => f()); return source(dispatchFeed); }, [source]);
  return useFeedState();
}

/** Parse an in-app deep link (`/app` or `/app?asset=X`, the alert action format) into an app + context. */
export function parseDeepLink(href: string): { app: AppId; context?: string } | null {
  const m = /^\/([\w-]+)(?:\/[\w-]+)?(?:\?(.*))?$/.exec(href);
  if (!m || !isAppId(m[1]!)) return null;
  const asset = new URLSearchParams(m[2] ?? "").get("asset");
  return { app: m[1] as AppId, context: asset ?? undefined };
}
