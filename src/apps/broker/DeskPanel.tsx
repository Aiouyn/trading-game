"use client";
// The bottom of the terminal: every open position and every working order, on any market, with close, cancel and modify.
// And the session rules the ticket shows: one set for every share order, the same ones the sim applies.
import { Fragment, useState } from "react";
import { symbolOf, type OrderRow, type SimView } from "@/shell/simSession";
import { moneyFromCents } from "@/components/ui/format";
import { shortDate } from "@/shell/calendar";
import { STATUS_WORD, orderRecords, tickWord, type OrderLife } from "@/components/market/facts";

/** An order as the sim lists it, with what the desk knows about it: a protective order, a bracket, an order for the open. */
export type DeskOrder = Omit<OrderRow, "mode"> & { mode?: "stop" | "limit" | "open"; protect?: boolean; oco?: number; bracket?: { stop?: number; target?: number } };

type Session = "open" | "closed" | "pre" | "after" | undefined;

/** When shares trade, what rests and what fills when: the rule for the order on the ticket. */
export function sessionRules(session: Session, otype: string, side: string): string {
  const hours = "Shares trade 09:30 to 16:00 on weekdays.";
  const shorting = side === "short" ? " A short borrows the shares when it fills, never before." : "";
  if (session === "open" || session === undefined) {
    if (otype === "market") return `${hours} The exchange is open: a market order fills now, against the best prices in the book.${shorting}`;
    if (otype === "limit") return `${hours} The exchange is open: a limit fills now as far as the book reaches your price, and the rest waits for the price to come to it.${shorting}`;
    return `${hours} The exchange is open: a stop watches every minute's price and sends a market order the minute it is touched.${shorting}`;
  }
  const shut = session === "pre" ? "not open yet" : session === "after" ? "closed for the day" : "closed today";
  if (otype === "market") return `${hours} The exchange is ${shut}: nothing fills now. A market order waits and goes in at the next open, at the price the open brings.${shorting}`;
  if (otype === "limit") return `${hours} The exchange is ${shut}: nothing fills now. A limit rests and can fill from the next open, at your price or better.${shorting}`;
  return `${hours} The exchange is ${shut}: a stop waits and starts watching the price at the next open. A gap at the open fills it at the open's price.${shorting}`;
}

function nameOf(instr: string, view: SimView): string {
  if (instr.startsWith("eq:")) return symbolOf(instr);
  if (instr.startsWith("fut:")) return view.futuresBoard?.find((b) => b.good === instr.slice(4))?.name ?? instr.slice(4);
  if (instr.startsWith("fx:")) return instr.slice(3);
  if (instr.startsWith("bond:")) return `${instr.split(":")[1] ?? ""} Treasury`;
  return view.coinBoard?.find((c) => c.id === instr)?.name ?? instr.replace(/^coin:(me:)?/, "");
}

function priceOf(cents: number): string {
  return cents < 100 && cents > 0 && cents % 1 !== 0 ? `$${(cents / 100).toFixed(6)}` : moneyFromCents(Math.round(cents));
}

interface Row { key: string; instr: string; kind: string; qty: number; entry: number; mark: number; pnl: number; month?: number; close: unknown; closeWord: string; unit: string }

function rowsOf(view: SimView): Row[] {
  const monthNow = Math.floor((view.date?.abs ?? 0) / 30);
  const out: Row[] = [];
  for (const p of view.positions ?? []) {
    if (!p.qty) continue;
    let mark = 0, scale = 1, close: unknown, closeWord = "Close";
    if (p.kind === "share") {
      mark = view.quotes.find((q) => q.instr === p.instr)?.px ?? 0;
      close = { kind: "order", side: p.qty > 0 ? "sell" : "buy", instr: p.instr, qty: Math.abs(p.qty), type: "market" };
      closeWord = p.qty > 0 ? "Sell" : "Cover";
    } else if (p.kind === "coin") {
      mark = view.coinBoard?.find((c) => c.id === p.instr)?.px ?? view.coins.find((c) => c.id === p.instr)?.px ?? 0;
      close = { kind: "coin", side: "sell", coin: p.instr, qty: p.qty };
      closeWord = "Sell";
    } else if (p.kind === "fx") {
      mark = view.fx?.pairs?.find((x) => x.id === p.instr)?.bid ?? 0;
      scale = 100;
      close = { kind: "fx", side: "sell", code: p.instr.slice(3), units: p.qty };
      closeWord = "Sell";
    } else {
      const board = view.futuresBoard?.find((b) => b.good === p.instr.slice(4));
      mark = board?.tenors.find((t) => t.monthsAhead === (p.month ?? monthNow) - monthNow)?.px ?? 0;
      scale = board?.lot ?? 1;
      close = { kind: "fut", side: "flat", good: p.instr.slice(4), qty: 0, months: Math.max(0, (p.month ?? monthNow) - monthNow) };
      closeWord = "Flatten";
    }
    const pnl = mark > 0 ? Math.round(p.qty * (mark - p.entry) * scale) : 0;
    out.push({ key: p.key, instr: p.instr, kind: p.kind, qty: p.qty, entry: p.entry, mark, pnl, month: p.month, close, closeWord, unit: p.kind === "fx" ? "fx" : "cents" });
  }
  return out;
}

