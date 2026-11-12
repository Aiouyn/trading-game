// 17B CH-00 `useChannel(ch)`: snap + delta + stale/denied state for one channel (19 §2.4, Rules 3.8.2 / 3.8.8).
// Every frame is parsed at the boundary (schema.ts); a delta is applied and the patched body re-validated, so the UI
// only ever sees bodies that match channels.ts. A seq gap or an unappliable delta asks the feed for a fresh snap.
"use client";
import { useSyncExternalStore } from "react";
import type { BodyOf, ChannelName, Tick } from "./channels";
import { applyOps } from "./delta";
import { PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";
import { MockFeed, scenarioFromQuery } from "./mockFeed";
import { bodySchema, parseFrame } from "./schema";
import { knownOffline, onNetworkChange } from "./network";

/** Re-exported for apps that may only read the channel contract (BR-4-03): the browser reports offline. */
export { knownOffline };

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
  /** Browser came back online. Optional: a feed that must not replay a cached book (signed-in quotes). */
  reconnect?(ch: ChannelName): void;
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
  // M2-05: while the browser reports offline nothing shown is live, whatever frames still arrive (the mock clock
  // keeps emitting): the view stays `stale` (Broker freezes Review / Place, panes say Updating…). Back online, a fresh
  // read is requested. `reconnect` (signed-in quotes) does not replay the cached book: that snap is the pre-outage
  // tick, and replaying it would mark the Broker live there. The read's own frame is what turns the view live.
  const live = () => (knownOffline() ? "stale" : "live") as "live" | "stale";
  const offNet = onNetworkChange(() => {
    if (knownOffline()) { if (view.state === "live") set({ ...view, state: "stale" }); }
    else if (feed.reconnect) feed.reconnect(ch);
    else feed.resync(ch);
  });

  const onRaw = (raw: unknown) => {
    let f;
    try { f = parseFrame(raw); } catch { return resync(); } // malformed frame: never reaches the UI
    if (f.ch !== ch) return;
    lastAt = now();
    if (f.t === "err") return set({ state: f.code === "CHANNEL_DENIED" ? "denied" : "error", body: null, tick: null });
    if (f.t === "snap") { seq = f.seq; return set({ state: live(), body: f.body as B, tick: f.tick }); }
    if (view.state !== "live" && view.state !== "stale") return; // delta before any snap: ignore
    if (f.seq !== seq + 1) return resync(); // gap
    try {
      const body = schema(applyOps(view.body, f.ops)) as B;
      seq = f.seq;
      set({ state: live(), body, tick: f.tick });
    } catch { resync(); }
  };
  const unsub = feed.subscribe(ch, onRaw);
  const watchdog = setInterval(() => {
    if (view.state === "live" && now() - lastAt >= staleAfterMs(feed.tickMs)) set({ ...view, state: "stale" });
  }, feed.tickMs / 4);
  return {
    get: () => view,
    listen: (fn) => { fns.add(fn); return () => { fns.delete(fn); }; },
    close: () => { clearInterval(watchdog); offNet(); unsub(); fns.clear(); },
  };
}

// ---- React hook: one shared store per (feed, channel), ref-counted ----
type SharedEntry = {
  store: ChannelStore<unknown>;
  refs: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
};

let defaultFeed: FeedTransport | null = null;
/** Bumped on every setFeed so hot-swaps invalidate render-time acquires. */
let feedGeneration = 0;

/** The page's feed: the deterministic mock, scripted by the (build-gated) URL scenario. */
export function getFeed(): FeedTransport {
  if (!defaultFeed) defaultFeed = new MockFeed(scenarioFromQuery(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)));
  return defaultFeed;
}

/**
 * Server-owned Port Avalon quote provenance for the Broker header.
 * Lives next to the feed so Broker source stays on the channel contract and does not import MockFeed.
 * Guest clocks, and a signed-in feed that has not adopted `/api/market` yet, return null.
 * The label is the adopted server tick only, never the constructor book.
 */
