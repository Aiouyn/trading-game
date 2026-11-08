// Launchpad rules (owner-restored feature; definitions reused from the p10 Launchpad, origin/p10/lp
// docs/team/specs/lead-launchpad.md L2/L3 and src/world/launchpad/constants.ts). Pure and shared: the server
// commits with these functions and the lazy Launchpad app previews with the same ones. Fictional game coins
// priced in game cents only. No chain, wallet or real money.
//
// Curve (L3): constant product on virtual reserves. X is virtual cash in cents, Y virtual tokens, k = X0 * Y0.
// A buy of c cents (after the fee) gets Y - k / (X + c) tokens; a sale of q tokens pays X - k / (Y + q) before the fee.
// Every result is rounded in the curve's favour, so X·Y never drops below k and the curve's real cash (X - X0) always
// covers a sale of everything sold (selling all of it returns X to exactly X0).
//
// Graduation (L4): a buy that reaches the curve's last token is clipped to exactly the tokens left (the old p10 quoteBuy
// rule: the trader pays only for what fills) and graduates the coin. 1.5% of the raised cash is a sink; the rest and the
// 200M tokens left of the supply seed a locked book that nobody owns. After graduation the coin trades against that book's
// own real reserves at constant product (this build's stand-in for the engine listing, see docs/v1/LAUNCHPAD.md
// "Graduation"), with the Broker's exchange fee as a sink and no creator share.
import { takerFeeMinor } from "@/shell/contracts/mockFeed";
import { CURVE } from "./curve";

export const LP = {
  X0: CURVE.X0, // $15,000 virtual cash, in cents
  Y0: CURVE.Y0,
  SUPPLY: 1_000_000_000,
  GRAD_Y: 273_000_000, // 800M sold on the curve
  FEE_BP: 100, // 1% each way: half to the creator, half a sink
  LAUNCH_FEE: 100_000, // $1,000 game money, a sink. Owner decision 2026-11-08 (replaces p10 R-10-6's $100)
  MAX_SLIP_BP: 500, // the ticket's default limit: a worse fill than reviewed is refused
  CREATOR_CAP: 100_000_000, // 10% of supply before graduation
  MAX_LIVE: 3,
  COOLDOWN_MS: 24 * 60 * 60 * 1000, // one launch per account per 24 real hours
  MIN_BUY: 100, // $1
  TAPE_KEEP: 20,
  GRAD_FEE_BP: 150, // 1.5% of the raised cash at graduation, a sink (L4)
  POOL_TOKENS: 200_000_000, // the supply the curve does not sell (1B - 800M, creator allocation 0) seeds the book (L2/L4)
  HIST_KEEP: 500, // saved price/volume points per coin (one per trade); older ones are dropped and counted
} as const;

const K = BigInt(LP.X0) * BigInt(LP.Y0);
const ONE = BigInt(1);
const ceilDiv = (a: bigint, b: bigint) => (a + b - ONE) / b;

/** The curve's state as saved: virtual cash in cents and tokens sold (Y = Y0 - sold). */
export interface Curve { x: number; sold: number }

/** The fee on a notional, rounded up (the sink's favour), and the creator's half of it, rounded down. */
export function feeOf(notional: number): { fee: number; creator: number } {
  const fee = Math.ceil((notional * LP.FEE_BP) / 10_000);
  return { fee, creator: Math.floor(fee / 2) };
}

export type QuoteRefusal = "MIN" | "TOO_SMALL" | "CURVE_FULL" | "NONE";

/** `spend` is what the buy actually costs (fee included): the reviewed amount, or less when the buy is clipped at the
 *  curve's last token; `graduates` when it sells that last token. */
export type BuyQuote = { ok: true; tokens: number; spend: number; fee: number; creatorFee: number; net: number; next: Curve; graduates: boolean } | { ok: false; why: QuoteRefusal };
export type SellQuote = { ok: true; gross: number; fee: number; creatorFee: number; pay: number; next: Curve } | { ok: false; why: QuoteRefusal };