/** The size of an order in the words of its desk: a Treasury order is in face cents, a memecoin buy in dollars to spend. */
function sizeWord(instr: string, book: string, side: string, qty: number): string {
  if (instr.startsWith("bond:") || book === "bonds") { const n = Math.round(qty / 16000); return `${n.toLocaleString("en-US")} bond${n === 1 ? "" : "s"}, face ${moneyFromCents(qty)}`; }
  if (instr.startsWith("coin:me:") && side === "buy") return `${moneyFromCents(qty)} to spend`;
  return qty.toLocaleString("en-US");
}

/** The price an order carries: a limit or a stop is its price; a market order has none until it fills. */
function priceWord(o: DeskOrder, life: OrderLife | undefined): string {
  const at = o.stop ?? o.limit;
  if (at) return priceOf(at);
  if (life && life.type !== "market" && life.limit) return priceOf(life.limit);
  if (o.mode === "open" || life?.status === "queued") return "market: no price until it fills";
  return "market";
}

function px(unit: string, v: number): string {
  return unit === "fx" ? v.toFixed(4) : priceOf(v);
}

function typeWord(o: DeskOrder, life?: OrderLife): string {
  if (life?.type === "market" || life?.type === "market-at-open") return o.book === "bonds" ? "Treasury market" : "market, at the open";
  if (o.book !== "stops") return o.book === "bonds" ? "bond limit" : "limit";
  if (o.mode === "open") return "at the open";
  if (o.mode === "limit") return o.protect ? "target" : "limit";
  return o.limit != null ? "stop-limit" : "stop";
}

