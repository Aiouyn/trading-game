// The saved Launchpad section of the auth store (owner-restored feature, first playable loop). It lives in the same
// snapshot file as the player ledgers and commits in the same persist, so a launch or trade and its cash effect are saved
// together or not at all. Parsed strictly on load: a section that does not parse is kept verbatim (never reset) and the
// Launchpad reads as unavailable until it is repaired.
import { LP, type Curve, type TaglineId, isTagline, liquidationCents, tickerOk } from "@/launchpad/rules";

export interface LpPrint { tick: number; atMs: number; side: "buy" | "sell"; tokens: number; cents: number; creator: boolean }
/** One executed trade on the coin's price/volume history: the curve after it (x, sold) and the tape's volume. */
export interface LpPoint { tick: number; atMs: number; side: "buy" | "sell"; tokens: number; cents: number; x: number; sold: number }
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
  return c.hist === undefined || histOk(c.hist, c as unknown as LpCoin);
}

const curveOk = (x: unknown, sold: unknown) => int(x, LP.X0) && int(sold) && (sold as number) <= LP.Y0 - LP.GRAD_Y;
function histOk(h: unknown, c: LpCoin): boolean {
  if (!obj(h) || !int(h.since, c.createdAtMs) || !int(h.dropped) || !Array.isArray(h.pts) || h.pts.length > LP.HIST_KEEP) return false;
  const pts = h.pts as unknown[];
  if (!pts.every((p) => obj(p) && (p.side === "buy" || p.side === "sell") && int(p.tick) && int(p.atMs, h.since as number) && int(p.tokens, 1) && int(p.cents) && curveOk(p.x, p.sold))) return false;
  const last = pts[pts.length - 1] as LpPoint | undefined;
  // The newest point is the curve as saved: the history cannot drift from the coin it describes.
  return !last || (last.x === c.x && last.sold === c.sold);
}

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
  // Tokens held must equal tokens sold by each curve: no coin is created or lost outside a trade.
  for (const c of coins) {
    let held = 0;
    for (const h of Object.values(holdings as Record<string, Record<string, number>>)) held += h[c.ticker] ?? 0;
    if (held !== c.sold) return { ok: false, reason: `holdings of ${c.ticker} do not match its curve` };
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
