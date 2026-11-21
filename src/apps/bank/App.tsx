"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { act, useSimSnap, type ActNote } from "@/shell/simSession";
import { Because, Field, Fig, Note, centsOf, moneyTitle, usePanel, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";
import { plainCopy } from "@/components/market/copy";
import { creditSentence, edgeOf, haircutOf } from "@/apps/research/edge";
import "@/apps/research/research.css";
import { LoanPreview } from "./LoanPreview";
import "./bank.css";

type Product = "margin" | "line" | "term";
const PRODUCTS: { id: Product; name: string; terms: string }[] = [
  { id: "margin", name: "Margin", terms: "Floats with the policy rate, and is called when the shares slip." },
  { id: "line", name: "Credit line", terms: "Cheaper than margin, but due every quarter, and not rolled in a crunch." },
  { id: "term", name: "Term loan", terms: "A deeper haircut, a fixed rate for three years, and not called while the payments are made." },
];

interface Claim { owed: number; eventId: number; text: string }
interface Loan { kind: string; owed: number; rate: number; eventId: number }
interface Deposit { bank: string; name: string; cents: number; eventId: number }
interface Bank {
  id: string; name: string; equity: number; deposits: number; ratio: number; word: string; failed: boolean; eventId: number;
}
interface Margin { limit: number; owed: number; room: number; rate: number; word: string; eventId: number }
interface Book { cash: number; cashEv: number; deposits: Deposit[]; claims?: Claim[]; loans: Loan[]; margin: Margin; banks: Bank[] }

function loanWord(kind: string): string {
  if (kind === "mortgage") return "A mortgage";
  if (kind === "margin") return "On margin";
  if (kind === "credit line") return "A credit line";
  if (kind === "term loan") return "A term loan";
  return "A consumer loan";
}

export default function BankApp() {
  const phone = usePhone();
  const { view } = useSimSnap();
  const why = useWhy();
  const panel = usePanel<Book>("name=bank", `${view?.date.abs ?? 0}:${view?.cash ?? 0}:${view?.loans?.length ?? 0}`);
  const [amount, setAmount] = useState("");
  const [moveAmt, setMoveAmt] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const [product, setProduct] = useState<Product>("margin");
  const [note, setNote] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const book = panel.data;
  const credit = edgeOf(view).credit;
  // The view names each loan by product (credit line, term loan); the bank panel names every non-margin loan a consumer loan.
  const loans = view?.loans ?? book?.loans ?? [];
  const tight = credit?.tightness ?? 0;
  const chosen = PRODUCTS.find((p) => p.id === product) ?? PRODUCTS[0];
  const open = credit?.products.find((p) => p.product === (product === "line" ? "credit line" : product === "term" ? "term loan" : "margin"));
  const haircut = haircutOf(product, tight, open?.haircut);

  const go = async (op: "deposit" | "withdraw" | "borrow" | "repay") => {
    const cents = centsOf(op === "borrow" ? amount : op === "repay" ? repayAmt : moveAmt);
    if (cents === null || cents < 1) { setNote({ ok: false, text: "Name an amount in dollars." }); return; }
    setBusy(true);
    setNote({ ok: true, text: "Sending…" });
    try {
      setNote(await act(op === "borrow" ? { kind: "cash", op, cents, product } : { kind: "cash", op, cents }));
    } catch {
      setNote({ ok: false, text: "That did not go through." });
    }
    setBusy(false);
  };

  const margin = book?.margin;
  // The credit view is what a borrow is checked against, so the margin row reads its limit and room when it has them.
  const marginLimit = credit?.limit ?? margin?.limit ?? 0;
  const marginRoom = credit?.room ?? margin?.room ?? 0;
  const marginWord = credit ? (credit.room > 0 ? "Open" : credit.owed > 0 ? "Full" : "No collateral") : margin?.word ?? "No collateral";
  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="bank">
      <Note note={note ? { ...note, text: plainCopy(note.text) } : null} testId="bank-note" />
      <h2 className="qa-title">Your account</h2>
      {book ? (
        <div className="qa-kv">
          <p><span className="label">Cash</span><Fig word={book.cash > 0 ? "In hand" : "Nothing in hand"} title={moneyTitle(book.cash)} eventId={book.cashEv} onWhy={why.open} /></p>
          <p><span className="label">Margin</span><Fig word={marginWord} title={margin ? `limit ${moneyTitle(marginLimit)}, room ${moneyTitle(marginRoom)}${margin.rate ? `, ${(margin.rate * 100).toFixed(1)}%` : ""}` : ""} eventId={margin?.eventId} onWhy={why.open} /></p>
        </div>
      ) : <p className="qa-muted">{panel.error || "Reading the bank…"}</p>}
      {credit ? (
        <div className="qa-block" data-testid="bank-credit">
          <h2 className="qa-title">Credit in the city</h2>
          <p className="qa-muted">{creditSentence(credit.word)}</p>
        </div>
      ) : null}
      <div className="qa-block">
        <h2 className="qa-title">Deposits</h2>
        {book && !book.deposits.length ? <p className="qa-empty">Nothing on deposit. Put cash with a bank.</p> : null}
        {book?.deposits.map((d) => (
          <p key={d.bank}><Fig word="On deposit" title={moneyTitle(d.cents)} eventId={d.eventId} onWhy={why.open} /> <span className="qa-muted">at {d.name}</span></p>
        ))}
      </div>
      {book?.claims?.length ? (
        <div className="qa-block" data-testid="bank-claims">
          <h2 className="qa-title">On the book, not a bank loan</h2>
          {book.claims.map((c, i) => (
            <p key={i}><Fig word="Owed" title={moneyTitle(c.owed)} eventId={c.eventId} onWhy={why.open} /> <span className="qa-muted">{c.text}</span></p>
          ))}
        </div>
      ) : null}
      <div className="qa-block">
        <h2 className="qa-title">Loans</h2>
        {book && !loans.length ? <p className="qa-empty">{book.claims?.length ? "No bank loan is open. The amount above is still owed." : "You owe the bank nothing."}</p> : null}
        {loans.map((l, i) => (
          <p key={`${l.kind}-${i}`}><Fig word={loanWord(l.kind)} title={`${moneyTitle(l.owed)} at ${(l.rate * 100).toFixed(1)}%`} eventId={l.eventId} onWhy={why.open} /></p>
        ))}
        {loans.length ? (
          <div className="qa-form" data-testid="bank-repay">
            <Field label="Repay, in dollars"><input className="qa-input" inputMode="decimal" placeholder="500.00" value={repayAmt} onChange={(e) => { setRepayAmt(e.target.value); setNote(null); }} data-testid="bank-repay-amount" /></Field>
            <Button variant="secondary" disabled={busy} data-testid="bank-repay-go" onClick={() => void go("repay")}>{busy ? "Sending…" : "Repay this much"}</Button>
          </div>
        ) : null}
      </div>
      <div className="qa-block" data-testid="bank-products">
        <h2 className="qa-title">Borrow against your shares</h2>
        <div className="qa-seg" role="group" aria-label="Kind of loan">
          {PRODUCTS.map((p) => (
            <button key={p.id} type="button" aria-pressed={product === p.id} data-testid={`bank-product-${p.id}`} onClick={() => setProduct(p.id)}>{p.name}</button>
          ))}
        </div>
        <p className="qa-muted" data-testid="bank-terms">{chosen.terms}</p>
        <p data-testid="bank-haircut">
          The bank lends against {Math.round((1 - haircut) * 100)}% of what your shares would fetch: a {Math.round(haircut * 100)}% haircut today.
        </p>
        {open && !open.open ? <p className="rs-warn" data-testid="bank-not-offered">Lenders are not writing {chosen.name.toLowerCase()} now, so a request will be refused.</p> : null}
        {open && open.loans > 0 ? (
          <p data-testid="bank-open-rate">Your open {chosen.name.toLowerCase()}: {moneyTitle(open.owed)} at {(open.rate * 100).toFixed(2)}%.</p>
        ) : <p className="qa-muted">You have none of these open.</p>}
        <Field label="Amount to borrow, in dollars"><input className="qa-input" inputMode="decimal" placeholder="1,000.00" value={amount} onChange={(e) => { setAmount(e.target.value); setNote(null); }} data-testid="bank-amount" /></Field>
        {view ? <LoanPreview view={view} product={product} cents={centsOf(amount)} /> : null}
        <div className="qa-actions">
          <Button variant="primary" disabled={busy || !(centsOf(amount) && centsOf(amount)! > 0)} data-testid="bank-borrow" onClick={() => void go("borrow")}>{busy ? "Sending…" : `Borrow on ${chosen.name.toLowerCase()}`}</Button>
        </div>
      </div>
      <div className="qa-block" data-testid="bank-move">
        <h2 className="qa-title">Move cash to or from a deposit</h2>
        <Field label="Amount, in dollars"><input className="qa-input" inputMode="decimal" placeholder="1,000.00" value={moveAmt} onChange={(e) => { setMoveAmt(e.target.value); setNote(null); }} data-testid="bank-move-amount" /></Field>
        <div className="qa-actions">
          <Button variant="secondary" disabled={busy} data-testid="bank-deposit" onClick={() => void go("deposit")}>{busy ? "Sending…" : "Deposit"}</Button>
          <Button variant="secondary" disabled={busy} data-testid="bank-withdraw" onClick={() => void go("withdraw")}>{busy ? "Sending…" : "Withdraw"}</Button>
        </div>
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
      <Because id={why.id} lines={why.lines ? why.lines.map((l) => ({ ...l, msg: plainCopy(l.msg) })) : null} />
    </div>
  );
}