export function authoritativeQuoteProvenance(tick: number | null): { worldId: string; tick: number } | null {
  if (tick === null) return null;
  const feed = getFeed();
  if (!(feed instanceof MockFeed) || feed.adoptedServerTick() !== tick) return null;
  return { worldId: PORT_AVALON_WORLD_ID, tick };
}

/** 04 Fear Index from the last adopted /api/market snapshot (macro.fear PUBLIC). Null for guest / not yet adopted. */
export function authoritativeFear(): { F: number; RA: number } | null {
  const feed = getFeed();
  if (!(feed instanceof MockFeed) || feed.fearIndex === null || feed.riskAppetite === null) return null;
  return { F: feed.fearIndex, RA: feed.riskAppetite };
}

/**
 * Replace the page feed. Safe while useChannel subscribers are mounted (M1-01 account boundary):
 * closes live channel stores, clears the shared map, and bumps feedGeneration so the next
 * subscribe/getSnapshot re-acquires on the new transport. Callers that mutate shell state in the
 * same turn (setChannels) re-render subscribers onto the new feed.
 */
const feedListeners = new Set<() => void>();

/** Bumped by every setFeed: anything loaded from one feed (e.g. chart history) is keyed by it, so an account switch never
 *  shows the previous feed's data (M1-07). */
export function feedEpoch(): number {
  return feedGeneration;
}

export function setFeed(f: FeedTransport | null): void {
  for (const e of shared.values()) {
    if (e.closeTimer) clearTimeout(e.closeTimer);
    e.closeTimer = null;
    e.store.close();
  }
  shared.clear();
  defaultFeed = f;
  feedGeneration += 1;
  // Force every mounted useChannel to re-read getSnapshot on the new feed.
  feedListeners.forEach((fn) => fn());
}

const shared = new Map<string, SharedEntry>();

function acquireEntry(ch: ChannelName): SharedEntry {
  let e = shared.get(ch);
  if (!e) {
    e = { store: openChannel(getFeed(), ch) as ChannelStore<unknown>, refs: 0, closeTimer: null };
    shared.set(ch, e);
  }
  return e;
}

function retainEntry(ch: string, e: SharedEntry): () => void {
  if (e.closeTimer) { clearTimeout(e.closeTimer); e.closeTimer = null; }
  e.refs += 1;
  return () => {
    e.refs -= 1;
    // Grace period so a remount (StrictMode, window move) doesn't drop and re-snap the channel.
    if (e.refs === 0) {
      e.closeTimer = setTimeout(() => {
        e.store.close();
        // Only delete if this entry is still current (setFeed may have replaced the map).
        if (shared.get(ch) === e) shared.delete(ch);
      }, 1000);
    }
  };
}

const SERVER_VIEW = LOADING;

/**
 * Subscribe a component to a channel: `loading` → `live` (snap, then per-tick deltas) → `stale` / `denied` / `error`.
 * Acquire happens again inside subscribe/getSnapshot so a setFeed between render and subscribe cannot
 * retain a missing map entry (AuthAccountBoundary / LiveNwUnlock hot-swap).
 */
export function useChannel<C extends ChannelName>(ch: C): ChannelView<BodyOf<C>> {
  // Read generation during render so a feed swap that also updates React state rebinds this hook.
  const generation = feedGeneration;
  const onClient = typeof window !== "undefined";
  void generation;
  return useSyncExternalStore(
    (fn) => {
      if (!onClient) return () => {};
      // Re-acquire on the *current* feed: setFeed may have cleared the map since render.
      const e = acquireEntry(ch);
      const off = e.store.listen(fn);
      const release = retainEntry(ch, e);
      feedListeners.add(fn);
      return () => { feedListeners.delete(fn); off(); release(); };
    },
    () => (onClient ? acquireEntry(ch).store.get() as ChannelView<BodyOf<C>> : SERVER_VIEW),
    () => SERVER_VIEW,
  );
}
