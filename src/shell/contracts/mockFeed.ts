// 17B CH-00 deterministic mock server for the 17B channels and `req` ops (stands in for the 19C gateway).
// Same seed + same scenario + same number of ticks => byte-identical frames. It emits `snap` then per-tick `delta`
// frames (19 §2.4) as plain JSON, so the client parses them at the boundary exactly as it will real frames.
// All arithmetic here is server-side mock arithmetic on integer minor units (G1 forbids it in the UI, not here).
import type {
  AssetDetail, BoardBody, BookBody, Candle, CandleHistoryReq, CandleHistoryRes, CandleRes, CandlesBody, ChannelName,
  DepthLevel, FilingsBody, IntentResult, MeTradingBody, MyFill, NewsBody, OpenOrder, OrderDraft, Position, PreviewRes,
  ServerFrame, TapeBody, TapePrint, TickerBody, TickerRow, TradingState, WireItem,
} from "./channels";
import { diffOps } from "./delta";
import { ASSETS, ASSET_BY_ID, WATCHLISTS, type AssetFixture } from "./fixtures/assets";
import { MDOL_BALANCE, NW_STATS, POSITIONS, RESTRICTED, START_NW_MINOR } from "./fixtures/me";
import { BOARD_ROWS, FILINGS, NEWS, NEWS_EVERY, NEWS_ROTATION } from "./fixtures/news";
import { submitIntent } from "../intentLog";

// Build-time gate (QUAY_HOOKS is always defined as "1"/"0" by next.config `env`, the single source of truth).
// Keep it a MODULE-LOCAL const: an exported const read from another module is emitted as a runtime property read
// on that module's exports once the module is shared by two chunks, and the gated branch then ships (see PR notes).
const MOCK_HOOKS = process.env.QUAY_HOOKS === "1";

export const FEED_TICK_MS = 5000; // spec: 5,000 ms tick; tests use a fake clock at 1,000 ms
export const SNAP_DELAY_MS = 40; // mock latency before the first snap (state `loading` until then)
export const START_TICK = 38 * 720 + 340;
export const TAPE_KEEP = 200; // keepLast 200 [P]
export const RING_KEEP = 50; // me.fills / me.intents (Q4)
export const NEWS_KEEP = 100; // [P]

export type FeedMode = "live" | "stale" | "denied" | "error" | "loading";
export interface Scenario { seed: number; feed: FeedMode; halt: string | null; thin: string | null; tier: "free" | "terminal"; empty: boolean; reject: string | null;
  /** `?nw=` pin (QUAY_HOOKS): `me.nw` stays exactly this string (cash absorbs mark moves), matching the shell's override. */
  nw: string | null;
  /** `?pledge=HALC:40` (QUAY_HOOKS): that held position reports pledgedQty 40 (PF-B badge); otherwise every pledgedQty is "0". */
  pledge: { assetId: string; qty: number } | null }
export const DEFAULT_SCENARIO: Scenario = { seed: 17, feed: "live", halt: null, thin: null, tier: "free", empty: false, reject: null, nw: null, pledge: null };

/**
 * Scenario from the URL (`?feed=stale|denied|error|loading&halt=HALC&thin=HALC&tier=terminal&empty=1&reject=CODE&seed=N&nw=D&pledge=ID:QTY`).
 * Gated at build time: without QUAY_HOOKS the overrides (and their names) are compiled out.
 */
