// Single-process authoritative quote clock (M1-05).
// One MockFeed, seed 17, advanced on FEED_TICK_MS. Reads never step it.
// Not durable across process restart and not multi-instance (same limit as the auth file store).
// M1-09: each step also publishes that tick's Wire story (src/market/wireStories.ts) and applies its price effect to
// these quotes once, before the step listeners (resting-order sweep, candles) see the tick. Reads never publish or
// apply. A restart starts a new epoch: the clock and its stories start again at the first tick (the same seeded replay).
import { ASSET_BY_ID } from "@/market/catalog";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { STORY_KEEP, storyAt } from "@/market/wireStories";
import type { WireSnapshot } from "@/market/wireSnapshot";
import { FEED_TICK_MS, MockFeed, fmt } from "@/shell/contracts/mockFeed";
import type { PriceEffect, TickerBody, WireItem } from "@/shell/contracts/channels";
import { PORT_AVALON_MARKET_SEED, PORT_AVALON_WORLD_ID } from "@/shell/worldIdentity";

const globalForMarket = globalThis as typeof globalThis & {
  __portAvalonLiveMarket?: LiveMarket;
};

export type LiveMarketOptions = {
  /** Override only in tests. Production uses FEED_TICK_MS. */
  tickMs?: number;
  /** Override only in tests. Production uses PORT_AVALON_MARKET_SEED. */
  seed?: number;
};

export class LiveMarket {
  readonly tickMs: number;
  private readonly feed: MockFeed;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly stepListeners = new Set<() => void>();
  private stories: WireItem[] = [];
  /** Names this clock's history (new per process / clock), so a client never mixes two runs' stories. */
  readonly epoch = Math.random().toString(36).slice(2, 10) || "0";

  constructor(opts: LiveMarketOptions = {}) {
    this.tickMs = opts.tickMs ?? FEED_TICK_MS;
    this.feed = new MockFeed(
      { seed: opts.seed ?? PORT_AVALON_MARKET_SEED, empty: true },
      { autoStart: false, tickMs: this.tickMs },
    );
  }

  /** Idempotent. A second start does not add another interval. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { this.step(); }, this.tickMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** One cadence step. The HTTP route never calls this. Listeners (the M1-06 resting-order sweep) run after it. */
  step(): void {
    this.feed.advance();
    this.publishStory();
    for (const fn of this.stepListeners) fn();
  }

  /** The story of the tick just reached, if any: its effects move these quotes now, once (the tick only grows). */
  private publishStory(): void {
    const tick = this.feed.tick;
    const def = storyAt(this.feed.scenario.seed, tick);
    if (!def) return;
    const effects: PriceEffect[] = [];
    for (const e of def.effects) {
      const a = ASSET_BY_ID[e.assetId], r = this.feed.applyShock(e.assetId, e.bp);
      if (!a || !r) continue;
      effects.push({ assetId: e.assetId, from: fmt(r.from, a.displayDecimals), to: fmt(r.to, a.displayDecimals), pct: fmt(Math.round(((r.to - r.from) * 10_000) / r.from), 2) });
    }
    const item: WireItem = {
      id: `w-${tick}`, kind: def.kind, headlineKey: def.headlineKey, slots: { ...def.slots },
      entities: def.assets.map((id) => ({ id, kind: "asset", label: ASSET_BY_ID[id]?.ticker ?? id })),
      tick, breaking: def.breaking, causeEventIds: [def.defId], phase: def.phase, causeKey: def.causeKey,
      ...(effects.length ? { effects } : {}),
    };
    this.stories = [...this.stories, item].slice(-STORY_KEEP);
  }

  /** The stories published so far (newest last), at the current tick. A copy: reading changes nothing. */
  wire(): WireSnapshot {
    return structuredClone({ worldId: PORT_AVALON_WORLD_ID, epoch: this.epoch, tick: this.feed.tick, items: this.stories });
  }

  /** Run `fn` after every step. Returns the unsubscribe. */
  onStep(fn: () => void): () => void {
    this.stepListeners.add(fn);
    return () => { this.stepListeners.delete(fn); };
  }

  snapshot(): MarketSnapshot {
    const quotes = this.feed.body("ticker:wl_default") as TickerBody;
    return {
      worldId: PORT_AVALON_WORLD_ID,
      marketSeed: this.feed.scenario.seed,
      tick: this.feed.tick,
      tickMs: this.tickMs,
      quotes,
    };
  }
}

export function shouldAutostartClock(): boolean {
  return process.env.NODE_ENV !== "test";
}

/** Process singleton. The first production read starts the one interval. */
export function getLiveMarket(): LiveMarket {
  if (!globalForMarket.__portAvalonLiveMarket) {
    const market = new LiveMarket();
    globalForMarket.__portAvalonLiveMarket = market;
    if (shouldAutostartClock()) market.start();
  }
  return globalForMarket.__portAvalonLiveMarket;
}

/** Test-only: replace the singleton. Stops the previous clock. */
export function setLiveMarketForTests(market: LiveMarket | undefined): void {
  const prev = globalForMarket.__portAvalonLiveMarket;
  if (prev && prev !== market) prev.stop();
  globalForMarket.__portAvalonLiveMarket = market;
}
