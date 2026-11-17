"use client";
// Markets: the listed board, then one stock — chart, book, profit, staff, holders, news, why it moved.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "@/components/shell/MoneyText";
import { Sparkline } from "@/components/shell/Sparkline";
import { useShellStore } from "@/components/shell/ShellContext";
import { dollars, symbolOf, useSimSnap, type NewsLine, type Quote } from "@/shell/simSession";
import { gameDate, moneyFromCents, signedQty, titleWord } from "@/components/ui/format";
import { Named } from "@/components/ui/Named";
import { holidayReason, parseCalendar } from "@/apps/society/read";
import { Cause, LineChart, NumBtn, signedPct, tone, useCause } from "./why";
import "./markets.css";

type SortKey = "name" | "px" | "chg" | "vol" | "pe" | "pos";

interface FirmPage {
  name: string;
  kind?: string;
  sector?: string;
  goodName?: string;
  staff?: number;
  profit?: number;
  revenue?: number;
  price?: number;
  debt?: number;
  deposits?: number;
  equity?: number;
  ceo?: { name: string } | null;
  events?: Record<string, number>;
  daily?: { day: number; px: number }[];
  news?: { eventId: number; day: number; text: string }[];
  holders?: { id: string; name: string; qty: number }[];
  move?: { eventId: number; day: number; text: string };
  eventId?: number;
}

function asFirm(raw: unknown): FirmPage | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof (raw as FirmPage).name !== "string") return null;
  return raw as FirmPage;
}

export default function MarketsApp({ context }: { context?: string }) {
  const { view } = useSimSnap();
  const { cause, ask, close } = useCause();
  const [sel, setSel] = useState<string | null>(context && !context.includes(":") ? context : context?.startsWith("eq:") ? context : null);
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  useEffect(() => {
    if (!context) return;
    if (context.startsWith("eq:") || !context.includes(":")) setSel(context);
  }, [context]);

  const quotes = view?.quotes ?? [];
  const quote = quotes.find((q) => q.instr === sel);
  if (!view) return <div className="mk" data-testid="markets"><p className="muted">The board is not open.</p></div>;
  if (quote) {
    return (
      <div className="mk" data-testid="markets">
        <Stock quote={quote} day={view.date.abs} news={view.news} ask={ask} closed={holidayReason(view.date.abs, parseCalendar(view.calendar))} onBack={() => setSel(null)} />
        <Cause cause={cause} onClose={close} />
      </div>
    );
  }

  const sectors = ["All", ...new Set(quotes.map((q) => q.sector || "Other"))];
  const rows = quotes.filter((q) => sector === "All" || (q.sector || "Other") === sector);
  const sorted = [...rows].sort((a, b) => cmp(a, b, sort.key) * sort.dir);

  const head = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}>{label}</button>
    </th>
  );

  return (
    <div className="mk" data-testid="markets">
      <div className="mk-chips" role="group" aria-label="Sector">
        {sectors.map((s) => (
          <button key={s} type="button" aria-pressed={sector === s} onClick={() => setSector(s)}>{s === "All" ? "All" : titleWord(s)}</button>
        ))}
      </div>
      <div className="mk-scroll">
        <table className="mk-table">
          <thead>
            <tr>
              {head("name", "Name")}
              {head("px", "Last")}
              {head("chg", "Change")}
              {head("vol", "Volume")}
              {head("pe", "P/E")}
              <th> </th>
              {head("pos", "Position")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((q) => (
              <tr key={q.instr} data-testid="mk-row">
                <td className="mk-name" data-label="Name">
                  <button type="button" className="mk-open" onClick={() => setSel(q.instr)}>{q.symbol || symbolOf(q.instr)} · {q.name || q.instr}</button>
                </td>
                <td data-label="Last"><NumBtn id={q.eventId} title={`${q.symbol || symbolOf(q.instr)} last`} ask={ask}><MoneyText amount={dollars(q.px)} ctx="table" /></NumBtn></td>
                <td data-label="Change"><NumBtn id={q.eventId} title={`${q.symbol || symbolOf(q.instr)} change`} ask={ask}><span className={tone(q.chg)}>{signedPct(q.chg)}</span></NumBtn></td>
                <td data-label="Volume"><NumBtn id={q.eventId} title={`${q.symbol || symbolOf(q.instr)} volume`} ask={ask}><span className="num">{q.vol.toLocaleString("en-US")}</span></NumBtn></td>
                <td data-label="P/E"><NumBtn id={q.eventId} title={`${q.symbol || symbolOf(q.instr)} P/E`} ask={ask}><span className="num">{q.pe == null ? "—" : q.pe.toFixed(1)}</span></NumBtn></td>
                <td data-label=""><Sparkline points={q.spark} /></td>
                <td data-label="Position"><NumBtn id={q.eventId} title={`${q.symbol || symbolOf(q.instr)} position`} ask={ask}><span className={`num ${tone(q.pos ?? 0)}`}>{signedQty(q.pos ?? 0)}</span></NumBtn></td>
              </tr>
            ))}
          </tbody>
        </table>
        {quotes.length === 0 ? <p className="quay-empty">Nothing is listed yet.</p> : sorted.length ? null : <p className="quay-empty">Nothing listed in that sector.</p>}
      </div>
      <Cause cause={cause} onClose={close} />
    </div>
  );
}