export function scenarioFromQuery(q: URLSearchParams): Scenario {
  if (!MOCK_HOOKS) return DEFAULT_SCENARIO;
  const feed = q.get("feed");
  const asset = (k: string) => { const v = q.get(k); return v && ASSET_BY_ID[v] ? v : null; };
  const seed = Number(q.get("seed"));
  const reject = q.get("reject");
  const nw = q.get("nw");
  const pledge = /^([A-Z0-9]{1,12}):(\d{1,9})$/.exec(q.get("pledge") ?? "");
  return {
    seed: Number.isSafeInteger(seed) && seed > 0 ? seed : DEFAULT_SCENARIO.seed,
    feed: feed === "stale" || feed === "denied" || feed === "error" || feed === "loading" ? feed : "live",
    halt: asset("halt"), thin: asset("thin"),
    tier: q.get("tier") === "terminal" ? "terminal" : "free",
    empty: q.get("empty") === "1",
    reject: reject && /^[A-Z][A-Z0-9_]{2,63}$/.test(reject) ? reject : null,
    nw: nw && /^\d{1,13}(\.\d{1,2})?$/.test(nw) ? nw : null,
    pledge: pledge && ASSET_BY_ID[pledge[1]!] && Number(pledge[2]) > 0 ? { assetId: pledge[1]!, qty: Number(pledge[2]) } : null,
  };
}

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer minor units -> decimal string with `dp` places (G2). */
export function fmt(minor: number, dp: number): string {
  const neg = minor < 0;
  const s = String(Math.abs(Math.round(minor))).padStart(dp + 1, "0");
  const out = dp ? `${s.slice(0, -dp)}.${s.slice(-dp)}` : s;
  return neg && /[1-9]/.test(out) ? `-${out}` : out;
}

interface AssetState { last: number; prevClose: number; dayVol: number; prints: TapePrint[]; lastQty: number; dir: -1 | 0 | 1 }
interface Lot { qty: number; avgCost: number }

const FEE_BP: Record<OrderDraft["type"], number> = { market: 10, limit: 6, stop: 10, stop_limit: 8 }; // fixed table
const IMPACT_BP = (qty: number, lot: number) => (lot <= 0 ? 0 : qty <= lot ? 1 : qty <= lot * 5 ? 4 : qty <= lot * 20 ? 12 : 30); // fixed table

type Listener = (raw: unknown) => void;
interface Sub { ch: ChannelName; fn: Listener; seq: number; sent: unknown; count: number; snapTimer: ReturnType<typeof setTimeout> | null }

export interface FeedOptions { tickMs?: number; startTick?: number; autoStart?: boolean }

export class MockFeed {
  readonly scenario: Scenario;
  readonly tickMs: number;
  tick: number;
  private rand: () => number;
  private assets = new Map<string, AssetState>();
  private cash: number;
  private lots = new Map<string, Lot>();
  private orders: Record<string, OpenOrder> = {};
  private fills: MyFill[] = [];
  private intents: IntentResult[] = [];
  private news: WireItem[];
  private pending: { intentId: string; draft: OrderDraft }[] = [];
  private nextId = 1;
  private subs = new Set<Sub>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private autoStart: boolean;

  constructor(scenario: Partial<Scenario> = {}, opts: FeedOptions = {}) {
    this.scenario = { ...DEFAULT_SCENARIO, ...scenario };
    this.tickMs = opts.tickMs ?? FEED_TICK_MS;
    this.tick = opts.startTick ?? START_TICK;
    this.autoStart = opts.autoStart ?? true;
    this.rand = rng(this.scenario.seed);
    for (const a of ASSETS) {
      const prevClose = Math.round(a.base * (1 + (this.rand() - 0.5) * 0.02));
      this.assets.set(a.assetId, { last: a.base, prevClose, dayVol: a.lot * 40, prints: [], lastQty: 0, dir: 0 });
    }
    if (!this.scenario.empty) for (const p of POSITIONS) this.lots.set(p.assetId, { qty: p.qty, avgCost: p.avgCostMinor });
    // One NW source (fixtures/me START_NW): opening cash is whatever makes nw = START_NW at the opening marks.
    this.cash = START_NW_MINOR - this.heldMinor();
    this.news = this.scenario.empty ? [] : NEWS.map((n) => this.tierNews(n));
  }

  // ---- world ----
  private tradingState(id: string): TradingState { return this.scenario.halt === id ? "HALTED" : "CONTINUOUS"; }