/** A buy spending `cents` in total (fee included). */
export function quoteBuy(c: Curve, cents: number): BuyQuote {
  if (!Number.isSafeInteger(cents) || cents < LP.MIN_BUY) return { ok: false, why: "MIN" };
  const { fee, creator } = feeOf(cents);
  const net = cents - fee;
  const left = curveLeft(c);
  if (left <= 0) return { ok: false, why: "CURVE_FULL" };
  const y = BigInt(LP.Y0 - c.sold);
  const y2 = ceilDiv(K, BigInt(c.x + net));
  const tokens = Number(y - y2);
  if (tokens < 1) return { ok: false, why: "TOO_SMALL" };
  if (tokens < left) return { ok: true, tokens, spend: cents, fee, creatorFee: creator, net, next: { x: c.x + net, sold: c.sold + tokens }, graduates: false };
  // Clip to the last tokens: the least outlay whose net reaches the cash where the curve holds exactly GRAD_Y tokens
  // (X·GRAD_Y ≥ k). The curve keeps any cent of rounding; the buyer gets exactly what is left, never more.
  const need = Number(ceilDiv(K, BigInt(LP.GRAD_Y))) - c.x;
  let spend = Math.max(LP.MIN_BUY, Math.ceil((need * 10_000) / (10_000 - LP.FEE_BP)) - 2);
  while (spend - feeOf(spend).fee < need) spend++;
  const f = feeOf(spend);
  return { ok: true, tokens: left, spend, fee: f.fee, creatorFee: f.creator, net: spend - f.fee, next: { x: c.x + spend - f.fee, sold: c.sold + left }, graduates: true };
}

/** A sale of `qty` tokens. */
export function quoteSell(c: Curve, qty: number): SellQuote {
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > c.sold) return { ok: false, why: "NONE" };
  const x2 = Number(ceilDiv(K, BigInt(LP.Y0 - c.sold + qty)));
  const gross = c.x - x2;
  const { fee, creator } = feeOf(gross);
  const pay = gross - fee;
  if (gross < 1 || pay < 1) return { ok: false, why: "TOO_SMALL" };
  return { ok: true, gross, fee, creatorFee: creator, pay, next: { x: x2, sold: c.sold - qty } };
}

// ---- graduation and the locked book (L4) ----

/** The locked book of a graduated coin: its real cash in cents and its tokens. Nobody owns it. */
export interface Pool { cash: number; tokens: number }
/** A coin's market: its curve, and its book once it has graduated (then the curve is frozen and holds nothing). */
export interface Market extends Curve { pool?: Pool | null }

/** What graduating a curve that has sold its 800M does: the raise, the 1.5% fee (rounded half up) and the book's seed. */
export function graduationOf(c: Curve): { raise: number; fee: number; pool: Pool } {
  const raise = c.x - LP.X0;
  const fee = Math.floor((raise * LP.GRAD_FEE_BP + 5_000) / 10_000);
  return { raise, fee, pool: { cash: raise - fee, tokens: LP.POOL_TOKENS } };
}

/** The Broker's exchange fee (taker), the fee of every fill after graduation (L4: engine fills), a sink. */
export const poolFee = takerFeeMinor;
// Read off the Broker fee itself, so the copy cannot drift from it: the rate on $10,000 and the minimum on $0.
export const POOL_FEE_TEXT = `${(takerFeeMinor(1_000_000) / 10_000).toFixed(2)}% (at least $${(takerFeeMinor(0) / 100).toFixed(2)})`;

export type PoolBuy = { ok: true; tokens: number; fee: number; net: number; next: Pool } | { ok: false; why: QuoteRefusal };
export type PoolSell = { ok: true; gross: number; fee: number; pay: number; next: Pool } | { ok: false; why: QuoteRefusal };

/** A buy spending `cents` in total against the book: the fee comes off, the rest goes in, tokens come out of the book only. */
export function quotePoolBuy(p: Pool, cents: number): PoolBuy {
  if (!Number.isSafeInteger(cents) || cents < LP.MIN_BUY) return { ok: false, why: "MIN" };
  const fee = poolFee(cents), net = cents - fee;
  if (net < 1) return { ok: false, why: "TOO_SMALL" };
  const k = BigInt(p.cash) * BigInt(p.tokens);
  const t2 = ceilDiv(k, BigInt(p.cash + net));
  const tokens = p.tokens - Number(t2);
  if (tokens < 1) return { ok: false, why: "TOO_SMALL" };
  return { ok: true, tokens, fee, net, next: { cash: p.cash + net, tokens: Number(t2) } };
}

/** A sale of `qty` tokens to the book, paid from the book's own cash only (constant product: it can always pay). */
export function quotePoolSell(p: Pool, qty: number): PoolSell {
  if (!Number.isSafeInteger(qty) || qty < 1) return { ok: false, why: "NONE" };
  const k = BigInt(p.cash) * BigInt(p.tokens);
  const c2 = Number(ceilDiv(k, BigInt(p.tokens + qty)));
  const gross = p.cash - c2;
  const fee = gross > 0 ? poolFee(gross) : 0;
  const pay = gross - fee;
  if (gross < 1 || pay < 1) return { ok: false, why: "TOO_SMALL" };
  return { ok: true, gross, fee, pay, next: { cash: c2, tokens: p.tokens + qty } };
}

/** One quote in the coin's current mode, in one shape for the ticket, the review and the server. `cents` is what a buy
 *  costs or a sale pays; `gross` the notional before the fee; `after` the market after the fill. */