export function PositionsPanel({ view, instr, busy, onPick, onSend, onCancel, onModify }: {
  view: SimView; instr: string; busy: boolean;
  onPick: (instr: string) => void; onSend: (cmd: unknown) => void; onCancel: (id: number) => void;
  onModify: (o: DeskOrder, cents: number, qty?: number) => Promise<void>;
}) {
  const [tab, setTab] = useState<"pos" | "orders">("pos");
  const [edit, setEdit] = useState<{ id: number; price: string; qty: string } | null>(null);
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setShown((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rows = rowsOf(view);
  const orders = (view.orders ?? []) as DeskOrder[];
  const lives = orderRecords(view);
  // finished orders stay on screen as records: what filled, when, at what price and fee, and what was turned away
  // A record still marked queued or working whose order is no longer on the book has left it: it filled or was taken off. Say so, never "queued".
  const gone = (l: OrderLife) => !orders.some((o) => o.id === l.id && (o.book === l.book || (l.book === "desk" && o.book === "stops")));
  const recent = lives.filter((l) => gone(l)).slice(-8).reverse();
  const left = (l: OrderLife) => (l.status === "queued" || l.status === "working") && gone(l);
  const total = rows.reduce((s, r) => s + r.pnl, 0);
  const monthNow = Math.floor((view.date?.abs ?? 0) / 30);
  return (
    <section className="tm-desk" aria-label="Positions and orders" data-testid="tm-desk">
      <div className="tm-desk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "pos"} onClick={() => setTab("pos")} data-testid="tm-desk-pos">Positions ({rows.length})</button>
        <button type="button" role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")} data-testid="tm-desk-orders">Working orders ({orders.length})</button>
        {tab === "pos" && rows.length ? <span className={total >= 0 ? "gain" : "loss"}>Open P&amp;L {total >= 0 ? "+" : "-"}{moneyFromCents(Math.abs(total))}</span> : null}
      </div>
      {tab === "pos" ? (
        rows.length ? (
          <table className="tm-desk-t">
            <thead><tr><th>Market</th><th>Position</th><th>Avg price</th><th>Last</th><th>Open P&amp;L</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-on={r.instr === instr ? "1" : "0"} data-testid="tm-desk-row">
                  <td><button type="button" className="tm-desk-name" onClick={() => onPick(r.instr)}>{nameOf(r.instr, view)}{r.month !== undefined ? ` ${r.month - monthNow > 0 ? `+${r.month - monthNow}m` : "front"}` : ""}</button></td>
                  <td>{r.qty < 0 ? `Short ${Math.abs(r.qty).toLocaleString("en-US")}` : `Long ${r.qty.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</td>
                  <td>{px(r.unit, r.entry)}</td>
                  <td>{r.mark > 0 ? px(r.unit, r.mark) : "-"}</td>
                  <td className={r.pnl >= 0 ? "gain" : "loss"}>{r.pnl >= 0 ? "+" : "-"}{moneyFromCents(Math.abs(r.pnl))}</td>
                  <td><button type="button" className="tm-ghost" disabled={busy} onClick={() => onSend(r.close)} data-testid="tm-desk-close" title={`${r.closeWord} the whole position at market`}>{r.closeWord}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted tm-desk-none">No open positions. What you buy or short shows here, with its average price and open profit or loss.</p>
      ) : orders.length || recent.length ? (
        <>
        {orders.length ? (
        <table className="tm-desk-t" data-testid="tm-orders-table">
          <thead><tr><th>Market</th><th>Order</th><th>Size</th><th>Price</th><th>Status</th><th /></tr></thead>
          <tbody>
            {orders.map((o) => {
              const at = o.stop ?? o.limit;
              const editing = edit?.id === o.id;
              const canModify = o.mode !== "open" && o.book !== "bonds";
              const life = lifeOf(lives, o.id, o.book);
              const open = shown.has(`${o.book}:${o.id}`);
              return (
                <Fragment key={`${o.book}:${o.id}`}>
                <tr data-testid="tm-desk-order" data-status={life?.status ?? "working"}>
                  <td><button type="button" className="tm-desk-name" onClick={() => onPick(o.instr)}>{nameOf(o.instr, view)}</button></td>
                  <td title={[o.protect ? "Protects your position and comes off with it" : "", o.oco !== undefined ? "One cancels the other: when one fills, the other comes off" : "", o.bracket ? "Puts a stop and a target on what fills" : ""].filter(Boolean).join(". ")}>{typeWord(o, life)} {o.side}{o.oco !== undefined ? <small className="muted"> OCO</small> : o.protect ? <small className="muted"> protects</small> : null}{o.bracket ? <small className="muted"> +bracket</small> : null}</td>
                  <td>{editing ? <input className="tm-desk-in" value={edit.qty} inputMode="numeric" onChange={(e) => setEdit({ ...edit, qty: e.target.value })} aria-label="New size" /> : sizeWord(o.instr, o.book, o.side, o.qty)}</td>
                  <td>{editing ? <input className="tm-desk-in" value={edit.price} inputMode="decimal" onChange={(e) => setEdit({ ...edit, price: e.target.value })} aria-label="New price" data-testid="tm-desk-price" /> : priceWord(o, life)}</td>
                  <td className="tm-desk-status" data-testid="tm-order-status">
                    <b>{life ? STATUS_WORD[life.status] : "Resting"}</b>
                    {life?.next ? <small>{life.status === "queued" ? `executes ${life.next}` : life.next}</small> : null}
                  </td>
                  <td className="tm-desk-acts">
                    {editing ? (
                      <>
                        <button type="button" className="tm-ghost" disabled={busy} data-testid="tm-desk-save" onClick={() => {
                          const p = Number(edit.price), q = Math.floor(Number(edit.qty));
                          const cents = o.instr.startsWith("coin:me:") ? p * 100 : Math.round(p * 100);
                          void onModify(o, cents, q > 0 && q !== o.qty ? q : undefined).then(() => setEdit(null));
                        }}>Save</button>
                        <button type="button" className="tm-ghost" onClick={() => setEdit(null)}>Back</button>
                      </>
                    ) : (
                      <>
                        {life ? <button type="button" className="tm-ghost" aria-expanded={open} data-testid="tm-order-more" onClick={() => toggle(`${o.book}:${o.id}`)}>{open ? "Hide" : "Record"}</button> : null}
                        {canModify ? <button type="button" className="tm-ghost" disabled={busy} data-testid="tm-desk-modify" onClick={() => setEdit({ id: o.id, price: at ? (at / 100).toFixed(at < 100 ? 6 : 2) : "", qty: String(o.qty) })}>Modify</button> : null}
                        {o.book !== "bonds" ? <button type="button" className="tm-ghost" disabled={busy} data-testid="tm-desk-cancel" onClick={() => onCancel(o.id)}>Cancel</button> : <small className="muted" title="A Treasury order matches once a day, at the open. This desk cannot take it back.">cannot be cancelled</small>}
                      </>
                    )}
                  </td>
                </tr>
                {open && life ? <tr className="tm-life-row"><td colSpan={6}><LifeRecord life={life} /></td></tr> : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        ) : <p className="muted tm-desk-none">No working orders.</p>}
        {recent.length ? (
          <table className="tm-desk-t tm-desk-recent" data-testid="tm-orders-recent">
            <caption>Recent orders</caption>
            <tbody>
              {recent.map((life) => {
                const open = shown.has(`${life.book}:${life.id}`);
                return (
                  <Fragment key={`${life.book}:${life.id}`}>
                    <tr data-status={life.status}>
                      <td>{nameOf(life.instr, view)}</td>
                      <td>{life.side} {sizeWord(life.instr, life.book, life.side, life.qty)}</td>
                      <td className="tm-desk-status"><b>{left(life) ? "Left the queue" : STATUS_WORD[life.status]}</b>{left(life) ? <small>it filled or was taken off; your positions show the result</small> : life.reason ? <small>{life.reason}</small> : null}</td>
                      <td className="tm-desk-acts"><button type="button" className="tm-ghost" aria-expanded={open} onClick={() => toggle(`${life.book}:${life.id}`)}>{open ? "Hide" : "Record"}</button></td>
                    </tr>
                    {open ? <tr className="tm-life-row"><td colSpan={4}><LifeRecord life={life} /></td></tr> : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : null}
        </>
      ) : <p className="muted tm-desk-none">No working orders. Limits, stops, targets and orders for the open wait here until they fill or you cancel them.</p>}
    </section>
  );
}

function lifeOf(list: OrderLife[], id: number, book: string): OrderLife | undefined {
  // the desk's own orders (stops, limits, orders for the open) are listed as "stops" on the book and "desk" in the record
  return list.find((l) => l.id === id && (l.book === book || (book === "stops" && l.book === "desk")));
}

/** One order's record: where it stands, what cash it holds, every fill with its time, price and fee, and what was turned away. */
function LifeRecord({ life }: { life: OrderLife }) {
  const filled = life.fills.reduce((n, x) => n + x.qty, 0);
  const left = Math.max(0, life.qty - filled - life.rejectedQty);
  const bonds = life.instr.startsWith("bond:") || life.book === "bonds";
  const unit = (n: number) => (bonds ? `${Math.round(n / 16000).toLocaleString("en-US")} bond${Math.round(n / 16000) === 1 ? "" : "s"}` : n.toLocaleString("en-US"));
  return (
    <dl className="tm-life" data-testid="tm-order-record">
      <div><dt>Status</dt><dd>{STATUS_WORD[life.status]}{life.next ? `, ${life.status === "queued" ? "executes " : ""}${life.next}` : ""}{life.reason ? `. ${life.reason}` : ""}</dd></div>
      <div><dt>Cash held for it</dt><dd>{life.reserved > 0 ? moneyFromCents(life.reserved) : "none"}</dd></div>
      <div><dt>Filled</dt><dd>{unit(filled)} of {unit(life.qty)}{left > 0 && life.status !== "cancelled" && life.status !== "rejected" ? `, ${unit(left)} still to go` : ""}</dd></div>
      {life.fills.map((x, i) => (
        <div key={i}><dt>Fill {i + 1}</dt><dd>{unit(x.qty)} at {moneyFromCents(x.px)}, {shortDate(x.day)}, {tickWord(x.tick)}{x.fee > 0 ? `, fee ${moneyFromCents(x.fee)}` : ""}</dd></div>
      ))}
      {life.rejectedQty > 0 ? <div><dt>Turned away</dt><dd>{unit(life.rejectedQty)}{life.reason ? `: ${life.reason}` : ""}</dd></div> : null}
      <div><dt>Fees in all</dt><dd>{life.fee > 0 ? moneyFromCents(life.fee) : "none"}</dd></div>
    </dl>
  );
}
