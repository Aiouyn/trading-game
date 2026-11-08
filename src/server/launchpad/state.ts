// The saved Launchpad section of the auth store (owner-restored feature, first playable loop). It lives in the same
// snapshot file as the player ledgers and commits in the same persist, so a launch or trade and its cash effect are saved
// together or not at all. Parsed strictly on load: a section that does not parse is kept verbatim (never reset) and the
// Launchpad reads as unavailable until it is repaired.
import { LP, type Curve, type TaglineId, isTagline, tickerOk } from "@/launchpad/rules";

export interface LpPrint { tick: number; atMs: number; side: "buy" | "sell"; tokens: number; cents: number; creator: boolean }
export interface LpCoin extends Curve {
  ticker: string;
  name: string;
  tagline: TaglineId;
  creatorId: string;
  createdAtMs: number;
  createdTick: number;
  tape: LpPrint[];
}
/** One account's replies by idempotency key (newest last, 50 kept). `fp` is the request it answered. */
export interface LpReceipt { key: string; fp: string; reply: unknown }
export interface LpState {
  v: 1;
  coins: LpCoin[];
  /** accountId → ticker → tokens held (> 0). */
  holdings: Record<string, Record<string, number>>;
  receipts: Record<string, LpReceipt[]>;
  /** accountId → when its last launch was accepted (real ms), for the 24 h cooldown. */
  lastLaunchAtMs: Record<string, number>;
  /** Fees and launch fees removed from the game (cents). */
  sinkCents: number;
}

export const RECEIPTS_KEEP = 50;
export const emptyLaunchpad = (): LpState => ({ v: 1, coins: [], holdings: {}, receipts: {}, lastLaunchAtMs: {}, sinkCents: 0 });
export const cloneLaunchpad = (s: LpState): LpState => structuredClone(s);

const int = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ACCT = /^acc_[0-9a-f]{32}$/;

function coinOk(c: unknown): c is LpCoin {
  if (!obj(c)) return false;
  if (typeof c.ticker !== "string" || !tickerOk(c.ticker) || typeof c.name !== "string" || !isTagline(c.tagline)) return false;
  if (typeof c.creatorId !== "string" || !ACCT.test(c.creatorId) || !int(c.createdAtMs) || !int(c.createdTick)) return false;
  if (!int(c.x, LP.X0) || !int(c.sold) || c.sold > LP.Y0 - LP.GRAD_Y || !Array.isArray(c.tape) || c.tape.length > LP.TAPE_KEEP) return false;
  return c.tape.every((p: unknown) => obj(p) && (p.side === "buy" || p.side === "sell") && int(p.tick) && int(p.atMs) && int(p.tokens, 1) && int(p.cents) && typeof p.creator === "boolean");
}

/** The saved section, or why it cannot be trusted. An absent section is an empty Launchpad. */
export function parseLaunchpad(raw: unknown): { ok: true; state: LpState } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, state: emptyLaunchpad() };
  if (!obj(raw) || raw.v !== 1) return { ok: false, reason: "unknown launchpad version" };
  const { coins, holdings, receipts, lastLaunchAtMs, sinkCents } = raw;
  if (!Array.isArray(coins) || !coins.every(coinOk)) return { ok: false, reason: "bad coin" };
  if (new Set(coins.map((c) => c.ticker)).size !== coins.length) return { ok: false, reason: "duplicate ticker" };
  if (!obj(holdings) || !obj(receipts) || !obj(lastLaunchAtMs) || !int(sinkCents)) return { ok: false, reason: "bad section" };
  const tickers = new Set(coins.map((c) => c.ticker));
  for (const [id, h] of Object.entries(holdings)) {
    if (!ACCT.test(id) || !obj(h)) return { ok: false, reason: "bad holding" };
    for (const [t, q] of Object.entries(h)) if (!tickers.has(t) || !int(q, 1)) return { ok: false, reason: "bad holding" };
  }
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
