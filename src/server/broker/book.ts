// L4 book liquidity path (docs/v1/LAUNCHPAD.md "Book liquidity path, order types and template factors"): every Broker fill
// on a coin listed at graduation is priced and bounded the way p10's engine fills an asset with a supply account
// (origin/p10/lp src/engine/trading.ts clearOrders, tickPrice, halfSpread, impact, marginalImpact, permanentMove,
// routeToSupply; constants from DEFAULT_TRADING and the FROG template def graduate.ts copies). The coin's book account is
// its NPC book and its only counterparty: a buy takes at most its tokens, a sale is cut to what its cash pays, nothing is
// minted, and the commission goes to the book. Pure: the caller commits the result (ledger, book and flow together).
import type { AssetFixture } from "@/market/catalog";
import { centsOf } from "@/market/valuation";
import { exchangeFeeMinor, FEE_BP } from "@/shell/contracts/mockFeed";
import { DAYS_PER_YEAR, memeParams } from "@/server/market/meme";

export const BOOK_LAW = {
  /** FROG spreadBps (universe.ts): the half spread is 45 bp (volScale 1: no regime or GARCH in this base). */
  spreadBps: 90,
  /** FROG advNotional, $ (graduate.ts keeps the template's). */
  advNotional: 400e6,
  impactY: 0.8,
  permanentImpactShare: 0.5,
  /** Per side, per tick, shared by every account, in units of advNotional. */
  maxAdvPerTick: 3,
  /** IMPACT_HALF_LIFE, ticks. */
  halfLife: 360,
} as const;

/** The coin's flow through its book (p10 impactTally + tickTraded): same-side notional at mid in $, decayed to tick `t`;
 *  `mid` the mid of tick `t` (minor units: every fill in one tick is priced off the same mid, as p10's lnMid); `tb`/`ts`
 *  the $ filled at mid in tick `t` per side (the per-tick cap). */
export interface BookFlow { readonly t: number; readonly buy: number; readonly sell: number; readonly mid: number; readonly tb: number; readonly ts: number }
/** A listed coin's liquidity book account (cents, tokens) and its flow (absent before its first fill). */
export interface BookAccount { readonly cash: number; readonly tokens: number; readonly flow?: BookFlow }

export const feeOf = (notional: number) => exchangeFeeMinor(notional, FEE_BP.taker);

const sigmaDaily = (ticker: string) => memeParams(ticker).vol / Math.sqrt(DAYS_PER_YEAR);
/** Temporary impact as a fraction of mid: Y · σ_daily · √(notional / ADV). */
export function impact(ticker: string, notional: number): number {
  return BOOK_LAW.impactY * sigmaDaily(ticker) * Math.sqrt(Math.max(0, notional) / BOOK_LAW.advNotional);
}
/** The average impact of `x` more notional after `before` already flowed the same way (p10 marginalImpact). */
export function marginalImpact(ticker: string, before: number, x: number): number {
  if (!(before > 0)) return impact(ticker, x);
  if (!(x > 0)) return impact(ticker, before);
  return ((before + x) * impact(ticker, before + x) - before * impact(ticker, before)) / x;
}
/** The flow's same-side tallies decayed to `tick` (no flow: nothing). */
export function decayed(flow: BookFlow | undefined, tick: number): { buy: number; sell: number } {
  if (!flow) return { buy: 0, sell: 0 };
  const k = Math.pow(0.5, Math.max(0, tick - flow.t) / BOOK_LAW.halfLife);
  return { buy: flow.buy * k, sell: flow.sell * k };
}
export const HALF_SPREAD = BOOK_LAW.spreadBps / 2 / 1e4;

export interface BookFillResult {
  readonly qty: number;
  /** Fill price, minor units of the coin (1e-8 $). */
  readonly px: number;
  /** Cents the trader pays (buy) or the book pays (sale), before the fee. */
  readonly notional: number;
  readonly fee: number;
  readonly book: BookAccount;
  /** Permanent impact to apply to the coin's path once the fill is saved (log price). */
  readonly move: number;
}

/**
 * One fill of up to `want` tokens on the book at server tick `tick`, mid = `mark` (minor units), or null when nothing can
 * fill now: the tick's shared cap is used, the book has no tokens (buy) or cannot pay for one token (sale), the priced
 * fill is past `limit`, or the sale is worth under a cent. The trader-side checks (cash, holding) are the caller's.
 */
export function fillOnBook(a: AssetFixture, side: "BUY" | "SELL", want: number, mark: number, book: BookAccount, tick: number, limit: number | null = null): BookFillResult | null {
  const unit = 10 ** a.displayDecimals, flow = book.flow;
  const same = flow !== undefined && flow.t === tick;
  const p0 = same ? flow.mid : mark, p0$ = p0 / unit;
  const used = same ? (side === "BUY" ? flow.tb : flow.ts) : 0;
  let qty = Math.min(want, Math.floor((BOOK_LAW.maxAdvPerTick * BOOK_LAW.advNotional - used) / p0$));
  if (side === "BUY") qty = Math.min(qty, book.tokens);
  if (!(qty >= 1)) return null;
  const before = decayed(flow, tick)[side === "BUY" ? "buy" : "sell"];
  const priceOf = (q: number) => {
    const c = HALF_SPREAD + marginalImpact(a.assetId, before, q * p0$);
    return side === "BUY" ? Math.ceil(p0 * (1 + c)) : Math.max(0, Math.floor(p0 * (1 - c)));
  };
  const cents = (q: number, px: number) => centsOf(a.displayDecimals, px * q, side === "BUY");
  let px = priceOf(qty);
  if (side === "SELL") {
    // bookCashBound: cut to what the book's cash pays at the fill price (p10: up to 4 re-pricings). A smaller sale prices
    // higher, so if it still does not pay, cut once more at the best sale price any size gets (mid less the half spread).
    const fit = (p: number) => (p > 0 ? Math.floor((book.cash * 10 ** (a.displayDecimals - 2)) / p) : 0);
    for (let pass = 0; pass < 4 && qty >= 1 && cents(qty, px) > book.cash; pass++) { qty = Math.min(qty, fit(px)); if (qty >= 1) px = priceOf(qty); }
    if (qty >= 1 && cents(qty, px) > book.cash) { qty = Math.min(qty, fit(Math.floor(p0 * (1 - HALF_SPREAD)))); if (qty >= 1) px = priceOf(qty); }
    if (!(qty >= 1) || cents(qty, px) > book.cash) return null;
  }
  if (limit !== null && (side === "BUY" ? px > limit : px < limit)) return null;
  const notional = cents(qty, px);
  if (notional < 1) return null;
  const fee = feeOf(notional);
  const atMid = qty * p0$;
  const d = decayed(flow, tick);
  const nextFlow: BookFlow = {
    t: tick, mid: p0,
    buy: d.buy + (side === "BUY" ? atMid : 0), sell: d.sell + (side === "SELL" ? atMid : 0),
    tb: (same ? flow.tb : 0) + (side === "BUY" ? atMid : 0), ts: (same ? flow.ts : 0) + (side === "SELL" ? atMid : 0),
  };
  const f = (n: number) => BOOK_LAW.permanentImpactShare * impact(a.assetId, n);
  const move = (side === "BUY" ? 1 : -1) * Math.log1p(f(before + atMid) - f(before));
  const next: BookAccount = side === "BUY"
    ? { cash: book.cash + notional + fee, tokens: book.tokens - qty, flow: nextFlow }
    : { cash: book.cash - notional + fee, tokens: book.tokens + qty, flow: nextFlow };
  return { qty, px, notional, fee, book: next, move };
}
