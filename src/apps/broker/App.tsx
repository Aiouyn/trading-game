"use client";
// Broker: one ticket for every asset the text game can trade, plus the foreign-currency quote.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "@/components/shell/MoneyText";
import { act, dollars, symbolOf, useSimSnap, type ActNote, type Quote, type SimView } from "@/shell/simSession";
import { levelPct, moneyFromCents, presentNote } from "@/components/ui/format";
import { Cause, LineChart, NumBtn, signedPct, tone, useCause } from "@/apps/markets/why";
import { holidayReason, parseCalendar } from "@/apps/society/read";
import Terminal from "./Terminal";
import "./broker.css";

type Desk = "stocks" | "bonds" | "futures" | "options" | "coins" | "fx";
const DESKS: { id: Desk; label: string }[] = [
  { id: "stocks", label: "Stocks" },
  { id: "bonds", label: "Bonds" },
  { id: "futures", label: "Futures" },
  { id: "options", label: "Options" },
  { id: "coins", label: "Coins" },
  { id: "fx", label: "Currency" },
];
const MAJORS = new Set(["coin:ledger", "coin:north", "coin:halo"]);

function bookName(view: SimView, instr: string): string {
  const quote = view.quotes.find((q) => q.instr === instr);
  if (quote?.symbol) return quote.symbol;
  if (quote?.name) return quote.name;
  const coin = view.coinBoard?.find((c) => c.id === instr || c.id === instr.replace(/^coin:/, ""));
  if (coin?.name) return coin.name;
  if (instr.startsWith("coin:")) {
    const slug = instr.slice(5).replace(/^me:/, "");
    return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "Coin";
  }
  return symbolOf(instr);
}

function holdWord(n: number): string {
  if (!n) return "You hold none";
  if (n < 0) return `You are short ${Math.abs(n).toLocaleString("en-US")}`;
  return `You hold ${n.toLocaleString("en-US")}`;
}
const LOT = 16000;

function readContext(context?: string): { desk: Desk; key: string } {
  if (!context) return { desk: "stocks", key: "" };
  if (context === "fx" || context.startsWith("fx:")) return { desk: "fx", key: "" };
  if (context.startsWith("bond:")) return { desk: "bonds", key: context.slice(5) };
  if (context.startsWith("fut:")) return { desk: "futures", key: context.slice(4) };
  if (context.startsWith("coin:")) return { desk: "coins", key: context };
  if (context.startsWith("opt:")) return { desk: "options", key: context.slice(4) };
  return { desk: "stocks", key: context };
}

