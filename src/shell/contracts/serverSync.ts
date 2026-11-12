// Signed-in feed, network half: M1-05 quotes, M1-06 ledger and order door, M1-07 live candles and candle history,
// M1-09 Wire, M2-05 offline snapshot save, L4 listings. MockFeed loads it with a dynamic import, only when the feed is
// signed in (authoritativeQuotes). The guest first load never carries it (S1-20; docs/v1/LAUNCHPAD.md "Signed-in
// server-sync loading boundary"). The steps moved here from MockFeed unchanged. MockFeed keeps the channel transport,
// the bodies, the guest demo and every flag its eager paths read. Replies are parsed with the same strict parsers.
// Only type imports from mockFeed.ts: a runtime import would make the feed module shared with this chunk.
import type { Candle, CandleHistoryReq, CandleRes } from "./channels";
import type { Lot, MockFeed } from "./mockFeed";
import { CANDLE_REV_RE } from "./candleRev";
import { IntentNotSentOffline, IntentOutcomeUnknown, knownOffline } from "./network";
import { saveMeSnapshot } from "@/pwa/meSnapshot";
import { ASSETS, ASSET_BY_ID, WATCHLISTS } from "@/market/catalog";
import { adoptListed } from "@/market/listings";
import { parseMarketSnapshot, parseMinor } from "@/market/quoteSnapshot";
import { parseWireSnapshot, type WireSnapshot } from "@/market/wireSnapshot";
import { parseBrokerIntentReply, parseBrokerLedger, type BrokerLedgerView } from "@/market/brokerLedger";
import type { CoinRow } from "./channels";

export const ORDER_SEND_ATTEMPTS = 3;
export const ORDER_RETRY_MS = 300;
const quoteRead = () => fetch("/api/market", { cache: "no-store", headers: { accept: "application/json" } });

/** One signed-in feed's server steps and the state only they use. */
export class ServerSync {
  private quotePulling = false;
  /** A read was requested while one was already in flight (reconnect). Run it when this one settles. */
  private quotePullAgain = false;
  private candlePulls = new Set<string>();
  /** Bumped by every adopted order reply, so a ledger read that started before it cannot roll it back. */
  private ledgerEpoch = 0;
  private ledgerPulling = false;
  private ledgerPullAgain = false;
  private wireEpoch: string | null = null;
  private wireTick = -1;
  private wirePulling = false;
  private wirePullAgain = false;

  constructor(private readonly f: MockFeed) {}

  /**
   * Replace marks with one server snapshot. Does not draw the price RNG.
   * A newer tick settles session-local demo intents once. Those fills stay in this feed; nothing here writes the auth ledger.
   * The same tick re-emits so the channel watchdog stays live between price steps.
   */
  adoptAuthoritativeQuotes(raw: unknown): boolean {
    const snap = parseMarketSnapshot(raw);
    if (!snap) return false;
    const next = new Map<string, { last: number; prevClose: number; dayVol: number }>();
    for (const a of ASSETS) {
      const row = snap.quotes.rows[a.assetId];
      if (!row || row.chg === null) return false;
      const last = parseMinor(row.last, a.displayDecimals);
      const chg = parseMinor(row.chg, a.displayDecimals);
      if (last === null || chg === null || last <= 0) return false;
      const prevClose = last - chg;
      if (prevClose <= 0) return false;
      const dayVol = Number(row.vol);
      if (!Number.isSafeInteger(dayVol) || dayVol < 0) return false;
      next.set(a.assetId, { last, prevClose, dayVol });
    }
    const prevTick = this.f.tick;
    for (const [id, n] of next) {
      const s = this.f.assets.get(id)!;
      s.dir = n.last > s.last ? 1 : n.last < s.last ? -1 : 0;
      s.last = n.last;
      s.prevClose = n.prevClose;
      s.dayVol = n.dayVol;
    }
    this.f.tick = snap.tick;
    this.f.quotesAdopted = true;
    this.f.quotesOk(); // card 19: connection live again, backoff reset
    if (snap.fear !== undefined && snap.riskAppetite !== undefined) {
      this.f.fearIndex = snap.fear;
      this.f.riskAppetite = snap.riskAppetite;
    }
    if (snap.tick > prevTick) {
      this.f.settle();
      // A new server tick may have filled a working limit: re-read the ledger (M1-06).
      if ([...this.f.subs].some((s) => s.ch === "me")) void this.pullLedger();
      // M1-09: a new server tick may have published a story: re-read the Wire.
      if ([...this.f.subs].some((s) => s.ch === "news")) void this.pullWire();
    }
    this.f.emitTick();
    // First publication is a snap. emitTick only reaches subscribers that already have one.
    for (const sub of this.f.subs) {
      if (this.f.isQuoteChannel(sub.ch) && sub.sent === null && this.f.quoteReady(sub.ch)) this.f.sendSnap(sub);
      if (sub.ch === "me" && sub.sent === null && this.f.meReady()) this.f.sendSnap(sub);
    }
    // M1-07: each server read also refreshes the live bar of every open candles channel.
    for (const ch of new Set([...this.f.subs].map((x) => x.ch).filter((c) => c.startsWith("candles:")))) void this.pullServerCandle(ch);
    return true;
  }

