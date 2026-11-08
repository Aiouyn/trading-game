// The saved Launchpad section of the auth store (owner-restored feature, first playable loop). It lives in the same
// snapshot file as the player ledgers and commits in the same persist, so a launch or trade and its cash effect are saved
// together or not at all. Parsed strictly on load: a section that does not parse is kept verbatim (never reset) and the
// Launchpad reads as unavailable until it is repaired.
import type { BookFlow } from "@/server/broker/book";
import { POOL_KINDS, type CoinPools } from "@/server/broker/pools";
import { LP, type Book, type Curve, type TaglineId, graduationOf, isTagline, liquidationCents, listPriceMinor, tickerOk } from "@/launchpad/rules";

export interface LpPrint { tick: number; atMs: number; side: "buy" | "sell"; tokens: number; cents: number; creator: boolean }
/** One executed curve trade on the coin's price/volume history: the curve after it (x, sold) and the tape's volume. */
export interface LpPoint { tick: number; atMs: number; side: "buy" | "sell"; tokens: number; cents: number; x: number; sold: number }
/** The graduation (L4), saved once by the buy that sold the curve's last token: when, at which clock tick, the raise and
 *  fee, `at` = trades recorded before it, and `price` = the listing price (the last curve price, 1e-8 $). */
export interface LpGrad { atMs: number; tick: number; raise: number; fee: number; at: number; price: number }
/** The recorded history: points since `since` (the launch, or the first trade after history existed); `dropped` older
 *  points were removed by the HIST_KEEP bound. */
export interface LpHistory { since: number; dropped: number; pts: LpPoint[] }
export interface LpCoin extends Curve {
  ticker: string;
  name: string;
  tagline: TaglineId;
  creatorId: string;
  createdAtMs: number;
  createdTick: number;
  tape: LpPrint[];
  /** Absent on a coin saved before history was recorded (never back-filled). */
  hist?: LpHistory;
  /** Set together, once, at graduation: the record, and the coin's liquidity book account (nobody's ledger), which every
   *  Broker fill on the listed coin trades against from then on. The curve is frozen and holds nothing then. */
  grad?: LpGrad;
  book?: Book;
  /** The book's flow (src/server/broker/book.ts BookFlow: the price law's decayed flow, the tick's mid and cap use), saved
   *  with the book by every fill from the first one on (absent before, and on a save from before this field). */
  flow?: BookFlow;
  /** The coin's trader pools (src/server/broker/pools.ts: NPC accounts, positions, hype, NPC prints), created and funded
   *  by the first pool step after graduation (absent before, and on a save from before this field). */
  pools?: CoinPools;
}
/** One account's replies by idempotency key (newest last, 50 kept). `fp` is the request it answered. */
export interface LpReceipt { key: string; fp: string; reply: unknown }
export interface LpState {
  v: 1;
  coins: LpCoin[];
  /** accountId → ticker → tokens held (> 0). */
  holdings: Record<string, Record<string, number>>;
  /** accountId → ticker → cost basis in cents (what the tokens still held cost, fees included); keys mirror holdings. */
  costs: Record<string, Record<string, number>>;
  receipts: Record<string, LpReceipt[]>;
  /** accountId → when its last launch was accepted (real ms), for the 24 h cooldown. */
  lastLaunchAtMs: Record<string, number>;
  /** Fees and launch fees removed from the game (cents). */
  sinkCents: number;
}

export const RECEIPTS_KEEP = 50;
export const emptyLaunchpad = (): LpState => ({ v: 1, coins: [], holdings: {}, costs: {}, receipts: {}, lastLaunchAtMs: {}, sinkCents: 0 });
export const cloneLaunchpad = (s: LpState): LpState => structuredClone(s);

const int = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ACCT = /^acc_[0-9a-f]{32}$/;

function coinOk(c: unknown): c is LpCoin {
  if (!obj(c)) return false;
  if (typeof c.ticker !== "string" || !tickerOk(c.ticker) || typeof c.name !== "string" || !isTagline(c.tagline)) return false;
  if (typeof c.creatorId !== "string" || !ACCT.test(c.creatorId) || !int(c.createdAtMs) || !int(c.createdTick)) return false;
  if (!int(c.x, LP.X0) || !int(c.sold) || c.sold > LP.Y0 - LP.GRAD_Y || !Array.isArray(c.tape) || c.tape.length > LP.TAPE_KEEP) return false;
  if (!c.tape.every((p: unknown) => obj(p) && (p.side === "buy" || p.side === "sell") && int(p.tick) && int(p.atMs) && int(p.tokens, 1) && int(p.cents) && typeof p.creator === "boolean")) return false;
  if ((c.grad === undefined) !== (c.book === undefined) || "pool" in c) return false; // "pool": the withdrawn 6ac2b3b1 stand-in
  if (c.grad !== undefined && !gradOk(c as unknown as LpCoin)) return false;
  if (c.flow !== undefined && (c.book === undefined || !flowOk(c.flow))) return false;
  if (c.pools !== undefined && (c.book === undefined || !poolsOk(c.pools))) return false;
  return c.hist === undefined || histOk(c.hist, c as unknown as LpCoin);
}

