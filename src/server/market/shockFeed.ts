// M1-09 server only: the clock's feed, which can move a price on a Wire story. Kept out of MockFeed so the client bundle
// (every signed-in and guest feed) does not carry code only the server clock runs.
import { ASSET_BY_ID, type AssetFixture } from "@/market/catalog";
import { MockFeed, fmt } from "@/shell/contracts/mockFeed";
import { listAsset } from "@/market/listings";
import { CRYPTO_FACTOR_STREAM, CRYPTO_DAYS_PER_YEAR, SESSION_DAYS_PER_YEAR, Draws, HYPE, MEME_TEMPLATE, MemeProcess, TICKS_PER_DAY, TICKS_PER_HOUR } from "./meme";
import { CoinNews, type CoinNewsItem, type NewsInputs } from "./coinNews";
import { moveAsserted, type BeliefMoveSeed } from "@/server/broker/belief";
import type { DepthInputs } from "@/server/broker/book";
import { WorldInputs, REGIME_TURNOVER, type WorldView } from "./world";
import { StormScheduler, type StormHypeShock, type StormPriceShock, type StormWireOut } from "./storms";

/** What the trader pools read of a listed coin (src/server/broker/pools.ts): its mark P_{N−1} and template value, its
 *  returns and template vol, the world (04 regime and Fear Index) and its news (attention, sign, mentions). */
export interface PoolInputs extends WorldView, NewsInputs {
  tick: number; ref: number; lnV: number; r1h: number | null; r1d: number | null; vol: number;
  /** Wire large-move claims published before this tick (05 §6.3 synthetic inputs). */
  moves?: BeliefMoveSeed[];
}
/** A coin news item the clock publishes on the Wire at this tick. */
export interface CoinNewsOut { assetId: string; item: CoinNewsItem }

/** The market factor of a listed coin's template step: this base's index. */
export const MARKET_FACTOR_ASSET = "GX";

/** A story's effect on a price in minor units: integer, at least 1 (as the quote walk). */
export const shockedMinor = (last: number, bp: number): number => Math.max(1, Math.round((last * (10_000 + bp)) / 10_000));

/** 06 §3.21 equity large-cap κ half-life (game days). Catalog `base` is the V1 lnF stand-in. */
export const EQUITY_KAPPA_HALF_LIFE_DAYS = 20;
/** 04:1031 RATE_SCARE "decays 30 d" — default storm residual half-life when a kind has no tighter schedule. */
export const DEFAULT_SHOCK_HALF_LIFE_DAYS = 30;

/** Per-tick decay / κ coefficient: k = 1 − 2^(−1/(hlDays·TICKS_PER_DAY)). */
export function halfLifeK(hlDays: number): number {
  if (!(hlDays > 0)) return 1;
  return 1 - Math.pow(2, -1 / (hlDays * TICKS_PER_DAY));
}

/** 04:1031 / 04:1015 shock residual half-lives (game days). Cite 04:1033 "Shocks decay on their own schedules". */

/** Extract the 04 kind token from a durable stockApplied stormId (`storm:day:KIND`, `major:force:KIND:tick`, …). */
export function kindFromAppliedId(id: string): string {
  const p = id.split(":");
  if (p[1] === "cwforce") return p[3] ?? "RATE_SCARE";
  if (p[1] === "force") return p[2] ?? "RATE_SCARE";
  return p[2] ?? "RATE_SCARE";
}