  /** Advance one tick: move prices, print the tape, settle intents from the previous tick, emit deltas. */
  advance(): void {
    this.tick += 1;
    for (const a of ASSETS) {
      const s = this.assets.get(a.assetId)!;
      const r = this.rand(), rq = this.rand();
      if (this.tradingState(a.assetId) !== "CONTINUOUS") { s.dir = 0; s.lastQty = 0; continue; }
      const step = Math.round(((r - 0.5) * 2 * a.volBp * s.last) / 10_000);
      s.dir = step > 0 ? 1 : step < 0 ? -1 : 0;
      s.last = Math.max(1, s.last + step);
      s.lastQty = Math.round(a.lot * (0.5 + rq));
      s.dayVol += s.lastQty;
      if (a.lot > 0) {
        s.prints = [...s.prints, <TapePrint>{ assetId: a.assetId, tick: this.tick, price: fmt(s.last, a.displayDecimals), qty: String(s.lastQty), aggressor: s.dir > 0 ? "BUY" : s.dir < 0 ? "SELL" : "NONE", block: s.lastQty > a.lot * 1.4, deferred: false }].slice(-TAPE_KEEP);
      }
    }
    this.settle();
    if (!this.scenario.empty && (this.tick - START_TICK) % NEWS_EVERY === 0) {
      const base = NEWS_ROTATION[Math.floor((this.tick - START_TICK) / NEWS_EVERY) % NEWS_ROTATION.length]!;
      this.news = [...this.news, this.tierNews({ ...base, id: `n-t${this.tick}`, tick: this.tick })].slice(-NEWS_KEEP);
    }
    this.emitTick();
  }

  private tierNews(n: WireItem): WireItem {
    // Q6: pricedInBand only for Terminal; [P] fixed band per item in the mock.
    if (this.scenario.tier !== "terminal" || n.kind === "FILING") return n;
    return { ...n, pricedInBand: n.breaking ? "early" : "mid", pricedInAsOf: this.tick }; // as of the mock clock now, so "as of" reads like the top bar
  }

  private settle(): void {
    const due = this.pending;
    this.pending = [];
    for (const { intentId, draft } of due) {
      const a = ASSET_BY_ID[draft.assetId];
      // Halt (Quant E-96 (3), Producer E-98 (1)): a halted asset still takes orders; a market day order is accepted with
      // no fill and waits for the reopen auction (QUEUED_AUCTION). Sell beyond the holding (E-96 (4)): rejected whole,
      // MKT_NO_LOCATE (a cash-account ticket has no locate); never a negative lot.
      const reject = this.scenario.reject ?? (!a ? "MKT_UNKNOWN_ASSET" : this.oversells(draft) ? "MKT_NO_LOCATE" : null);
      if (reject || !a) {
        this.intents = [...this.intents, <IntentResult>{ intentId, tick: this.tick, status: "REJECTED", rejectCode: reject ?? "MKT_UNKNOWN_ASSET" }].slice(-RING_KEEP);
        continue;
      }
      const qty = Number(draft.qty);
      const orderId = `o-${this.nextId++}`;
      if (draft.type !== "market") {
        this.orders = { ...this.orders, [orderId]: { orderId, assetId: a.assetId, side: draft.side, type: draft.type, qty: draft.qty, filled: "0", ...(draft.limit ? { limit: draft.limit } : {}), ...(draft.stop ? { stop: draft.stop } : {}), tif: draft.tif, status: "WORKING", placedTick: this.tick, avgPrice: fmt(0, a.displayDecimals) } };
        this.intents = [...this.intents, <IntentResult>{ intentId, tick: this.tick, status: "ACCEPTED", effects: [`order:${orderId}`] }].slice(-RING_KEEP);
        continue;
      }
      if (this.tradingState(a.assetId) === "HALTED") {
        this.orders = { ...this.orders, [orderId]: { orderId, assetId: a.assetId, side: draft.side, type: draft.type, qty: draft.qty, filled: "0", tif: draft.tif, status: "QUEUED_AUCTION", placedTick: this.tick, avgPrice: fmt(0, a.displayDecimals) } };
        this.intents = [...this.intents, <IntentResult>{ intentId, tick: this.tick, status: "ACCEPTED", effects: [`order:${orderId}`] }].slice(-RING_KEEP);
        continue;
      }
      const s = this.assets.get(a.assetId)!;
      const px = s.last;
      const fee = Math.round((px * qty * FEE_BP.market) / 10_000);
      const signed = draft.side === "BUY" ? qty : -qty;
      const lot = this.lots.get(a.assetId) ?? { qty: 0, avgCost: 0 };
      const nq = lot.qty + signed;
      const avg = nq === 0 ? 0 : draft.side === "BUY" && lot.qty >= 0 ? Math.round((lot.avgCost * lot.qty + px * qty) / nq) : lot.avgCost;
      if (nq === 0) this.lots.delete(a.assetId); else this.lots.set(a.assetId, { qty: nq, avgCost: avg });
      this.cash -= signed * px + fee;
      const fillId = `x-${this.nextId++}`;
      this.fills = [...this.fills, <MyFill>{ fillId, tick: this.tick, assetId: a.assetId, orderId, side: draft.side, qty: draft.qty, price: fmt(px, a.displayDecimals), fee: fmt(fee, 2), feeCcy: a.ccy, liquidity: "TAKER", counterpartyKind: "NPC" }].slice(-RING_KEEP);
      this.intents = [...this.intents, <IntentResult>{ intentId, tick: this.tick, status: "ACCEPTED", effects: [`fill:${fillId}`] }].slice(-RING_KEEP);
    }
  }

