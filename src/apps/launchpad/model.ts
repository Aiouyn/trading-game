// Launchpad model (pure, no DOM): the sim's memecoins as the Launchpad reads them. Every figure is the sim's, read in one
// piece from /coins (every coin's pool as it stands that minute), so a coin's price, market cap, holders, raised and
// bought-out always come from the same pool state. Nothing here moves money or invents a price; the sim decides every
// trade and every launch, and the constant-product quotes below are only the estimates shown before a click.
import { dayLabel as weekdayLabel, hhmm } from "@/components/market/terminalApi";

/** A memecoin row from the sim. Prices are cents per token; money is cents; times are game minutes since day 0. */
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
  bornAbs: number;
  eventId: number;
  px: number;
  prev: number;
  /** Price change over the last game hour (1 = unchanged); null while the coin is younger than an hour. */
  h1: number | null;
  king: boolean;
  supply: number;
  cap: number;
  /** Share of the pool's tokens bought out, 0..1. */
  sold: number;
  raised: number;
  cash: number;
  tokens: number;
  holders: number;
  /** Cents traded since launch. */
  vol: number;
  trades: number;
  /** Cents traded lately, fading over a couple of game hours: what Trending sorts by. */
  heat: number;
  lastAbs: number;
  lastDay: number;
  peak: number;
  /** How the coin ended: pulled by its creator, or faded and delisted. Empty while it trades. */
  ended: "" | "rugged" | "faded";
  /** inactivity, drawdown, age or rug. Empty while it trades. */
  endWhy?: "" | "inactivity" | "drawdown" | "age" | "rug";
  endAbs: number;
  rugCash: number;
  /** The game day a faded coin's pool pays out. 0 once holders have already been paid. */
  windDay: number;
  seed?: number;
  founderBuy?: number;
  outsideBuy?: number;
  withdrawn?: number;
  payout?: Payout;
  kingRule?: string;
}

/** The settlement shown on a coin that has ended. */
export interface Payout {
  pool: number;
  taken: number;
  paid: number;
  dust: number;
  holders: number;
  lines: { who: number; tokens: number; cents: number }[];
  yoursTokens: number;
  yoursCents: number;
  note: string;
}

/** One executed trade on the trades bar. */
export interface TapeRow {
  coin: string;
  ticker: string;
  coinName: string;
  seq: number;
  day: number;
  abs: number;
  side: "buy" | "sell";
  tokens: number;
  cents: number;
  who: number;
  name: string;
  mine: boolean;
}

/** What someone posted on a coin: the creator's own posts, the people whose trades said something, the player's posts and the
 *  crowd's answers. An answer names its parent and quotes it. */
export interface Post {
  id: string;
  abs: number;
  name: string;
  mine: boolean;
  creator: boolean;
  act: "launch" | "buy" | "sell" | "pump" | "dump" | "rug" | "post" | "reply";
  parent?: string;
  quote?: string;
  quoteName?: string;
  cents: number;
  gain?: number;
  text: string;
  /** opinion, marketing, disclosure or question. */
  label?: string;
}

/** The coin page's read: this detail comes with /coins?coin=... */
export interface CoinPage extends Coin {
  /** The creator's own words about the coin. */
  desc: string;
  creatorIndex: number;
  creatorHandle: string;
  top: { index: number; name: string; qty: number; share: number; mine: boolean; creator: boolean }[];
  prints: { seq: number; day: number; abs: number; side: "buy" | "sell"; tokens: number; cents: number; px: number; before?: number; after?: number; name: string; mine: boolean }[];
  posts: Post[];
  hears?: { abs: number; name: string; fromName: string; holding: number; kind: string; did: string; cents: number }[];
}

export interface Rug { id: string; ticker: string; name: string; creatorName: string; mine: boolean; cash: number; abs: number }

/** The player's record as a coin creator, as the crowd keeps it. */
export interface DevRecord {
  handle: string;
  launches: number;
  dumps: number;
  hurt: number;
  good: number;
  following: number;
  word: string;
  line: string;
}
export interface Rules { fee: number; seedMin: number; seedMax: number; pool: number; founder: number }