export function shockHalfLifeDays(kind: string): number {
  switch (kind) {
    case "RATE_SCARE": return 30;
    case "OIL_SPIKE_LITE": return 20;
    case "CREDIT_WOBBLE": return 30;
    case "FX_SQUALL": return 10;
    case "CRYPTO_FLUSH": return 1;
    case "LIQUIDITY_HICCUP": return 1 / 12; // 60 ticks
    case "SECTOR_ROTATION": return 30;
    case "EARNINGS_SCARE": return 30;
    case "EQUITY_BUBBLE_BURST": return 120; // 04:1015 erpShock half-life 120 d
    case "FLASH_CRASH": return 1 / Math.log2(1 / 0.3); // 04:1024 ~70% recovered within 1 GD
    case "OIL_SHOCK": return 20;
    case "BANKING_PANIC": return 30;
    case "CREDIT_CRUNCH": return 30;
    default: return DEFAULT_SHOCK_HALF_LIFE_DAYS;
  }
}

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
  /** 04 §3.16 storm tier in this base (storms.ts). */
  readonly storms = new StormScheduler();
  /** Remaining log-gap from decaying applyShock moves (04:1033). Unwound each advance tick. */
  private readonly shockResidual = new Map<string, { log: number; k: number }>();

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
  private static readonly SIGMA_GX = ((ASSET_BY_ID[MARKET_FACTOR_ASSET]?.volBp ?? 0) / 10_000 / Math.sqrt(3)) * Math.sqrt(TICKS_PER_DAY * SESSION_DAYS_PER_YEAR);

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
    // 04 storm makerWithdrawal: CRYPTO_FLUSH / LIQUIDITY_HICCUP multiply depth for graduated crypto
    const eventDepth = this.storms.depthMult(this.tick);
    return { fear, regimeDepth: this.world.depth(this.tick) * eventDepth,
      adv: 150e6 * (1 + 0.01 * Math.max(0, fear - 20)) * att * REGIME_TURNOVER[this.world.regime],
      sigmaDaily: m.sigmaEff(this.pathInputs(id)) / Math.sqrt(CRYPTO_DAYS_PER_YEAR) };
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
    const news = this.coinNews.get(assetId)!;
    const moves: BeliefMoveSeed[] = [];
    for (const it of news.items) {
      if (it.kind !== "move" || it.tick >= this.tick || it.from === undefined || it.to === undefined) continue;
      const a = moveAsserted(it.sign, it.from, it.to);
      if (a === 0) continue;
      moves.push({ id: `move:${it.tick}`, tick: it.tick, a, nw: it.nw });
    }
    return {
      tick: this.tick, ref, lnV: h.v[n - 1]!, r1h: back(TICKS_PER_HOUR), r1d: back(TICKS_PER_DAY), vol: m.vol,
      ...this.world.view(), ...news.inputs(this.tick),
      ...(moves.length ? { moves } : {}),
    };
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
    // crisisTerm from storm/major state (end of N); majors → 1 in TRIGGER/CONTAGION. Demo Wire crises do not set this.
    if (gxFrom > 0) this.world.observe(this.tick + 1, gxFrom, this.storms.crisisTerm());
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
    this.storms.observe(this.tick);
    const zCrypto = this.cryptoFactor.normal();
    const zMarket = gx && gxDef && gxDef.volBp > 0 && gxFrom > 0 ? (gx.last - gxFrom) / gxFrom / (gxDef.volBp / 10_000 / Math.sqrt(3)) : 0;
    // 04:1033 residual unwind, then 05:274 A_N = −k(lnP−lnF) / 06 §3.21 equity κ HL=20 toward catalog base.
    this.unwindShockResiduals();
    this.pullTowardAnchor();
    for (const [id, m] of this.memes) {
      const s = this.assets.get(id);
      if (!s || this.tradingState(id) !== "CONTINUOUS") continue;
      const to = m.step(zMarket, zCrypto, this.pathInputs(id));
      s.dir = to > s.last ? 1 : to < s.last ? -1 : 0;
      s.last = to;
    }
  }

  /** 04:1033: unwind each registered shock log-residual one tick toward 0 on its own half-life. */
  private unwindShockResiduals(): void {
    for (const [id, r] of [...this.shockResidual.entries()]) {
      const s = this.assets.get(id);
      if (!s || this.tradingState(id) !== "CONTINUOUS" || r.log === 0) {
        this.shockResidual.delete(id);
        continue;
      }
      const dec = r.k * r.log;
      const to = Math.max(1, Math.round(s.last * Math.exp(-dec)));
      s.dir = to > s.last ? 1 : to < s.last ? -1 : s.dir;
      s.last = to;
      const next = r.log - dec;
      if (Math.abs(next) < 1e-12) this.shockResidual.delete(id);
      else this.shockResidual.set(id, { log: next, k: r.k });
    }
  }

  /** 05 §3.3.1 / 06 §3.21: pull equity + index marks toward catalog base (V1 lnF) with κ HL=20 GD. */
  private pullTowardAnchor(): void {
    const k = halfLifeK(EQUITY_KAPPA_HALF_LIFE_DAYS);
    for (const [id, s] of this.assets) {
      const def = ASSET_BY_ID[id];
      if (!def || (def.class !== "equity" && def.class !== "index")) continue;
      if (this.tradingState(id) !== "CONTINUOUS" || !(s.last > 0) || !(def.base > 0)) continue;
      const lnP = Math.log(s.last), lnF = Math.log(def.base);
      const to = Math.max(1, Math.round(Math.exp(lnP - k * (lnP - lnF))));
      s.dir = to > s.last ? 1 : to < s.last ? -1 : s.dir;
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

  /** Move one asset's price by a story/storm effect at the current tick, after this tick's walk step. Returns the price
   *  before and after in minor units, or null for an unknown or non-trading asset. When `halfLifeDays` is set
   *  (04 scheduler shocks), the log-move is registered as a residual that unwinds per 04:1033; omit it for company
   *  NEWS/RUMOR story effects (fundamental-ish; κ to catalog base is the V1 recovery). */
  applyShock(assetId: string, bp: number, halfLifeDays?: number): { from: number; to: number } | null {
    const s = this.assets.get(assetId);
    if (!s || this.tradingState(assetId) !== "CONTINUOUS") return null;
    const from = s.last, to = shockedMinor(from, bp);
    s.last = to;
    s.dir = to > from ? 1 : to < from ? -1 : s.dir;
    const p = s.prints.at(-1);
    if (p && p.tick === this.tick) s.prints = [...s.prints.slice(0, -1), { ...p, price: fmt(to, ASSET_BY_ID[assetId]!.displayDecimals) }];
    if (halfLifeDays != null && from > 0 && to !== from) {
      const prev = this.shockResidual.get(assetId);
      const log = Math.log(to / from) + (prev?.log ?? 0);
      const k = halfLifeK(halfLifeDays);
      this.shockResidual.set(assetId, { log, k: prev ? Math.max(prev.k, k) : k });
    }
    return { from, to };
  }

  takeStormWire(): StormWireOut[] { return this.storms.takeWire(); }
  takeCrisisWire() { return this.storms.takeCrisisWire(); }
  takeStormHype(): StormHypeShock[] { return this.storms.takeHypeShocks(); }
  takeStormPrices(): StormPriceShock[] { return this.storms.takePriceShocks(); }
}
