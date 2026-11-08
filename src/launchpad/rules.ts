// Launchpad rules (owner-restored feature; definitions reused from the p10 Launchpad, origin/p10/lp
// docs/team/specs/lead-launchpad.md L2/L3 and src/world/launchpad/constants.ts). Pure and shared: the server
// commits with these functions and the lazy Launchpad app previews with the same ones. Fictional game coins
// priced in game cents only. No chain, wallet or real money.
//
// Curve (L3): constant product on virtual reserves. X is virtual cash in cents, Y virtual tokens, k = X0 * Y0.
// A buy of c cents (after the fee) gets Y - k / (X + c) tokens; a sale of q tokens pays X - k / (Y + q) before the fee.
// Every result is rounded in the curve's favour, so X·Y never drops below k and the curve's real cash (X - X0) always
// covers a sale of everything sold (selling all of it returns X to exactly X0). Graduation (Y = 273M) is not in this build: a buy that would pass it is refused.

export const LP = {
  X0: 1_500_000, // $15,000 virtual cash, in cents
  Y0: 1_073_000_000,
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

export type BuyQuote = { ok: true; tokens: number; fee: number; creatorFee: number; net: number; next: Curve } | { ok: false; why: QuoteRefusal };
export type SellQuote = { ok: true; gross: number; fee: number; creatorFee: number; pay: number; next: Curve } | { ok: false; why: QuoteRefusal };

/** A buy spending `cents` in total (fee included). */
export function quoteBuy(c: Curve, cents: number): BuyQuote {
  if (!Number.isSafeInteger(cents) || cents < LP.MIN_BUY) return { ok: false, why: "MIN" };
  const { fee, creator } = feeOf(cents);
  const net = cents - fee;
  const y = BigInt(LP.Y0 - c.sold);
  const y2 = ceilDiv(K, BigInt(c.x + net));
  const tokens = Number(y - y2);
  if (tokens < 1) return { ok: false, why: "TOO_SMALL" };
  if (y2 < BigInt(LP.GRAD_Y)) return { ok: false, why: "CURVE_FULL" };
  return { ok: true, tokens, fee, creatorFee: creator, net, next: { x: c.x + net, sold: c.sold + tokens } };
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

/**
 * Indicative value of a holding (old p10 L8.1: curve holdings count at liquidation, not at spot): what selling all
 * `qty` alone, now, would pay after the fee and the curve's price impact; 0 when it is too small to sell. Not a quote:
 * other trades move the curve, so an actual sale can pay less (its review keeps its own slippage floor).
 */
export function liquidationCents(c: Curve, qty: number): number {
  const q = quoteSell(c, qty);
  return q.ok ? q.pay : 0;
}

/** Tokens a buy could still take before the curve is full. */
export const curveLeft = (c: Curve) => LP.Y0 - c.sold - LP.GRAD_Y;

/** The spot price in dollars, as text with four significant digits ("$0.00001398"). */
export function priceText(c: Curve): string {
  const p = c.x / (100 * (LP.Y0 - c.sold));
  return `$${p.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;
}

/** Market cap in cents at the spot price (price × 1B supply), rounded down. */
export const marketCapCents = (c: Curve) => Number((BigInt(c.x) * BigInt(LP.SUPPLY)) / BigInt(LP.Y0 - c.sold));

/** Price impact of a fill in basis points: how far the spot price moves. */
export function impactBp(c: Curve, next: Curve): number {
  const p0 = c.x / (LP.Y0 - c.sold), p1 = next.x / (LP.Y0 - next.sold);
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