  // ---- bodies (the full server state of a channel at the current tick) ----
  body(ch: ChannelName): unknown {
    const [head, id, res] = ch.split(":") as [string, string?, string?];
    switch (head) {
      case "ticker": return this.tickerBody(id!);
      case "book": return this.bookBody(id!);
      case "tape": return this.tapeBody(id!);
      case "candles": return this.candlesBody(id!, res as CandleRes);
      case "me": return this.meBody();
      case "news": return { items: this.news } satisfies NewsBody;
      case "filings": return { items: this.scenario.empty ? [] : [...FILINGS] } satisfies FilingsBody;
      default: return { boardId: id!, scope: res!, rows: BOARD_ROWS.map((r) => ({ ...r })) } satisfies BoardBody;
    }
  }

  private tickerRow(a: AssetFixture): TickerRow {
    const s = this.assets.get(a.assetId)!;
    const chg = s.last - s.prevClose;
    const state = this.tradingState(a.assetId);
    return {
      assetId: a.assetId, last: fmt(s.last, a.displayDecimals), chg: fmt(chg, a.displayDecimals),
      chgPct: fmt(Math.round((chg * 10_000) / s.prevClose), 2), vol: String(s.dayVol), state, halted: state === "HALTED",
    };
  }
  private tickerBody(listId: string): TickerBody {
    const ids = WATCHLISTS[listId] ?? [];
    return { listId, rows: Object.fromEntries(ids.map((id) => [id, this.tickerRow(ASSET_BY_ID[id]!)])) };
  }
  private bookBody(assetId: string): BookBody {
    const a = ASSET_BY_ID[assetId], s = this.assets.get(assetId);
    if (!a || !s) return { assetId, tick: this.tick, bids: [], asks: [], last: null };
    const thin = this.scenario.thin === assetId;
    const n = thin ? 1 : this.scenario.tier === "terminal" ? 10 : 3;
    const r = rng(this.scenario.seed * 7919 + this.tick * 31 + assetId.length);
    const tickSize = Math.max(1, Math.round(s.last / 2000));
    const lvl = (side: 1 | -1, i: number): DepthLevel => ({ price: fmt(s.last + side * tickSize * (i + 1), a.displayDecimals), qty: String(thin ? 5 + i : Math.round(a.lot * (0.3 + r() * 2))) });
    const halted = this.tradingState(assetId) === "HALTED";
    return {
      assetId, tick: this.tick,
      bids: halted ? [] : Array.from({ length: n }, (_, i) => lvl(-1, i)),
      asks: halted ? [] : Array.from({ length: n }, (_, i) => lvl(1, i)),
      last: s.lastQty > 0 ? { assetId, tick: this.tick, kind: "TICK", price: fmt(s.last, a.displayDecimals), qty: String(s.lastQty), imbalance: "0", aggressorSide: s.dir > 0 ? "BUY" : s.dir < 0 ? "SELL" : "NONE", bandClamped: false, fillsCount: 1 + Math.floor(s.lastQty / 100) } : null,
    };
  }
  private tapeBody(assetId: string): TapeBody {
    return { assetId, prints: this.assets.get(assetId)?.prints ?? [] };
  }
  private candlesBody(assetId: string, res: CandleRes): CandlesBody {
    const a = ASSET_BY_ID[assetId], s = this.assets.get(assetId);
    const span = res === "tick" ? 1 : res === "hour" ? 30 : 720;
    const t = this.tick - (this.tick % span);
    if (!a || !s) return { assetId, res, live: { t, o: "0", h: "0", l: "0", c: "0", v: "0" } };
    const prints = s.prints.filter((p) => p.tick >= t);
    const px = prints.map((p) => Math.round(Number(p.price) * 10 ** a.displayDecimals));
    const o = px[0] ?? s.last;
    return { assetId, res, live: { t, o: fmt(o, a.displayDecimals), h: fmt(Math.max(o, s.last, ...px), a.displayDecimals), l: fmt(Math.min(o, s.last, ...px), a.displayDecimals), c: fmt(s.last, a.displayDecimals), v: String(prints.reduce((n, p) => n + Number(p.qty), 0)) } };
  }
  private heldMinor(): number {
    let held = 0;
    for (const [id, l] of this.lots) held += this.assets.get(id)!.last * l.qty;
    return held;
  }
  /** `?nw=` pin: the FDL cash that keeps nw at the pinned value for the current marks. */
  private pinnedNwMinor(): number | null {
    const v = this.scenario.nw;
    if (v === null) return null;
    const [i, f = ""] = v.split(".");
    return Number(i) * 100 + Number(f.padEnd(2, "0"));
  }
  private meBody(): MeTradingBody {
    const held = this.heldMinor(), pin = this.pinnedNwMinor();
    const cash = pin === null ? this.cash : pin - held;
    const nw = cash + held;
    const positions: Record<string, Position> = {};
    for (const [id, l] of this.lots) {
      const a = ASSET_BY_ID[id]!, mark = this.assets.get(id)!.last;
      // Proposed PF-B fields (server side, so the client never computes): pnlPct = upl / cost, weightPct = value / nw,
      // both percent units with 1 dp, integer maths on minor units.
      const pnlPct = l.avgCost ? fmt(((mark - l.avgCost) * 1000) / l.avgCost, 1) : "0.0";
      const weightPct = nw > 0 ? fmt((mark * l.qty * 1000) / nw, 1) : "0.0";
      positions[id] = { assetId: id, qty: String(l.qty), avgCost: fmt(l.avgCost, a.displayDecimals), mark: fmt(mark, a.displayDecimals), value: fmt(mark * l.qty, 2), upl: fmt((mark - l.avgCost) * l.qty, 2), pledgedQty: this.scenario.pledge?.assetId === id ? String(Math.min(this.scenario.pledge.qty, l.qty)) : "0", lentQty: "0", pnlPct, weightPct };
    }
    const empty = this.scenario.empty;
    // Restricted buckets live inside the FDL balance (so inside nw); untilRealMs = real ms remaining (5 s per tick),
    // and a bucket leaves the list once released (its cash stays in FDL). `?empty=1` is a new player: FDL only.
    const restricted = empty ? [] : RESTRICTED.flatMap((r) => {
      const left = r.releaseTick === null ? null : (r.releaseTick - this.tick) * FEED_TICK_MS;
      return left !== null && left <= 0 ? [] : [{ reason: r.reason, amount: fmt(r.amountMinor, 2), untilRealMs: left }];
    });
    return {
      balances: empty ? { FDL: fmt(cash, 2) } : { FDL: fmt(cash, 2), MDOL: MDOL_BALANCE },
      nw: fmt(nw, 2), nwi: fmt(Math.round((nw * 10_000) / START_NW_MINOR), 4), restricted,
      positions, orders: this.orders, fills: this.fills, margin: null, holds: {}, intents: this.intents, alerts: [],
      ...(empty ? {} : { nwStats: { ...NW_STATS } }),
    };
  }

