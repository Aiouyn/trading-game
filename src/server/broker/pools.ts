// Graduated-coin trader pools (lead-launchpad L4 "the token gets the retail-heavy pool weights of the meme template";
// owner pt106u keeps it, pt107u names the source: export/vision-review/complete/05-MARKETS-PRICE-ENGINE.md §6.2).
// docs/v1/LAUNCHPAD.md "Graduated-coin trader pools" has the exact passages, the traced dependencies and the mapping.
//
// Each pool is an explicit NPC account on the coin (cash cents, tokens) plus its tracking position `pos` (ADV units).
// Once a server tick, after the players' resting orders, every pool sends one IOC limit that `fillOnBook` fills against
// the coin's book like any order (spread, impact, per-tick cap, fee to the book, the book's cash and token bounds).
// A pool never sells tokens it does not hold and never pays more than its cash; the decay moves only `pos`.
// Pure: the caller (BrokerService.sweep) commits the result with the ledgers and books in one persist.
import type { AssetFixture } from "@/market/catalog";
import { LP } from "@/launchpad/rules";
import { Draws, DAYS_PER_YEAR, HYPE, TICKS_PER_DAY, TICKS_PER_HOUR } from "@/server/market/meme";
import type { PoolInputs } from "@/server/market/shockFeed";
import { REGIME_TURNOVER, type Regime } from "@/server/market/world";
import { HALF_SPREAD, fillOnBook, type BookAccount } from "./book";

export type PoolKind = "value" | "retail" | "degen";
/** 05 §6.2 table order: the order in which the pools trade within a tick. */
export const POOL_KINDS: readonly PoolKind[] = ["value", "retail", "degen"] as const;
export type PoolWeights = Readonly<Record<PoolKind, number>>;

/** 05 §6.2 class defaults. MEME: VALUE "meme 0.2", RETAIL "meme (3.0)", DEGEN lists meme with no number, so the table's
 *  default weight 1.0. CRYPTO (alts) row, for comparison only: VALUE 0.5, RETAIL 1.0, DEGEN 1.0. */
export const MEME_POOL_WEIGHTS: PoolWeights = { value: 0.2, retail: 3.0, degen: 1.0 };
export const CRYPTO_POOL_WEIGHTS: PoolWeights = { value: 0.5, retail: 1.0, degen: 1.0 };

export const POOL_LAW = {
  /** Rate caps, ADV a game day (05 §6.2). */
  rate: { value: 0.9, retail: 0.15, degen: 0.4 } as Readonly<Record<PoolKind, number>>,
  /** PARAM.mkt_pool_pos_hl_days (23 registry) in ticks: 10 game days. */
  posHalfLifeTicks: 10 * TICKS_PER_DAY,
  /** 05 §3.3.6 Meme turnover (daily share of size); size = the coin's supply. */
  turnover: 0.15,
  /** PARAM.mkt_value_g0 (05 §6.2). */
  valueG0: 1.0,
  /** VALUE soft capacity: orders × 1 / (1 + 3|pos|). */
  valueSoft: 3,
  /** The IOC limit's allowance in half spreads: s + 2s. */
  limitSpreads: 3,
  /** IMPLEMENTATION CHOICE, not a source value: 05 §6.2 leaves `speed` undefined. 1 per tick: the order is the whole gap
   *  to the target, so the documented rate cap is the binding limit (no tuning). */
  speed: 1,
  /** RETAIL chasing weight 0.5 (05 §6.2) and dip-buying weight 0.3 in EXPANSION (T05-14). */
  retailChase: 0.5, retailDip: 0.3,
  /** PARAM.mkt_adv_fear_k: ADV × (1 + k × max(0, F − 20)) (05 §3.14.1). */
  advFearK: 0.01, advFearFloor: 20,
  /** Public NPC prints kept per coin. */
  tapeKeep: 20,
} as const;
/** The coin's base ADV in tokens: 0.15 × 1,000,000,000 = 150,000,000 a game day (turnover × size; the funding base). */
export const ADV_TOKENS = POOL_LAW.turnover * LP.SUPPLY;
/** 05 §3.14.1 ADV now, in tokens: turnover × size × (1 + 0.01 max(0, F − 20)) × attention × regimeTurnover. Never from
 *  realized volume. */
export const advTokens = (inp: Pick<PoolInputs, "fear" | "attention" | "regime">): number =>
  ADV_TOKENS * (1 + POOL_LAW.advFearK * Math.max(0, inp.fear - POOL_LAW.advFearFloor)) * inp.attention * REGIME_TURNOVER[inp.regime];

export interface PoolAccount { cash: number; tokens: number; pos: number }
/** The world and news inputs the pools' last step read (public): regime, Fear Index, attention, news sign, mentions. */
export interface PoolWorld { rg: Regime; f: number; att: number; ns: -1 | 0 | 1; m: number }
export interface NpcPrint { tick: number; pool: PoolKind; side: "BUY" | "SELL"; qty: number; px: number }
/** The pools of one graduated coin, saved on the coin. `ep`/`t`: the clock epoch and tick the pools last acted at (once a
 *  tick); `hr`: the game hour of the last hype update; `h`: hype H; `bk`: the book's tokens after the last pool step (the
 *  player net flow since is the change); `pnet`: [game hour, cents] net player buy volume, last 24 game hours of this
 *  epoch; `funded`: cents the booked NPC line gave the pools (once, at their creation); `tape`: the last NPC prints. */
