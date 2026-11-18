"use client";
// The trading terminal: a market list, one big chart with drawing and indicator tools, and an order ticket.
// Every price is the sim's (/api/sim/history and the view); every order goes through act(). A stop is the one thing the
// sim has no order for, so the terminal holds it and sends a market order the moment the price crosses.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { act, symbolOf, useSimSnap, type ActNote, type SimView } from "@/shell/simSession";
import { moneyFromCents, presentNote } from "@/components/ui/format";
import type { ChartLine, Studies } from "@/components/market/TerminalChart";
import {
  TFS, TOOLS, fetchList, fetchSeries, instrOf, loadDrawings, loadPref, priceText, saveDrawings, savePref,
  type Drawing, type ListRow, type Series, type Tf, type Tool,
} from "@/components/market/terminalApi";
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
interface Stop { id: string; instr: string; side: "buy" | "sell"; qty: number; price: number }

function kindOf(instr: string): "share" | "coin" | "future" | "bond" | "none" {
  if (instr.startsWith("eq:")) return "share";
  if (instr.startsWith("coin:")) return "coin";
  if (instr.startsWith("fut:")) return "future";
  if (instr.startsWith("bond:")) return "bond";
  return "none";
}

function loadStops(): Stop[] {
  const v = loadPref<Stop[]>("stops", []);
  return Array.isArray(v) ? v : [];
}

function livePx(view: SimView, instr: string): number | null {
  const q = view.quotes.find((x) => x.instr === instr);
  if (q) return q.px;
  const c = view.coinBoard?.find((x) => x.id === instr);
  return c ? c.px : null;
}

/** Average price paid for what you hold now: the newest buys that add up to it. The view's fills list an order when it
 *  is placed, so a buy still resting is left out. Null when the fills do not cover the holding. */
function entryOf(view: SimView, instr: string, held: number): number | null {
  if (held <= 0) return null;
  const resting = (view.orders ?? []).filter((o) => o.instr === instr);
  const fills = view.fills ?? [];
  let need = held, cost = 0;
  const used = new Set<number>();
  for (let i = fills.length - 1; i >= 0 && need > 0; i--) {
    const f = fills[i]!;
    const m = /^buy\s+([\d,]+)\s+(\S+)\s*@\s*\$?([\d,]+(?:\.\d+)?)/i.exec(f.text.trim());
    if (!m || m[2] !== instr) continue;
    const n = Number(m[1]!.replace(/,/g, "")), px = Math.round(Number(m[3]!.replace(/,/g, "")) * 100);
    const open = resting.findIndex((o, k) => !used.has(k) && o.side === "buy" && o.qty === n && o.limit === px);
    if (open >= 0) { used.add(open); continue; }
    const take = Math.min(n, need);
    cost += take * px; need -= take;
  }
  return need === 0 ? cost / held : null;
}

