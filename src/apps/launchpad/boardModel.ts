// Launchpad board model (pure; read by App.tsx, Board.tsx and the unit tests without a DOM). Port of the owner's first
// version board (origin/p10/integration src/components/apps/launchpad/{Board,FeedTab}.tsx and src/world/launchpad/view.ts):
// the King of the Hill, the live trades bar, the New / Trending / Graduated / Holdings feeds and their sorts. Everything is
// derived from main's public board read (GET /api/launchpad): each coin's curve, its last 20 public trades and its holder
// count, plus only the caller's own holdings. Nothing here moves money; the ticket's review and the server decide trades.
import { LP, marketCapCents, type Curve } from "@/launchpad/rules";

export interface BoardPrint { atMs: number; side: "buy" | "sell"; tokens: number; cents: number; creator: boolean }
export interface BoardCoin extends Curve {
  ticker: string; name: string; createdAtMs: number; holders: number; mine: boolean;
  /** Newest first (the server's order). */
  tape: BoardPrint[];
  grad?: { atMs: number; price: number; mark: number | null } | null;
}

export type Feed = "new" | "trending" | "graduated" | "holdings";
export type BoardSort = "bump" | "cap" | "created" | "vol" | "curve";
/** The default sort of each feed (p10 FeedTab): New bumps by the last trade, Trending by volume, Graduated by market cap. */
export const DEFAULT_SORT: Record<Feed, BoardSort> = { new: "bump", trending: "vol", graduated: "cap", holdings: "cap" };

/** Tokens the curve sells before graduation (800M). */
export const CURVE_TOKENS = LP.Y0 - LP.GRAD_Y;
/** Share of the curve sold, 0..1. A graduated coin is 1. */
export const progressOf = (c: BoardCoin) => (c.grad ? 1 : Math.min(1, c.sold / CURVE_TOKENS));
/** Market cap in cents: the curve's spot × supply, or a graduated coin's Broker mark (1e-8 $) × supply. */
export const capOf = (c: BoardCoin) => (c.grad ? (c.grad.mark ?? c.grad.price) * (LP.SUPPLY / 1e6) : marketCapCents(c));
/** Cash raised on the curve, in cents. */
export const raisedOf = (c: Curve) => c.x - LP.X0;
/** The market cap a curve graduates at, in cents (about $216k): the spot when exactly GRAD_Y tokens are left. */
export const GRAD_CAP_CENTS = marketCapCents({ x: Number((BigInt(LP.X0) * BigInt(LP.Y0) + BigInt(LP.GRAD_Y) - BigInt(1)) / BigInt(LP.GRAD_Y)), sold: CURVE_TOKENS });
/** Volume of the coin's public recent trades (the last 20 the server keeps), in cents. */
export const volOf = (c: BoardCoin) => c.tape.reduce((s, p) => s + p.cents, 0);
/** The last trade's time, or the launch when it has not traded. */
export const lastTradeOf = (c: BoardCoin) => c.tape[0]?.atMs ?? c.createdAtMs;

function keyOf(sort: BoardSort, c: BoardCoin): number {
  switch (sort) {
    case "bump": return lastTradeOf(c);
    case "cap": return capOf(c);
    case "created": return c.createdAtMs;
    case "vol": return volOf(c);
    case "curve": return progressOf(c);
  }
}

/** The coins of a feed, filtered by a name/ticker search and sorted, largest first (ties by ticker). */
export function feedOf<C extends BoardCoin>(coins: readonly C[], feed: Feed, holdings: Readonly<Record<string, number>>, q: string, sort: BoardSort): C[] {
  const needle = q.trim().toLowerCase();
  const inFeed = (c: C) => (feed === "graduated" ? !!c.grad : feed === "holdings" ? (holdings[c.ticker] ?? 0) > 0 : !c.grad);
  const list = coins.filter((c) => inFeed(c) && (!needle || c.name.toLowerCase().includes(needle) || c.ticker.toLowerCase().includes(needle)));
  return list.sort((a, b) => keyOf(sort, b) - keyOf(sort, a) || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
}

/** The King of the Hill (p10): the live coin closest to graduation. Null until a live coin has sold any token. */
export function kingOf(coins: readonly BoardCoin[]): BoardCoin | null {
  let king: BoardCoin | null = null;
  for (const c of coins) if (!c.grad && c.sold > 0 && (!king || c.sold > king.sold || (c.sold === king.sold && c.ticker < king.ticker))) king = c;
  return king;
}

export interface BarRow { ticker: string; atMs: number; side: "buy" | "sell"; cents: number; creator: boolean }
/** The live trades bar (p10 TradesBar): the newest public trades across all coins, newest first. */
export function barOf(coins: readonly BoardCoin[], n = 5): BarRow[] {
  const rows: BarRow[] = [];
  for (const c of coins) for (const p of c.tape) rows.push({ ticker: c.ticker, atMs: p.atMs, side: p.side, cents: p.cents, creator: p.creator });
  return rows.sort((a, b) => b.atMs - a.atMs || (a.ticker < b.ticker ? -1 : 1)).slice(0, n);
}

/** "now", "45s", "8m", "3h", "2d": time since `atMs`. */
export function ago(atMs: number, now: number): string {
  const s = Math.max(0, Math.floor((now - atMs) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