  /** Signed-in: the server's bar at the adopted tick for one candles channel, with the server's candle revision
   *  (`x-candle-rev`); publishes them (snap or delta). Changes to older bars (a closed bar's last sample, a late save's
   *  volume) are not sent here: the chart that holds the bars fetches everything changed since the revision of its own
   *  bars (PriceChart), so a change counts as delivered only once it is installed. A failed or malformed read keeps the
   *  last bar (a long outage reads as stale through the quote watchdog). */
  async pullServerCandle(ch: string): Promise<void> {
    if (!this.f.authoritativeQuotes || !this.f.quotesAdopted || this.candlePulls.has(ch)) return;
    const [, assetId, res] = ch.split(":") as [string, string, CandleRes];
    if (!ASSET_BY_ID[assetId] || (res !== "tick" && res !== "hour" && res !== "day")) return;
    const span = res === "tick" ? 1 : res === "hour" ? 30 : 720;
    const t = this.f.tick - (this.f.tick % span);
    this.candlePulls.add(ch);
    try {
      const reply = await this.serverCandleChanges({ assetId, res, from: t, to: t });
      if (!reply) return;
      const list = reply.raw && typeof reply.raw === "object" ? (reply.raw as { bars?: unknown }).bars : null;
      const bar = Array.isArray(list) ? list[list.length - 1] : undefined;
      if (!isCandle(bar) || bar.t !== t) return;
      const prev = this.f.serverCandles.get(ch);
      const sameHistory = (reply.rev ?? "").split(".")[0] === (this.f.serverRevs.get(ch) ?? "").split(".")[0];
      // Within one server history an older reply never replaces a newer bar; a restarted server (new epoch) starts its
      // own clock and history, possibly at an earlier tick, and replaces the old one.
      if (prev && prev.t > bar.t && sameHistory) return;
      if (reply.rev !== null) this.f.serverRevs.set(ch, reply.rev);
      this.f.serverCandles.set(ch, bar);
      for (const sub of this.f.subs) {
        if (sub.ch !== ch) continue;
        if (sub.sent === null) { if (!sub.snapTimer) this.f.sendSnap(sub); continue; }
        this.f.delta(sub, false);
      }
    } catch {
      // keep the last bar
    } finally {
      this.candlePulls.delete(ch);
    }
  }

  /** Signed-in history door: GET /api/market/candles (server quote OHLC + executed volume). Raw JSON: history.ts parses it. */
  serverCandleHistory(req: CandleHistoryReq): Promise<unknown> {
    const q = new URLSearchParams({ assetId: req.assetId, res: req.res, from: String(req.from), to: String(req.to) });
    return fetch(`/api/market/candles?${q}`, { cache: "no-store", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null));
  }

  /** The same door, read with the reply's `x-candle-rev` (null when absent or malformed); `since` adds every other bar
   *  changed after that revision. The live pull uses it, and so does the chart catching its bars up. */
  serverCandleChanges(req: CandleHistoryReq, since?: number): Promise<{ raw: unknown; rev: string | null } | null> {
    const q = new URLSearchParams({ assetId: req.assetId, res: req.res, from: String(req.from), to: String(req.to) });
    if (since !== undefined) q.set("since", String(since));
    return fetch(`/api/market/candles?${q}`, { cache: "no-store", headers: { accept: "application/json" } }).then(async (r) => {
      if (!r.ok) return null;
      const h = r.headers.get("x-candle-rev") ?? "";
      return { raw: await r.json(), rev: CANDLE_REV_RE.test(h) ? h : null };
    });
  }

