// Single-process authoritative quote clock (M1-05).
// One MockFeed, seed 17, advanced on FEED_TICK_MS. Reads never step it.
// Not durable across process restart and not multi-instance (same limit as the auth file store).
import type { MarketSnapshot } from "@/market/quoteSnapshot";
import { FEED_TICK_MS, MockFeed } from "@/shell/contracts/mockFeed";
import type { TickerBody } from "@/shell/contracts/channels";
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

  /** One cadence step. The HTTP route never calls this. */
  step(): void {
    this.feed.advance();
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