  // ---- channel transport ----
  /** Subscribe to a channel. Frames are delivered as plain JSON (a wire copy), never shared objects. */
  subscribe(ch: ChannelName, fn: Listener): () => void {
    const sub: Sub = { ch, fn, seq: 0, sent: null, count: 0, snapTimer: null };
    this.subs.add(sub);
    if (this.autoStart) this.start();
    const mode = this.scenario.feed;
    if (mode !== "loading") sub.snapTimer = setTimeout(() => {
      sub.snapTimer = null;
      if (mode === "denied") return this.send(sub, { t: "err", ch, code: "CHANNEL_DENIED" });
      if (mode === "error") return this.send(sub, { t: "err", ch, code: "INTERNAL" });
      this.sendSnap(sub);
    }, SNAP_DELAY_MS);
    return () => {
      if (sub.snapTimer) clearTimeout(sub.snapTimer);
      this.subs.delete(sub);
      if (this.subs.size === 0) this.stop();
    };
  }
  /** Client asks for a fresh snap (seq gap or unappliable delta; 19 Rule 3.8.8). */
  resync(ch: ChannelName): void {
    for (const s of this.subs) if (s.ch === ch && s.sent !== null) this.sendSnap(s);
  }
  private sendSnap(sub: Sub) {
    const body = this.body(sub.ch);
    sub.sent = body;
    this.send(sub, { t: "snap", ch: sub.ch, seq: ++sub.seq, tick: this.tick, body });
  }
  private send(sub: Sub, f: ServerFrame) { sub.fn(JSON.parse(JSON.stringify(f))); }

