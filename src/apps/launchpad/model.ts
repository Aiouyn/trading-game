// Launchpad model (pure, no DOM): the sim's memecoins as the board reads them. Every figure is the sim's: the view's
// coinBoard and coinTape, and the coin page from /history. Nothing here moves money or invents a price; the sim decides
// every trade and every launch, and the constant-product quote below is only the estimate shown before a click.
import type { SimView } from "@/shell/simSession";

/** A memecoin row from the view. Prices are cents per token; the market cap is cents. */
export interface Coin {
  id: string;
  name: string;
  ticker: string;
  creator: number;
  creatorName: string;
  mine: boolean;
  live: boolean;
  rugged: boolean;
  born: number;
  eventId: number;
  px: number;
  prev: number;
  supply: number;
  cap: number;
  /** Share of the pool's tokens bought out, 0..1. */
  sold: number;
  raised: number;
  cash: number;
  tokens: number;
  holders: number;
  vol: number;
  lastDay: number;
  replies: number;
}

/** One executed trade on the trades bar. */
export interface TapeRow {
  coin: string;
  ticker: string;
  coinName: string;
  seq: number;
  day: number;
  side: "buy" | "sell";
  tokens: number;
  cents: number;
  who: number;
  name: string;
  mine: boolean;
}

/** The coin page's read: the chart's bars and this detail, from /history?instr=coin:... */
export interface CoinPage extends Coin {
  creatorIndex: number;
  top: { index: number; name: string; qty: number; share: number; mine: boolean }[];
  prints: (TapeRow & { index: number })[];
  /** What people said about the coin, newest first (the sim's crowd lines). */
  talk: { eventId: number; day: number; text: string }[];
}

export interface Bar { t: number; k: number; o: number; h: number; l: number; c: number; v: number }
export interface ChartRead { bars: Bar[]; ticks: number; day: number; coin?: CoinPage }

export const LAUNCH_FEE = 2_000;
export const LAUNCH_SEED = 150_000;
export const POOL_TOKENS = 150_000;
export const MAX_LIVE = 6;

export type Feed = "new" | "bumped" | "trending" | "holdings";
export type Sort = "created" | "bumped" | "cap" | "vol";
export const FEEDS: readonly Feed[] = ["new", "bumped", "trending", "holdings"];
export const DEFAULT_SORT: Record<Feed, Sort> = { new: "created", bumped: "bumped", trending: "vol", holdings: "cap" };

/** The memecoins in the view: the majors have no ticker and are traded in the Broker, not here. */
export function coinsOf(view: SimView | null): Coin[] {
  const rows = (view?.coinBoard ?? []) as unknown as Partial<Coin>[];
  return rows.filter((c): c is Coin => typeof c.ticker === "string" && typeof c.id === "string" && c.id.startsWith("coin:me:"));
}

export function tapeOf(view: SimView | null): TapeRow[] {
  return ((view as unknown as { coinTape?: TapeRow[] } | null)?.coinTape ?? []).filter((p) => typeof p.ticker === "string");
}

/** Holdings of memecoins: coin id to tokens, from the view's own holdings. */
export function heldOf(view: SimView | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of view?.coins ?? []) if (h.id.startsWith("coin:me:") && h.qty > 0) out[h.id] = h.qty;
  return out;
}

/** The king of the hill: the live coin with the largest market cap. Null when no coin is live. */
export function kingOf(coins: readonly Coin[]): Coin | null {
  let king: Coin | null = null;
  for (const c of coins) if (c.live && (!king || c.cap > king.cap || (c.cap === king.cap && c.id < king.id))) king = c;
  return king;
}

/** The coins of a feed, searched by name or ticker and sorted, largest first. */
export function feedOf(coins: readonly Coin[], feed: Feed, held: Readonly<Record<string, number>>, q: string, sort: Sort): Coin[] {
  const needle = q.trim().toLowerCase();
  const inFeed = (c: Coin) => (feed === "holdings" ? (held[c.id] ?? 0) > 0 : c.live);
  const keyOf = (c: Coin): number => (sort === "created" ? c.eventId : sort === "bumped" ? c.lastDay * 1_000_000 + c.eventId : sort === "cap" ? c.cap : c.vol);
  const list = coins.filter((c) => inFeed(c) && (!needle || c.name.toLowerCase().includes(needle) || c.ticker.toLowerCase().includes(needle)));
  return list.sort((a, b) => keyOf(b) - keyOf(a) || (a.id < b.id ? -1 : 1));
}

/** Cents per token as the dollars a player reads: $0.0128. */
export function perToken(px: number): string {
  const d = px / 100;
  if (!(d > 0)) return "$0.00";
  if (d >= 1) return `$${d.toFixed(2)}`;
  return `$${d.toPrecision(3).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}`;
}

/** Cents as dollars with two decimals. */
export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A count of whole tokens. */
export function qty(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

/** The game day as "Y1 M2 D3". */
export function dayLabel(day: number): string {
  const doy = ((day % 360) + 360) % 360;
  return `Y${Math.floor(day / 360) + 1} M${Math.floor(doy / 30) + 1} D${(doy % 30) + 1}`;
}

/** Days since `day`, as the board's "today", "2d" text. */
export function agoDays(day: number, now: number): string {
  const d = Math.max(0, now - day);
  return d === 0 ? "today" : `${d}d`;
}

/** The FNV-1a hash of a ticker: the same ticker always draws the same token icon. */
export function tickerHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Estimate of a buy: the tokens a spend would get from the pool now (constant product, as the sim quotes it). */
export function quoteBuy(cash: number, tokens: number, spend: number): number {
  if (spend < 1 || tokens < 2 || cash < 1) return 0;
  const newTokens = Math.ceil((cash * tokens) / (cash + spend));
  return Math.max(0, tokens - newTokens);
}

/** Estimate of a sale: the cents the pool would pay for `qty` tokens now. */
export function quoteSell(cash: number, tokens: number, n: number): number {
  if (n < 1 || cash < 2 || tokens < 1) return 0;
  const newCash = Math.ceil((cash * tokens) / (tokens + n));
  return Math.max(0, cash - newCash);
}
