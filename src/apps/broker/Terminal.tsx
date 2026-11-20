"use client";
// The trading terminal: a market list, one big chart with drawing and indicator tools, and an order ticket.
// Every price is the sim's (/api/sim/history and the view); every order goes through act(), stops and standing limits
// included: the sim holds them and fires them on the price whether or not this screen is open.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { act, symbolOf, useSimSnap, type ActNote, type SimView } from "@/shell/simSession";
import { moneyFromCents, presentNote } from "@/components/ui/format";
import { plainCopy } from "@/components/market/copy";
import type { ChartLine, ChartMark, Studies } from "@/components/market/TerminalChart";
import {
  RANGES, TFS, TOOLS, candleRealSeconds, fetchList, instrOf, isIntraday, isTf, loadDrawings, loadPref, priceText, realText, saveDrawings, savePref, volText,
  type Drawing, type ListRow, type RangeId, type Series, type Tf, type Tool,
} from "@/components/market/terminalApi";
import { useBars } from "@/components/market/useBars";
import "./terminal.css";

const Chart = dynamic(() => import("@/components/market/TerminalChart"), { ssr: false, loading: () => <div className="tm-chart-wait">Drawing the chart…</div> });

const STUDY_LABEL: [keyof Studies, string][] = [
  ["vol", "Volume"], ["sma", "Moving averages (20, 50)"], ["ema", "EMA 21"], ["bb", "Bollinger bands"],
  ["vwap", "VWAP"], ["rsi", "RSI 14"], ["macd", "MACD"], ["cmp", "Compare with the index"],
];
const DEFAULT_STUDIES: Studies = { sma: false, ema: false, bb: false, vwap: false, vol: true, rsi: false, macd: false, cmp: false };
const MAJORS = new Set(["coin:ledger", "coin:north", "coin:halo"]);
const RECENT = 30;

type Side = "buy" | "sell" | "short" | "long" | "flat";
type OType = "market" | "limit" | "stop";

/** How far back a candle size goes: the minutes six game days, the five to thirty-minute sizes a game month, the hours a game year. */
function reachOf(tf: Tf): string {
  return tf === "1m" || tf === "3m" ? "6 game days" : tf === "5m" || tf === "15m" || tf === "30m" ? "a game month" : "a game year";
}

function kindOf(instr: string): "share" | "coin" | "future" | "bond" | "fx" | "none" {
  if (instr.startsWith("eq:")) return "share";
  if (instr.startsWith("fx:")) return "fx";
  if (instr.startsWith("coin:")) return "coin";
  if (instr.startsWith("fut:")) return "future";
  if (instr.startsWith("bond:")) return "bond";
  return "none";
}

function livePx(view: SimView, instr: string): number | null {
  const q = view.quotes.find((x) => x.instr === instr);
  if (q) return q.px;
  const c = view.coinBoard?.find((x) => x.id === instr);
  return c ? c.px : null;
}

/** One position on the instrument you are looking at: what you hold, what you paid, and the open profit or loss in cents. */
interface Held { key: string; qty: number; entry: number; mark: number; pnl: number; pct: number; short: boolean; fee?: number; month?: number }

function heldOf(view: SimView, instr: string, last: number): Held[] {
  const out: Held[] = [];
  for (const sl of view.stockLoans ?? []) {
    if (sl.instr !== instr) continue;
    const mark = last > 0 ? last : sl.px ?? 0;
    const entry = sl.entry ?? (sl.qty > 0 ? sl.face / sl.qty : 0);
    const pnl = Math.round(sl.qty * (entry - mark) - (sl.fees ?? 0));
    out.push({ key: `short:${instr}`, qty: sl.qty, entry, mark, pnl, pct: entry > 0 ? (entry - mark) / entry : 0, short: true, fee: sl.fees ?? 0 });
  }
  const month = Math.floor((view.date?.abs ?? 0) / 30);
  for (const p of view.positions ?? []) {
    if (p.instr !== instr) continue;
    if (p.kind === "future") {
      const good = instr.slice(4);
      const board = view.futuresBoard?.find((b) => b.good === good);
      const tenor = board?.tenors.find((t) => t.monthsAhead === (p.month ?? month) - month);
      const mark = tenor?.px ?? last;
      const lot = board?.lot ?? 1;
      const pnl = Math.round(p.qty * (mark - p.entry) * lot);
      out.push({ key: p.key, qty: p.qty, entry: p.entry, mark, pnl, pct: p.entry > 0 ? (p.qty > 0 ? 1 : -1) * (mark - p.entry) / p.entry : 0, short: p.qty < 0, month: p.month });
      continue;
    }
    if (p.qty <= 0) continue;
    const mark = last > 0 ? last : 0;
    // a currency is quoted in dollars a unit, everything else in cents
    const toCents = p.kind === "fx" ? 100 : 1;
    out.push({ key: p.key, qty: p.qty, entry: p.entry, mark, pnl: Math.round(p.qty * (mark - p.entry) * toCents), pct: p.entry > 0 ? (mark - p.entry) / p.entry : 0, short: false });
  }
  return out;
}