  private emitTick() {
    for (const sub of this.subs) {
      if (sub.sent === null) continue; // no snap yet (loading / denied / error)
      sub.count += 1;
      if (this.scenario.feed === "stale") {
        // Backpressure script: 2 ticks live, 3 ticks missed (=> stale after 2), then a fresh snap (=> live).
        const phase = sub.count % 6;
        if (phase >= 3) continue;
        if (phase === 0) { this.sendSnap(sub); continue; }
      }
      const body = this.body(sub.ch);
      const ops = diffOps(sub.sent, body, RINGS);
      sub.sent = body;
      this.send(sub, { t: "delta", ch: sub.ch, seq: ++sub.seq, tick: this.tick, ops });
    }
  }

  start(): void { if (!this.timer) this.timer = setInterval(() => this.advance(), this.tickMs); }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  // ---- req ops (19 Rule 3.8.5) and HTTP ----
  /** intent.preview: a fixed fee/impact table against the mock's committed state, never UI state (Q14). */
  preview(draft: OrderDraft): PreviewRes {
    const a = ASSET_BY_ID[draft.assetId];
    const s = a && this.assets.get(a.assetId);
    const qty = Number(draft.qty);
    // Halted stays valid: the preview reads only N-1 public data (Quant E-96 (3)). A sell beyond the holding is invalid.
    const wellFormed = !!a && !!s && Number.isSafeInteger(qty) && qty > 0;
    const valid = wellFormed && !this.oversells(draft);
    const dp = a?.displayDecimals ?? 2;
    const px = draft.type === "limit" || draft.type === "stop_limit" ? Math.round(Number(draft.limit ?? 0) * 10 ** dp) : (s?.last ?? 0);
    const impactBp = valid ? IMPACT_BP(qty, a!.lot) : 0;
    const impact = Math.round((px * qty * impactBp) / 10_000);
    const fee = valid ? Math.round((px * qty * FEE_BP[draft.type]) / 10_000) : 0;
    const gross = valid ? px * qty : 0;
    const total = gross + (draft.side === "BUY" ? fee + impact : -(fee + impact));
    return {
      price: fmt(px, dp), estFill: fmt(valid ? px + (draft.side === "BUY" ? 1 : -1) * Math.round((px * impactBp) / 10_000) : px, dp), fee: fmt(fee, 2), valid,
      ...(valid ? {} : { reasonCode: !a ? "MKT_UNKNOWN_ASSET" : !wellFormed ? "MKT_BAD_QTY" : "MKT_NO_LOCATE" }),
      buyingPowerAfter: fmt(this.cash - (draft.side === "BUY" ? total : -total), 2), impactBp: String(impactBp), impactMoney: fmt(impact, 2), total: fmt(total, 2),
      firstTradeCapRemaining: null, computedAtTick: this.tick,
    };
  }
  assetDetail(assetId: string): AssetDetail | null {
    const a = ASSET_BY_ID[assetId];
    if (!a) return null;
    const { base: _b, volBp: _v, lot: _l, ...pub } = a;
    void _b; void _v; void _l;
    return { ...pub, tradingState: this.tradingState(assetId) };
  }
  /** GET /api/v1/history/candles: deterministic per (seed, asset, res, range); ≤ 5,000 bars per call. */
  candleHistory(req: CandleHistoryReq): CandleHistoryRes {
    const a = ASSET_BY_ID[req.assetId];
    if (!a || req.to < req.from) return { bars: [] };
    const span = req.res === "tick" ? 1 : req.res === "hour" ? 30 : 720;
    const first = req.from - (((req.from % span) + span) % span);
    const bars: Candle[] = [];
    const r = rng(this.scenario.seed * 104729 + a.base);
    let px = a.base;
    for (let t = first; t <= req.to && bars.length < 5000; t += span) {
      const o = px;
      const move = Math.round(((r() - 0.5) * 2 * a.volBp * Math.sqrt(span) * px) / 10_000);
      const c = Math.max(1, o + move);
      const h = Math.max(o, c) + Math.round(r() * a.volBp * px / 20_000), l = Math.max(1, Math.min(o, c) - Math.round(r() * a.volBp * px / 20_000));
      bars.push({ t, o: fmt(o, a.displayDecimals), h: fmt(h, a.displayDecimals), l: fmt(l, a.displayDecimals), c: fmt(c, a.displayDecimals), v: String(Math.round(a.lot * span * (0.5 + r()))) });
      px = c;
    }
    return { bars };
  }
  /** A SELL for more than the account holds (E-96 (4)): a short sale of the excess, which this mock never allows. */
  private oversells(draft: OrderDraft): boolean {
    return draft.side === "SELL" && Number(draft.qty) > (this.lots.get(draft.assetId)?.qty ?? 0);
  }
  /** Place an order intent: logged to the shell intent log; the IntentResult (+ MyFill) lands on `me` next tick. */
  submit(draft: OrderDraft): string {
    const intentId = `i-${this.nextId++}`;
    const payload: Record<string, string> = { intentId, assetId: draft.assetId, side: draft.side, type: draft.type, qty: draft.qty, tif: draft.tif };
    if (draft.limit) payload.limit = draft.limit;
    if (draft.stop) payload.stop = draft.stop;
    submitIntent({ kind: "mkt.order.place", payload });
    this.pending.push({ intentId, draft });
    return intentId;
  }
}

/** Append-only rings (Q4): diffed to `ins` + `trim`. */
const RINGS: ReadonlySet<string> = new Set(["/prints", "/fills", "/intents", "/alerts", "/items"]);
