"use client";
// Risk: margin used against the limit, the distance to a call, and what would be sold first.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "@/components/shell/MoneyText";
import { useShellStore } from "@/components/shell/ShellContext";
import { act, dollars, useSimSnap } from "@/shell/simSession";
import { Cause, NumBtn, tone, useCause } from "@/apps/markets/why";
import "./risk.css";

const WORD: Record<string, string> = {
  Closed: "No margin account is open.",
  Room: "Inside the limit, with room before a call.",
  Close: "The loan is more than half the limit.",
  Thin: "Near a call.",
  Called: "A call would close risk now.",
};

export default function RiskApp() {
  const { view, note } = useSimSnap();
  const { cause, ask, close } = useCause();
  const store = useShellStore();
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const risk = view?.risk;

  const openAccount = async () => {
    if (busy) return;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isInteger(cents) || cents < 1) return;
    setBusy(true);
    await act({ kind: "cash", op: "borrow", cents });
    setBusy(false);
  };

  if (!view || !risk) return <div className="rk" data-testid="risk"><p className="muted">The book is not open.</p></div>;

  if (!risk.open) {
    return (
      <div className="rk" data-testid="risk">
        <p className="rk-word" title={WORD.Closed}>Closed</p>
        <p className="muted">{WORD.Closed} Borrowing opens it. The bank names the limit in its reply, including when it lends nothing.</p>
        <label className="rk-field">Borrow, dollars
          <input className="rk-qty" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="rk-amount" />
        </label>
        <Button variant="primary" data-testid="rk-open" disabled={busy} onClick={() => void openAccount()}>Open a margin account</Button>
        {note ? <p className={note.ok ? "muted" : "rk-warn"} data-testid="rk-note">{note.text}</p> : null}
        <Cause cause={cause} onClose={close} />
      </div>
    );
  }

  const limit = risk.limit ?? 0;
  const used = risk.used ?? risk.loanOwed ?? 0;
  const width = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  const word = risk.word || "Room";
  const id = risk.eventId;

  return (
    <div className="rk" data-testid="risk">
      <p className={`rk-word rk-${word.toLowerCase()}`} title={WORD[word] ?? word} data-testid="rk-word">{word}</p>
      <p className="muted">{WORD[word] ?? word}</p>
      <div className="rk-bar" title={`${dollars(used)} of ${dollars(limit)}`}>
        <span data-word={word.toLowerCase()} style={{ width: `${width}%` }} />
      </div>
      <dl className="rk-rows">
        <Row label="Margin loan used" cents={used} id={id} ask={ask} />
        <Row label="Limit" cents={limit} id={id} ask={ask} />
        <Row label="Distance to a call" cents={risk.distance ?? 0} id={id} ask={ask} note={risk.distanceKind} />
        <Row label="Cash" cents={risk.cash ?? view.cash} id={id} ask={ask} />
        <Row label="Sale value of shares" cents={risk.sale ?? 0} id={id} ask={ask} />
        <Row label="Futures margin posted" cents={risk.futPosted ?? 0} id={id} ask={ask} />
        <Row label="Futures initial" cents={risk.futInit ?? 0} id={id} ask={ask} />
        <Row label="Futures maintenance" cents={risk.futMaint ?? 0} id={id} ask={ask} />
        <Row label="Option margin posted" cents={risk.optPosted ?? 0} id={id} ask={ask} />
        <Row label="Option requirement" cents={risk.optNeed ?? 0} id={id} ask={ask} />
        <Row label="Option maintenance" cents={risk.optMaint ?? 0} id={id} ask={ask} />
      </dl>
      {(risk.loanRate ?? 0) > 0 ? (
        <p className="muted">Loan rate <NumBtn id={id} title="Margin rate" ask={ask}><span className="num">{((risk.loanRate ?? 0) * 100).toFixed(2)}%</span></NumBtn></p>
      ) : null}
      <section>
        <h2 className="label">Sold first</h2>
        <p className="muted">A loan call sells these holdings in this order, every one of them. A futures call closes the futures book. An option call closes the written options.</p>
        {risk.sold?.length ? risk.sold.map((s) => (
          <div key={s.instr} className="rk-row" data-testid="rk-sold">
            <button type="button" className="rk-link" onClick={() => store.getState().open("broker", s.instr)}>{s.symbol} · {s.name} · {s.qty}</button>
            <NumBtn id={s.eventId} title={`${s.symbol} sale proceeds`} ask={ask}>
              <span className={tone(s.proceeds)}><MoneyText amount={dollars(s.proceeds)} ctx="table" /></span>
            </NumBtn>
          </div>
        )) : <p className="muted">No shares to sell.</p>}
      </section>
      <Cause cause={cause} onClose={close} />
    </div>
  );
}

function Row({ label, cents, id, ask, note }: { label: string; cents: number; id?: number; ask: (id: number, title: string) => void; note?: string }) {
  return (
    <div className="rk-row">
      <dt>{label}{note ? <span className="muted"> · {note}</span> : null}</dt>
      <dd><NumBtn id={id} title={label} ask={ask}><MoneyText amount={dollars(cents)} ctx="table" /></NumBtn></dd>
    </div>
  );
}
