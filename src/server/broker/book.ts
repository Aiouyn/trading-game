// Finite-book depth execution: docs/v1/LAUNCHPAD.md. 05 §3.4 spread, log-price square-root ladder, side depth,
// inventory skew and signed daily permanent tally. This is NOT the unlimited last-resort maker or a batch auction.
// Cash/tokens remain real backing, fees go to the book; no credit, mint, refill or off-book asset transfers.
import type { AssetFixture } from "@/market/catalog";
import { centsOf } from "@/market/valuation";
import { exchangeFeeMinor, FEE_BP } from "@/shell/contracts/mockFeed";
import { CRYPTO_DAYS_PER_YEAR, memeParams, TICKS_PER_DAY } from "@/server/market/meme";

export const BOOK_LAW = {
  /** 06 §3.21 / 05 §3.4.6: meme BASE HALF-spread 1–3%; midpoint 2% (implementation choice). */
  spreadBps: 400,
  impactY: 1.2,
  permanentImpactShare: 0.5,
} as const;
export const HALF_SPREAD = BOOK_LAW.spreadBps / 2 / 1e4;
/** Public market inputs at the quote tick. No private holdings or orders. */
export interface DepthInputs { fear: number; regimeDepth: number; adv: number; sigmaDaily: number }
/** Separate signed flow statistic, NOT ledger holdings. Absent for a legacy book until its first new fill. */
export interface MakerFlow { day: number; inv: number; qc: number; pi: number; ds: number; dt: number; d: number; skew: number }
/** Legacy six-key shape retained for reading old saves. tb/ts are now cumulative tokens consumed on each tick side. */
export interface BookFlow { readonly t: number; readonly buy: number; readonly sell: number; readonly mid: number; readonly tb: number; readonly ts: number; readonly m?: MakerFlow }
export interface BookAccount { readonly cash: number; readonly tokens: number; readonly flow?: BookFlow }
export const feeOf = (notional: number) => exchangeFeeMinor(notional, FEE_BP.taker);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Pure callers without a clock use genesis Fear/regime and base token ADV (not a fake event input). */
export const baseDepthInputs = (ticker: string): DepthInputs => ({ fear: 22, regimeDepth: 1.1, adv: 150e6, sigmaDaily: memeParams(ticker).vol / Math.sqrt(CRYPTO_DAYS_PER_YEAR) });
export function depthQuote(mark: number, inp: DepthInputs, inv: number, side: "BUY" | "SELL") {
  const s = Math.max(HALF_SPREAD * (1 + 1.5 * inp.fear / 100), 0.5 / mark);
  // positive inv: maker long, so a player SELL increases |inv|; a player BUY reduces it (vice versa when short)
  const increases = side === "SELL" ? inv > 0 : inv < 0;
  const invSide = increases ? Math.max(0.2, 1 - 1.6 * Math.max(0, Math.abs(inv) / 0.5 - 0.5)) : 1;
  const d = Math.max(0.2, (1 - 0.6 * inp.fear / 100) * inp.regimeDepth * invSide);
  return { s, d, skew: -s * clamp(inv / 0.5, -1, 1) };
}
/** 05 δ(q)−s; q and ADV both whole-token units. */
export function ladderImpact(q: number, inp: DepthInputs, d: number): number {
  return BOOK_LAW.impactY * inp.sigmaDaily * Math.sqrt(Math.max(0, q) / (d * inp.adv));
}
export interface BookFillResult { readonly qty: number; readonly px: number; readonly notional: number; readonly fee: number; readonly book: BookAccount; readonly move: number }

/** Pure dry-run/execute share this function. Monotone grid ladder inside the source tick band (meme minimum 4%,
 *  otherwise 6σ_tick); binary search chooses the largest whole-token fill satisfying price, finite cash and limit.
 *  No new mutable world state and no asset changes before the caller atomically saves the result. */
