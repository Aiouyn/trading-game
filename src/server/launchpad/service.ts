// Launchpad server rules (owner-restored feature, first playable loop; lead-launchpad.md L2/L3 definitions in
// src/launchpad/rules.ts). The server owns identity (the session's account), validation, every cash effect, the
// idempotency key and ordering: each launch or trade is decided and saved inside the auth service lock, together with
// the ledgers it pays, by AuthService.commitLaunchpad. The view is read-only.
import { AuthError, type AuthService, type AuthSessionView, type PlayerPrivateRecord } from "@/server/auth";
import { reservedCashCents } from "@/server/broker/execution";
import { ASSETS } from "@/market/catalog";
import { LP, nameOk, quoteBuy, quoteSell, tickerOk, type TaglineId } from "@/launchpad/rules";
import { moderateName, normalizeName } from "./moderate";
import { RECEIPTS_KEEP, recordPoint, type LpCoin, type LpState } from "./state";

export interface LaunchInput { name: string; ticker: string; tagline: TaglineId; fee: number }
export interface TradeInput { ticker: string; side: "buy" | "sell"; amount: number; min: number }

export type Refusal = { status: "refused"; code: string; message: string; nextAtMs?: number };
export type LaunchReply = { status: "accepted"; ticker: string; cashCents: number } | Refusal;
export type TradeReply =
  | { status: "accepted"; ticker: string; side: "buy" | "sell"; tokens: number; cents: number; fee: number; cashCents: number; held: number }
  | Refusal;

export interface CoinView {
  ticker: string; name: string; tagline: TaglineId; creator: string | null; mine: boolean;
  createdAtMs: number; x: number; sold: number; holders: number;
  tape: { atMs: number; tick: number; side: "buy" | "sell"; tokens: number; cents: number; creator: boolean }[];
}
export interface LaunchpadView {
  coins: CoinView[];
  /** Only the caller's own values; null for a guest (or an account whose ledger cannot be loaded). */
  self: null | { cashCents: number; spendableCents: number; holdings: Record<string, number>; live: number; nextLaunchAtMs: number | null };
}

/** A coin's public price/volume history: curve points only (no account ids, handles, receipts, creator flag or
 *  holdings). `since` is null for a legacy coin that has not traded since history was recorded. */
export interface HistoryView {
  ticker: string; createdAtMs: number; startX: number; since: number | null; dropped: number;
  pts: { tick: number; atMs: number; side: "buy" | "sell"; tokens: number; cents: number; x: number; sold: number }[];
}

const refuse = (code: string, message: string, extra: Partial<Refusal> = {}): Refusal => ({ status: "refused", code, message, ...extra });
const spendable = (r: PlayerPrivateRecord) => r.cashCents - reservedCashCents(r);

export interface LaunchpadDeps { auth: () => AuthService; tick: () => number }

export class LaunchpadService {
  constructor(private readonly deps: LaunchpadDeps) {}

  async view(session: AuthSessionView | null): Promise<LaunchpadView> {
    const me = session?.account.accountId ?? null;
    return this.deps.auth().readLaunchpad(session, (lp, self, handleOf, now) => {
      const last = me ? lp.lastLaunchAtMs[me] : undefined;
      const next = last === undefined ? null : last + LP.COOLDOWN_MS;
      return {
      coins: [...lp.coins].reverse().map((c) => ({
        ticker: c.ticker, name: c.name, tagline: c.tagline, creator: handleOf(c.creatorId), mine: c.creatorId === me,
        createdAtMs: c.createdAtMs, x: c.x, sold: c.sold,
        holders: Object.values(lp.holdings).filter((h) => (h[c.ticker] ?? 0) > 0).length,
        tape: [...c.tape].reverse(),
      })),
      self: me && self ? {
        cashCents: self.cashCents, spendableCents: spendable(self), holdings: { ...lp.holdings[me] },
        live: lp.coins.filter((c) => c.creatorId === me).length,
        nextLaunchAtMs: next !== null && next > now ? next : null,
      } : null,
      };
    });
  }

