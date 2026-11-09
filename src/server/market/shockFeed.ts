// M1-09 server only: the clock's feed, which can move a price on a Wire story. Kept out of MockFeed so the client bundle
// (every signed-in and guest feed) does not carry code only the server clock runs.
import { ASSET_BY_ID, type AssetFixture } from "@/market/catalog";
import { MockFeed, fmt } from "@/shell/contracts/mockFeed";
import { listAsset } from "@/market/listings";
import { CRYPTO_FACTOR_STREAM, DAYS_PER_YEAR, Draws, HYPE, MEME_TEMPLATE, MemeProcess, TICKS_PER_DAY, TICKS_PER_HOUR } from "./meme";
import { CoinNews, type CoinNewsItem, type NewsInputs } from "./coinNews";
import type { DepthInputs } from "@/server/broker/book";
import { WorldInputs, REGIME_TURNOVER, type WorldView } from "./world";

/** What the trader pools read of a listed coin (src/server/broker/pools.ts): its mark P_{N−1} and template value, its
 *  returns and template vol, the world (04 regime and Fear Index) and its news (attention, sign, mentions). */
export interface PoolInputs extends WorldView, NewsInputs { tick: number; ref: number; lnV: number; r1h: number | null; r1d: number | null; vol: number }
/** A coin news item the clock publishes on the Wire at this tick. */
export interface CoinNewsOut { assetId: string; item: CoinNewsItem }

/** The market factor of a listed coin's template step: this base's index. */
export const MARKET_FACTOR_ASSET = "GX";

/** A story's effect on a price in minor units: integer, at least 1 (as the quote walk). */
export const shockedMinor = (last: number, bp: number): number => Math.max(1, Math.round((last * (10_000 + bp)) / 10_000));

export class ShockFeed extends MockFeed {
  /** Listed (graduated) coins and their meme-template paths, in listing order (L4). */
  private readonly memes = new Map<string, MemeProcess>();

  /** Each listed coin's hype H as its path reads it (06 §3.11.3): the saved pools' H, pushed after each saved step. */
  private readonly hype = new Map<string, number>();
  /** Each listed coin's Wire news (16), and the items published at the current tick (taken by the clock). */
  private readonly coinNews = new Map<string, CoinNews>();
  private fresh: CoinNewsOut[] = [];
  /** 04's Fear Index and global regime in this base (world.ts). */
  readonly world = new WorldInputs();

  /** L4: give a def the catalog just appended its quote state at its listing price and its meme-template path, at hype
   *  `hype` (a fresh listing: H₀; a relist after a restart: the saved H). Idempotent. */
  listMeme(a: AssetFixture, hype: number = HYPE.h0): void {
    if (this.memes.has(a.assetId)) return;
    listAsset(this.assets, a);
    Object.assign(this.assets.get(a.assetId)!, { last: a.base, prevClose: a.base }); // a clock built after the append starts it at its listing price too
    this.memes.set(a.assetId, new MemeProcess(a.assetId, a.base, a.displayDecimals));
    this.hype.set(a.assetId, hype);
    this.coinNews.set(a.assetId, new CoinNews());
  }

  /** The saved hype of a listed coin, read by its next path step. */
  setHype(assetId: string, h: number): void {
    if (this.memes.has(assetId) && Number.isFinite(h)) this.hype.set(assetId, Math.min(1, Math.max(0, h)));
  }
  hypeOf(assetId: string): number | null { return this.hype.get(assetId) ?? null; }

  /** A fresh graduation's listing item (16 "launches … IPOs"), once per coin per clock; null when not published. */
  announceListing(assetId: string): CoinNewsItem | null {
    const n = this.coinNews.get(assetId), s = this.assets.get(assetId);
    if (!n || !s || n.items.some((i) => i.kind === "listing")) return null;
    return n.listing(this.tick, s.last);
  }
  /** The coin news items published at this tick (cleared by the read). */
  takeNews(): CoinNewsOut[] { const out = this.fresh; this.fresh = []; return out; }

  /** σ_GX: the index walk's annual vol (uniform ±volBp a tick: sd volBp/√3), the factor's reference (05 §3.3). */
  private static readonly SIGMA_GX = ((ASSET_BY_ID[MARKET_FACTOR_ASSET]?.volBp ?? 0) / 10_000 / Math.sqrt(3)) * Math.sqrt(TICKS_PER_DAY * DAYS_PER_YEAR);

  /** 05 §3.3 factor jump: the index moved by `j` (log) on a story; each listed, trading coin's path moves by
   *  wMarket × σ_coin,eff / σ_GX × j (a value move). Returns the coins' moves (minor units). */
  factorJump(j: number): { assetId: string; from: number; to: number }[] {
    const out: { assetId: string; from: number; to: number }[] = [];
    if (!Number.isFinite(j) || j === 0 || !(ShockFeed.SIGMA_GX > 0)) return out;
    for (const [id, m] of this.memes) {
      const s = this.assets.get(id);
      if (!s || this.tradingState(id) !== "CONTINUOUS") continue;
      const x = MEME_TEMPLATE.wMarket * (m.sigmaEff(this.pathInputs(id)) / ShockFeed.SIGMA_GX) * j;
      const from = s.last, to = m.jump(x);
      s.last = to;
      s.dir = to > from ? 1 : to < from ? -1 : s.dir;
      out.push({ assetId: id, from, to });
    }
    return out;
  }

  private pathInputs(id: string) { return { hype: this.hype.get(id) ?? HYPE.h0, reg: this.world.mults(this.tick) }; }