  /** M1-09 signed-in: read the server's Wire. A failed first read errors the news channel (Retry, or the next server
   *  tick reads again); after one good read the last adopted Wire stays and a long outage reads as stale. */
  async pullWire(): Promise<void> {
    if (!this.f.authoritativeQuotes) return;
    if (this.wirePulling) { this.wirePullAgain = true; return; }
    this.wirePulling = true;
    try {
      do {
        this.wirePullAgain = false;
        let v: WireSnapshot | null = null;
        try {
          const res = await fetch("/api/wire", { cache: "no-store", headers: { accept: "application/json" } });
          v = res.ok ? parseWireSnapshot(await res.json()) : null;
        } catch { v = null; }
        if (v) this.adoptWire(v);
        else if (!this.f.wireAdopted) for (const sub of this.f.subs) if (sub.ch === "news" && sub.sent === null) this.f.send(sub, { t: "err", ch: "news", code: "INTERNAL" });
      } while (this.wirePullAgain);
    } finally {
      this.wirePulling = false;
    }
  }

  /** Replace news with one server Wire reply. Within one epoch an older reply is dropped; a new epoch (restarted
   *  server) replaces the list with a snap. Nothing here moves a price: the server did, once, at the story's tick. */
  adoptWire(v: WireSnapshot): boolean {
    if (!this.f.authoritativeQuotes) return false;
    if (this.wireEpoch === v.epoch && v.tick < this.wireTick) return false;
    const newEpoch = this.wireEpoch !== null && this.wireEpoch !== v.epoch;
    this.f.news = v.items;
    this.wireEpoch = v.epoch;
    this.wireTick = v.tick;
    this.f.wireAdopted = true;
    for (const sub of this.f.subs) {
      if (sub.ch !== "news") continue;
      if (sub.sent === null || newEpoch) { this.f.sendSnap(sub); continue; }
      this.f.delta(sub, false);
    }
    return true;
  }

  /**
   * Replace cash, lots, working orders, fills and intents with one server ledger (M1-06). Nothing here prices or fills:
   * the server did. Marks for `me` still come from the adopted server book.
   */
  adoptLedger(raw: unknown): boolean {
    if (!this.f.authoritativeQuotes) return false;
    const v = parseBrokerLedger(raw);
    if (!v) return false;
    return this.applyLedger(v);
  }

  applyLedger(v: BrokerLedgerView): boolean {
    const lots = new Map<string, Lot>();
    for (const p of Object.values(v.positions)) {
      const a = ASSET_BY_ID[p.assetId];
      const qty = Number(p.qty), avg = a ? parseMinor(p.avgCost, a.displayDecimals) : null;
      if (!a || !Number.isSafeInteger(qty) || qty <= 0 || avg === null) return false;
      lots.set(p.assetId, { qty, avgCost: avg });
    }
    this.f.cash = v.cashCents;
    this.f.reservedCash = v.reservedCashCents;
    this.f.lots = lots;
    this.f.orders = { ...v.orders };
    this.f.fills = [...v.fills];
    this.f.intents = [...v.intents];
    this.f.coins = v.coins as CoinRow[]; // a fresh parsed copy, never mutated
    this.f.ledgerAdopted = true;
    if (this.f.snapshotAccount) void saveMeSnapshot(this.f.snapshotAccount, v); // refused unless still the current account
    for (const sub of this.f.subs) {
      if (sub.ch !== "me") continue;
      if (sub.sent === null) { if (this.f.meReady()) this.f.sendSnap(sub); continue; }
      this.f.delta(sub, true);
    }
    return true;
  }