export function fillOnBook(a: AssetFixture, side: "BUY" | "SELL", want: number, mark: number, book: BookAccount, tick: number, limit: number | null = null, inp: DepthInputs = baseDepthInputs(a.assetId)): BookFillResult | null {
  if (!(want >= 1) || !(mark >= 1) || !(inp.adv > 0) || !(inp.sigmaDaily > 0)) return null;
  const f = book.flow, old = f?.m;
  const same = old !== undefined && f?.t === tick;
  const day = Math.floor(tick / TICKS_PER_DAY);
  const priorInv = old?.inv ?? 0;
  const dq = depthQuote(mark, inp, priorInv, side);
  // same-tick reference is frozen, including its skew; mark already contains previously saved permanent/skew moves
  const ref = same ? f.mid : Math.max(1, Math.round(mark * Math.exp(dq.skew - (old?.skew ?? 0))));
  const used = same ? (side === "BUY" ? f.tb : f.ts) : 0;
  const band = Math.max(0.04, 6 * inp.sigmaDaily / Math.sqrt(TICKS_PER_DAY));
  const sign = side === "BUY" ? 1 : -1;
  const price = (q: number) => {
    const log = dq.s + ladderImpact(used + q, inp, dq.d);
    return side === "BUY" ? Math.ceil(ref * Math.exp(log)) : Math.floor(ref * Math.exp(-log));
  };
  const cost = (q: number) => centsOf(a.displayDecimals, price(q) * q, side === "BUY");
  // δ(q) ≤ band, relative to the unskewed tick mark; skew must not move an execution outside that band either
  const bandMark = same ? f.mid : mark;
  const loPx = Math.ceil(bandMark * Math.exp(-band)), hiPx = Math.floor(bandMark * Math.exp(band));
  const maxQ = Math.max(0, Math.floor(dq.d * inp.adv * Math.pow(Math.max(0, band - dq.s) / (BOOK_LAW.impactY * inp.sigmaDaily), 2)) - used);
  let lo = 0, hi = Math.min(Math.floor(want), maxQ, side === "BUY" ? book.tokens : Number.MAX_SAFE_INTEGER);
  const fits = (q: number) => {
    const px = price(q);
    return px >= loPx && px <= hiPx && (limit === null || (side === "BUY" ? px <= limit : px >= limit))
      && (side === "BUY" || cost(q) <= book.cash);
  };
  while (lo < hi) { const q = Math.floor((lo + hi + 1) / 2); if (fits(q)) lo = q; else hi = q - 1; }
  if (lo < 1) return null;
  const qty = lo, px = price(qty), notional = cost(qty);
  if (notional < 1) return null;
  const fee = feeOf(notional);
  const qc0 = old?.day === day ? old.qc : 0;
  const pi0 = old?.day === day ? old.pi : 0;
  const elapsed = old?.day === day && f ? Math.max(0, tick - f.t) : tick % TICKS_PER_DAY + 1;
  const ds = (old?.day === day ? old.ds : 0) + (old?.day === day ? old.d : dq.d) * elapsed;
  const dt = (old?.day === day ? old.dt : 0) + elapsed;
  const avgD = dt > 0 ? ds / dt : dq.d;
  const qc = qc0 + sign * qty / inp.adv;
  const pi = Math.sign(qc) * BOOK_LAW.permanentImpactShare * BOOK_LAW.impactY * inp.sigmaDaily * Math.sqrt(Math.abs(qc) / avgD);
  const inv = priorInv - sign * qty / inp.adv;
  const skew = depthQuote(mark, inp, inv, side).skew;
  const m: MakerFlow = { day, inv, qc, pi, ds, dt, d: dq.d, skew };
  const flow: BookFlow = { t: tick, mid: ref, buy: same ? f.buy + (side === "BUY" ? qty : 0) : side === "BUY" ? qty : 0,
    sell: same ? f.sell + (side === "SELL" ? qty : 0) : side === "SELL" ? qty : 0,
    tb: (same ? f.tb : 0) + (side === "BUY" ? qty : 0), ts: (same ? f.ts : 0) + (side === "SELL" ? qty : 0), m };
  const next: BookAccount = side === "BUY" ? { cash: book.cash + notional + fee, tokens: book.tokens - qty, flow }
    : { cash: book.cash - notional + fee, tokens: book.tokens + qty, flow };
  return { qty, px, notional, fee, book: next, move: pi - pi0 + skew - (old?.skew ?? 0) };
}