function cmp(a: Quote, b: Quote, key: SortKey): number {
  if (key === "name") return (a.symbol || a.instr).localeCompare(b.symbol || b.instr);
  if (key === "pe") {
    if (a.pe == null && b.pe == null) return 0;
    if (a.pe == null) return 1;
    if (b.pe == null) return -1;
    return a.pe - b.pe;
  }
  if (key === "px") return a.px - b.px;
  if (key === "chg") return a.chg - b.chg;
  if (key === "vol") return a.vol - b.vol;
  return (a.pos ?? 0) - (b.pos ?? 0);
}

function Stock({ quote, day, news, ask, closed, onBack }: {
  quote: Quote;
  day: number;
  news: NewsLine[];
  ask: (id: number, title: string) => void;
  closed: string;
  onBack: () => void;
}) {
  const store = useShellStore();
  const [firm, setFirm] = useState<FirmPage | null>(null);
  const [firmState, setFirmState] = useState<"load" | "in" | "out">("load");
  const issuer = quote.issuer || "";
  useEffect(() => {
    if (!issuer) { setFirm(null); setFirmState("out"); return; }
    const ac = new AbortController();
    setFirm(null);
    setFirmState("load");
    void fetch(`/api/sim/firm/${encodeURIComponent(issuer)}`, { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (ac.signal.aborted) return;
        const page = asFirm(raw);
        setFirm(page);
        setFirmState(page ? "in" : "out");
      })
      .catch(() => { if (!ac.signal.aborted) { setFirm(null); setFirmState("out"); } });
    return () => ac.abort();
  }, [issuer, day]);

  const closes = firm?.daily ?? [];
  const up = closes.length > 1 ? closes[closes.length - 1].px >= closes[0].px : quote.chg >= 0;
  const bids = useMemo(() => [...(quote.book?.bids ?? [])].sort((a, b) => b.px - a.px), [quote]);
  const asks = useMemo(() => [...(quote.book?.asks ?? [])].sort((a, b) => a.px - b.px), [quote]);
  const ev = firm?.events ?? {};
  const shareId = firm?.move?.eventId ?? quote.eventId;
  const firmNews = firm?.news ?? [];
  const extra = news.filter((n) => n.firms?.some((f) => f.id === issuer) && !firmNews.some((x) => x.eventId === n.eventId));
  const lines = [...firmNews, ...extra.map((n) => ({ eventId: n.eventId, day: n.day, text: n.text }))].slice(-8).reverse();
  const sym = quote.symbol || symbolOf(quote.instr);

  return (
    <>
      <div className="mk-head">
        <div>
          <button type="button" className="mk-back" onClick={onBack}>Board</button>
          <h2 className="section-title">{sym} · {firm?.name || quote.name}</h2>
          <p className="muted">{firm?.sector ? titleWord(firm.sector) : quote.sector ? titleWord(quote.sector) : ""}{firm?.goodName ? ` · ${firm.goodName}` : ""}{firm?.ceo?.name ? <> · <Named name={firm.ceo.name} /></> : null}</p>
        </div>
        <div>
          <Button variant="primary" data-testid="mk-trade" disabled={!!closed} onClick={() => { if (!closed) store.getState().open("broker", quote.instr); }}>Trade</Button>
          {closed ? <p className="muted" data-testid="mk-closed">{closed}</p> : null}
        </div>
      </div>
      <div className="mk-quote">
        <NumBtn id={quote.eventId} title={`${sym} last`} ask={ask}><span className="mk-last"><MoneyText amount={dollars(quote.px)} ctx="wealth" /></span></NumBtn>
        <NumBtn id={quote.eventId} title={`${sym} change`} ask={ask}><span className={tone(quote.chg)}>{signedPct(quote.chg)}</span></NumBtn>
        <span className="muted">Bid <NumBtn id={quote.eventId} title={`${sym} bid`} ask={ask}><MoneyText amount={dollars(quote.bid ?? 0)} ctx="table" /></NumBtn></span>
        <span className="muted">Ask <NumBtn id={quote.eventId} title={`${sym} ask`} ask={ask}><MoneyText amount={dollars(quote.ask ?? 0)} ctx="table" /></NumBtn></span>
      </div>
      <LineChart points={closes.map((c) => c.px)} days={closes.map((c) => c.day)} up={up} label={`${sym} daily closes`} format={moneyFromCents} />
      <div className="mk-facts">
        {firm?.kind === "bank" ? (
          <>
            <Fact label="Deposits" id={firm.eventId} title="Bank deposits" ask={ask}><MoneyText amount={dollars(firm.deposits ?? 0)} ctx="table" /></Fact>
            <Fact label="Equity" id={firm.eventId} title="Bank equity" ask={ask}><MoneyText amount={dollars(firm.equity ?? 0)} ctx="table" /></Fact>
          </>
        ) : (
          <>
            <Fact label="Profit" id={ev.profit ?? shareId} title={`${sym} profit`} ask={ask}><MoneyText amount={dollars(firm?.profit ?? 0)} ctx="table" /></Fact>
            <Fact label="Revenue" id={ev.revenue ?? shareId} title={`${sym} revenue`} ask={ask}><MoneyText amount={dollars(firm?.revenue ?? 0)} ctx="table" /></Fact>
            <Fact label="Staff" id={ev.staff ?? shareId} title={`${sym} staff`} ask={ask}><span className="num">{firm?.staff ?? "—"}</span></Fact>
            <Fact label="Debt" id={ev.debt ?? shareId} title={`${sym} debt`} ask={ask}><MoneyText amount={dollars(firm?.debt ?? 0)} ctx="table" /></Fact>
          </>
        )}
        <Fact label="Your position" id={shareId} title={`${sym} position`} ask={ask}><span className={`num ${tone(quote.pos ?? 0)}`}>{signedQty(quote.pos ?? 0)}</span></Fact>
        <Fact label="P/E" id={shareId} title={`${sym} P/E`} ask={ask}><span className="num">{quote.pe == null ? "—" : quote.pe.toFixed(1)}</span></Fact>
      </div>
      <section>
        <h3 className="label">Order book</h3>
        <div className="mk-book">
          <div>
            <p className="label">Bids</p>
            {bids.length ? bids.map((lvl) => (
              <div key={`b${lvl.px}`} className="mk-book-row"><span>{lvl.qty}</span><NumBtn id={quote.eventId} title={`${sym} bid ${dollars(lvl.px)}`} ask={ask}><MoneyText amount={dollars(lvl.px)} ctx="table" /></NumBtn></div>
            )) : <p className="muted">None</p>}
          </div>
          <div>
            <p className="label">Asks</p>
            {asks.length ? asks.map((lvl) => (
              <div key={`a${lvl.px}`} className="mk-book-row"><span>{lvl.qty}</span><NumBtn id={quote.eventId} title={`${sym} ask ${dollars(lvl.px)}`} ask={ask}><MoneyText amount={dollars(lvl.px)} ctx="table" /></NumBtn></div>
            )) : <p className="muted">None</p>}
          </div>
        </div>
      </section>
      <section>
        <h3 className="label">Top holders</h3>
        {firm?.holders?.length ? firm.holders.map((h) => (
          <div key={h.id} className="mk-book-row">
            <Named name={h.name} />
            <NumBtn id={shareId} title={`${h.name} holds ${sym}`} ask={ask}><span className="num">{h.qty.toLocaleString("en-US")}</span></NumBtn>
          </div>
        )) : <p className={firmState === "out" ? "quay-state" : "muted"} data-kind={firmState === "out" ? "error" : undefined}>{firm ? "No holders on the book." : firmState === "out" ? "The firm page did not open." : "Reading the firm…"}</p>}
      </section>
      <section>
        <h3 className="label">Why did it move</h3>
        <p className="mk-move">
          {firm?.move?.text || "The log no longer has the line."}{" "}
          <NumBtn id={firm?.move?.eventId ?? quote.eventId} title={`Why ${sym} moved`} ask={ask}><span>Why?</span></NumBtn>
        </p>
      </section>
      <section>
        <h3 className="label">Latest news</h3>
        {lines.length ? lines.map((n) => (
          <button key={n.eventId} type="button" className="mk-open" onClick={() => ask(n.eventId, `${sym} news`)}>
            <span className="label">{gameDate(n.day)}</span> {n.text}
          </button>
        )) : <p className="muted">No news on this name.</p>}
      </section>
    </>
  );
}

function Fact({ label, id, title, ask, children }: { label: string; id?: number; title: string; ask: (id: number, title: string) => void; children: ReactNode }) {
  return (
    <div className="mk-fact">
      <span className="label">{label}</span>
      <NumBtn id={id} title={title} ask={ask}>{children}</NumBtn>
    </div>
  );
}