  async pullLedger(): Promise<void> {
    if (!this.f.authoritativeQuotes) return;
    if (this.ledgerPulling) { this.ledgerPullAgain = true; return; }
    this.ledgerPulling = true;
    try {
      do {
        this.ledgerPullAgain = false;
        const epoch = this.ledgerEpoch;
        try {
          const res = await fetch("/api/broker/me", { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } });
          if (res.status === 401 || res.status === 403 || res.status === 409) { this.f.failMe(); return; }
          // M1-08: a failed first read says so (error + Retry) instead of a skeleton that never ends; the next server
          // tick (or Retry) reads again and its snap replaces the error. An adopted ledger is kept as it is.
          if (!res.ok) { this.f.failMe(); continue; }
          const v = parseBrokerLedger(await res.json());
          if (!v) this.f.failMe();
          else if (epoch === this.ledgerEpoch) this.applyLedger(v);
        } catch {
          this.f.failMe(); // network / unreadable reply: same as above; the last adopted ledger stays
        }
      } while (this.ledgerPullAgain);
    } finally {
      this.ledgerPulling = false;
    }
  }

  /** Read-only calculation over the own ledger and finite book; no intent or mutation. */
  async previewListed(draft: import("./channels").OrderDraft): Promise<import("./channels").PreviewRes> {
    if (knownOffline()) throw new IntentNotSentOffline();
    const r = await fetch("/api/broker/preview", { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ draft }) });
    if (!r.ok) throw new IntentNotSentOffline();
    return (await import("./schema")).previewRes(await r.json(), "preview");
  }


  /** POST one order intent with one key; retried only on network / 5xx failures, with the same key.
   *  M2-05: never sent while the browser reports offline (IntentNotSentOffline). Once a request may have left
   *  (a network error) and the browser then reports offline, retrying stops and the outcome is unknown
   *  (IntentOutcomeUnknown): the key and the `me` sync settle it; nothing is re-sent on reconnect. */

  async sendIntent(path: string, body: Record<string, unknown>): Promise<string> {
    let maybeSent = false;
    for (let attempt = 1; attempt <= ORDER_SEND_ATTEMPTS; attempt++) {
      if (knownOffline()) throw maybeSent ? new IntentOutcomeUnknown() : new IntentNotSentOffline();
      let res: Response;
      try {
        res = await fetch(path, {
          method: "POST", cache: "no-store", credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
        });
      } catch {
        maybeSent = true;
        if (attempt < ORDER_SEND_ATTEMPTS) { await new Promise((r) => setTimeout(r, ORDER_RETRY_MS * attempt)); continue; }
        throw new IntentOutcomeUnknown();
      }
      if (res.status >= 500 && attempt < ORDER_SEND_ATTEMPTS) { await new Promise((r) => setTimeout(r, ORDER_RETRY_MS * attempt)); continue; }
      if (!res.ok) return "";
      let reply;
      try { reply = parseBrokerIntentReply(await res.json()); } catch { reply = null; }
      if (!reply) return "";
      this.ledgerEpoch += 1;
      this.applyLedger(reply.ledger);
      return reply.intentId;
    }
    return "";
  }

  /**
   * One /api/market read (`started`: the feed's first read, begun before this module arrived).
   * `followUp` is only for reconnect: a read is already in flight, so run one more when it settles, and do not
   * adopt that in-flight body at all. Its tick can already be ahead of the last adopted book and still behind
   * the server (held across the outage, released after the clock has stepped). A routine poll that arrives
   * during a read does not pass `followUp` and is dropped, so a slow read is still adopted.
   */
  async pullServerQuotes(started?: Promise<Response>, opts?: { followUp?: boolean }): Promise<void> {
    if (!this.f.authoritativeQuotes) return;
    if (this.quotePulling) {
      if (opts?.followUp) this.quotePullAgain = true;
      return;
    }
    this.quotePulling = true;
    try {
      let pending = started;
      do {
        this.quotePullAgain = false;
        try {
          const res = await (pending ?? quoteRead());
          pending = undefined;
          const raw = res.ok ? await res.json() : null;
          const newerRead = this.quotePullAgain;
          if (!res.ok || raw == null) { this.f.quotesFailed(); continue; }
          if (newerRead) continue;
          // L4: coins listed at graduation join the catalog before the read's quotes are adopted. A ledger read before
          // that could not be valued and is read again.
          if (raw.listed && !adoptListed(raw, this.f, ASSETS, ASSET_BY_ID, WATCHLISTS)) { this.f.quotesFailed(); continue; }
          if (!this.adoptAuthoritativeQuotes(raw)) this.f.quotesFailed();
        } catch {
          this.f.quotesFailed();
        }
      } while (this.quotePullAgain);
    } finally {
      this.quotePulling = false;
    }
  }
}

const DEC_RE = /^\d{1,15}(\.\d{1,8})?$/;
function isCandle(v: unknown): v is Candle {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return Number.isSafeInteger(c.t) && (c.t as number) >= 0
    && [c.o, c.h, c.l, c.c, c.v].every((x) => typeof x === "string" && DEC_RE.test(x));
}
