// Single-process authoritative quote clock (M1-05).
// One MockFeed (the ShockFeed subclass, M1-09), seed 17, advanced on FEED_TICK_MS. Reads never step it.
// Not durable across process restart and not multi-instance (same limit as the auth file store).
// M1-09: each step also publishes that tick's Wire story (src/market/wireStories.ts) and applies its price effect to
// these quotes once, before the step listeners (resting-order sweep, candles) see the tick. Reads never publish or
// apply. A restart starts a new epoch: the clock and its stories start again at the first tick (the same seeded replay).
import { ASSETS, ASSET_BY_ID, WATCHLISTS, type AssetFixture } from "@/market/catalog";
import { appendAsset, listVersion } from "@/market/listings";
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { STORY_KEEP, storyAt } from "@/market/wireStories";
import type { WireSnapshot } from "@/market/wireSnapshot";
import { FEED_TICK_MS, fmt } from "@/shell/contracts/mockFeed";
import { MARKET_FACTOR_ASSET, ShockFeed, type CoinNewsOut, type PoolInputs } from "./shockFeed";
import { TICKS_PER_DAY } from "./meme";
import type { WorldView } from "./world";
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
  private readonly feed: ShockFeed;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly stepListeners = new Set<() => void>();
  private readonly listListeners = new Set<() => void>();
  private stories: WireItem[] = [];
  /** L4 listings on this clock, oldest first (public defs). */
  private readonly listedDefs: AssetFixture[] = [];
  /** Names this clock's history (new per process / clock), so a client never mixes two runs' stories. */
  readonly epoch = Math.random().toString(36).slice(2, 10) || "0";

  constructor(opts: LiveMarketOptions = {}) {
    this.tickMs = opts.tickMs ?? FEED_TICK_MS;
    this.feed = new ShockFeed(
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
    for (const n of this.feed.takeNews()) this.publishCoinNews(n);
    for (const fn of this.stepListeners) fn();
  }

  /** A listed coin's 16 news item (src/server/market/coinNews.ts) on the Wire, naming the coin; it cites its committed
   *  event and states only what is true now (16 N1/N2). */
  private publishCoinNews({ assetId, item }: CoinNewsOut): void {
    const a = ASSET_BY_ID[assetId];
    if (!a) return;
    const entities = [{ id: assetId, kind: "asset", label: a.ticker }];
    // no `phase`: the item causes no price effect of its own (the Wire's "Price effect" section is for stories)
    const base = { kind: "NEWS" as const, entities, tick: item.tick, breaking: false };
    const wi: WireItem = item.kind === "listing"
      ? { ...base, id: `w-${item.tick}-${assetId}-listed`, headlineKey: "wire.news.coinListed", slots: { coin: a.ticker }, causeEventIds: [`lp-grad:${assetId}`], causeKey: "wire.cause.coin-listed" }
      : {
        ...base, id: `w-${item.tick}-${assetId}-move${Math.round(item.level! * 100)}`, headlineKey: item.sign > 0 ? "wire.news.coinUp" : "wire.news.coinDown",
        slots: { coin: a.ticker, move: fmt(Math.round(Math.abs(item.to! / item.from! - 1) * 1000), 1) },
        causeEventIds: [`mkt-move:${assetId}:${Math.floor((item.tick - 1) / TICKS_PER_DAY)}:${Math.round(item.level! * 100)}`], causeKey: "wire.cause.coin-move",
      };
    this.stories = [...this.stories, wi].slice(-STORY_KEEP);
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
      // 05 §3.3 factor jumps: a story that moves the index moves each listed coin through its market loading, now
      if (e.assetId === MARKET_FACTOR_ASSET) {
        for (const c of this.feed.factorJump(Math.log(r.to / r.from))) {
          const ca = ASSET_BY_ID[c.assetId];
          if (ca) effects.push({ assetId: c.assetId, from: fmt(c.from, ca.displayDecimals), to: fmt(c.to, ca.displayDecimals), pct: fmt(Math.round(((c.to - c.from) * 10_000) / c.from), 2) });
        }
      }
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

  /** L4 listing path: append the def to the catalog (list version + 1) and quote it on this clock from the current tick,
   *  with its meme-template path. Idempotent: listing the same def again changes nothing. Throws on a def that collides
   *  with a different asset (never silently replaced). */
  list(def: AssetFixture, opts: { hype?: number | null; announce?: boolean } = {}): void {
    if (!appendAsset(def, { ASSETS, ASSET_BY_ID, WATCHLISTS })) throw new Error(`listing ${def.assetId} collides with an existing asset`);
    if (!this.listedDefs.some((d) => d.assetId === def.assetId)) {
      this.feed.listMeme(ASSET_BY_ID[def.assetId]!, opts.hype ?? undefined);
      this.listedDefs.push({ ...def });
      for (const fn of this.listListeners) fn(); // candles sample the new asset at its listing tick (fills there count)
    }
    // a fresh graduation (not a relist after a restart): its listing on the Wire, once per coin on this clock
    if (opts.announce) {
      const item = this.feed.announceListing(def.assetId);
      if (item) this.publishCoinNews({ assetId: def.assetId, item });
    }
  }

  /** The saved hype of a listed coin (its pools' H), read by its next path step; called after the pools' save. */
  setHype(assetId: string, h: number): void { if (this.isListed(assetId)) this.feed.setHype(assetId, h); }
  /** The hype a listed coin's next path step reads, or null. */
  hypeOf(assetId: string): number | null { return this.isListed(assetId) ? this.feed.hypeOf(assetId) : null; }
  /** 04's regime and Fear Index on this clock now (world.ts). */
  worldView(): WorldView { return this.feed.world.view(); }

  /** A listed coin's mark now (1e-8 $), or null when this clock has not listed it. */
  listedMark(assetId: string): number | null {
    return this.isListed(assetId) ? this.feed.lastMinor(assetId) : null;
  }

  /** L4: a committed book fill's permanent impact on a listed coin (src/server/broker/book.ts). Not durable, like the
   *  path itself (a restart starts the clock again). Returns the new mark, or null when not listed here. */
  impactListed(assetId: string, logMove: number): number | null {
    return this.isListed(assetId) ? this.feed.impactListed(assetId, logMove) : null;
  }

  /** The trader pools' inputs for a listed coin (ShockFeed.poolInputs), or null. Reads only. */
  poolInputs(assetId: string): PoolInputs | null {
    return this.isListed(assetId) ? this.feed.poolInputs(assetId) : null;
  }

  isListed(assetId: string): boolean {
    return this.listedDefs.some((d) => d.assetId === assetId);
  }

  /** Run `fn` after every new listing (L4), at the listing tick. Returns the unsubscribe. */
  onList(fn: () => void): () => void {
    this.listListeners.add(fn);
    return () => { this.listListeners.delete(fn); };
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
      // L4: once a coin is listed, the list version and every listed def, so a client adds them to its catalog before
      // reading their rows (absent until then: the snapshot is exactly the pre-listing shape).
      ...(this.listedDefs.length ? { listVersion: listVersion(), listed: this.listedDefs.map((d) => ({ ...d })) } : {}),
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
