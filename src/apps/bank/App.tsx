"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { act, useSimSnap, type ActNote } from "@/shell/simSession";
import { Because, Field, Fig, Note, centsOf, moneyTitle, usePanel, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";

interface Loan { kind: string; owed: number; rate: number; eventId: number }
interface Deposit { bank: string; name: string; cents: number; eventId: number }
interface Bank {
  id: string; name: string; equity: number; deposits: number; ratio: number; word: string; failed: boolean; eventId: number;
}
interface Margin { limit: number; owed: number; room: number; rate: number; word: string; eventId: number }
interface Book { cash: number; cashEv: number; deposits: Deposit[]; loans: Loan[]; margin: Margin; banks: Bank[] }

function loanWord(kind: string): string {
  if (kind === "mortgage") return "A mortgage";
  if (kind === "margin") return "On margin";
  return "A consumer loan";
}

export default function BankApp() {
  const phone = usePhone();
  const { view } = useSimSnap();
  const why = useWhy();
  const panel = usePanel<Book>("name=bank", `${view?.date.abs ?? 0}:${view?.cash ?? 0}:${view?.loans?.length ?? 0}`);
  const [amount, setAmount] = useState("1000");
  const [note, setNote] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const book = panel.data;

  const go = async (op: "deposit" | "withdraw" | "borrow" | "repay") => {
    const cents = centsOf(amount);
    if (cents === null || cents < 1) { setNote({ ok: false, text: "Name an amount in dollars." }); return; }
    setBusy(true);
    setNote(await act({ kind: "cash", op, cents }));
    setBusy(false);
  };

  const margin = book?.margin;
  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="bank">
      <Note note={note} testId="bank-note" />
      <h2 className="qa-title">Your account</h2>
      {book ? (
        <div className="qa-kv">
          <p><span className="label">Cash</span><Fig word={book.cash > 0 ? "In hand" : "Nothing in hand"} title={moneyTitle(book.cash)} eventId={book.cashEv} onWhy={why.open} /></p>
          <p><span className="label">Margin</span><Fig word={margin?.word ?? "No collateral"} title={margin ? `limit ${moneyTitle(margin.limit)}, room ${moneyTitle(margin.room)}${margin.rate ? `, ${(margin.rate * 100).toFixed(1)}%` : ""}` : ""} eventId={margin?.eventId} onWhy={why.open} /></p>
        </div>
      ) : <p className="qa-muted">{panel.error || "Reading the bank…"}</p>}
      <div className="qa-block">
        <h2 className="qa-title">Deposits</h2>
        {book && !book.deposits.length ? <p className="qa-empty">Nothing on deposit. Put cash with a bank.</p> : null}
        {book?.deposits.map((d) => (
          <p key={d.bank}><Fig word="On deposit" title={moneyTitle(d.cents)} eventId={d.eventId} onWhy={why.open} /> <span className="qa-muted">at {d.name}</span></p>
        ))}
      </div>
      <div className="qa-block">
        <h2 className="qa-title">Loans</h2>
        {book && !book.loans.length ? <p className="qa-empty">You owe the bank nothing.</p> : null}
        {book?.loans.map((l, i) => (
          <p key={`${l.kind}-${i}`}><Fig word={loanWord(l.kind)} title={`${moneyTitle(l.owed)} at ${(l.rate * 100).toFixed(1)}%`} eventId={l.eventId} onWhy={why.open} /></p>
        ))}
      </div>
      <Field label="Amount"><input className="qa-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="bank-amount" /></Field>
      <div className="qa-actions">
        <Button variant="primary" disabled={busy} data-testid="bank-borrow" onClick={() => void go("borrow")}>Borrow</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void go("deposit")}>Deposit</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void go("withdraw")}>Withdraw</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void go("repay")}>Repay</Button>
      </div>
      <div className="qa-block">
        <h2 className="qa-title">The banks</h2>
        {book?.banks.map((b) => (
          <div key={b.id} className="qa-row">
            <span className="qa-row-main"><strong>{b.name}</strong></span>
            <Fig word={b.word} title={`equity ${moneyTitle(b.equity)}, deposits ${moneyTitle(b.deposits)}, ${(b.ratio * 100).toFixed(1)}% equity`} eventId={b.eventId} onWhy={why.open} />
          </div>
        ))}
      </div>
      <Because id={why.id} lines={why.lines} />
    </div>
  );
}