  /** Read-only and public: the same locked read as the board, with no session. Null for an unknown coin. */
  history(ticker: string): Promise<HistoryView | null> {
    return this.deps.auth().readLaunchpad(null, (lp) => {
      const c = lp.coins.find((x) => x.ticker === ticker);
      if (!c) return null;
      return {
        ticker: c.ticker, createdAtMs: c.createdAtMs, startX: LP.X0, since: c.hist?.since ?? null, dropped: c.hist?.dropped ?? 0,
        pts: (c.hist?.pts ?? []).map(({ tick, atMs, side, tokens, cents, x, sold }) => ({ tick, atMs, side, tokens, cents, x, sold })),
      };
    });
  }

  launch(session: AuthSessionView, key: string, input: LaunchInput): Promise<LaunchReply> {
    const fp = JSON.stringify(["launch", input.name, input.ticker, input.tagline, input.fee]);
    const tick = this.deps.tick();
    return this.deps.auth().commitLaunchpad<LaunchReply>(session, ({ lp, self, now }) => {
      const me = self.accountId;
      const replay = replayOf(lp, me, key, fp);
      if (replay) return { result: replay as LaunchReply };
      const name = input.name.trim().replace(/\s+/g, " ");
      if (input.fee !== LP.LAUNCH_FEE) return { result: refuse("FEE_CHANGED", "The launch fee is $1,000.00. Review the launch again.") };
      if (!tickerOk(input.ticker)) return { result: refuse("TICKER_INVALID", "A ticker is 3 to 5 letters A–Z.") };
      if (!nameOk(name)) return { result: refuse("NAME_INVALID", "A name is 3 to 24 letters, digits, spaces, dots, apostrophes or hyphens.") };
      const takenNames = new Set([...ASSETS.map((a) => a.name), ...lp.coins.map((c) => c.name)].map((n) => normalizeName(n).joined));
      const takenTickers = new Set([...ASSETS.map((a) => a.ticker), ...lp.coins.map((c) => c.ticker)].map((n) => normalizeName(n).joined));
      const t = moderateName(input.ticker, takenTickers);
      if (!t.ok) return { result: refuse(t.reason === "taken" ? "TICKER_TAKEN" : "TICKER_REFUSED", t.reason === "taken" ? "That ticker is taken." : "Use a fictional ticker: real coins, brands, people and abuse are refused.") };
      const n = moderateName(name, takenNames);
      if (!n.ok) return { result: refuse(n.reason === "taken" ? "NAME_TAKEN" : "NAME_REFUSED", n.reason === "taken" ? "That name is taken." : "Use a fictional name: real coins, brands, people and abuse are refused.") };
      const last = lp.lastLaunchAtMs[me];
      if (last !== undefined && now < last + LP.COOLDOWN_MS) {
        return { result: refuse("COOLDOWN", "One launch per account every 24 hours.", { nextAtMs: last + LP.COOLDOWN_MS }) };
      }
      if (lp.coins.filter((c) => c.creatorId === me).length >= LP.MAX_LIVE) return { result: refuse("MAX_LIVE", "You already have 3 live coins.") };
      if (spendable(self) < LP.LAUNCH_FEE) return { result: refuse("CASH", "Not enough spendable cash for the $1,000.00 launch fee.") };
      const cashCents = self.cashCents - LP.LAUNCH_FEE;
      const coin: LpCoin = { ticker: input.ticker, name, tagline: input.tagline, creatorId: me, createdAtMs: now, createdTick: tick, x: LP.X0, sold: 0, tape: [], hist: { since: now, dropped: 0, pts: [] } };
      lp.coins.push(coin);
      lp.lastLaunchAtMs[me] = now;
      lp.sinkCents += LP.LAUNCH_FEE;
      const result: LaunchReply = { status: "accepted", ticker: coin.ticker, cashCents };
      remember(lp, me, key, fp, result);
      return { result, lp, cash: new Map([[me, cashCents]]) };
    });
  }

