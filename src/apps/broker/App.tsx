"use client";
// Broker on the simulation: every listed stock, the book, and the player's orders.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "@/components/shell/MoneyText";
import { act, dollars, symbolOf, useSimSnap, type Quote } from "@/shell/simSession";
import "./broker.css";

function pct(chg: number): string {
  const n = (chg * 100).toFixed(2);
  if (chg > 0) return `+${n}`;
  return n;
}

export default function BrokerApp({ context }: { context?: string }) {
  const { view, note } = useSimSnap();
  const quotes = view?.quotes ?? [];
  const [pick, setPick] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell" | "short">("buy");
  const [qty, setQty] = useState("1");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);

  const instr = useMemo(() => {
    const fromContext = context
      ? quotes.find((q) => q.instr === context || symbolOf(q.instr) === context || q.symbol === context)
      : undefined;
    if (pick && quotes.some((q) => q.instr === pick)) return pick;
    return fromContext?.instr ?? quotes[0]?.instr ?? "";
  }, [context, pick, quotes]);
  const quote: Quote | undefined = quotes.find((q) => q.instr === instr);
  const orders = view?.orders ?? [];

  const place = async () => {
    if (!quote || busy) return;
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return;
    const cmd: { kind: "order"; side: typeof side; instr: string; qty: number; limit?: number } = {
      kind: "order", side, instr: quote.instr, qty: n,
    };
    if (limit.trim()) {
      const cents = Math.round(Number(limit) * 100);
      if (!Number.isInteger(cents) || cents < 1) return;
      cmd.limit = cents;
    }
    setBusy(true);
    await act(cmd);
    setBusy(false);
  };

  const bids = [...(quote?.book?.bids ?? [])].sort((a, b) => b.px - a.px);
  const asks = [...(quote?.book?.asks ?? [])].sort((a, b) => a.px - b.px);

  return (
    <div className="br" data-testid="broker">
      <div className="br-grid">
        <div className="br-col br-col-head">
          <div className="br-head">
            <label className="br-pick">
              <span className="label">Stock</span>
              <select className="br-select" data-testid="br-symbol" value={instr} onChange={(e) => setPick(e.target.value)}>
                {quotes.map((q) => (
                  <option key={q.instr} value={q.instr}>{symbolOf(q.instr)} · {q.name || q.instr}</option>
                ))}
              </select>
            </label>
            {quote ? (
              <div className="br-quote">
                <span className="br-last"><MoneyText amount={dollars(quote.px)} ctx="list" /></span>
                <span className="br-today num">{pct(quote.chg)}%</span>
                {quote.bid ? <span className="muted">Bid <MoneyText amount={dollars(quote.bid)} ctx="list" /></span> : null}
                {quote.ask ? <span className="muted">Ask <MoneyText amount={dollars(quote.ask)} ctx="list" /></span> : null}
              </div>
            ) : <p className="muted">No listed stocks yet.</p>}
          </div>
          <div className="sim-book" data-testid="br-book">
            <div>
              <p className="label">Bids</p>
              {bids.length ? bids.map((lvl) => (
                <div key={`b${lvl.px}`} className="sim-book-row"><span>{lvl.qty}</span><MoneyText amount={dollars(lvl.px)} ctx="list" /></div>
              )) : <p className="muted">None</p>}
            </div>
            <div>
              <p className="label">Asks</p>
              {asks.length ? asks.map((lvl) => (
                <div key={`a${lvl.px}`} className="sim-book-row"><span>{lvl.qty}</span><MoneyText amount={dollars(lvl.px)} ctx="list" /></div>
              )) : <p className="muted">None</p>}
            </div>
          </div>
        </div>
        <div className="br-col br-col-ticket">
          <div className="br-seg" role="group" aria-label="Side">
            {(["buy", "sell", "short"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>{s}</button>
            ))}
          </div>
          <label className="br-field">Qty
            <input className="br-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="br-qty" />
          </label>
          <label className="br-field">Limit, dollars. Empty is a market order.
            <input className="br-qty" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} data-testid="br-limit" />
          </label>
          <Button variant="primary" data-testid="br-buy" disabled={busy || !quote} onClick={() => void place()}>Place</Button>
          <p className="br-note">A market order rests until the next day, then the market matches it.</p>
          {note ? <p className={note.ok ? "br-note" : "br-msg warn"} data-testid="br-note">{note.text}</p> : null}
          <div data-testid="br-orders">
            <p className="label">Your orders</p>
            {orders.length ? orders.map((o) => (
              <div key={o.id} className="sim-book-row">
                <span>{o.side} {o.qty} {symbolOf(o.instr)}{o.limit ? ` @ ${dollars(o.limit)}` : ""}</span>
                <button type="button" onClick={() => void act({ kind: "cancel", orderId: o.id })}>Cancel</button>
              </div>
            )) : <p className="muted">None resting.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