export default function Terminal({ context, onDesks }: { context?: string; onDesks: () => void }) {
  const { view } = useSimSnap();
  const [instr, setInstr] = useState(() => instrOf(context));
  const [tf, setTf] = useState<Tf>(() => { const v = loadPref<unknown>("tf2", "1D"); return isTf(v) ? v : "1D"; });
  const [range, setRange] = useState<RangeId>(() => { const v = loadPref<string>("range", "1Y"); return RANGES.some((r) => r.id === v) ? (v as RangeId) : "1Y"; });
  const [rangeKey, setRangeKey] = useState(0);
  const [pct, setPct] = useState(() => loadPref("pct", false));
  const [look, setLook] = useState<"candles" | "line">(() => (loadPref<string>("look", "candles") === "line" ? "line" : "candles"));
  const [past, setPast] = useState<Drawing[][]>([]);
  const [future, setFuture] = useState<Drawing[][]>([]);
  const [studies, setStudies] = useState<Studies>(() => ({ ...DEFAULT_STUDIES, ...loadPref<Partial<Studies>>("studies", {}) }));
  const [log, setLog] = useState(() => loadPref("log", false));
  const [tool, setTool] = useState<Tool>("cursor");
  const [list, setList] = useState<ListRow[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [menu, setMenu] = useState<"" | "studies">("");
  const [showList, setShowList] = useState(true);
  const [tab, setTab] = useState<"all" | "movers" | "coins" | "new" | "watch">("all");
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<string[]>(() => loadPref<string[]>("watch", []));
  const [side, setSide] = useState<Side>("buy");
  const [otype, setOtype] = useState<OType>("market");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ActNote | null>(null);
  const [review, setReview] = useState<string>("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const abs = view?.date.abs ?? 0;
  const pxNow = view ? livePx(view, instr) : null;

  useEffect(() => { setInstr(instrOf(context)); }, [context]);
  // "fx" alone (the old Currency desk link) is the main pair: the ticket trades a pair, not the desk
  useEffect(() => { if (instr === "fx") { const p = view?.fx?.pairs?.find((x) => x.main) ?? view?.fx?.pairs?.[0]; if (p) setInstr(p.id); } }, [instr, view?.fx?.pairs]);
  useEffect(() => { savePref("tf2", tf); }, [tf]);
  useEffect(() => { savePref("range", range); }, [range]);
  useEffect(() => { savePref("pct", pct); }, [pct]);
  useEffect(() => { savePref("look", look); }, [look]);
  useEffect(() => { savePref("studies", studies); }, [studies]);
  useEffect(() => { savePref("log", log); }, [log]);
  useEffect(() => { savePref("watch", watch); }, [watch]);

  // the saved drawings follow the instrument
  useEffect(() => {
    setDrawings(loadDrawings(instr)); setTool("cursor"); setReview(""); setNote(null); setPast([]); setFuture([]);
    // the ticket starts clean on each instrument: a stop price typed for a share must not wait in a coin's form
    setQty("1"); setPrice(""); setOtype("market"); setSide(kindOf(instr) === "future" ? "long" : "buy");
  }, [instr]);
  const pickSide = useCallback((s: Side) => { setSide(s); setNote(null); setReview(""); }, []);
  const pickType = useCallback((t: OType) => { setOtype(t); setPrice(""); setNote(null); setReview(""); }, []);
  const lastEdit = useRef(0);
  const drawRef = useRef<Drawing[]>([]);
  drawRef.current = drawings;
  const changeDrawings = useCallback((next: Drawing[]) => {
    // a drag sends many small changes: one undo step per burst
    setPast((p) => (p.length && Date.now() - lastEdit.current < 400 ? p : [...p, drawRef.current].slice(-30)));
    lastEdit.current = Date.now();
    setFuture([]);
    setDrawings(next); saveDrawings(instr, next);
  }, [instr]);
  const undo = () => { const prev = past[past.length - 1]; if (!prev) return; setPast(past.slice(0, -1)); setFuture((f) => [...f, drawRef.current]); setDrawings(prev); saveDrawings(instr, prev); };
  const redo = () => { const nxt = future[future.length - 1]; if (!nxt) return; setFuture(future.slice(0, -1)); setPast((p) => [...p, drawRef.current]); setDrawings(nxt); saveDrawings(instr, nxt); };

  // bars: fetched once per instrument, then the newest minutes as the game clock runs (useBars)
  const stamp = `${view?.live?.day ?? abs}:${view?.live?.min ?? ""}:${pxNow ?? ""}`;
  const bars = useBars(instr, tf, stamp);
  const kept = useRef<{ id: string; series: Series } | null>(null);
  if (bars.series) kept.current = { id: instr, series: bars.series };
  const series = bars.series ?? (kept.current?.id === instr ? kept.current.series : null);
  const compare = useBars(studies.cmp && instr !== "index" ? "index" : null, tf, stamp).series;
  const refresh = useCallback(() => { void fetchList().then((l) => { if (l) setList(l.rows); }); }, []);
  const listAt = useRef(0);
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, [refresh]);
  // the list follows the game clock too, so a row never trails the chart by more than a moment
  useEffect(() => { if (Date.now() - listAt.current > 1200) { listAt.current = Date.now(); refresh(); } }, [stamp, refresh]);

  const row = list.find((r) => r.id === instr);
  const kind = kindOf(instr);
  const unitCents = (series?.unit ?? row?.unit ?? "cents") === "cents";
  // One price: the live price the sim gave with the newest candles. The header, the ticket, the watchlist row and the last candle read it.
  const last = bars.live ?? (row && row.px > 0 ? row.px : null) ?? (series?.bars.length ? series.bars[series.bars.length - 1]!.c : 0);
  const title = series?.name ?? row?.name ?? instr;
  const sym = instr.startsWith("eq:") ? symbolOf(instr) : title;

  // ---- what you hold here, and the lines and marks that show it ----
  const heldRows = useMemo(() => (view ? heldOf(view, instr, last) : []), [view, instr, last]);
  const memeCoin = kind === "coin" && instr.startsWith("coin:me:");
  const lines = useMemo<ChartLine[]>(() => {
    if (!view || !series) return [];
    const out: ChartLine[] = [];
    const unit = series.unit;
    const disp = (v: number) => (unit === "cents" ? v / 100 : v);
    for (const o of view.orders ?? []) {
      const at = o.stop ?? o.limit;
      if (o.instr !== instr || !at) continue;
      const isStop = o.book === "stops" && o.mode !== "limit";
      const qtyWord = instr.startsWith("coin:me:") && o.side === "buy" ? moneyFromCents(o.qty) : o.qty.toLocaleString("en-US");
      out.push({ id: `o${o.id}`, kind: isStop ? "stop" : "order", side: o.side === "buy" || o.side === "long" ? "buy" : "sell", price: disp(at), label: `${isStop ? "stop " : ""}${o.side} ${qtyWord}`, drag: o.book !== "bonds" });
    }
    const monthNow = Math.floor((view.date?.abs ?? 0) / 30);
    for (const h of heldRows) {
      if (!(h.entry > 0)) continue;
      const gain = h.pnl >= 0;
      const lead = h.short ? "short" : "you hold";
      const ahead = h.month !== undefined ? h.month - monthNow : 0;
      const month = h.month !== undefined ? ` (${ahead > 0 ? `+${ahead}m` : "front"})` : "";
      out.push({ id: h.key, kind: h.short ? "short" : "pos", price: disp(h.entry), gain, label: `${lead} ${Math.abs(h.qty).toLocaleString("en-US")}${month} @ ${priceText(unit, h.entry)}  ${gain ? "+" : "-"}${moneyFromCents(Math.abs(h.pnl))}` });
    }
    const held = view.shares.find((h) => h.instr === instr);
    const r = view.risk;
    if (held && r && r.loanOwed > 0 && r.sale > r.loanOwed) {
      const value = (held as unknown as { value?: number; saleValue?: number }).value ?? held.px * held.qty;
      const sale = (held as unknown as { saleValue?: number }).saleValue ?? value;
      const ratio = value > 0 ? sale / value : 1;
      const call = held.px - (r.sale - r.loanOwed) / (held.qty * Math.max(0.05, ratio));
      if (call > 0 && call < held.px) out.push({ id: "margin", kind: "margin", price: disp(call), label: "margin call" });
    }
    return out;
  }, [view, series, instr, heldRows]);
  const marks = useMemo<ChartMark[]>(() => {
    if (!view?.marks || !series) return [];
    const unit = series.unit;
    const daily = !isIntraday(tf);
    return view.marks.filter((m) => m.instr === instr).map((m) => ({ t: daily ? Math.floor(m.abs / 1440) : m.abs / 1440, price: unit === "cents" ? m.px / 100 : m.px, side: m.side, qty: m.qty }));
  }, [view?.marks, series?.unit, instr, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- orders ----
  const tradable = kind !== "none";
  const sides: { id: Side; label: string }[] = kind === "future"
    ? [{ id: "long", label: "Long" }, { id: "short", label: "Short" }, { id: "flat", label: "Flat" }]
    : kind === "share" ? [{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }, { id: "short", label: "Short" }]
    : [{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }];
  const types: OType[] = kind === "share" || kind === "coin" ? ["market", "limit", "stop"]
    : kind === "future" ? (side === "flat" ? ["market"] : ["market", "limit", "stop"])
    : kind === "bond" ? ["market", "limit"] : ["market"];
  useEffect(() => { if (!sides.some((s) => s.id === side)) setSide(sides[0]!.id); if (!types.includes(otype)) setOtype("market"); }, [instr, side, otype]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (cmd: unknown, text: string) => {
    setBusy(true); setNote({ ok: true, text: "Sending…" });
    try { setNote(await act(cmd)); } catch { setNote({ ok: false, text: "That did not go through." }); }
    setBusy(false); setReview("");
    refresh();
    void text;
  }, [refresh]);

  // A memecoin buy is "dollars to spend": the sim takes cents, the player types dollars.
  const spend = memeCoin && side === "buy";
  const build = useCallback((): { cmd?: unknown; text: string; error?: string } => {
    const flat = kind === "future" && side === "flat";
    const typed = Number(qty.replace(/[$,s]/g, ""));
    const n = spend ? Math.round(typed * 100) : Math.floor(typed);
    if (!flat && (!Number.isFinite(n) || n < 1)) return { text: "", error: spend ? "Name how many dollars to spend, at least one cent." : kind === "fx" ? "Name how many units of the currency, as a whole number." : "Name how many, as a whole number." };
    const p = Number(price);
    // whole cents, except a memecoin, which trades at fractions of one
    const cents = memeCoin ? p * 100 : Math.round(p * 100);
    if (otype !== "market" && (!Number.isFinite(p) || p <= 0)) return { text: "", error: otype === "stop" ? "Name the stop price." : "Name the limit price." };
    const at = otype === "market" ? "at market" : otype === "limit" ? `limit ${dollarText(series?.unit ?? "cents", unitCents ? cents : p)}` : `stop ${dollarText(series?.unit ?? "cents", unitCents ? cents : p)}`;
    const word = spend ? `buy ${moneyFromCents(n)} of ${sym}` : `${side} ${flat ? "everything" : n.toLocaleString("en-US")} ${sym}`;
    const typeBits = otype === "limit" ? { type: "limit", limit: cents } : otype === "stop" ? { type: "stop", stop: cents } : {};
    if (kind === "share") return { cmd: { kind: "order", side, instr, qty: n, ...(otype === "limit" ? { limit: cents } : typeBits) }, text: `${word}, ${at}` };
    if (kind === "coin") return { cmd: { kind: "coin", side: side === "sell" ? "sell" : "buy", coin: instr, qty: n, ...typeBits }, text: `${word}, ${at}` };
    if (kind === "future") return { cmd: { kind: "fut", side, good: instr.slice(4), qty: flat ? 0 : n, months: 0, ...(flat ? {} : typeBits) }, text: flat ? word : `${word}, ${at}` };
    if (kind === "fx") return { cmd: { kind: "fx", side: side === "sell" ? "sell" : "buy", code: instr.slice(3), units: n }, text: `${side === "sell" ? "sell" : "buy"} ${n.toLocaleString("en-US")} ${sym} at the dealer's quote` };
    if (kind === "bond") return { cmd: { kind: "bond", side: side === "sell" ? "sell" : "buy", tenor: instr.slice(5), bonds: n, ...(otype === "limit" ? { limit: cents } : {}) }, text: `${word}, ${at}` };
    return { text: "", error: "This is a reading, not a market." };
  }, [kind, side, otype, qty, price, instr, sym, series, unitCents, spend, memeCoin]);

  const ask = () => {
    if (!tradable || busy) return;
    const b = build();
    if (b.error) { setNote({ ok: false, text: b.error }); setReview(""); return; }
    setNote(null);
    setReview(b.text);
  };
  const confirm = () => {
    const b = build();
    if (b.error) { setNote({ ok: false, text: b.error }); setReview(""); return; }
    void send(b.cmd, b.text);
  };

  // Drag a standing order's line to a new price: the sim has no "amend", so the old order comes off and the same one goes on
  // at the new price. When the new one is refused the old one goes back, so a bad drag never loses an order.
  const moveLine = useCallback((id: string, p: number) => {
    const cents = unitCents ? (memeCoin ? p * 100 : Math.round(p * 100)) : p;
    const oid = Number(id.slice(1));
    const o = view?.orders.find((x) => x.id === oid);
    if (!o || !(cents > 0)) return;
    const monthNow = Math.floor((view?.date?.abs ?? 0) / 30);
    const place = (at: number): unknown => {
      if (o.book === "stops") {
        const type = o.mode === "limit" ? "limit" : o.limit != null ? "stop-limit" : "stop";
        if (o.instr.startsWith("fut:")) return { kind: "fut", side: o.side, good: o.instr.slice(4), qty: o.qty, months: Math.max(0, (o.month ?? monthNow) - monthNow), type, ...(o.mode === "limit" ? { limit: at } : { stop: at }) };
        const body = o.mode === "limit" ? { limit: at } : { stop: at, ...(o.limit != null ? { limit: o.limit } : {}) };
        if (o.instr.startsWith("coin:")) return { kind: "coin", side: o.side, coin: o.instr, qty: o.qty, type, ...body };
        return { kind: "order", side: o.side, instr: o.instr, qty: o.qty, type, ...body };
      }
      if (o.book === "crypto") return { kind: "coin", side: o.side, coin: o.instr, qty: o.qty, limit: at };
      return { kind: "order", side: o.side, instr: o.instr, qty: o.qty, limit: at };
    };
    void (async () => {
      setBusy(true);
      const gone = await act({ kind: "cancel", orderId: oid });
      if (!gone.ok) { setNote(gone); setBusy(false); return; }
      const again = await act(place(cents));
      if (!again.ok) await act(place(o.stop ?? o.limit ?? cents));
      setNote(again);
      setBusy(false);
      refresh();
    })();
  }, [view, unitCents, refresh, memeCoin]);

  const pickPrice = useCallback((p: number) => { setOtype((t) => (t === "market" ? "limit" : t)); setPrice(p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(2) : p.toFixed(4)); }, []);

  // ---- keyboard, as in the first version: / search, B and S the side, 1 to 3 the type, Enter twice sends ----
  const onKey = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    const typing = el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA";
    if (e.key === "Escape" && review) { setReview(""); return; }
    if (e.key === "Enter" && (!typing || el.dataset.tm === "field")) {
      if (review) confirm(); else ask();
      e.preventDefault();
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); search.current?.focus(); return; }
    const k = e.key.toLowerCase();
    if (k === "b") pickSide(kind === "future" ? "long" : "buy");
    else if (k === "s") pickSide(kind === "future" ? "short" : "sell");
    else if (k === "1" || k === "2" || k === "3") { const t = types[Number(k) - 1]; if (t) pickType(t); }
  };

  // ---- list ----
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = list.filter((x) => (x.live || x.id === instr) && (!q || x.id.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)));
    if (tab === "movers") r = r.filter((x) => x.kind === "share" || x.kind === "coin").sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 25);
    else if (tab === "coins") r = r.filter((x) => x.kind === "coin");
    else if (tab === "new") r = r.filter((x) => x.kind === "coin" && x.id.startsWith("coin:me:") && abs - x.since <= RECENT).sort((a, b) => b.since - a.since);
    else if (tab === "watch") r = r.filter((x) => watch.includes(x.id));
    return r.slice(0, 120);
  }, [list, query, tab, watch, abs, instr]);
  const rowChg = (r: ListRow) => (r.id === instr && r.prev > 0 && last > 0 ? last / r.prev - 1 : r.chg);
  const star = (id: string) => setWatch((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  if (!view) return <div className="tm"><p className="muted">The desk is not open.</p></div>;

  const cash = view.cash;
  const typedQty = Number(qty.replace(/[$,s]/g, ""));
  const n = spend ? Math.max(0, Math.round(typedQty * 100) || 0) : Math.max(0, Math.floor(typedQty) || 0);
  const refPx = otype !== "market" && Number(price) > 0 ? (unitCents ? Math.round(Number(price) * 100) : Number(price)) : last;
  const fxPair = kind === "fx" ? view.fx?.pairs?.find((p) => p.id === instr) : undefined;
  const cost = spend ? n : kind === "share" || kind === "coin" || kind === "bond" ? n * refPx : kind === "fx" && side !== "sell" ? Math.round(n * 100 * (fxPair?.ask ?? last)) : 0;
  const held = view.shares.find((h) => h.instr === instr)?.qty ?? view.coins.find((c) => c.id === instr)?.qty ?? (kind === "fx" ? fxPair?.held ?? 0 : 0) ?? 0;
  const chg = row && row.prev > 0 && last > 0 ? last / row.prev - 1 : row?.chg ?? 0;
  const mine = (view.orders ?? []).filter((o) => o.instr === instr);
  const asideTitle = spend ? "Dollars to spend" : kind === "coin" ? (side === "sell" ? "Coins to sell" : "Coins to buy") : kind === "future" ? "Contracts" : kind === "bond" ? "Bonds" : kind === "fx" ? `Units of ${sym}` : side === "sell" ? "Shares to sell" : side === "short" ? "Shares to short" : "Shares";

  return (
    <div className="tm-wrap"><div className="tm" data-testid="terminal" ref={root} onKeyDown={onKey} data-list={showList ? "on" : "off"}>
      <aside className="tm-list" aria-label="Markets">
        <input ref={search} className="tm-search" placeholder="Search a name or ticker ( / )" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="tm-search" />
        <div className="tm-tabs" role="tablist">
          {([["all", "All"], ["movers", "Movers"], ["coins", "Coins"], ["new", "New coins"], ["watch", "Watching"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <ul className="tm-rows">
          {rows.map((r) => (
            <li key={r.id} className={r.id === instr ? "on" : ""}>
              <button type="button" className="tm-row" onClick={() => { setInstr(r.id); }} data-testid={`tm-row-${r.id}`}>
                <span className="tm-row-n"><b>{r.id.startsWith("eq:") ? symbolOf(r.id) : r.name}</b>{r.id.startsWith("eq:") ? <small>{r.name}</small> : <small>{r.kind}</small>}</span>
                <span className="tm-row-p">{priceText(r.unit, r.id === instr && last > 0 ? last : r.px)}<small className={rowChg(r) >= 0 ? "gain" : "loss"}>{rowChg(r) >= 0 ? "+" : ""}{(rowChg(r) * 100).toFixed(1)}%</small></span>
              </button>
              <button type="button" className="tm-star" aria-pressed={watch.includes(r.id)} aria-label={watch.includes(r.id) ? "Stop watching" : "Watch"} onClick={() => star(r.id)}>{watch.includes(r.id) ? "★" : "☆"}</button>
            </li>
          ))}
          {!rows.length ? <li className="muted tm-none">{tab === "new" ? "No coin has launched in the last month." : tab === "watch" ? "Star a name to keep it here." : "Nothing matches."}</li> : null}
        </ul>
      </aside>

      <section className="tm-main">
        <header className="tm-head">
          <button type="button" className="tm-ghost tm-listbtn" onClick={() => setShowList((v) => !v)} aria-pressed={showList}>Markets</button>
          <h2 className="tm-title">{sym}{instr.startsWith("eq:") ? <small>{title}</small> : null}</h2>
          <span className="tm-price" data-testid="tm-price">{series ? priceText(series.unit, last) : "…"}<small className={chg >= 0 ? "gain" : "loss"}>{chg >= 0 ? "+" : ""}{(chg * 100).toFixed(2)}%</small><small className="tm-today">today</small></span>
          <span className="tm-grow" />
          {view.live ? <span className="tm-clock" data-testid="tm-clock">{view.live.label}<small>{view.live.session === "open" ? "open" : view.live.session === "pre" ? "pre-market" : view.live.session === "after" ? "after hours" : "closed"}</small></span> : null}
        </header>
        {bars.today && !instr.startsWith("fx") ? (
          <p className="tm-ohlc" data-testid="tm-ohlc">
            <span>Open <b>{priceText(series?.unit ?? "cents", bars.today.o)}</b></span>
            <span>High <b>{priceText(series?.unit ?? "cents", bars.today.h)}</b></span>
            <span>Low <b>{priceText(series?.unit ?? "cents", bars.today.l)}</b></span>
            {bars.today.v > 0 ? <span>Volume <b>{volText(bars.today.v)}</b></span> : null}
          </p>
        ) : null}
        {heldRows.length ? (
          <ul className="tm-posbar" data-testid="tm-posbar" aria-label="Your position">
            {heldRows.map((h) => (
              <li key={h.key} data-testid="tm-pos" data-short={h.short ? "1" : "0"}>
                <b>{h.short ? "Short" : "You hold"} {Math.abs(h.qty).toLocaleString("en-US")}</b>
                <span>at {priceText(series?.unit ?? "cents", h.entry)}</span>
                <span>now {priceText(series?.unit ?? "cents", h.mark > 0 ? h.mark : last)}</span>
                <span className={h.pnl >= 0 ? "gain" : "loss"} data-testid="tm-pos-pnl">{h.pnl >= 0 ? "+" : "-"}{moneyFromCents(Math.abs(h.pnl))} ({h.pct >= 0 ? "+" : ""}{(h.pct * 100).toFixed(1)}%)</span>
                {h.short && h.fee ? <span className="muted">borrow fee so far {moneyFromCents(h.fee)}</span> : null}
                {h.short ? <button type="button" className="tm-ghost" disabled={busy} data-testid="tm-cover" onClick={() => void send({ kind: "order", side: "buy", instr, qty: h.qty }, "cover")}>Cover at market</button> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="tm-bar" data-testid="tm-bar">
          <div className="tm-seg tm-tfs" role="group" aria-label="Candle size" title={`One candle is ${series ? realText(candleRealSeconds(tf)) : ""} of real time at x1 (a game day is one real hour).`}>
            {TFS.map((t) => <button key={t.id} type="button" aria-pressed={tf === t.id} data-testid={`tf-${t.id}`} onClick={() => setTf(t.id)}>{t.label}</button>)}
          </div>
          <span className="tm-real muted" data-testid="candle-real">{tf} candle = {realText(candleRealSeconds(tf))} at x1{isIntraday(tf) ? `. These candles reach back ${reachOf(tf)}.` : ""}</span>
          <span className="tm-grow" />
          <div className="tm-seg" role="group" aria-label="Range">
            {RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} data-testid={`range-${r.id}`} onClick={() => { setRange(r.id); setRangeKey((n) => n + 1); }}>{r.id === "ALL" ? "All" : r.id}</button>)}
          </div>
          <div className="tm-seg" role="group" aria-label="Style">
            <button type="button" aria-pressed={look === "candles"} onClick={() => setLook("candles")}>Candles</button>
            <button type="button" aria-pressed={look === "line"} onClick={() => setLook("line")}>Line</button>
          </div>
          <div className="tm-menu">
            <button type="button" className="tm-ghost" aria-expanded={menu === "studies"} onClick={() => setMenu(menu === "studies" ? "" : "studies")} data-testid="tm-studies">Indicators{Object.values(studies).filter(Boolean).length - (studies.vol ? 1 : 0) > 0 ? ` (${Object.values(studies).filter(Boolean).length - (studies.vol ? 1 : 0)})` : ""}</button>
            {menu === "studies" ? (
              <div className="tm-pop" role="menu">
                {STUDY_LABEL.filter(([k]) => k !== "cmp" || instr !== "index").map(([k, label]) => (
                  <label key={k} className="tm-check"><input type="checkbox" checked={studies[k]} data-testid={`tm-study-${k}`} onChange={(e) => setStudies((x) => ({ ...x, [k]: e.target.checked }))} />{label}</label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="tm-stage" onClick={() => { if (menu) setMenu(""); }}>
          <div className="tm-rail" role="toolbar" aria-label="Drawing tools" data-testid="tm-rail">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tool === t.id} title={`${t.label}: ${t.hint}`} aria-label={t.label} data-testid={`tm-tool-${t.id}`}
                onClick={() => { setTool(t.id); root.current?.querySelector<HTMLElement>(".tm-chart")?.focus(); }}>{t.glyph}</button>
            ))}
            <span className="tm-rail-gap" />
            <button type="button" title="Undo a drawing change" aria-label="Undo" disabled={!past.length} onClick={undo}>↶</button>
            <button type="button" title="Redo" aria-label="Redo" disabled={!future.length} onClick={redo}>↷</button>
            <button type="button" title={`Remove all ${drawings.length} drawings`} aria-label="Remove all drawings" disabled={!drawings.length} className="tm-danger" onClick={() => changeDrawings([])} data-testid="tm-clear">✕</button>
          </div>
          <div className="tm-chartbox">
            {series && series.bars.length ? (
              <Chart series={series} compare={compare} studies={studies} log={log} pct={pct} look={look} range={range} rangeKey={rangeKey}
                onScale={(m) => (m === "pct" ? setPct((v) => !v) : setLog((v) => !v))}
                onStudy={(k) => setStudies((x) => ({ ...x, [k]: false }))}
                tool={tool} onTool={setTool} drawings={drawings} onDrawings={changeDrawings} lines={lines} marks={marks} onMoveLine={moveLine} onPickPrice={pickPrice} />
            ) : <div className="tm-chart-wait">{bars.missing ? (isIntraday(tf) ? "This market has no minute candles. Try 1D." : "Nothing has traded here yet.") : series ? "Nothing has traded here yet. Let a day pass." : "Loading the chart…"}</div>}
          </div>
        </div>
        {tool !== "cursor" ? <p className="tm-hint">{TOOLS.find((t) => t.id === tool)?.hint}. Esc cancels.</p> : <p className="tm-hint muted">Scroll to zoom, drag to pan. Double-click the chart to set a price. Drag an order line to move it. Drag an axis to scale it, double-click it to reset.</p>}
      </section>

      <aside className="tm-ticket" aria-label="Order ticket">
        <div className="tm-seg tm-seg-side" role="group" aria-label="Side">
          {sides.map((s) => <button key={s.id} type="button" aria-pressed={side === s.id} data-side={s.id} onClick={() => pickSide(s.id)}>{s.label}</button>)}
        </div>
        {tradable ? (
          <>
            <div className="tm-seg" role="group" aria-label="Order type">
              {types.map((t) => <button key={t} type="button" aria-pressed={otype === t} onClick={() => pickType(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
            </div>
            {!(kind === "future" && side === "flat") ? (
              <label className="tm-field">{asideTitle}
                <input data-tm="field" inputMode={spend ? "decimal" : "numeric"} value={qty} onChange={(e) => { setQty(e.target.value); setReview(""); setNote(null); }} data-testid="tm-qty" />
              </label>
            ) : null}
            {otype !== "market" ? (
              <label className="tm-field">{otype === "stop" ? "Stop price" : "Limit price"}
                <input data-tm="field" inputMode="decimal" value={price} placeholder={last > 0 ? priceText(series?.unit ?? "cents", last).replace(/,/g, "") : ""} onChange={(e) => { setPrice(e.target.value); setReview(""); setNote(null); }} data-testid="tm-price-in" />
              </label>
            ) : null}
            <p className="tm-est">
              {cost > 0 ? <>About <b>{moneyFromCents(cost)}</b> of your <b>{moneyFromCents(cash)}</b>. </> : <>You have <b>{moneyFromCents(cash)}</b>. </>}
              {held ? <>You hold {held.toLocaleString("en-US")}.</> : null}
            </p>
            {review ? (
              <div className="tm-review" data-testid="tm-review">
                <p>{review}</p>
                <div className="tm-row2">
                  <button type="button" className="tm-go" data-side={side} onClick={confirm} disabled={busy} data-testid="tm-confirm">Confirm</button>
                  <button type="button" className="tm-ghost" onClick={() => setReview("")}>Back</button>
                </div>
              </div>
            ) : (
              <button type="button" className="tm-go" data-side={side} onClick={ask} disabled={busy} data-testid="tm-place">{side === "flat" ? "Close out" : `${side[0]!.toUpperCase()}${side.slice(1)} ${sym}`}</button>
            )}
          </>
        ) : <p className="muted tm-nolist">{instr === "index" ? "The index is a reading, not something you can buy. Trade the names in it." : "This is a reading, not something you can buy."}</p>}
        <p className={note && !note.ok ? "tm-note warn" : "tm-note"} data-testid="tm-note" aria-live="polite">{note ? presentNote(plainCopy(note.text)) : " "}</p>
        {mine.length ? (
          <ul className="tm-orders" data-testid="tm-orders">
            {mine.map((o) => {
              const at = o.stop ?? o.limit;
              const what = o.book === "stops" ? (o.mode === "limit" ? "limit " : "stop ") : "";
              return (
                <li key={o.id}><span>{what}{o.side} {memeCoin && o.side === "buy" ? moneyFromCents(o.qty) : o.qty.toLocaleString("en-US")}{at ? ` @ ${dollarText(series?.unit ?? "cents", at)}` : ""}</span>
                  {o.book !== "bonds" ? <button type="button" onClick={() => void act({ kind: "cancel", orderId: o.id }).then((n) => { setNote(n); refresh(); })}>Cancel</button> : <small className="muted">rests</small>}</li>
              );
            })}
          </ul>
        ) : null}
        <p className="tm-keys muted">B and S pick the side, 1 to 3 the type, Enter twice sends.</p>
        <button type="button" className="tm-ghost tm-more" onClick={onDesks} data-testid="tm-desks">Options, launch a coin, currency</button>
      </aside>
    </div></div>
  );
}

/** A price in words: dollars get their sign, points and rates stay as they are. */
function dollarText(unit: Series["unit"], v: number): string {
  return unit === "cents" ? `$${priceText(unit, v)}` : priceText(unit, v);
}