/** A graduated coin: the curve sold its 800M, the raise, fee and listing price follow from it, the book is whole numbers
 *  within the supply (Broker fills move it both ways; the supply check across ledgers is AuthService.reload's). */
function gradOk(c: LpCoin): boolean {
  const g = c.grad as unknown, b = c.book as unknown;
  if (!obj(g) || !obj(b) || !int(g.atMs, c.createdAtMs) || !int(g.tick) || !int(g.at, 1) || !int(g.price, 1) || !int(b.cash) || !int(b.tokens)) return false;
  if (Object.keys(g).length !== 6 || Object.keys(b).length !== 2 || (b.tokens as number) > LP.SUPPLY) return false;
  if (c.sold !== LP.Y0 - LP.GRAD_Y) return false;
  const want = graduationOf(c);
  return g.raise === want.raise && g.fee === want.fee && g.price === listPriceMinor(c);
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
function flowOk(f: unknown): boolean {
  return obj(f) && Object.keys(f).length === 6 && int(f.t) && int(f.mid, 1) && num(f.buy) && num(f.sell) && num(f.tb) && num(f.ts);
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sint = (v: unknown): v is number => Number.isSafeInteger(v);
const REGIMES = ["EXPANSION", "OVERHEATING", "CONTRACTION", "RECOVERY"];
/** The inputs the last pool step read (absent until a step read them): exactly 5 keys, each in its range. */
function worldOk(w: unknown): boolean {
  return obj(w) && Object.keys(w).length === 5 && REGIMES.includes(w.rg as string) && fin(w.f) && w.f >= 0 && w.f <= 100
    && fin(w.att) && w.att >= 1 && w.att <= 2 && (w.ns === -1 || w.ns === 0 || w.ns === 1) && fin(w.m) && w.m >= 0 && w.m <= 1;
}
function poolsOk(p: unknown): boolean {
  if (!obj(p) || Object.keys(p).length !== 9 + POOL_KINDS.length + ("w" in p ? 1 : 0) || !int(p.vol)) return false;
  if ("w" in p && !worldOk(p.w)) return false;
  if (typeof p.ep !== "string" || !/^[0-9a-z]{1,16}$/.test(p.ep) || !int(p.t) || !int(p.hr) || !fin(p.h) || p.h < 0 || p.h > 1) return false;
  if (!int(p.bk) || p.bk > LP.SUPPLY || !int(p.funded) || !Array.isArray(p.pnet) || p.pnet.length > 24 || !Array.isArray(p.tape) || p.tape.length > 20) return false;
  if (!p.pnet.every((e: unknown) => Array.isArray(e) && e.length === 2 && int(e[0]) && sint(e[1]))) return false;
  if (!p.tape.every((x: unknown) => obj(x) && Object.keys(x).length === 5 && int(x.tick) && POOL_KINDS.includes(x.pool as never) && (x.side === "BUY" || x.side === "SELL") && int(x.qty, 1) && int(x.px))) return false;
  return POOL_KINDS.every((k) => { const a = p[k]; return obj(a) && Object.keys(a).length === 3 && int(a.cash) && int(a.tokens) && (a.tokens as number) <= LP.SUPPLY && fin(a.pos); });
}

const curveOk = (x: unknown, sold: unknown) => int(x, LP.X0) && int(sold) && (sold as number) <= LP.Y0 - LP.GRAD_Y;
function histOk(h: unknown, c: LpCoin): boolean {
  if (!obj(h) || !int(h.since, c.createdAtMs) || !int(h.dropped) || !Array.isArray(h.pts) || h.pts.length > LP.HIST_KEEP) return false;
  const pts = h.pts as unknown[];
  if (!pts.every((p) => obj(p) && (p.side === "buy" || p.side === "sell") && int(p.tick) && int(p.atMs, h.since as number) && int(p.tokens, 1) && int(p.cents) && curveOk(p.x, p.sold)
    && !("pc" in p) && !("pt" in p))) return false; // book points: the withdrawn stand-in
  // A graduated coin's history ends at its graduation (trades recorded = grad.at): it trades in the Broker afterwards.
  if (c.grad && c.grad.at !== (h.dropped as number) + pts.length) return false;
  const last = pts[pts.length - 1] as LpPoint | undefined;
  // The newest point is the coin as saved: history cannot drift from it.
  return !last || (last.x === c.x && last.sold === c.sold);
}

/** The cash a coin's Launchpad market holds: the curve's real cash while live; once graduated the curve holds nothing
 *  (the raise went to the fee and the book) and the book's cash is `book.cash`. */
export const marketCashCents = (c: LpCoin) => (c.book ? 0 : c.x - LP.X0);

/** A coin's trader pools (src/server/broker/pools.ts): their cash and tokens, and the cash the booked NPC line funded
 *  them with (0 before their first step). World cash identity: Σ ledgers + curves + books + pools + sinks = start cash +
 *  Σ funded; supply: Σ positions + book + pools' tokens = the supply. */
export const poolCashCents = (c: LpCoin) => POOL_KINDS.reduce((s, k) => s + (c.pools?.[k].cash ?? 0), 0);
export const poolTokens = (c: LpCoin) => POOL_KINDS.reduce((s, k) => s + (c.pools?.[k].tokens ?? 0), 0);
export const poolFundedCents = (c: LpCoin) => c.pools?.funded ?? 0;

/** Append one executed trade to the coin's history (starting it on a legacy coin), keeping at most HIST_KEEP points. */
export function recordPoint(c: LpCoin, p: LpPoint): void {
  // A legacy coin that never traded has a complete history from its launch; one that traded starts at this trade.
  const h = (c.hist ??= { since: c.tape.length === 0 ? c.createdAtMs : p.atMs, dropped: 0, pts: [] });
  h.pts.push(p);
  if (h.pts.length > LP.HIST_KEEP) h.dropped += h.pts.splice(0, h.pts.length - LP.HIST_KEEP).length;
}

/** The saved section, or why it cannot be trusted. An absent section is an empty Launchpad. */
export function parseLaunchpad(raw: unknown): { ok: true; state: LpState } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, state: emptyLaunchpad() };
  if (!obj(raw) || raw.v !== 1) return { ok: false, reason: "unknown launchpad version" };
  const { coins, holdings, costs, receipts, lastLaunchAtMs, sinkCents } = raw;
  if (!Array.isArray(coins) || !coins.every(coinOk)) return { ok: false, reason: "bad coin" };
  if (new Set(coins.map((c) => c.ticker)).size !== coins.length) return { ok: false, reason: "duplicate ticker" };
  if (!obj(holdings) || !obj(costs) || !obj(receipts) || !obj(lastLaunchAtMs) || !int(sinkCents)) return { ok: false, reason: "bad section" };
  const tickers = new Set(coins.map((c) => c.ticker));
  for (const [id, h] of Object.entries(holdings)) {
    if (!ACCT.test(id) || !obj(h)) return { ok: false, reason: "bad holding" };
    for (const [t, q] of Object.entries(h)) if (!tickers.has(t) || !int(q, 1)) return { ok: false, reason: "bad holding" };
  }
  // A cost for every holding and nothing else.
  const keys = (m: Record<string, unknown>) => Object.entries(m).flatMap(([id, h]) => (obj(h) ? Object.keys(h).map((t) => `${id}/${t}`) : [`${id}/?`])).sort().join();
  if (keys(costs) !== keys(holdings)) return { ok: false, reason: "costs do not match holdings" };
  for (const h of Object.values(costs)) for (const c of Object.values(h as Record<string, unknown>)) if (!int(c)) return { ok: false, reason: "bad cost" };
  // Tokens held equal tokens sold by the curve; a graduated coin has no Launchpad holdings (they became Broker positions in
  // the graduation's commit): no coin is created or lost outside a trade.
  for (const c of coins) {
    let held = 0;
    for (const h of Object.values(holdings as Record<string, Record<string, number>>)) held += h[c.ticker] ?? 0;
    if (held !== (c.book ? 0 : c.sold)) return { ok: false, reason: `holdings of ${c.ticker} do not match its curve` };
  }
  for (const [id, r] of Object.entries(receipts)) {
    if (!ACCT.test(id) || !Array.isArray(r) || r.length > RECEIPTS_KEEP) return { ok: false, reason: "bad receipts" };
    if (!r.every((x: unknown) => obj(x) && typeof x.key === "string" && typeof x.fp === "string")) return { ok: false, reason: "bad receipts" };
  }
  for (const [id, t] of Object.entries(lastLaunchAtMs)) if (!ACCT.test(id) || !int(t)) return { ok: false, reason: "bad launch time" };
  return { ok: true, state: structuredClone(raw) as unknown as LpState };
}

/** One account's coin holdings at the indicative liquidation value (the one valuation NW, Portfolio and the board use). */
export interface LpCoinRow { ticker: string; qty: number; value: number; cost: number }
export function coinRows(lp: Readonly<LpState>, accountId: string): LpCoinRow[] {
  const held = lp.holdings[accountId] ?? {};
  return lp.coins.filter((c) => held[c.ticker]).map((c) => ({
    ticker: c.ticker, qty: held[c.ticker]!, value: liquidationCents(c, held[c.ticker]!), cost: lp.costs[accountId]?.[c.ticker] ?? 0,
  })).sort((a, b) => (a.ticker < b.ticker ? -1 : 1));
}
export const coinValueCents = (rows: readonly LpCoinRow[]) => rows.reduce((n, r) => n + r.value, 0);