  /** Public execution inputs on this tick (source 05: Fear/regime depth, token ADV; 364-day crypto σd). */
  depthInputs(id: string): DepthInputs | null {
    const m = this.memes.get(id);
    if (!m) return null;
    const fear = this.world.fear, att = this.coinNews.get(id)!.inputs(this.tick).attention;
    return { fear, regimeDepth: this.world.depth(this.tick),
      adv: 150e6 * (1 + 0.01 * Math.max(0, fear - 20)) * att * REGIME_TURNOVER[this.world.regime],
      sigmaDaily: m.sigmaEff(this.pathInputs(id)) / Math.sqrt(364) };
  }

  /** Each listed coin's marks and template values (lnV) at the end of its recent ticks, newest last (at most
   *  POOL_LOOKBACK + 1): what the trader pools read as "state published at the end of tick N−1" (05 §6.2). In memory,
   *  like the path: a restart starts it again. */
  private readonly marks = new Map<string, { p: number[]; v: number[] }>();

  /** The trader pools' inputs for a listed coin at this tick, read from the end of the previous tick: its mark P_{N−1}
   *  (minor units), lnV_{N−1}, the 1-hour and 1-day log returns (null until the clock has that much of this coin's
   *  marks) and its template vol; null when the coin is not listed here or no tick has ended since its listing. */
  poolInputs(assetId: string): PoolInputs | null {
    const m = this.memes.get(assetId), h = this.marks.get(assetId);
    if (!m || !h || h.p.length === 0) return null;
    const n = h.p.length, ref = h.p[n - 1]!;
    const back = (k: number) => (n > k ? Math.log(ref / h.p[n - 1 - k]!) : null);
    return { tick: this.tick, ref, lnV: h.v[n - 1]!, r1h: back(TICKS_PER_HOUR), r1d: back(TICKS_PER_DAY), vol: m.vol, ...this.world.view(), ...this.coinNews.get(assetId)!.inputs(this.tick) };
  }

  /** The current mark of an asset in its minor unit, or null. */
  lastMinor(assetId: string): number | null {
    return this.assets.get(assetId)?.last ?? null;
  }

  /** The world's crypto factor (one normal a tick, drawn every tick whether or not a coin is listed: a coin listed
   *  later sees the same factor path). Its own stream: no existing asset's draws change. */
  private readonly cryptoFactor = new Draws(CRYPTO_FACTOR_STREAM);

  /** The base walk for every asset (a listed coin has volBp 0 and lot 0 there: no move, no print), then one meme-template
   *  step per listed coin from its own stream, so the existing assets' paths are exactly those of a world without it.
   *  The market factor is the index GX's own step this tick, standardized (its walk is uniform on +-volBp: sd volBp/sqrt 3),
   *  read after the base walk and before any story moves it; 0 when GX did not step. */
  override advance(): void {
    const gx = this.assets.get(MARKET_FACTOR_ASSET), gxDef = ASSET_BY_ID[MARKET_FACTOR_ASSET];
    const gxFrom = gx?.last ?? 0;
    // the end of the previous tick, as published (after its fills' permanent moves): the world's and the pools' N−1
    // state, and the coins' large moves of N−1 (published at N)
    if (gxFrom > 0) this.world.observe(this.tick + 1, gxFrom);
    for (const [id, m] of this.memes) {
      const s = this.assets.get(id);
      if (!s) continue;
      const h = this.marks.get(id) ?? { p: [], v: [] };
      h.p.push(s.last); h.v.push(m.lnV());
      if (h.p.length > TICKS_PER_DAY + 1) { h.p.shift(); h.v.shift(); }
      this.marks.set(id, h);
      const item = this.coinNews.get(id)!.observe(this.tick + 1, s.last);
      if (item) this.fresh.push({ assetId: id, item });
    }
    super.advance();
    const zCrypto = this.cryptoFactor.normal();
    const zMarket = gx && gxDef && gxDef.volBp > 0 && gxFrom > 0 ? (gx.last - gxFrom) / gxFrom / (gxDef.volBp / 10_000 / Math.sqrt(3)) : 0;
    for (const [id, m] of this.memes) {
      const s = this.assets.get(id);
      if (!s || this.tradingState(id) !== "CONTINUOUS") continue;
      const to = m.step(zMarket, zCrypto, this.pathInputs(id));
      s.dir = to > s.last ? 1 : to < s.last ? -1 : 0;
      s.last = to;
    }
  }

  /** L4: a committed book fill's permanent impact on a listed coin's mark (log move). Returns the new mark, or null when
   *  the coin is not listed here. */
  impactListed(assetId: string, logMove: number): number | null {
    const m = this.memes.get(assetId), s = this.assets.get(assetId);
    if (!m || !s || !Number.isFinite(logMove) || logMove === 0) return m && s ? s.last : null;
    const from = s.last, to = m.shift(logMove);
    s.last = to;
    s.dir = to > from ? 1 : to < from ? -1 : s.dir;
    return to;
  }

  /** Move one asset's price by a story's effect at the current tick, after this tick's walk step. Returns the price
   *  before and after in minor units, or null for an unknown or non-trading asset. The quote walk itself is not
   *  redrawn: its next step starts from the new price. */
  applyShock(assetId: string, bp: number): { from: number; to: number } | null {
    const s = this.assets.get(assetId);
    if (!s || this.tradingState(assetId) !== "CONTINUOUS") return null;
    const from = s.last, to = shockedMinor(from, bp);
    s.last = to;
    s.dir = to > from ? 1 : to < from ? -1 : s.dir;
    const p = s.prints.at(-1);
    if (p && p.tick === this.tick) s.prints = [...s.prints.slice(0, -1), { ...p, price: fmt(to, ASSET_BY_ID[assetId]!.displayDecimals) }];
    return { from, to };
  }
}