  trade(session: AuthSessionView, key: string, input: TradeInput): Promise<TradeReply> {
    const fp = JSON.stringify(["trade", input.ticker, input.side, input.amount, input.min]);
    const tick = this.deps.tick();
    return this.deps.auth().commitLaunchpad<TradeReply>(session, ({ lp, self, ledgerOf, now }) => {
      const me = self.accountId;
      const replay = replayOf(lp, me, key, fp);
      if (replay) return { result: replay as TradeReply };
      const coin = lp.coins.find((c) => c.ticker === input.ticker);
      if (!coin) return { result: refuse("UNKNOWN_COIN", "No coin with that ticker.") };
      const creator = coin.creatorId === me ? self : ledgerOf(coin.creatorId);
      if (!creator) return { result: refuse("COIN_UNAVAILABLE", "This coin can't be traded right now.") };
      const held = lp.holdings[me]?.[coin.ticker] ?? 0;
      const cash = new Map<string, number>();
      let tokens: number, cents: number, fee: number, creatorFee: number, next: { x: number; sold: number };
      if (input.side === "buy") {
        if (input.amount > spendable(self)) return { result: refuse("CASH", "Not enough spendable cash.") };
        const q = quoteBuy(coin, input.amount);
        if (!q.ok) return { result: refuseQuote(q.why) };
        if (q.tokens < input.min) return { result: refuse("PRICE_MOVED", "The price moved past your 5% limit. Review again.") };
        if (coin.creatorId === me && held + q.tokens > LP.CREATOR_CAP) return { result: refuse("CREATOR_CAP", "A creator can hold at most 10% of the supply.") };
        ({ tokens, fee, creatorFee, next } = q);
        cents = input.amount;
        cash.set(me, self.cashCents - cents);
      } else {
        if (input.amount > held) return { result: refuse("HELD", "You can't sell more than you hold.") };
        const q = quoteSell(coin, input.amount);
        if (!q.ok) return { result: refuseQuote(q.why) };
        if (q.pay < input.min) return { result: refuse("PRICE_MOVED", "The price moved past your 5% limit. Review again.") };
        ({ fee, creatorFee, next } = q);
        tokens = input.amount;
        cents = q.pay;
        cash.set(me, self.cashCents + cents);
      }
      cash.set(coin.creatorId, (cash.get(coin.creatorId) ?? creator.cashCents) + creatorFee);
      coin.x = next.x;
      coin.sold = next.sold;
      // The tape must be read before the trade is on it: recordPoint starts a legacy coin's history from its tape.
      recordPoint(coin, { tick, atMs: now, side: input.side, tokens, cents, x: next.x, sold: next.sold });
      coin.tape.push({ tick, atMs: now, side: input.side, tokens, cents, creator: coin.creatorId === me });
      if (coin.tape.length > LP.TAPE_KEEP) coin.tape.splice(0, coin.tape.length - LP.TAPE_KEEP);
      const mine = (lp.holdings[me] ??= {}), cost = (lp.costs[me] ??= {});
      const after = held + (input.side === "buy" ? tokens : -tokens);
      // Cost basis: a buy adds what it cost (fee included); a sell removes the sold share of the cost, pro rata.
      const was = cost[coin.ticker] ?? 0;
      if (after > 0) {
        mine[coin.ticker] = after;
        cost[coin.ticker] = input.side === "buy" ? was + cents : was - Math.round((was * tokens) / held);
      } else {
        delete mine[coin.ticker];
        delete cost[coin.ticker];
      }
      if (Object.keys(mine).length === 0) { delete lp.holdings[me]; delete lp.costs[me]; }
      lp.sinkCents += fee - creatorFee;
      const result: TradeReply = { status: "accepted", ticker: coin.ticker, side: input.side, tokens, cents, fee, cashCents: cash.get(me)!, held: after };
      remember(lp, me, key, fp, result);
      return { result, lp, cash };
    });
  }
}

function refuseQuote(why: string): Refusal {
  if (why === "CURVE_FULL") return refuse("CURVE_FULL", "This coin's curve is nearly full; graduation is not in this build. Try a smaller buy.");
  if (why === "MIN") return refuse("MIN", "The smallest buy is $1.00.");
  return refuse("TOO_SMALL", "That trade is too small to fill.");
}

/** The first reply for this key, or a 409 when the key was used for a different request. */
function replayOf(lp: LpState, me: string, key: string, fp: string): unknown {
  const r = lp.receipts[me]?.find((x) => x.key === key);
  if (!r) return null;
  if (r.fp !== fp) throw new AuthError("IDEMPOTENCY_CONFLICT", "That idempotency key was used for a different request.", 409);
  return r.reply;
}

function remember(lp: LpState, me: string, key: string, fp: string, reply: unknown): void {
  const list = (lp.receipts[me] ??= []);
  list.push({ key, fp, reply });
  if (list.length > RECEIPTS_KEEP) list.splice(0, list.length - RECEIPTS_KEEP);
}