export default function Terminal({ context, onDesks }: { context?: string; onDesks: () => void }) {
  const { view } = useSimSnap();
  const [instr, setInstr] = useState(() => instrOf(context));
  const [tf, setTf] = useState<Tf>(() => loadPref<Tf>("tf", "d"));
  const [studies, setStudies] = useState<Studies>(() => ({ ...DEFAULT_STUDIES, ...loadPref<Partial<Studies>>("studies", {}) }));
  const [log, setLog] = useState(() => loadPref("log", false));
  const [tool, setTool] = useState<Tool>("cursor");
  const [series, setSeries] = useState<Series | null>(null);
  const [compare, setCompare] = useState<Series | null>(null);
  const [list, setList] = useState<ListRow[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [menu, setMenu] = useState<"" | "draw" | "studies">("");
  const [showList, setShowList] = useState(true);
  const [tab, setTab] = useState<"all" | "movers" | "coins" | "new" | "watch">("all");
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<string[]>(() => loadPref<string[]>("watch", []));
  const [stops, setStops] = useState<Stop[]>(() => loadStops());
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
  useEffect(() => { savePref("tf", tf); }, [tf]);
  useEffect(() => { savePref("studies", studies); }, [studies]);
  useEffect(() => { savePref("log", log); }, [log]);
  useEffect(() => { savePref("watch", watch); }, [watch]);
  useEffect(() => { savePref("stops", stops); }, [stops]);

  // the saved drawings follow the instrument
  useEffect(() => { setDrawings(loadDrawings(instr)); setTool("cursor"); setReview(""); setNote(null); }, [instr]);
  const changeDrawings = useCallback((next: Drawing[]) => { setDrawings(next); saveDrawings(instr, next); }, [instr]);

  // bars: refetched when the game clock or the price moves, and when the instrument or timeframe changes
  const gen = useRef(0);
  const refresh = useCallback(() => {
    const mine = ++gen.current;
    void fetchSeries(instr, tf, tf === "i" ? 400 : 700).then((s) => { if (mine === gen.current && s) setSeries(s); });
    void fetchList().then((l) => { if (l) setList(l.rows); });
  }, [instr, tf]);
  useEffect(() => { refresh(); }, [refresh, abs, pxNow]);
  useEffect(() => {
    if (!studies.cmp || instr === "index") { setCompare(null); return; }
    let live = true;
    void fetchSeries("index", tf, tf === "i" ? 400 : 700).then((s) => { if (live) setCompare(s); });
    return () => { live = false; };
  }, [studies.cmp, instr, tf, abs]);

  const row = list.find((r) => r.id === instr);
  const kind = kindOf(instr);
  const unitCents = (series?.unit ?? row?.unit ?? "cents") === "cents";
  const last = series?.bars.length ? series.bars[series.bars.length - 1]!.c : row?.px ?? 0;
  const title = series?.name ?? row?.name ?? instr;
  const sym = instr.startsWith("eq:") ? symbolOf(instr) : title;

  // ---- lines on the chart: resting orders, held stops, what you hold, the margin call ----
  const lines = useMemo<ChartLine[]>(() => {
    if (!view || !series) return [];
    const out: ChartLine[] = [];
    const unit = series.unit;
    const disp = (v: number) => (unit === "cents" ? v / 100 : v);
    for (const o of view.orders ?? []) {
      if (o.instr !== instr || !o.limit) continue;
      out.push({ id: `o${o.id}`, kind: "order", side: o.side === "buy" ? "buy" : "sell", price: disp(o.limit), label: `${o.side} ${o.qty.toLocaleString("en-US")}`, drag: o.book === "shares" });
    }
    for (const s of stops) if (s.instr === instr) out.push({ id: s.id, kind: "stop", side: s.side, price: disp(s.price), label: `stop ${s.side} ${s.qty}`, drag: true });
    const held = view.shares.find((h) => h.instr === instr);
    const coin = view.coins.find((c) => c.id === instr);
    const qtyHeld = held?.qty ?? coin?.qty ?? 0;
    if (qtyHeld) {
      const entry = entryOf(view, instr, qtyHeld);
      if (entry) out.push({ id: "pos", kind: "pos", price: disp(entry), label: `you hold ${qtyHeld.toLocaleString("en-US")}` });
    }
    const r = view.risk;
    if (held && r && r.loanOwed > 0 && r.sale > r.loanOwed) {
      const value = (held as unknown as { value?: number; saleValue?: number }).value ?? held.px * held.qty;
      const sale = (held as unknown as { saleValue?: number }).saleValue ?? value;
      const ratio = value > 0 ? sale / value : 1;
      const call = held.px - (r.sale - r.loanOwed) / (held.qty * Math.max(0.05, ratio));
      if (call > 0 && call < held.px) out.push({ id: "margin", kind: "margin", price: disp(call), label: "margin call" });
    }
    return out;
  }, [view, series, instr, stops]);

  // ---- orders ----
  const tradable = kind !== "none";
  const sides: { id: Side; label: string }[] = kind === "future"
    ? [{ id: "long", label: "Long" }, { id: "short", label: "Short" }, { id: "flat", label: "Flat" }]
    : kind === "share" ? [{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }, { id: "short", label: "Short" }]
    : [{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }];
  const types: OType[] = kind === "share" ? ["market", "limit", "stop"] : kind === "coin" ? (MAJORS.has(instr) ? ["market", "limit", "stop"] : ["market", "stop"]) : kind === "bond" ? ["market", "limit"] : ["market"];
  useEffect(() => { if (!sides.some((s) => s.id === side)) setSide(sides[0]!.id); if (!types.includes(otype)) setOtype("market"); }, [instr]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (cmd: unknown, text: string) => {
    setBusy(true); setNote({ ok: true, text: "Sending…" });
    try { setNote(await act(cmd)); } catch { setNote({ ok: false, text: "That did not go through." }); }
    setBusy(false); setReview("");
    refresh();
    void text;
  }, [refresh]);

  const build = useCallback((): { cmd?: unknown; stop?: Stop; text: string; error?: string } => {
    const n = Math.floor(Number(qty));
    const flat = kind === "future" && side === "flat";
    if (!flat && (!Number.isFinite(n) || n < 1)) return { text: "", error: "Name how many, as a whole number." };
    const p = Number(price);
    const cents = Math.round(p * 100);
    if (otype !== "market" && (!Number.isFinite(p) || p <= 0)) return { text: "", error: otype === "stop" ? "Name the stop price." : "Name the limit price." };
    const at = otype === "market" ? "at market" : otype === "limit" ? `limit ${priceText(series?.unit ?? "cents", unitCents ? cents : p)}` : `stop ${priceText(series?.unit ?? "cents", unitCents ? cents : p)}`;
    const word = `${side} ${flat ? "everything" : n.toLocaleString("en-US")} ${sym}`;
    if (otype === "stop") {
      if (side !== "buy" && side !== "sell") return { text: "", error: "A stop buys or sells." };
      return { stop: { id: `s${Date.now().toString(36)}`, instr, side, qty: n, price: cents }, text: `${word}, ${at}` };
    }
    const lim = otype === "limit" ? { limit: cents } : {};
    if (kind === "share") return { cmd: { kind: "order", side, instr, qty: n, ...lim }, text: `${word}, ${at}` };
    if (kind === "coin") return { cmd: { kind: "coin", side: side === "sell" ? "sell" : "buy", coin: instr, qty: n, ...(MAJORS.has(instr) ? lim : {}) }, text: `${word}, ${at}` };
    if (kind === "future") return { cmd: { kind: "fut", side, good: instr.slice(4), qty: flat ? 0 : n, months: 0 }, text: word };
    if (kind === "bond") return { cmd: { kind: "bond", side: side === "sell" ? "sell" : "buy", tenor: instr.slice(5), bonds: n, ...lim }, text: `${word}, ${at}` };
    return { text: "", error: "This is a reading, not a market." };
  }, [kind, side, otype, qty, price, instr, sym, series, unitCents]);

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
    if (b.stop) { setStops((s) => [...s, b.stop!]); setNote({ ok: true, text: `Stop held: ${b.text}. It sends a market order when the price crosses, while the game is open.` }); setReview(""); return; }
    void send(b.cmd, b.text);
  };

  // stops fire as market orders the first time the price crosses them
  useEffect(() => {
    if (!view || !stops.length) return;
    const hit = stops.filter((s) => {
      const p = livePx(view, s.instr);
      return p !== null && (s.side === "sell" ? p <= s.price : p >= s.price);
    });
    if (!hit.length) return;
    setStops((all) => all.filter((s) => !hit.some((h) => h.id === s.id)));
    for (const s of hit) {
      const cmd = s.instr.startsWith("coin:") ? { kind: "coin", side: s.side, coin: s.instr, qty: s.qty } : { kind: "order", side: s.side, instr: s.instr, qty: s.qty };
      void act(cmd).then((n) => setNote({ ok: n.ok, text: `Stop hit: ${n.text}` }));
    }
  }, [view, stops]);

  const moveLine = useCallback((id: string, p: number) => {
    const cents = unitCents ? Math.round(p * 100) : p;
    if (id.startsWith("s")) { setStops((all) => all.map((s) => (s.id === id ? { ...s, price: cents } : s))); return; }
    const oid = Number(id.slice(1));
    const o = view?.orders.find((x) => x.id === oid);
    if (!o || !(cents > 0)) return;
    void (async () => {
      setBusy(true);
      const gone = await act({ kind: "cancel", orderId: oid });
      if (!gone.ok) { setNote(gone); setBusy(false); return; }
      const cmd = o.instr.startsWith("eq:") ? { kind: "order", side: o.side, instr: o.instr, qty: o.qty, limit: cents } : null;
      setNote(cmd ? await act(cmd) : { ok: false, text: "This book does not take a moved order." });
      setBusy(false);
      refresh();
    })();
  }, [view, unitCents, refresh]);

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
    if (k === "b") setSide(kind === "future" ? "long" : "buy");
    else if (k === "s") setSide(kind === "future" ? "short" : "sell");
    else if (k === "1" || k === "2" || k === "3") { const t = types[Number(k) - 1]; if (t) setOtype(t); }
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
  const star = (id: string) => setWatch((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  if (!view) return <div className="tm"><p className="muted">The desk is not open.</p></div>;

  const cash = view.cash;
  const n = Math.max(0, Math.floor(Number(qty)) || 0);
  const refPx = otype !== "market" && Number(price) > 0 ? (unitCents ? Math.round(Number(price) * 100) : Number(price)) : last;
  const cost = kind === "share" || kind === "coin" || kind === "bond" ? n * refPx : 0;
  const held = view.shares.find((h) => h.instr === instr)?.qty ?? view.coins.find((c) => c.id === instr)?.qty ?? 0;
  const chg = row?.chg ?? 0;
  const mine = (view.orders ?? []).filter((o) => o.instr === instr);
  const myStops = stops.filter((s) => s.instr === instr);
  const asideTitle = kind === "coin" && instr.startsWith("coin:me:") ? (side === "sell" ? "Coins to sell" : "Cents to spend") : kind === "future" || kind === "bond" ? (kind === "bond" ? "Bonds" : "Contracts") : "Quantity";

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
                <span className="tm-row-p">{priceText(r.unit, r.px)}<small className={r.chg >= 0 ? "gain" : "loss"}>{r.chg >= 0 ? "+" : ""}{(r.chg * 100).toFixed(1)}%</small></span>
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
          <span className="tm-price" data-testid="tm-price">{series ? priceText(series.unit, last) : "…"}<small className={chg >= 0 ? "gain" : "loss"}>{chg >= 0 ? "+" : ""}{(chg * 100).toFixed(2)}%</small></span>
          <span className="tm-grow" />
          <div className="tm-seg" role="group" aria-label="Timeframe">
            {TFS.map((t) => <button key={t.id} type="button" aria-pressed={tf === t.id} onClick={() => setTf(t.id)}>{t.label}</button>)}
          </div>
          <div className="tm-menu">
            <button type="button" className="tm-ghost" aria-expanded={menu === "draw"} onClick={() => setMenu(menu === "draw" ? "" : "draw")} data-testid="tm-draw">{tool === "cursor" ? "Draw" : TOOLS.find((t) => t.id === tool)?.label}</button>
            {menu === "draw" ? (
              <div className="tm-pop" role="menu">
                {TOOLS.map((t) => (
                  <button key={t.id} type="button" role="menuitem" aria-pressed={tool === t.id} data-testid={`tm-tool-${t.id}`} onClick={() => { setTool(t.id); setMenu(""); root.current?.querySelector<HTMLElement>(".tm-chart")?.focus(); }}>
                    {t.label}<small>{t.hint}</small>
                  </button>
                ))}
                {drawings.length ? <button type="button" role="menuitem" className="tm-danger" onClick={() => { changeDrawings([]); setMenu(""); }}>Clear {drawings.length} drawing{drawings.length > 1 ? "s" : ""}</button> : null}
              </div>
            ) : null}
          </div>
          <div className="tm-menu">
            <button type="button" className="tm-ghost" aria-expanded={menu === "studies"} onClick={() => setMenu(menu === "studies" ? "" : "studies")} data-testid="tm-studies">Indicators</button>
            {menu === "studies" ? (
              <div className="tm-pop" role="menu">
                {STUDY_LABEL.filter(([k]) => k !== "cmp" || instr !== "index").map(([k, label]) => (
                  <label key={k} className="tm-check"><input type="checkbox" checked={studies[k]} data-testid={`tm-study-${k}`} onChange={(e) => setStudies((s) => ({ ...s, [k]: e.target.checked }))} />{label}</label>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className="tm-ghost" aria-pressed={log} onClick={() => setLog((v) => !v)} data-testid="tm-log">{log ? "Log" : "Linear"}</button>
        </header>
        <div className="tm-stage" onClick={() => { if (menu) setMenu(""); }}>
          {series && series.bars.length ? (
            <Chart series={series} compare={compare} studies={studies} log={log} tool={tool} onTool={setTool} drawings={drawings} onDrawings={changeDrawings} lines={lines} onMoveLine={moveLine} onPickPrice={pickPrice} />
          ) : <div className="tm-chart-wait">{series ? "Nothing has traded here yet. Let a day pass." : "Loading the chart…"}</div>}
        </div>
        {tool !== "cursor" ? <p className="tm-hint">{TOOLS.find((t) => t.id === tool)?.hint}. Esc cancels.</p> : <p className="tm-hint muted">Double-click the chart to set a price. Drag a limit line to move it.</p>}
      </section>

      <aside className="tm-ticket" aria-label="Order ticket">
        <div className="tm-seg tm-seg-side" role="group" aria-label="Side">
          {sides.map((s) => <button key={s.id} type="button" aria-pressed={side === s.id} data-side={s.id} onClick={() => setSide(s.id)}>{s.label}</button>)}
        </div>
        {tradable ? (
          <>
            <div className="tm-seg" role="group" aria-label="Order type">
              {types.map((t) => <button key={t} type="button" aria-pressed={otype === t} onClick={() => setOtype(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
            </div>
            {!(kind === "future" && side === "flat") ? (
              <label className="tm-field">{asideTitle}
                <input data-tm="field" inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value); setReview(""); }} data-testid="tm-qty" />
              </label>
            ) : null}
            {otype !== "market" ? (
              <label className="tm-field">{otype === "stop" ? "Stop price" : "Limit price"}
                <input data-tm="field" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setReview(""); }} data-testid="tm-price-in" />
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
        ) : <p className="muted tm-nolist">{instr === "fx" ? "The city dealer does not take a player order in foreign currency." : "The index is a reading, not something you can buy. Trade the names in it."}</p>}
        <p className={note && !note.ok ? "tm-note warn" : "tm-note"} data-testid="tm-note" aria-live="polite">{note ? presentNote(note.text) : " "}</p>
        {mine.length || myStops.length ? (
          <ul className="tm-orders" data-testid="tm-orders">
            {mine.map((o) => (
              <li key={o.id}><span>{o.side} {o.qty.toLocaleString("en-US")}{o.limit ? ` @ ${priceText(series?.unit ?? "cents", o.limit)}` : ""}</span>
                {o.book === "shares" ? <button type="button" onClick={() => void act({ kind: "cancel", orderId: o.id }).then((n) => { setNote(n); refresh(); })}>Cancel</button> : <small className="muted">rests</small>}</li>
            ))}
            {myStops.map((s) => (
              <li key={s.id}><span>stop {s.side} {s.qty} @ {priceText(series?.unit ?? "cents", s.price)}</span><button type="button" onClick={() => setStops((all) => all.filter((x) => x.id !== s.id))}>Cancel</button></li>
            ))}
          </ul>
        ) : null}
        <p className="tm-keys muted">B and S pick the side, 1 to 3 the type, Enter twice sends.</p>
        <button type="button" className="tm-ghost tm-more" onClick={onDesks} data-testid="tm-desks">Options, launch a coin, currency</button>
      </aside>
    </div></div>
  );
}
