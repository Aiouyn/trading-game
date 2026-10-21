// 17B CH-00 `useChannel(ch)`: snap + delta + stale/denied state for one channel (19 §2.4, Rules 3.8.2 / 3.8.8).
// Every frame is parsed at the boundary (schema.ts); a delta is applied and the patched body re-validated, so the UI
// only ever sees bodies that match channels.ts. A seq gap or an unappliable delta asks the feed for a fresh snap.
"use client";
import { useSyncExternalStore } from "react";
import type { BodyOf, ChannelName, Tick } from "./channels";
import { applyOps } from "./delta";
import { MockFeed, scenarioFromQuery } from "./mockFeed";
import { bodySchema, parseFrame } from "./schema";

/** What a channel subscription exposes. `denied` and `error` never carry a body or an entity hint (CH-03). */
export type ChannelView<B> =
  | { state: "loading"; body: null; tick: null }
  | { state: "live" | "stale"; body: B; tick: Tick }
  | { state: "denied" | "error"; body: null; tick: null };

/** The transport useChannel needs; MockFeed implements it now, the 19C socket client on SWAP. */
export interface FeedTransport {
  readonly tickMs: number;
  subscribe(ch: ChannelName, fn: (raw: unknown) => void): () => void;
  resync(ch: ChannelName): void;
}

/** Stale after 2 missed ticks (17 §3.5 PriceCell, 19 Rule 3.8.8); a quarter tick of slack for timer jitter. */
export const staleAfterMs = (tickMs: number) => 2 * tickMs + tickMs / 4;

export interface ChannelStore<B> { get(): ChannelView<B>; listen(fn: () => void): () => void; close(): void }

const LOADING = { state: "loading", body: null, tick: null } as const;

/** Framework-free channel store (unit-testable with a fake clock); useChannel wraps it. */
export function openChannel<C extends ChannelName>(feed: FeedTransport, ch: C, now: () => number = Date.now): ChannelStore<BodyOf<C>> {
  type B = BodyOf<C>;
  let view: ChannelView<B> = LOADING;
  let seq = -1;
  let lastAt = now();
  const fns = new Set<() => void>();
  const set = (v: ChannelView<B>) => { view = v; fns.forEach((f) => f()); };
  const schema = bodySchema(ch);
  const resync = () => { if (view.state === "live") set({ ...view, state: "stale" }); feed.resync(ch); };

  const onRaw = (raw: unknown) => {
    let f;
    try { f = parseFrame(raw); } catch { return resync(); } // malformed frame: never reaches the UI
    if (f.ch !== ch) return;
    lastAt = now();
    if (f.t === "err") return set({ state: f.code === "CHANNEL_DENIED" ? "denied" : "error", body: null, tick: null });
    if (f.t === "snap") { seq = f.seq; return set({ state: "live", body: f.body as B, tick: f.tick }); }
    if (view.state !== "live" && view.state !== "stale") return; // delta before any snap: ignore
    if (f.seq !== seq + 1) return resync(); // gap
    try {
      const body = schema(applyOps(view.body, f.ops)) as B;
      seq = f.seq;
      set({ state: "live", body, tick: f.tick });
    } catch { resync(); }
  };
  const unsub = feed.subscribe(ch, onRaw);
  const watchdog = setInterval(() => {
    if (view.state === "live" && now() - lastAt >= staleAfterMs(feed.tickMs)) set({ ...view, state: "stale" });
  }, feed.tickMs / 4);
  return {
    get: () => view,
    listen: (fn) => { fns.add(fn); return () => { fns.delete(fn); }; },
    close: () => { clearInterval(watchdog); unsub(); fns.clear(); },
  };
}

// ---- React hook: one shared store per (feed, channel), ref-counted ----
let defaultFeed: FeedTransport | null = null;
/** The page's feed: the deterministic mock, scripted by the (build-gated) URL scenario. */
export function getFeed(): FeedTransport {
  if (!defaultFeed) defaultFeed = new MockFeed(scenarioFromQuery(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)));
  return defaultFeed;
}
/** Tests / SWAP: replace the page feed (closes nothing; call before the first useChannel). */
export function setFeed(f: FeedTransport | null): void { defaultFeed = f; shared.clear(); }

const shared = new Map<string, { store: ChannelStore<unknown>; refs: number; closeTimer: ReturnType<typeof setTimeout> | null }>();
function acquire<C extends ChannelName>(ch: C): ChannelStore<BodyOf<C>> {
  let e = shared.get(ch);
  if (!e) { e = { store: openChannel(getFeed(), ch) as ChannelStore<unknown>, refs: 0, closeTimer: null }; shared.set(ch, e); }
  return e.store as ChannelStore<BodyOf<C>>;
}
function retain(ch: string) {
  const e = shared.get(ch)!;
  if (e.closeTimer) { clearTimeout(e.closeTimer); e.closeTimer = null; }
  e.refs += 1;
  return () => {
    e.refs -= 1;
    // Grace period so a remount (StrictMode, window move) doesn't drop and re-snap the channel.
    if (e.refs === 0) e.closeTimer = setTimeout(() => { e.store.close(); shared.delete(ch); }, 1000);
  };
}

const SERVER_VIEW = LOADING;
/** Subscribe a component to a channel: `loading` → `live` (snap, then per-tick deltas) → `stale` / `denied` / `error`. */
export function useChannel<C extends ChannelName>(ch: C): ChannelView<BodyOf<C>> {
  const store = typeof window === "undefined" ? null : acquire(ch);
  return useSyncExternalStore(
    (fn) => { if (!store) return () => {}; const off = store.listen(fn); const release = retain(ch); return () => { off(); release(); }; },
    () => (store ? store.get() : SERVER_VIEW),
    () => SERVER_VIEW,
  );
}