export interface CoinPools extends Record<PoolKind, PoolAccount> {
  ep: string; t: number; hr: number; h: number; bk: number; pnet: [number, number][]; funded: number; tape: NpcPrint[];
  /** Tokens the pools have traded in all (every print's qty, both sides): their share of the coin's volume. */
  vol: number;
  /** What the last step read of the world and the coin's news (absent until a step reads them). */
  w?: PoolWorld;
}

/** Cash a pool is funded with: enough for w ADV at the listing price (T05-14 capV = 1 ADV, scaled by the weight).
 *  IMPLEMENTATION CHOICE (05 does not size NPC cash for this base); tokens start at 0 (nothing is minted). */
export const fundingOf = (w: number, listMinor: number, dp = 8): number => Math.round(w * ADV_TOKENS * listMinor * 10 ** (2 - dp));
/** Cents of `tokens` at a price in minor units of a dp-decimal coin. */
const centsAt = (tokens: number, minor: number, dp: number) => Math.round(tokens * minor * 10 ** (2 - dp));

export function newPools(weights: PoolWeights, listMinor: number, ep: string, tick: number, bookTokens: number, dp = 8): CoinPools {
  const acct = (k: PoolKind): PoolAccount => ({ cash: fundingOf(weights[k], listMinor, dp), tokens: 0, pos: 0 });
  const p = { value: acct("value"), retail: acct("retail"), degen: acct("degen") };
  return { ep, t: tick - 1, hr: Math.floor(tick / TICKS_PER_HOUR), h: HYPE.h0, bk: bookTokens, pnet: [], funded: p.value.cash + p.retail.cash + p.degen.cash, tape: [], vol: 0, ...p };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** RETAIL's noise: one standard normal per game hour of this clock, from its own stream (exactly once whatever ticks
 *  run or fail; a restart's clock replays its hours, M1-05 rule). */
export const retailNoise = (ticker: string, hour: number): number => new Draws(`lp:${ticker}:retail:${hour}`).normal();

/** The unweighted targets (ADV units) from the inputs at the end of N−1 (05 §6.2 with T05-14's forms):
 *  - VALUE −tanh(G/g0);
 *  - RETAIL tanh(n_h + 0.5 tanh(r_1d/σ_d) + newsSign × (attention − 1) + 0.3 × [EXPANSION] × tanh(max(0, −r_1d/σ_d)));
 *  - DEGEN (1 + 2H) tanh(r_1h/σ_h).
 *  Belief (× (1 + 2|b|/0.1) on RETAIL and DEGEN when a belief is active) is inactive: no claim on a coin exists in this
 *  base (docs/v1/LAUNCHPAD.md "Graduated-coin trader inputs"). A return the clock does not have yet reads 0. */
export function targets(inp: PoolInputs, h: number, z: number, dp = 8): Record<PoolKind, number> {
  const sd = inp.vol / Math.sqrt(DAYS_PER_YEAR), sh = sd / Math.sqrt(24);
  const g = Math.log(inp.ref / 10 ** dp) - inp.lnV, g0 = POOL_LAW.valueG0 * sd * Math.sqrt(5);
  const d = inp.r1d === null ? 0 : inp.r1d / sd;
  const dip = inp.regime === "EXPANSION" ? POOL_LAW.retailDip * Math.tanh(Math.max(0, -d)) : 0;
  return {
    value: -Math.tanh(g / g0),
    retail: Math.tanh(z + POOL_LAW.retailChase * Math.tanh(d) + inp.newsSign * (inp.attention - 1) + dip),
    degen: (1 + HYPE.volK * h) * (inp.r1h === null ? 0 : Math.tanh(inp.r1h / sh)),
  };
}

/** The hype after one game hour: dH = a(m + f − H) − bH + shock, m = the coin's Wire mentions (0–1), clamped to [0, 1].
 *  shock = 0: its sized sources (04's CRYPTO_FLUSH storm and CRYPTO_WINTER major, 09 campaigns) do not exist here. */
export const hypeStep = (h: number, m: number, f: number): number => clamp(h + HYPE.a * (m + f - h) - HYPE.b * h, 0, 1);
/** f = clamp(net player buy volume over 24 game hours / circulating market cap × 20, 0, 1), both in cents. */
export const hypeF = (netCents: number, capCents: number): number => (capCents > 0 ? clamp((netCents / capCents) * HYPE.f, 0, 1) : 0);

export interface PoolStep { pools: CoinPools; book: BookAccount; prints: NpcPrint[]; moves: number[] }

/**
 * One tick of a coin's pools: `mark` is the tick's mark (the book's mid), `inp` the end of N−1. Null when the pools
 * already acted at this tick of this epoch (exactly once) or the tick is idle. `pools` undefined: create and fund them
 * first.
 */
export function stepPools(a: AssetFixture, weights: PoolWeights, listMinor: number, prior: CoinPools | undefined, book: BookAccount, mark: number, inp: PoolInputs, ep: string): PoolStep | null {
  const tick = inp.tick;
  const dp = a.displayDecimals;
  const p: CoinPools = prior ? structuredClone(prior) : newPools(weights, listMinor, ep, tick, book.tokens, dp);
  const same = p.ep === ep;
  if (same && p.t >= tick) return null;
  const hour = Math.floor(tick / TICKS_PER_HOUR);
  // decay of the tracking positions only (a new epoch: one tick, its gap is not measured in game time)
  const k = Math.pow(0.5, (same ? tick - p.t : 1) / POOL_LAW.posHalfLifeTicks);
  for (const kind of POOL_KINDS) p[kind].pos *= k;
  // the players' net buy since the last pool step (the book's token change), valued at P_{N−1}
  if (!same) { p.pnet = []; p.hr = hour; }
  const net = centsAt(p.bk - book.tokens, inp.ref, dp);
  if (net !== 0) {
    const last = p.pnet.at(-1);
    if (last && last[0] === hour) last[1] += net; else p.pnet.push([hour, net]);
  }
  p.pnet = p.pnet.filter(([hr]) => hr > hour - 24);
  const hourly = same && hour > p.hr;
  if (hourly) {
    const f = hypeF(p.pnet.reduce((s, [, c]) => s + c, 0), centsAt(LP.SUPPLY - book.tokens, inp.ref, dp));
    for (let i = 0; i < Math.min(hour - p.hr, 24); i++) p.h = hypeStep(p.h, inp.mentions, f);
    p.hr = hour;
  }
  const want = targets(inp, p.h, retailNoise(a.assetId, hour), dp);
  const adv = advTokens(inp);
  const w: PoolWorld = { rg: inp.regime, f: inp.fear, att: inp.attention, ns: inp.newsSign, m: inp.mentions };
  const wChanged = JSON.stringify(w) !== JSON.stringify(p.w);
  p.w = w;
  const s = HALF_SPREAD * POOL_LAW.limitSpreads;
  let b = book;
  const prints: NpcPrint[] = [], moves: number[] = [];
  for (const kind of POOL_KINDS) {
    const w = weights[kind], acct = p[kind];
    if (!(w > 0)) continue;
    const cap = (w * POOL_LAW.rate[kind]) / TICKS_PER_DAY;
    let o = clamp(POOL_LAW.speed * (w * want[kind] - acct.pos), -cap, cap);
    if (kind === "value") o /= 1 + POOL_LAW.valueSoft * Math.abs(acct.pos);
    const side = o > 0 ? "BUY" : "SELL";
    // whole tokens toward zero; rounded to 1e-6 token first so a float's last bit (0.45 / 720 × 150M = 93,749.99…)
    // never drops a whole token
    let qty = Math.trunc(Math.round(Math.abs(o) * adv * 1e6) / 1e6);
    if (side === "SELL") qty = Math.min(qty, acct.tokens);
    if (qty < 1) continue;
    const limit = side === "BUY" ? Math.floor(inp.ref * Math.exp(s)) : Math.ceil(inp.ref * Math.exp(-s));
    let fill = fillOnBook(a, side, qty, mark, b, tick, limit);
    // a buy within the pool's cash (fee included): cut and re-price, as the book's own cash bound
    for (let pass = 0; side === "BUY" && fill && fill.notional + fill.fee > acct.cash && pass < 4; pass++) {
      const q = Math.floor((fill.qty * acct.cash) / (fill.notional + fill.fee));
      fill = q >= 1 ? fillOnBook(a, side, q, mark, b, tick, limit) : null;
    }
    if (!fill || (side === "BUY" ? fill.notional + fill.fee > acct.cash : acct.cash + fill.notional - fill.fee < 0)) continue;
    acct.cash += side === "BUY" ? -(fill.notional + fill.fee) : fill.notional - fill.fee;
    acct.tokens += side === "BUY" ? fill.qty : -fill.qty;
    acct.pos += (side === "BUY" ? fill.qty : -fill.qty) / adv;
    b = fill.book;
    prints.push({ tick, pool: kind, side, qty: fill.qty, px: fill.px });
    p.vol += fill.qty;
    moves.push(fill.move);
  }
  // An idle tick (no fill, no player flow to record, no hour, nothing new) changes nothing saved: the decay composes
  // (0.5^(Δ/hl)), so the next step that acts decays over the whole gap, and nothing is written for it.
  if (prior && same && prints.length === 0 && net === 0 && !hourly && !wChanged) return null;
  p.ep = ep; p.t = tick; p.bk = b.tokens;
  p.tape = [...p.tape, ...prints].slice(-POOL_LAW.tapeKeep);
  return { pools: p, book: b, prints, moves };
}
