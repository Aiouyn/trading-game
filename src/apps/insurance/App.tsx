"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { act, useSimSnap, type ActNote } from "@/shell/simSession";
import { Because, Fig, Note, moneyTitle, usePanel, usePhone, useWhy } from "@/apps/businesses/sheet";
import "@/apps/businesses/sheet.css";

interface Cover {
  kind: "home" | "firm"; id: number | string; name: string; insurer?: string;
  cover: number; prem: number; word: string; eventId: number; mortgaged?: boolean;
}
interface Insurer { id: string; name: string; word: string; equity: number; eventId: number }
interface Claim { eventId: number; day: number; kind: string; text: string }
interface Book {
  rate: number; rateWord: string; rateEv: number; premiums: number; claimsTotal: number;
  insurers: Insurer[]; policies: Cover[]; quotes: Cover[]; claims: Claim[];
}

export default function InsuranceApp() {
  const phone = usePhone();
  const { view } = useSimSnap();
  const why = useWhy();
  const panel = usePanel<Book>("name=insurance", `${view?.date.abs ?? 0}:${view?.homes?.length ?? 0}`);
  const [key, setKey] = useState("");
  const [note, setNote] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const book = panel.data;
  const rows = [...(book?.policies ?? []), ...(book?.quotes ?? [])];
  const pick = rows.find((r) => `${r.kind}:${r.id}` === key) ?? rows[0];

  const insure = async () => {
    if (!pick) { setNote({ ok: false, text: "You have nothing to insure. Buy a home, or found a firm." }); return; }
    setBusy(true);
    const parts: string[] = [];
    if (pick.kind === "home" && pick.word === "Bare" && !pick.mortgaged) {
      const m = await act({ kind: "mortgage", id: pick.id, cents: 0 });
      parts.push(m.text);
      if (!m.ok) { setNote(m); setBusy(false); return; }
    }
    const w = await act({ kind: "wait", days: 1 });
    parts.push(w.text);
    setNote({ ok: w.ok, text: parts.join(" ") });
    setBusy(false);
  };

  return (
    <div className="qa" data-phone={phone ? "1" : "0"} data-testid="insurance">
      <Note note={note} testId="insurance-note" />
      <div className="qa-head">
        <h2 className="qa-title">Cover</h2>
        {book ? <Fig word={book.rateWord} title={`${(book.rate * 100).toFixed(2)}% of cover`} eventId={book.rateEv} onWhy={why.open} /> : null}
      </div>
      {book ? (
        <p className="qa-muted">
          <Fig word="Premiums in" title={moneyTitle(book.premiums)} eventId={book.rateEv} onWhy={why.open} />
          {" · "}
          <Fig word="Claims paid" title={moneyTitle(book.claimsTotal)} eventId={book.rateEv} onWhy={why.open} />
        </p>
      ) : <p className="qa-muted">{panel.error || "Reading the book…"}</p>}
      <div className="qa-list">
        {book?.insurers.map((ins) => (
          <div key={ins.id} className="qa-row">
            <span className="qa-row-main"><strong>{ins.name}</strong></span>
            <Fig word={ins.word} title={moneyTitle(ins.equity)} eventId={ins.eventId} onWhy={why.open} />
          </div>
        ))}
      </div>
      <h2 className="qa-title">Your cover</h2>
      {!rows.length && book ? <p className="qa-empty">You have nothing to insure. Buy a home in Property, or found a firm in Businesses.</p> : null}
      <div className="qa-list">
        {rows.map((r) => (
          <div key={`${r.kind}:${r.id}`} className="qa-row" data-on={pick && pick.kind === r.kind && pick.id === r.id ? "1" : "0"}>
            <button type="button" className="qa-row-main" onClick={() => setKey(`${r.kind}:${r.id}`)}>
              <strong>{r.name}</strong>
              <span className="qa-muted"> · {r.kind === "home" ? "A home" : "A firm"}{r.insurer ? ` · ${r.insurer}` : ""}</span>
            </button>
            <Fig word={r.word} title={`cover ${moneyTitle(r.cover)}, premium ${moneyTitle(r.prem)}`} eventId={r.eventId} onWhy={why.open} />
          </div>
        ))}
      </div>
      <Button variant="primary" disabled={busy || !pick} data-testid="insurance-insure" onClick={() => void insure()}>Insure</Button>
      {pick && note?.ok ? (
        <p data-testid="insurance-result">{rows.find((r) => r.kind === pick.kind && r.id === pick.id)?.word === "Bare" ? "The insurer has not written this cover yet. The book writes it at the close of the day, when it will take the risk." : "The book shows this cover."}</p>
      ) : null}
      <h2 className="qa-title">Claims</h2>
      {book && !book.claims.length ? <p className="qa-empty">No claim on the book.</p> : null}
      {book?.claims.map((c) => (
        <p key={c.eventId}><Fig word={c.kind.startsWith("hazard") ? "A loss" : c.kind === "ins.rate" ? "The rate moved" : "The book opened"} title={c.text} eventId={c.eventId} onWhy={why.open} /> <span className="qa-muted">{c.text}</span></p>
      ))}
      <Because id={why.id} lines={why.lines} />
    </div>
  );
}
