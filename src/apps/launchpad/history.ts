// Launchpad coin history model (pure, read by History.tsx and the unit tests without a DOM). The server records one point
// per executed trade (src/server/launchpad/state.ts recordPoint): the curve after it and the trade's tape volume. Here
// those points become the chart's steps; nothing is interpolated, smoothed or invented. Price is the curve's spot price
// after each trade (x / (Y0 − sold), the panel's "Price"), never the liquidation estimate used for net worth.
import { LP } from "@/launchpad/rules";

/** A trade point: the curve after it, and after graduation also the book after it (pc cash, pt tokens). */
export interface HistPoint { tick: number; atMs: number; side: "buy" | "sell"; tokens: number; cents: number; x: number; sold: number; pc?: number; pt?: number }
export interface HistGrad { atMs: number; at: number; cash: number; tokens: number }
export interface HistoryData { ticker: string; createdAtMs: number; startX: number; since: number | null; dropped: number; pts: HistPoint[]; grad: HistGrad | null }

const int = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The server's reply for `ticker`, or null when it is not one (a malformed or other coin's reply is never drawn). */
export function parseHistory(v: unknown, ticker: string): HistoryData | null {
  if (!obj(v) || v.ticker !== ticker || !int(v.createdAtMs) || v.startX !== LP.X0 || !int(v.dropped) || !Array.isArray(v.pts)) return null;
  if (v.since !== null && !int(v.since)) return null;
  const pts = v.pts as unknown[];
  const g = v.grad;
  if (g !== null && !(obj(g) && int(g.atMs) && int(g.at, 1) && int(g.cash, 1) && int(g.tokens, 1))) return null;
  const at = g ? (g.at as number) - v.dropped : pts.length; // window index of the first book point
  const ok = pts.every((p, i) => obj(p) && (p.side === "buy" || p.side === "sell") && int(p.tick) && int(p.atMs) && int(p.tokens, 1)
    && int(p.cents) && int(p.x, LP.X0) && int(p.sold) && (p.sold as number) < LP.Y0
    && (i >= at ? int(p.pc, 1) && int(p.pt, 1) : p.pc === undefined && p.pt === undefined));
  if (!ok || (v.since === null && pts.length > 0)) return null;
  return { ticker, createdAtMs: v.createdAtMs, startX: LP.X0, since: v.since as number | null, dropped: v.dropped, pts: pts as HistPoint[], grad: (g as HistGrad | null) ?? null };
}

/** Spot price in dollars per token. */
export const spot = (x: number, sold: number) => x / (100 * (LP.Y0 - sold));
/** A price as text with four significant digits, like the panel ("$0.00001398"). */
export const priceStr = (d: number) => `$${d.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;

/** One chart step. `market` names where its price comes from: the curve, or the locked book after graduation. */
export interface Step { n: number; kind: "launch" | "buy" | "sell" | "graduation"; market: "curve" | "pool"; atMs: number; price: number; cents: number; tokens: number; /** 1-based among the kept trades; 0 for the launch and the graduation */ trade: number }
export interface Model {
  steps: Step[];
  /** Trades are charted from the launch (nothing missing). */
  fromLaunch: boolean;
  /** "legacy": the coin has not traded since history was recorded; "since": trades before `since` are not charted. */
  gap: null | { kind: "legacy" } | { kind: "since"; atMs: number };
  dropped: number;
  price: { min: number; max: number };
  volMax: number;
}

export function modelOf(h: HistoryData): Model {
  const fromLaunch = h.since === h.createdAtMs && h.dropped === 0;
  const steps: Step[] = [];
  if (fromLaunch) steps.push({ n: 0, kind: "launch", market: "curve", atMs: h.createdAtMs, price: spot(h.startX, 0), cents: 0, tokens: 0, trade: 0 });
  // The graduation is a state change, not a trade: its step carries the book's seed price and no volume. It sits after
  // the trade that completed the curve (absolute trade index grad.at − 1); when that trade is no longer kept, it leads.
  const gi = h.grad ? Math.max(0, h.grad.at - h.dropped) : -1;
  const grad = () => h.grad && steps.push({ n: steps.length, kind: "graduation", market: "pool", atMs: h.grad.atMs, price: h.grad.cash / (100 * h.grad.tokens), cents: 0, tokens: 0, trade: 0 });
  h.pts.forEach((p, i) => {
    if (i === gi) grad();
    const pool = p.pc !== undefined && p.pt !== undefined;
    steps.push({ n: steps.length, kind: p.side, market: pool ? "pool" : "curve", atMs: p.atMs, price: pool ? p.pc! / (100 * p.pt!) : spot(p.x, p.sold), cents: p.cents, tokens: p.tokens, trade: i + 1 });
  });
  if (gi >= h.pts.length) grad();
  const prices = steps.map((s) => s.price);
  return {
    steps, fromLaunch, dropped: h.dropped,
    gap: h.since === null ? { kind: "legacy" } : h.since > h.createdAtMs ? { kind: "since", atMs: h.since } : null,
    price: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    volMax: steps.reduce((m, s) => Math.max(m, s.cents), 0),
  };
}

export const W = 600;
export const PH = 140;
export const VH = 56;

/** Each step owns one equal slot, oldest left: step i spans [left(i), left(i + 1)], the newest runs to the right edge. */
export const slotW = (n: number) => (W - 16) / Math.max(n, 1);
export const leftOf = (i: number, n: number) => 8 + i * slotW(n);
/** The centre of step i's slot (its volume bar and the readout cursor). */
export const xOf = (i: number, n: number) => leftOf(i, n) + slotW(n) / 2;
/** The step under a horizontal position in viewBox units. */
export const stepAt = (vx: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor((vx - 8) / slotW(n))));
/** y of a price inside the price plot (a flat history sits in the middle). */
export function yOf(price: number, m: Model): number {
  const { min, max } = m.price;
  if (max <= min) return PH / 2;
  return PH - 8 - ((price - min) / (max - min)) * (PH - 16);
}
/** The price line: each trade's price is held until the next trade (a step), never a straight line between trades. */
export function stepPath(m: Model): string {
  const n = m.steps.length;
  if (n === 0) return "";
  let d = `M8 ${yOf(m.steps[0]!.price, m)}`;
  for (let i = 1; i < n; i++) d += `H${leftOf(i, n)}V${yOf(m.steps[i]!.price, m)}`;
  return `${d}H${W - 8}`;
}
/** Height of a volume bar inside the volume plot. */
export const barH = (cents: number, m: Model) => (m.volMax <= 0 ? 0 : Math.max(1, (cents / m.volMax) * (VH - 4)));