export type Quote =
  | { ok: true; mode: "curve" | "pool"; side: "buy" | "sell"; tokens: number; cents: number; gross: number; fee: number; creatorFee: number; graduates: boolean; after: Market }
  | { ok: false; why: QuoteRefusal };
export function quote(m: Market, side: "buy" | "sell", amount: number): Quote {
  if (m.pool) {
    const pool = m.pool;
    if (side === "buy") {
      const q = quotePoolBuy(pool, amount);
      return q.ok ? { ok: true, mode: "pool", side, tokens: q.tokens, cents: amount, gross: q.net, fee: q.fee, creatorFee: 0, graduates: false, after: { x: m.x, sold: m.sold, pool: q.next } } : q;
    }
    const q = quotePoolSell(pool, amount);
    return q.ok ? { ok: true, mode: "pool", side, tokens: amount, cents: q.pay, gross: q.gross, fee: q.fee, creatorFee: 0, graduates: false, after: { x: m.x, sold: m.sold, pool: q.next } } : q;
  }
  if (side === "buy") {
    const q = quoteBuy(m, amount);
    return q.ok ? { ok: true, mode: "curve", side, tokens: q.tokens, cents: q.spend, gross: q.net, fee: q.fee, creatorFee: q.creatorFee, graduates: q.graduates, after: q.next } : q;
  }
  const q = quoteSell(m, amount);
  return q.ok ? { ok: true, mode: "curve", side, tokens: amount, cents: q.pay, gross: q.gross, fee: q.fee, creatorFee: q.creatorFee, graduates: false, after: q.next } : q;
}

/**
 * Indicative value of a holding (old p10 L8.1: holdings count at liquidation, not at spot): what selling all `qty` alone,
 * now, would pay after the fee and the price impact, against the curve before graduation and against the book after; 0
 * when it is too small to sell. Not a quote: other trades move the price (a real sale keeps its own 5% review floor).
 */
export function liquidationCents(m: Market, qty: number): number {
  if (m.pool) { const q = quotePoolSell(m.pool, qty); return q.ok ? q.pay : 0; }
  const q = quoteSell(m, qty);
  return q.ok ? q.pay : 0;
}

/** Tokens a buy could still take before the curve has sold its 800M (0 once graduated). */
export const curveLeft = (c: Market) => (c.pool ? 0 : LP.Y0 - c.sold - LP.GRAD_Y);

/** The spot price in cents per token: the curve's before graduation, the book's after. */
export const spotCents = (m: Market) => (m.pool ? m.pool.cash / m.pool.tokens : m.x / (LP.Y0 - m.sold));

/** The spot price in dollars, as text with four significant digits ("$0.00001398"). */
export function priceText(m: Market): string {
  const p = spotCents(m) / 100;
  return `$${p.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;
}

/** Market cap in cents at the spot price (price × 1B supply), rounded down. */
export const marketCapCents = (m: Market) => (m.pool
  ? Number((BigInt(m.pool.cash) * BigInt(LP.SUPPLY)) / BigInt(m.pool.tokens))
  : Number((BigInt(m.x) * BigInt(LP.SUPPLY)) / BigInt(LP.Y0 - m.sold)));

/** Price impact of a fill in basis points: how far the spot price moves. */
export function impactBp(m: Market, next: Market): number {
  const p0 = spotCents(m), p1 = spotCents(next);
  return Math.round((Math.abs(p1 - p0) / p0) * 10_000);
}

/** The least a reviewed fill may give after the ticket's slippage limit. */
export const minAfterSlip = (n: number) => Math.floor((n * (10_000 - LP.MAX_SLIP_BP)) / 10_000);

/** Tagline templates (L2 V1: no free text), copy from the p10 Launchpad (lp.tagline.tg1–tg8). */
export const TAGLINES = {
  tg1: "A tiny token with big plans.",
  tg2: "Community-run, mostly vibes.",
  tg3: "Built on a napkin, shipped on a Tuesday.",
  tg4: "Not a company. Not a plan. A token.",
  tg5: "Small coin, loud fans.",
  tg6: "Made for the group chat.",
  tg7: "Ask the frog. The frog agrees.",
  tg8: "Zero utility, full commitment.",
} as const;
export type TaglineId = keyof typeof TAGLINES;
export const isTagline = (v: unknown): v is TaglineId => typeof v === "string" && Object.hasOwn(TAGLINES, v);

/** A ticker is 3 to 5 capital letters A-Z. */
export const tickerOk = (s: string) => /^[A-Z]{3,5}$/.test(s);
/** A name is 3 to 24 letters, digits, spaces, dots, apostrophes or hyphens (accents allowed). */
export function nameOk(raw: string): boolean {
  const s = raw.trim();
  return s.length >= 3 && s.length <= 24 && /^[\p{L}\p{N} .'-]+$/u.test(s);
}
