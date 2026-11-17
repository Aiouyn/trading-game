"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useSimSnap } from "@/shell/simSession";
import { Named } from "@/components/ui/Named";
import { Because, Field, Fig, moneyTitle, titleCase, usePanel, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";

interface Holding { instr: string; name: string; qty: number; value: number }
interface Book {
  id: string; name: string; style: string; kind: "market" | "hedge";
  nav: number; shares: number; px: number; yours: number; yBps: number; word: string; open: string;
  manager: string; managerEv: number; flowEv: number; lever: number;
  holdings: Holding[]; eventId: number;
}
interface Quote { fund: string; shares?: number; px?: number; cost?: number; nav?: number; yours?: number; line?: string; why?: string }
interface Funds { books: Book[]; quote?: Quote }

export default function FundsApp() {
  const phone = usePhone();
  const { view } = useSimSnap();
  const why = useWhy();
  const [id, setId] = useState("");
  const [amount, setAmount] = useState("");
  const [query, setQuery] = useState("name=funds");
  const panel = usePanel<Funds>(query, `${view?.date.abs ?? 0}:${query}`);
  const books = panel.data?.books ?? [];
  const book = books.find((b) => b.id === id) ?? books.find((b) => b.kind === "hedge") ?? books[0];
  const quote = panel.data?.quote && book && panel.data.quote.fund === book.id ? panel.data.quote : undefined;

  const price = () => {
    if (!book) return;
    const t = amount.trim().replace(/[$,]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return;
    const cents = Math.round(Number(t) * 100);
    if (!Number.isSafeInteger(cents) || cents < 1) return;
    setId(book.id);
    setQuery(`name=funds&fund=${encodeURIComponent(book.id)}&cents=${cents}`);
  };

  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="funds">
      <h2 className="qa-title">The city&apos;s funds</h2>
      {panel.error ? <p className="qa-muted">{panel.error}</p> : null}
      {!books.length && !panel.error ? <p className="qa-empty">The books are still being read.</p> : null}
      <div className="qa-list">
        {books.map((b) => (
          <div key={b.id} className="qa-row" data-on={book?.id === b.id ? "1" : "0"}>
            <button type="button" className="qa-row-main" onClick={() => setId(b.id)}>
              <strong>{b.name}</strong>
              <span className="qa-muted"> · {titleCase(b.style)} · {b.open}{b.manager ? ` · ${b.manager}` : ""}{b.yours ? " · You hold a stake" : ""}</span>
            </button>
            <Fig word={b.word} title={moneyTitle(b.nav)} eventId={b.eventId} onWhy={why.open} />
          </div>
        ))}
      </div>
      {book ? (
        <div className="qa-block">
          <h2 className="qa-title">{book.name}</h2>
          <p className="qa-muted">{book.kind === "market" ? "This book trades for its own account." : book.open}{book.lever ? " · Borrowed." : ""}</p>
          <div className="qa-kv">
            <p><span className="label">Value</span><Fig word={book.nav > 0 ? "The book" : "Empty"} title={moneyTitle(book.nav)} eventId={book.eventId} onWhy={why.open} /></p>
            <p><span className="label">Your stake</span><Fig word={book.yours > 0 ? "You are in" : "You are out"} title={`${book.yours.toLocaleString("en-US")} shares`} eventId={book.eventId} onWhy={why.open} /></p>
            {book.manager ? <p><span className="label">Manager</span><Named name={book.manager} /></p> : null}
          </div>
          <p><span className="label">Largest holdings</span> {book.holdings.length ? book.holdings.map((h, i) => <span key={h.instr}>{i ? ", " : ""}<Named name={h.name} /></span>) : "Nothing held"}</p>
          <Field label="Cash to price">
            <input className="qa-input" inputMode="decimal" placeholder="1,000.00" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="funds-amount" />
          </Field>
          <Button variant="primary" data-testid="funds-price" onClick={price}>Price a stake</Button>
          {quote ? (
            <p data-testid="funds-quote">
              {quote.why ?? quote.line}
              {quote.cost ? <> <Fig word="The cost on the book" title={moneyTitle(quote.cost)} eventId={book.eventId} onWhy={why.open} /></> : null}
            </p>
          ) : null}
        </div>
      ) : null}
      <Because id={why.id} lines={why.lines} />
    </div>
  );
}
