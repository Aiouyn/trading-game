"use client";
// The quote panel: what the market says about this name right now, with the source of every number.
// Shares: the official mark apart from the executable bid and ask, the last real fill and when it was, and session volume.
// Futures, currency, coins and Treasuries each show their own desk's quote. The index shows its method.
import { moneyFromCents } from "@/components/ui/format";
import { lastFillWord, quoteFacts } from "@/components/market/facts";
import { priceText, volText } from "@/components/market/terminalApi";
import type { SimView } from "@/shell/simSession";

interface FutureQuote { spot: number; front: number; roll: number; bid: number; ask: number; fee: number; roundTripCost: number }
interface FxRow { id: string; mid: number; bid: number; ask: number; fee?: number; roundTripCost?: number; executableSize?: number; stress?: number }

function Row({ k, v, title, tone }: { k: string; v: React.ReactNode; title?: string; tone?: string }) {
  return <div className="tm-q-row" title={title}><dt>{k}</dt><dd className={tone}>{v}</dd></div>;
}

export function QuotePanel({ view, instr, last }: { view: SimView; instr: string; last: number }) {
  if (instr.startsWith("eq:")) {
    const f = quoteFacts(view, instr);
    if (!f) return null;
    const bid = f.bid ?? 0, ask = f.ask ?? 0;
    const spread = bid > 0 && ask > 0 ? ask - bid : 0;
    const today = f.asOf !== "last session";
    return (
      <dl className="tm-quote" data-testid="tm-quote" aria-label="Quote">
        <Row k="Mark" v={moneyFromCents(f.mark ?? f.px)} title={`The official mark: ${f.markRule ?? ""}. ${f.markInputs ?? ""}`} />
        <Row k="Bid" v={bid > 0 ? <>{moneyFromCents(bid)} <small>× {(f.bidQty ?? 0).toLocaleString("en-US")}</small></> : "no bid"} tone={bid > 0 ? undefined : "muted"} title="The best price a buyer will pay now, with the size on offer" />
        <Row k="Ask" v={ask > 0 ? <>{moneyFromCents(ask)} <small>× {(f.askQty ?? 0).toLocaleString("en-US")}</small></> : "no ask"} tone={ask > 0 ? undefined : "muted"} title="The best price a seller will take now, with the size on offer" />
        {spread > 0 ? <Row k="Spread" v={moneyFromCents(spread)} title="What a round trip at market costs per share, before fees" /> : null}
        <Row k="Last trade" v={f.lastExecPx ? <>{moneyFromCents(f.lastExecPx)} <small>{lastFillWord(f)}</small></> : "none yet"} title="The last real fill on this name. The mark is not a trade." />
        <Row k={today ? "Volume today" : "Volume, last session"} v={f.vol > 0 ? <>{volText(f.vol)} <small>real fills</small></> : <span className="muted">none traded</span>} title={f.vol > 0 ? "Shares that really changed hands" : "No fills printed, so there is no volume. The price is the mark."} />
        <Row k="As of" v={today ? "today" : "last session"} title={f.sessionDate ?? ""} />
        <Row k="Change" v={<span className={f.chg >= 0 ? "gain" : "loss"}>{f.chg >= 0 ? "+" : ""}{(f.chg * 100).toFixed(2)}% <small>vs {f.chgBase ?? "previous close"}</small></span>} />
      </dl>
    );
  }
  if (instr.startsWith("fut:")) {
    const b = view.futuresBoard?.find((x) => x.good === instr.slice(4));
    const q = (b as unknown as { quote?: FutureQuote | null } | undefined)?.quote;
    if (!b || !q) return null;
    return (
      <dl className="tm-quote" data-testid="tm-quote" aria-label="Quote">
        <Row k="Spot" v={moneyFromCents(q.spot)} title="The price of the good itself today" />
        <Row k="Front month" v={moneyFromCents(q.front)} />
        <Row k="Roll to chosen month" v={`${q.roll >= 0 ? "+" : "-"}${moneyFromCents(Math.abs(q.roll))}`} title="The gap between this delivery month and the front month. You carry it." />
        <Row k="Bid / ask" v={`${moneyFromCents(q.bid)} / ${moneyFromCents(q.ask)}`} title="For one contract" />
        <Row k="Fee, one way" v={moneyFromCents(q.fee)} />
        <Row k="Round trip" v={moneyFromCents(q.roundTripCost)} title="Spread and fees to open and flatten one contract. Larger sizes and fast markets cost more." />
        <Row k="One contract" v={`${b.lot.toLocaleString("en-US")} units`} />
      </dl>
    );
  }
  if (instr.startsWith("fx:")) {
    const p = view.fx?.pairs?.find((x) => x.id === instr) as unknown as FxRow | undefined;
    if (!p) return null;
    return (
      <dl className="tm-quote" data-testid="tm-quote" aria-label="Quote">
        <Row k="Mid" v={p.mid.toFixed(4)} title="Dollars per unit of the foreign currency" />
        <Row k="Dealer bid / ask" v={`${p.bid.toFixed(4)} / ${p.ask.toFixed(4)}`} title="What the dealer pays and charges for 100 units" />
        <Row k="Fee, 100 units" v={moneyFromCents(p.fee ?? 0)} />
        <Row k="Round trip, 100 units" v={moneyFromCents(p.roundTripCost ?? 0)} title="Spread and fee to buy and sell 100 units at once. Bigger sizes and a stressed market widen it." />
        <Row k="Quoted size" v={`${(p.executableSize ?? 100).toLocaleString("en-US")} units`} />
      </dl>
    );
  }
  if (instr.startsWith("coin:")) {
    const c = view.coinBoard?.find((x) => x.id === instr);
    if (!c) return null;
    const major = !instr.startsWith("coin:me:");
    return (
      <dl className="tm-quote" data-testid="tm-quote" aria-label="Quote">
        <Row k="Last" v={priceText("cents", last > 0 ? last : c.px)} />
        <Row k="Fills" v={major ? "against the book, a limit rests" : "against its pool, now"} title={major ? "Majors match against resting orders. A market order fills as far as the book reaches." : "A memecoin trades against a pool: the price moves as you buy."} />
        <Row k="Spread" v={major ? "set by the book" : "none: a pool, with price impact"} />
      </dl>
    );
  }
  if (instr.startsWith("bond:")) {
    const row = view.curve?.find((c) => instr.startsWith(`bond:${c.tenor}`));
    if (!row) return null;
    return (
      <dl className="tm-quote" data-testid="tm-quote" aria-label="Quote">
        <Row k="Yield" v={`${(row.yield * 100).toFixed(2)}%`} />
        <Row k="Price, one bond" v={moneyFromCents(row.px)} title="A bond has a face of $160.00" />
        <Row k="Executes" v="at the next open" title="Treasury orders match once a day, at the open. A market order carries no price until then." />
      </dl>
    );
  }
  return null;
}