/** Everything one read of /coins returns. */
export interface LpData {
  now: number;
  day: number;
  live: number;
  /** Coins the city's own launchers have live, against `max`: the cap never applies to the player. */
  cityLive: number;
  max: number;
  king: string;
  kingRule?: string;
  board: Coin[];
  held: Record<string, number>;
  rugs: Rug[];
  tape: TapeRow[];
  rules: Rules;
  detail?: CoinPage;
  dev?: DevRecord;
}

export type Feed = "new" | "bumped" | "trending" | "holdings" | "gone";
export type Sort = "created" | "bumped" | "cap" | "heat";
export const FEEDS: readonly Feed[] = ["new", "bumped", "trending", "holdings", "gone"];
export const DEFAULT_SORT: Record<Feed, Sort> = { new: "created", bumped: "bumped", trending: "heat", holdings: "cap", gone: "bumped" };

/** Read the /coins reply defensively: a missing part is an empty one. */
export function readLp(j: unknown): LpData | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Partial<LpData>;
  if (!Array.isArray(o.board) || typeof o.now !== "number") return null;
  return {
    now: o.now,
    day: o.day ?? Math.floor(o.now / 1440),
    live: o.live ?? 0,
    cityLive: o.cityLive ?? o.live ?? 0,
    max: o.max ?? 12,
    king: o.king ?? "",
    kingRule: typeof (o as { kingRule?: unknown }).kingRule === "string" ? (o as { kingRule: string }).kingRule : "",
    board: o.board,
    held: o.held ?? {},
    rugs: Array.isArray(o.rugs) ? o.rugs : [],
    tape: Array.isArray(o.tape) ? o.tape : [],
    rules: o.rules ?? { fee: 2_000, seedMin: 25_000, seedMax: 150_000, pool: 150_000, founder: 15_000 },
    detail: o.detail,
    dev: readDev((o as { dev?: unknown }).dev),
  };
}

function readDev(v: unknown): DevRecord | undefined {
  if (!v || typeof v !== "object") return undefined;
  const d = v as Partial<DevRecord>;
  if (typeof d.line !== "string" || typeof d.word !== "string") return undefined;
  return {
    handle: typeof d.handle === "string" ? d.handle : "",
    launches: typeof d.launches === "number" ? d.launches : 0,
    dumps: typeof d.dumps === "number" ? d.dumps : 0,
    hurt: typeof d.hurt === "number" ? d.hurt : 0,
    good: typeof d.good === "number" ? d.good : 0,
    following: typeof d.following === "number" ? d.following : 0,
    word: d.word,
    line: d.line,
  };
}

/** The king of the hill: the coin the sim marked after the latest trades. The same coin wears the badge. */
export function kingOf(coins: readonly Coin[]): Coin | null {
  const flagged = coins.find((c) => c.live && c.king);
  if (flagged) return flagged;
  let king: Coin | null = null;
  for (const c of coins) if (c.live && (!king || c.cap > king.cap || (c.cap === king.cap && c.id < king.id))) king = c;
  return king;
}

/** The coins of a feed, searched by name or ticker and sorted, largest first. */
export function feedOf(coins: readonly Coin[], feed: Feed, held: Readonly<Record<string, number>>, q: string, sort: Sort): Coin[] {
  const needle = q.trim().toLowerCase();
  const inFeed = (c: Coin) => (feed === "holdings" ? (held[c.id] ?? 0) > 0 : feed === "gone" ? !c.live : c.live);
  const keyOf = (c: Coin): number => (sort === "created" ? c.bornAbs : sort === "bumped" ? c.lastAbs : sort === "cap" ? c.cap : c.heat);
  const list = coins.filter((c) => inFeed(c) && (!needle || c.name.toLowerCase().includes(needle) || c.ticker.toLowerCase().includes(needle)));
  return list.sort((a, b) => keyOf(b) - keyOf(a) || (a.id < b.id ? -1 : 1));
}