function whole(text: string): number | null {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Dollars typed by the player, as the cents the sim takes. Null when it is not a sum of at least one cent. */
function dollarsToCents(text: string): number | null {
  const x = Number(text.replace(/[$,s]/g, ""));
  if (!Number.isFinite(x) || x < 0.01) return null;
  return Math.round(x * 100);
}

/** A memecoin buy is a sum to spend: the player types dollars. */
function spendsDollars(view: SimView, desk: Desk, key: string, side: string): boolean {
  return desk === "coins" && side !== "sell" && coinId(view, key).startsWith("coin:me:");
}

function limitCents(text: string): number | undefined | null {
  const t = text.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (cents < 1) return null;
  return cents;
}

function writeMargin(spot: number, strike: number, right: "C" | "P", bid: number, ask: number, qty: number): number {
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : ask || bid;
  const k = strike > 0 ? strike : spot;
  const otm = right === "C" ? Math.max(0, k - spot) : Math.max(0, spot - k);
  const cushion = Math.max(0, spot * 100 * 0.1 - otm * 100 * 0.5);
  return qty * Math.max(100, Math.round(mid * 100 + cushion));
}

function orderWord(note: ActNote | null): { word: string; text: string } | null {
  if (!note) return null;
  if (note.text === "Sending…") return { word: "Sending", text: "The desk has it." };
  if (!note.ok) return { word: "Rejected", text: note.text };
  if (/cancel/i.test(note.text)) return { word: "Cancelled", text: note.text };
  return { word: "Taken", text: note.text };
}

export default function BrokerApp({ context }: { context?: string }) {
  const { view, note } = useSimSnap();
  const { cause, ask, close } = useCause();
  const opened = readContext(context);
  const [desk, setDesk] = useState<Desk>(opened.desk);
  const [key, setKey] = useState(opened.key);
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("1");
  const [limit, setLimit] = useState("");
  const [months, setMonths] = useState(0);
  const [right, setRight] = useState<"C" | "P">("C");
  const [strike, setStrike] = useState(0);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<ActNote | null>(null);
  const [terminal, setTerminal] = useState(() => !context || !/^(opt:|fx)/.test(context));

  useEffect(() => {
    const next = readContext(context);
    setDesk(next.desk);
    if (next.key) setKey(next.key);
  }, [context]);

  useEffect(() => {
    setSide(desk === "futures" ? "long" : desk === "options" ? "buy" : "buy");
  }, [desk]);

  if (!view) return <div className="br" data-testid="broker"><p className="muted">The desk is not open.</p></div>;
  if (terminal) return <Terminal context={context} onDesks={() => setTerminal(false)} />;

  const place = async () => {
    if (busy || desk === "fx" || !view) return;
    const exchange = desk === "stocks" || desk === "bonds" || desk === "futures" || desk === "options";
    if (exchange && holidayReason(view.date.abs, parseCalendar(view.calendar))) return;
    const spend = spendsDollars(view, desk, key, side);
    const n = spend ? dollarsToCents(qty) : whole(qty);
    const lim = limitCents(limit);
    if (lim === null) { setLocal({ ok: false, text: "Name a limit in dollars, or leave it empty for the market." }); return; }
    const flat = desk === "futures" && side === "flat";
    if (!flat && !n) { setLocal({ ok: false, text: spend ? "Name how many dollars to spend, at least one cent." : "Name how many. Use a whole number." }); return; }
    setBusy(true);
    setLocal({ ok: true, text: "Sending…" });
    let sent = false;
    try {
      if (desk === "stocks") {
        const instr = picked(view, key);
        const stockSide = side === "sell" || side === "short" ? side : "buy";
        if (instr && n) { sent = true; setLocal(await act({ kind: "order", side: stockSide, instr, qty: n, ...(lim ? { limit: lim } : {}) })); }
      } else if (desk === "bonds") {
        const tenor = bondTenor(view, key);
        if (tenor && n) { sent = true; setLocal(await act({ kind: "bond", side: side === "sell" ? "sell" : "buy", tenor, bonds: n, ...(lim ? { limit: lim } : {}) })); }
      } else if (desk === "futures") {
        const good = futGood(view, key);
        const futSide = side === "short" || side === "flat" ? side : "long";
        if (good && (futSide === "flat" || n)) { sent = true; setLocal(await act({ kind: "fut", side: futSide, good, qty: futSide === "flat" ? 0 : n ?? 0, months })); }
      } else if (desk === "options") {
        const instr = optInstr(view, key);
        const listed = listedMonths(view, instr);
        const useMonths = listed.includes(months) ? months : listed[0];
        if (!instr || useMonths === undefined) {
          setLocal({ ok: false, text: "No listed contract for this name. Pick another, or let a day pass." });
          sent = true;
        } else if (n) {
          sent = true;
          if (side === "close") {
            const row = contract(view, instr, right, useMonths, strike);
            setLocal(await act(row ? { kind: "optclose", id: row.id, instr: "", qty: n } : { kind: "optclose", id: "", instr, qty: n }));
          } else if (side === "write") {
            setLocal(await act({ kind: "write", right, instr, qty: n, months: useMonths, strike }));
          } else {
            setLocal(await act({ kind: "optbuy", right, instr, qty: n, months: useMonths, strike }));
          }
        }
      } else if (desk === "coins") {
        const coin = coinId(view, key);
        if (coin && n) { sent = true; setLocal(await act({ kind: "coin", side: side === "sell" ? "sell" : "buy", coin, qty: n, ...(lim && MAJORS.has(coin) ? { limit: lim } : {}) })); }
      }
      if (!sent) setLocal({ ok: false, text: "Nothing on this desk matches. Pick a name on the left." });
    } catch {
      setLocal({ ok: false, text: "That did not go through." });
    }
    setBusy(false);
  };

  const state = orderWord(local ?? note);
  const exchange = desk === "stocks" || desk === "bonds" || desk === "futures" || desk === "options";
  const closed = exchange ? holidayReason(view.date.abs, parseCalendar(view.calendar)) : "";

  return (
    <div className="br" data-testid="broker">
      <button type="button" className="br-back" data-testid="br-terminal" onClick={() => setTerminal(true)}>Back to the chart</button>
      <div className="br-desks" role="group" aria-label="Desk">
        {DESKS.map((d) => (
          <button key={d.id} type="button" data-testid={`br-desk-${d.id}`} aria-pressed={desk === d.id} onClick={() => setDesk(d.id)}>{d.label}</button>
        ))}
      </div>
      <div className="br-grid">
        <div className="br-col br-col-head">
          <Market desk={desk} view={view} picked={key} onPick={setKey} months={months} right={right} strike={strike} onRight={setRight} onStrike={(k) => { setStrike(k); }} onMonths={setMonths} ask={ask} />
        </div>
        <div className="br-col br-col-ticket">
          {desk !== "fx" ? (
            <div className="br-seg" role="group" aria-label="Side">
              {sides(desk).map((s) => (
                <button key={s.id} type="button" aria-pressed={side === s.id} onClick={() => setSide(s.id)}>{s.label}</button>
              ))}
            </div>
          ) : null}
          {desk === "options" ? (
            <div className="br-seg" role="group" aria-label="Right">
              {(["C", "P"] as const).map((r) => (
                <button key={r} type="button" aria-pressed={right === r} onClick={() => setRight(r)}>{r === "C" ? "Call" : "Put"}</button>
              ))}
            </div>
          ) : null}
          <label className="br-field">{qtyLabel(desk, desk === "coins" ? coinId(view, key) : key, side)}
            <input className="br-qty" inputMode={spendsDollars(view, desk, key, side) ? "decimal" : "numeric"} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="br-qty" />
          </label>
          {desk === "futures" || desk === "options" ? (
            <label className="br-field">Months ahead
              <input className="br-qty" inputMode="numeric" value={String(months)} onChange={(e) => setMonths(clampMonth(e.target.value, desk))} data-testid="br-months" />
            </label>
          ) : null}
          {desk === "options" ? (
            <label className="br-field">Strike, dollars. 0 is at the money.
              <input className="br-qty" inputMode="decimal" value={strike ? (strike / 100).toFixed(2) : "0"} onChange={(e) => setStrike(strikeOf(e.target.value))} data-testid="br-strike" />
            </label>
          ) : null}
          {desk === "stocks" || desk === "bonds" || (desk === "coins" && MAJORS.has(coinId(view, key))) ? (
            <label className="br-field">Limit, dollars. Empty is a market order.
              <input className="br-qty" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} data-testid="br-limit" />
            </label>
          ) : null}
          <Preview desk={desk} view={view} picked={key} side={side} qty={qty} right={right} months={months} strike={strike} ask={ask} />
          {desk === "fx" ? <p className="br-note">The city dealer does not take a player order in foreign currency.</p> : (
            <Button variant="primary" data-testid="br-buy" disabled={busy || !!closed} onClick={() => void place()}>{busy ? "Sending…" : "Place"}</Button>
          )}
          {closed ? <p className="br-note" data-testid="br-closed">{closed}</p> : null}
          {desk === "coins" ? (
            <Button variant="secondary" data-testid="br-launch" disabled={busy} onClick={() => {
              setBusy(true);
              setLocal({ ok: true, text: "Sending…" });
              void act({ kind: "launch" }).then((n) => setLocal(n)).catch(() => setLocal({ ok: false, text: "That did not go through." })).finally(() => setBusy(false));
            }}>{busy ? "Sending…" : "Launch a coin"}</Button>
          ) : null}
          {desk === "stocks" ? <p className="br-note">A market order rests until the next day, then the market matches it.</p> : null}
          {desk === "options" ? <Payoff view={view} picked={key} right={right} months={months} strike={strike} /> : null}
          {desk === "options" ? <p className="br-note">The diagram is one contract, bought at the ask, held to expiry. A strike of 0 is at the money.</p> : null}
          {desk === "coins" ? <p className="br-note">A major rests on the book. A memecoin fills against its pool now. A launch needs the day, eight contacts, the nerve, and spare cash. The reply says why if it refuses.</p> : null}
          {state ? (
            <p className={state.word === "Rejected" ? "br-msg warn" : "br-note"} data-testid="br-note">
              <strong>{state.word}.</strong> {presentNote(state.text)}
            </p>
          ) : <p className="br-note" data-testid="br-note"> </p>}
          <Orders view={view} ask={ask} />
        </div>
      </div>
      <Cause cause={cause} onClose={close} />
    </div>
  );
}