/** Cents per token as the dollars a player reads: $0.001667. Always enough digits to see a move. */
export function perToken(px: number): string {
  const d = px / 100;
  if (!(d > 0)) return "$0.00";
  if (d >= 1) return `$${d.toFixed(2)}`;
  if (d >= 0.01) return `$${d.toFixed(4)}`;
  return `$${d.toFixed(6)}`;
}

/** Cents as dollars with two decimals. */
export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Cents as whole dollars, for market caps and other large figures. */
export function usdWhole(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** A count of whole tokens. */
export function qty(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

/** The change over a game hour as "+12.4%". */
export function pctText(ratio: number | null): string {
  if (ratio === null) return "new";
  if (!Number.isFinite(ratio)) return "0.0%";
  const p = (ratio - 1) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(Math.abs(p) >= 100 ? 0 : 1)}%`;
}

/** The game clock "14:32" for a minute since day 0. */
export function clockText(abs: number): string {
  return hhmm((((Math.floor(abs) % 1440) + 1440) % 1440));
}

/** When a trade or a post happened, in game time: the clock today, the weekday and date before that. */
export function whenText(abs: number, now: number): string {
  const d = Math.floor(abs / 1440);
  return d === Math.floor(now / 1440) ? clockText(abs) : `${weekdayLabel(d)} ${clockText(abs)}`;
}

/** Game time since `abs`: "just now", "12 min ago", "3 h ago", "2 d ago". */
export function agoText(abs: number, now: number): string {
  const m = Math.max(0, Math.floor(now - abs));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} d ago`;
}

/** The game day as "Tue 2 Jan". */
export function dateText(day: number): string {
  return weekdayLabel(day);
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

/** The fewest tokens whose sale pays at least `cents`; 0 when the pool cannot pay that much. */
export function tokensForCents(cash: number, tokens: number, cents: number): number {
  if (cents < 1 || cash < 2 || tokens < 1 || cents >= cash - 1) return 0;
  let q = Math.max(1, Math.ceil((cash * tokens) / (cash - cents)) - tokens);
  while (q > 1 && quoteSell(cash, tokens, q - 1) >= cents) q--;
  while (quoteSell(cash, tokens, q) < cents && q < 1e12) q++;
  return q;
}

/** What a launch costs and what the player's books read just after: the fee and the seed leave cash, the buy goes in the pool, and
 *  the tokens the player then holds (the founder's share plus the buy) are valued at what selling them into the pool would bring,
 *  as the sim values every coin. */
export function launchPreview(rules: Rules, seed: number, buy: number): { cost: number; tokens: number; px: number; value: number; change: number } {
  const out = buy >= 1 ? quoteBuy(seed, rules.pool, buy) : 0;
  const tokens = rules.founder + out;
  const cash = seed + (out > 0 ? buy : 0);
  const left = Math.max(1, rules.pool - out);
  const px = cash / left;
  const value = quoteSell(cash, left, tokens);
  const cost = rules.fee + seed + (out > 0 ? buy : 0);
  return { cost, tokens, px, value, change: value - cost };
}

/** What a buy would do, from the pool as it stands: tokens, average price, what selling them straight back would bring, and the
 *  move in the pool's price. Same arithmetic as the sim's pool, so the fill matches the preview made at the same moment. */
export function buyDetail(cash: number, tokens: number, spend: number): { tokens: number; avg: number; back: number; impact: number } | null {
  const out = quoteBuy(cash, tokens, spend);
  if (out < 1) return null;
  const nc = cash + spend, nt = tokens - out;
  return { tokens: out, avg: spend / out, back: nt > 0 ? quoteSell(nc, nt, out) : 0, impact: nt > 0 ? (nc / nt) / (cash / tokens) - 1 : 0 };
}

/** What a sale would do: the proceeds, the average price and the move in the pool's price. */
export function sellDetail(cash: number, tokens: number, n: number): { tokens: number; cents: number; avg: number; impact: number } | null {
  const pay = quoteSell(cash, tokens, n);
  if (pay < 1) return null;
  const nc = cash - pay, nt = tokens + n;
  return { tokens: n, cents: pay, avg: pay / n, impact: (nc / nt) / (cash / tokens) - 1 };
}