function sides(desk: Desk): { id: string; label: string }[] {
  if (desk === "futures") return [{ id: "long", label: "Long" }, { id: "short", label: "Short" }, { id: "flat", label: "Flat" }];
  if (desk === "options") return [{ id: "buy", label: "Buy" }, { id: "write", label: "Write" }, { id: "close", label: "Close" }];
  if (desk === "stocks") return [{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }, { id: "short", label: "Short" }];
  return [{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell" }];
}

function qtyLabel(desk: Desk, key: string, side: string): string {
  if (desk === "bonds") return "Bonds";
  if (desk === "futures") return "Contracts";
  if (desk === "options") return "Contracts";
  if (desk === "coins" && key.startsWith("coin:me:")) return side === "sell" ? "Coins to sell" : "Dollars to spend";
  if (desk === "fx") return "Foreign currency";
  return "Qty";
}

function clampMonth(text: string, desk: Desk): number {
  const n = Number(text);
  const max = desk === "options" ? 6 : 5;
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(max, n);
}

function strikeOf(text: string): number {
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function picked(view: SimView, key: string): string {
  const quotes = view.quotes;
  const hit = quotes.find((q) => q.instr === key || symbolOf(q.instr) === key || q.symbol === key);
  return hit?.instr ?? quotes[0]?.instr ?? "";
}

function bondTenor(view: SimView, key: string): string {
  const curve = view.curve ?? [];
  if (curve.some((c) => c.tenor === key)) return key;
  return curve[0]?.tenor ?? "";
}

function futGood(view: SimView, key: string): string {
  const board = view.futuresBoard ?? [];
  if (board.some((b) => b.good === key)) return key;
  return board[0]?.good ?? "";
}

function optInstr(view: SimView, key: string): string {
  if (view.quotes.some((q) => q.instr === key)) return key;
  return view.quotes[0]?.instr ?? "";
}

function listedMonths(view: SimView, instr: string): number[] {
  return [...new Set((view.chain ?? []).filter((c) => c.instr === instr).map((c) => c.months))].sort((a, b) => a - b);
}

function coinId(view: SimView, key: string): string {
  const board = view.coinBoard ?? [];
  if (board.some((c) => c.id === key)) return key;
  return board[0]?.id ?? "";
}

function contract(view: SimView, instr: string, right: "C" | "P", months: number, strike: number) {
  const rows = (view.chain ?? []).filter((c) => c.instr === instr && c.right === right && c.months === months);
  if (strike > 0) return rows.find((c) => c.strike === strike);
  const spot = view.quotes.find((q) => q.instr === instr)?.px ?? 0;
  return [...rows].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
}

function Market({ desk, view, picked: key, onPick, months, right, strike, onRight, onStrike, onMonths, ask }: {
  desk: Desk;
  view: SimView;
  picked: string;
  onPick: (id: string) => void;
  months: number;
  right: "C" | "P";
  strike: number;
  onRight: (r: "C" | "P") => void;
  onStrike: (cents: number) => void;
  onMonths: (n: number) => void;
  ask: (id: number, title: string) => void;
}) {
  if (desk === "stocks") return <StockMarket view={view} picked={key} onPick={onPick} ask={ask} />;
  if (desk === "bonds") return <BondMarket view={view} picked={key} onPick={onPick} ask={ask} />;
  if (desk === "futures") return <FuturesMarket view={view} picked={key} months={months} onPick={onPick} onMonths={onMonths} ask={ask} />;
  if (desk === "options") return <OptionMarket view={view} picked={key} months={months} right={right} strike={strike} onPick={onPick} onMonths={onMonths} onRight={onRight} onStrike={onStrike} ask={ask} />;
  if (desk === "coins") return <CoinMarket view={view} picked={key} onPick={onPick} ask={ask} />;
  return <FxMarket view={view} ask={ask} />;
}

function StockMarket({ view, picked: key, onPick, ask }: { view: SimView; picked: string; onPick: (id: string) => void; ask: (id: number, title: string) => void }) {
  const instr = picked(view, key);
  const quote = view.quotes.find((q) => q.instr === instr);
  const bids = [...(quote?.book?.bids ?? [])].sort((a, b) => b.px - a.px);
  const asks = [...(quote?.book?.asks ?? [])].sort((a, b) => a.px - b.px);
  return (
    <>
      <label className="br-pick"><span className="label">Stock</span>
        <select className="br-select" data-testid="br-symbol" value={instr} onChange={(e) => onPick(e.target.value)}>
          {view.quotes.map((q) => <option key={q.instr} value={q.instr}>{symbolOf(q.instr)} · {q.name || q.instr}</option>)}
        </select>
      </label>
      {quote ? <QuoteLine quote={quote} ask={ask} /> : <p className="muted">No listed stocks yet.</p>}
      <div className="sim-book" data-testid="br-book">
        <BookSide title="Bids" rows={bids} id={quote?.eventId} ask={ask} />
        <BookSide title="Asks" rows={asks} id={quote?.eventId} ask={ask} />
      </div>
    </>
  );
}

function QuoteLine({ quote, ask }: { quote: Quote; ask: (id: number, title: string) => void }) {
  const sym = quote.symbol || symbolOf(quote.instr);
  return (
    <div className="br-quote">
      <span className="br-last"><NumBtn id={quote.eventId} title={`${sym} last`} ask={ask}><MoneyText amount={dollars(quote.px)} ctx="wealth" /></NumBtn></span>
      <NumBtn id={quote.eventId} title={`${sym} change`} ask={ask}><span className={`br-today ${tone(quote.chg)}`}>{signedPct(quote.chg)}</span></NumBtn>
      <span className="muted">{holdWord(quote.pos ?? 0)}</span>
    </div>
  );
}

function BookSide({ title, rows, id, ask }: { title: string; rows: { px: number; qty: number }[]; id?: number; ask: (id: number, title: string) => void }) {
  return (
    <div>
      <p className="label">{title}</p>
      {rows.length ? rows.map((lvl) => (
        <div key={lvl.px} className="sim-book-row">
          <span>{lvl.qty}</span>
          <NumBtn id={id} title={`${title} ${dollars(lvl.px)}`} ask={ask}><MoneyText amount={dollars(lvl.px)} ctx="table" /></NumBtn>
        </div>
      )) : <p className="muted">None</p>}
    </div>
  );
}

function BondMarket({ view, picked: key, onPick, ask }: { view: SimView; picked: string; onPick: (id: string) => void; ask: (id: number, title: string) => void }) {
  const curve = view.curve ?? [];
  const tenor = curve.some((c) => c.tenor === key) ? key : curve[0]?.tenor ?? "";
  return (
    <>
      <p className="label">Yield curve</p>
      <LineChart neutral points={curve.map((c) => c.yield)} labels={curve.map((c) => c.tenor)} label="Yield curve" format={(v) => levelPct(v * 100, 2)} height={88} />
      <div className="br-tenors">
        {curve.map((c) => (
          <div key={c.tenor} className="br-tenor" data-on={tenor === c.tenor ? "1" : "0"}>
            <button type="button" aria-pressed={tenor === c.tenor} onClick={() => onPick(c.tenor)}>{c.tenor}</button>
            <NumBtn id={c.eventId} title={`${c.tenor} yield`} ask={ask}><span className="num">{levelPct(c.yield * 100, 2)}</span></NumBtn>
            <NumBtn id={c.eventId} title={`${c.tenor} price`} ask={ask}><MoneyText amount={dollars(c.px)} ctx="table" /></NumBtn>
          </div>
        ))}
      </div>
      <select className="br-select" data-testid="br-symbol" value={tenor} onChange={(e) => onPick(e.target.value)}>
        {curve.map((c) => <option key={c.tenor} value={c.tenor}>{c.tenor}</option>)}
      </select>
    </>
  );
}

function FuturesMarket({ view, picked: key, months, onPick, onMonths, ask }: {
  view: SimView; picked: string; months: number; onPick: (id: string) => void; onMonths: (n: number) => void; ask: (id: number, title: string) => void;
}) {
  const board = view.futuresBoard ?? [];
  const good = board.some((b) => b.good === key) ? key : board[0]?.good ?? "";
  const book = board.find((b) => b.good === good);
  return (
    <>
      <label className="br-pick"><span className="label">Good</span>
        <select className="br-select" data-testid="br-symbol" value={good} onChange={(e) => onPick(e.target.value)}>
          {board.map((b) => <option key={b.good} value={b.good}>{b.name}</option>)}
        </select>
      </label>
      {book ? book.tenors.map((t) => (
        <div key={t.monthsAhead} className="sim-book-row">
          <button type="button" aria-pressed={months === t.monthsAhead} onClick={() => onMonths(Math.max(0, Math.min(5, t.monthsAhead)))}>{t.monthsAhead}m</button>
          <NumBtn id={book.eventId} title={`${book.name} ${t.monthsAhead}m`} ask={ask}>
            <span className={tone(t.px - t.prev)}><MoneyText amount={dollars(t.px)} ctx="table" /></span>
          </NumBtn>
        </div>
      )) : <p className="muted">No futures listed.</p>}
    </>
  );
}

type OptRow = NonNullable<SimView["chain"]>[number];

function expiryWord(months: number): string {
  if (months <= 0) return "This month";
  if (months === 1) return "1 month";
  return `${months} months`;
}

function daysLeft(months: number, day: number): number {
  return Math.max(0, months * 30 - Math.max(0, day - 1));
}

function OptionMarket({ view, picked: key, months, right, strike, onPick, onMonths, onRight, onStrike, ask }: {
  view: SimView; picked: string; months: number; right: "C" | "P"; strike: number;
  onPick: (id: string) => void; onMonths: (n: number) => void; onRight: (r: "C" | "P") => void; onStrike: (cents: number) => void;
  ask: (id: number, title: string) => void;
}) {
  const instr = view.quotes.some((q) => q.instr === key) ? key : view.quotes[0]?.instr ?? "";
  const chain = (view.chain ?? []).filter((c) => c.instr === instr);
  const monthList = [...new Set(chain.map((c) => c.months))].sort((a, b) => a - b);
  const month = monthList.includes(months) ? months : monthList[0] ?? months;
  const at = chain.filter((c) => c.months === month);
  const strikes = [...new Set(at.map((c) => c.strike))].sort((a, b) => a - b);
  const chosen = contract(view, instr, right, month, strike);
  const choose = (side: "C" | "P", k: number) => { onRight(side); onStrike(k); onMonths(month); };
  return (
    <>
      <label className="br-pick"><span className="label">Underlying</span>
        <select className="br-select" data-testid="br-symbol" value={instr} onChange={(e) => onPick(e.target.value)}>
          {view.quotes.map((q) => <option key={q.instr} value={q.instr}>{symbolOf(q.instr)}</option>)}
        </select>
      </label>
      <div className="br-desks" role="tablist" aria-label="Expiry">
        {monthList.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={month === m} aria-pressed={month === m} onClick={() => onMonths(m)}>{expiryWord(m)}</button>
        ))}
      </div>
      <div className="br-scroll">
        <table className="br-chain" data-testid="opt-chain">
          <thead><tr><th>Call bid / ask</th><th>Strike</th><th>Put bid / ask</th></tr></thead>
          <tbody>
            {strikes.map((k) => {
              const call = at.find((c) => c.strike === k && c.right === "C");
              const put = at.find((c) => c.strike === k && c.right === "P");
              return (
                <tr key={k}>
                  <td>{call ? <ChainCell row={call} on={chosen?.id === call.id} onPick={() => choose("C", k)} ask={ask} /> : "—"}</td>
                  <td className="num">{dollars(k)}</td>
                  <td>{put ? <ChainCell row={put} on={chosen?.id === put.id} onPick={() => choose("P", k)} ask={ask} /> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {strikes.length ? null : <p className="muted">No listed contracts.</p>}
      </div>
      <OpenContracts view={view} ask={ask} />
    </>
  );
}

function ChainCell({ row, on, onPick, ask }: { row: OptRow; on: boolean; onPick: () => void; ask: (id: number, title: string) => void }) {
  const name = row.right === "C" ? "Call" : "Put";
  return (
    <span className="br-chain-cell">
      <button type="button" aria-pressed={on} onClick={onPick}>
        <span className="num">{dollars(row.bid)}</span>
        <span className="br-chain-gap">/</span>
        <span className="num">{dollars(row.ask)}</span>
        {row.net ? <span className={tone(row.net)}> {row.net > 0 ? `long ${row.net}` : `short ${Math.abs(row.net)}`}</span> : null}
      </button>
      <NumBtn id={row.eventId} title={`${name} ${dollars(row.strike)}`} ask={ask}>{null}</NumBtn>
    </span>
  );
}

function OpenContracts({ view, ask }: { view: SimView; ask: (id: number, title: string) => void }) {
  const open = (view.chain ?? []).filter((c) => c.net !== 0);
  const day = view.date?.day ?? 1;
  return (
    <div data-testid="opt-open">
      <p className="label">Open contracts</p>
      {open.length ? open.map((row) => {
        const long = row.net > 0;
        const qty = Math.abs(row.net);
        const mark = (long ? row.bid : row.ask) * qty * 100;
        const left = daysLeft(row.months, day);
        const name = `${row.right === "C" ? "Call" : "Put"} ${symbolOf(row.instr)} ${dollars(row.strike)}`;
        return (
          <div key={row.id} className="sim-book-row" data-testid="opt-position">
            <NumBtn id={row.eventId} title={name} ask={ask}>
              <span>{long ? "Long" : "Short"} {qty} {name}</span>
            </NumBtn>
            <span className="num">{long ? dollars(mark) : `−${dollars(mark)}`}</span>
            <span className="muted">{left <= 0 ? "Expires today" : left === 1 ? "1 day left" : `${left} days left`}</span>
            <button type="button" data-testid="opt-close" onClick={() => void act({ kind: "optclose", id: row.id, instr: "", qty })}>Close</button>
          </div>
        );
      }) : <p className="muted">No open contracts.</p>}
    </div>
  );
}

function Payoff({ view, picked: key, right, months, strike }: {
  view: SimView; picked: string; right: "C" | "P"; months: number; strike: number;
}) {
  const instr = optInstr(view, key);
  const quote = view.quotes.find((q) => q.instr === instr);
  const listed = listedMonths(view, instr);
  const useMonths = listed.includes(months) ? months : listed[0];
  const row = useMonths === undefined ? undefined : contract(view, instr, right, useMonths, strike);
  if (!quote || !row || row.ask < 1) return <p className="muted" data-testid="opt-payoff">No listed contract to draw.</p>;
  const premium = row.ask;
  const spot = quote.px;
  const k = row.strike;
  const lo = Math.max(1, k * 0.55);
  const hi = k * 1.45;
  const n = 33;
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = lo + (hi - lo) * (i / (n - 1));
    const intrinsic = right === "C" ? Math.max(0, s - k) : Math.max(0, k - s);
    ys.push((intrinsic - premium) * 100);
  }
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const span = maxY - minY || 1;
  const w = 320;
  const h = 120;
  const pad = 8;
  const xOf = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const yOf = (v: number) => pad + (1 - (v - minY) / span) * (h - pad * 2);
  const d = ys.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const zero = yOf(0);
  const spotX = xOf(Math.max(0, Math.min(n - 1, ((spot - lo) / (hi - lo)) * (n - 1))));
  const be = right === "C" ? k + premium : k - premium;
  const above = right === "C";
  return (
    <div className="br-payoff" data-testid="opt-payoff">
      <p className="label">Payoff at expiry</p>
      <p className="br-note">
        {above ? "The call is ahead if the share finishes above" : "The put is ahead if the share finishes below"} {dollars(be)}. One contract, premium {dollars(premium * 100)} at the ask.
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Payoff diagram">
        <line x1={pad} x2={w - pad} y1={zero} y2={zero} className="br-pay-zero" />
        <path d={d} className="br-pay-line" />
        <line x1={spotX} x2={spotX} y1={pad} y2={h - pad} className="br-pay-spot" />
      </svg>
      <p className="muted">The upright line is the share now, {dollars(spot)}. The flat line is no gain and no loss.</p>
    </div>
  );
}

function CoinMarket({ view, picked: key, onPick, ask }: { view: SimView; picked: string; onPick: (id: string) => void; ask: (id: number, title: string) => void }) {
  const board = view.coinBoard ?? [];
  const id = board.some((c) => c.id === key) ? key : board[0]?.id ?? "";
  return (
    <>
      <label className="br-pick"><span className="label">Coin</span>
        <select className="br-select" data-testid="br-symbol" value={id} onChange={(e) => onPick(e.target.value)}>
          {board.map((c) => <option key={c.id} value={c.id}>{c.name}{c.live ? "" : " · dark"}</option>)}
        </select>
      </label>
      {board.filter((c) => c.id === id).map((c) => (
        <div key={c.id} className="br-quote">
          <NumBtn id={c.eventId} title={`${c.name} last`} ask={ask}><span className="br-last num">{priceOf(c.px)}</span></NumBtn>
          <span className="muted">{MAJORS.has(c.id) ? "Major, rests on the book" : c.live ? "Memecoin, fills now" : "Not live"}</span>
        </div>
      ))}
      {board.length ? null : <p className="muted">No coins listed.</p>}
    </>
  );
}

function priceOf(px: number): string {
  if (!Number.isFinite(px)) return "0.00";
  if (Number.isInteger(px)) return `$${dollars(px).replace("-", "\u2212")}`;
  return px.toFixed(4);
}

function FxMarket({ view, ask }: { view: SimView; ask: (id: number, title: string) => void }) {
  const fx = view.fx;
  if (!fx) return <p className="muted">No foreign quote.</p>;
  return (
    <div className="br-quote">
      <div>
        <p className="label">{fx.name || "Foreign"} · {fx.currency}</p>
        <p className="br-last"><NumBtn id={fx.eventId} title="Exchange rate" ask={ask}><span className="num">{fx.mid.toFixed(4)}</span></NumBtn></p>
        <p className="muted">home per {fx.currency || "foreign"}</p>
      </div>
      <p className="muted">Bid <NumBtn id={fx.eventId} title="Dealer bid" ask={ask}><span className="num">{fx.bid.toFixed(4)}</span></NumBtn></p>
      <p className="muted">Ask <NumBtn id={fx.eventId} title="Dealer ask" ask={ask}><span className="num">{fx.ask.toFixed(4)}</span></NumBtn></p>
      <p className="muted">You hold <NumBtn id={fx.eventId} title="Foreign cash" ask={ask}><span className="num">{dollars(fx.held)} {fx.currency}</span></NumBtn></p>
      <p className="muted">Foreign bonds <NumBtn id={fx.eventId} title="Foreign bonds" ask={ask}><span className="num">{dollars(fx.bonds)}</span></NumBtn></p>
      <p className="muted">Home rate <NumBtn id={fx.eventId} title="Home policy rate" ask={ask}><span className="num">{(fx.homeRate * 100).toFixed(2)}%</span></NumBtn> · foreign <NumBtn id={fx.eventId} title="Foreign policy rate" ask={ask}><span className="num">{(fx.foreignRate * 100).toFixed(2)}%</span></NumBtn></p>
    </div>
  );
}

function Preview({ desk, view, picked: key, side, qty, right, months, strike, ask }: {
  desk: Desk; view: SimView; picked: string; side: string; qty: string; right: "C" | "P"; months: number; strike: number;
  ask: (id: number, title: string) => void;
}) {
  const n = (spendsDollars(view, desk, key, side) ? dollarsToCents(qty) : whole(qty)) ?? 0;
  const lines = previewLines(desk, view, key, side, n, right, months, strike);
  if (!lines.length) return null;
  return (
    <div className="br-est" data-testid="br-preview">
      <p className="br-est-title label">Preview</p>
      <dl className="br-rows">
        {lines.map((line) => (
          <div key={line.label} className="br-row">
            <dt>{line.label}</dt>
            <dd>{line.cents == null ? line.text : <NumBtn id={line.eventId} title={line.label} ask={ask}><MoneyText amount={dollars(line.cents)} ctx="table" /></NumBtn>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function previewLines(desk: Desk, view: SimView, key: string, side: string, qty: number, right: "C" | "P", months: number, strike: number): { label: string; cents?: number; text?: string; eventId?: number }[] {
  if (desk === "stocks") {
    const quote = view.quotes.find((q) => q.instr === picked(view, key));
    if (!quote || qty < 1) return [];
    const px = side === "buy" ? (quote.ask || quote.px) : (quote.bid || quote.px);
    const lines = [{ label: side === "buy" ? "Cost" : "Proceeds", cents: qty * px, eventId: quote.eventId }];
    if (side === "short") lines.push({ label: "Face, needs a margin account", cents: qty * quote.px, eventId: quote.eventId });
    return lines;
  }
  if (desk === "bonds") {
    const tenor = bondTenor(view, key);
    const row = view.curve?.find((c) => c.tenor === tenor);
    if (!row || qty < 1) return [];
    return [
      { label: "Invoice", cents: qty * row.px, eventId: row.eventId },
      { label: "Face", cents: qty * LOT, eventId: row.eventId },
    ];
  }
  if (desk === "futures") {
    const good = futGood(view, key);
    const book = view.futuresBoard?.find((b) => b.good === good);
    const tenor = book?.tenors.find((t) => t.monthsAhead === months) ?? book?.tenors[0];
    if (!book || !tenor) return [];
    if (side === "flat") return [{ label: "Flat", text: "Closes that month. Posted margin comes back if the book accepts.", eventId: book.eventId }];
    if (qty < 1) return [];
    const note = qty * tenor.px * book.lot;
    return [
      { label: "Notional", cents: note, eventId: book.eventId },
      { label: "Initial margin", cents: Math.round(note * 0.12), eventId: book.eventId },
    ];
  }
  if (desk === "options") {
    const instr = optInstr(view, key);
    const quote = view.quotes.find((q) => q.instr === instr);
    const row = contract(view, instr, right, months, strike);
    if (!quote || qty < 1) return [];
    if (side === "close") {
      const px = row ? (row.net >= 0 ? row.bid : row.ask) : 0;
      return [{ label: "Close mark", cents: Math.abs(qty * px * 100), eventId: row?.eventId ?? quote.eventId }];
    }
    const bid = row?.bid ?? 0;
    const askPx = row?.ask ?? 0;
    if (side === "write") {
      return [
        { label: "Premium in", cents: qty * bid * 100, eventId: row?.eventId ?? quote.eventId },
        { label: "Margin posted", cents: writeMargin(quote.px, strike || row?.strike || quote.px, right, bid, askPx, qty), eventId: row?.eventId ?? quote.eventId },
      ];
    }
    return [{ label: "Premium", cents: qty * askPx * 100, eventId: row?.eventId ?? quote.eventId }];
  }
  if (desk === "coins") {
    const id = coinId(view, key);
    const coin = view.coinBoard?.find((c) => c.id === id);
    if (!coin || qty < 1) return [];
    if (id.startsWith("coin:me:")) {
      return [{ label: side === "sell" ? "Coins into the pool" : "Dollars into the pool", text: side === "sell" ? `${qty} coins` : `${dollars(qty)}`, eventId: coin.eventId }];
    }
    return [{ label: side === "sell" ? "Proceeds if it prints" : "Cost if it prints", cents: qty * Math.round(coin.px), eventId: coin.eventId }];
  }
  const fx = view.fx;
  if (!fx) return [];
  const q = qty > 0 ? qty : 1;
  return [{ label: `Buying ${q.toLocaleString("en-US")} of the foreign currency would cost`, cents: Math.round(q * 100 * fx.ask), eventId: fx.eventId }];
}

function Orders({ view, ask }: { view: SimView; ask: (id: number, title: string) => void }) {
  const orders = view.orders ?? [];
  return (
    <div data-testid="br-orders">
      <p className="label">Your orders</p>
      {orders.length ? orders.map((o) => (
        <div key={o.id} className="sim-book-row">
          <NumBtn id={o.eventId} title={`Order ${o.id}`} ask={ask}>
            <span>{o.side.charAt(0).toUpperCase() + o.side.slice(1)} {o.qty.toLocaleString("en-US")} {bookName(view, o.instr)}{o.limit ? ` @ ${moneyFromCents(o.limit)}` : ""}</span>
          </NumBtn>
          {o.book === "shares" ? (
            <button type="button" onClick={() => void act({ kind: "cancel", orderId: o.id })}>Cancel</button>
          ) : <span className="muted">Rests. This book does not take a cancel.</span>}
        </div>
      )) : <p className="muted">None resting.</p>}
    </div>
  );
}
