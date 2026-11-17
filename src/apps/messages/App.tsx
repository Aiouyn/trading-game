"use client";
// Contacts, what they have said, and the rumours you can pass on.
import { useState } from "react";
import {
  ChoiceButton, Closed, Result, Why, sentenceOf, useAct, useLife, when,
} from "@/apps/profile/data";
import "@/apps/profile/life.css";

export default function MessagesApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const contacts = life?.contacts ?? [];
  const firms = life?.firms ?? [];
  const [firm, setFirm] = useState(life?.firm || firms[0]?.id || "");
  if (!life) return <Closed title="Messages" />;
  const askFirm = firm || life.firm || firms[0]?.id || "";
  const rumours = life.private ?? [];

  return (
    <div className="qy-life" data-testid="messages">
      <header className="qy-block">
        <h2>People you know</h2>
        <p className="qy-kicker">{contacts.length ? `${contacts.length} contacts` : "Nobody in the book yet"}</p>
      </header>
      <Result note={note} />
      <label className="qy-field">
        <span className="label">Ask about</span>
        <select value={askFirm} data-testid="ask-firm" onChange={(e) => setFirm(e.target.value)}>
          {life.firm ? <option value={life.firm}>Your employer</option> : null}
          {firms.filter((f) => f.id !== life.firm).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <section className="qy-block">
        {contacts.length ? contacts.map((c) => (
          <article className="qy-card" key={c.slot} data-testid="contact">
            <h3>{c.name}</h3>
            <p>{sentenceOf(c)}</p>
            <div>
              <span className="label">Told you</span>
              {c.told?.length ? c.told.map((t) => (
                <p key={t.factId}>{t.text} <Why id={t.eventId} /></p>
              )) : <p className="qy-muted">They have not told you anything yet.</p>}
            </div>
            <div className="qy-actions">
              <ChoiceButton primary={c.slot === contacts[0]?.slot} disabled={busy} testId={`talk-${c.slot}`} onClick={() => void go({ kind: "talk", slot: c.slot })}>
                Talk
              </ChoiceButton>
              <ChoiceButton primary={false} disabled={busy || !askFirm} testId={`ask-${c.slot}`} onClick={() => void go({ kind: "ask", slot: c.slot, firm: askFirm })}>
                Ask
              </ChoiceButton>
            </div>
          </article>
        )) : <p className="qy-muted">No contacts yet. The city introduces them.</p>}
      </section>
      <section className="qy-block">
        <h3>Rumours</h3>
        {rumours.length ? rumours.map((r) => (
          <article className="qy-card" key={`${r.eventId}-${r.factId ?? r.day}`} data-testid="rumour">
            <span className="label">{r.from || "Someone"} · {when(r.day)}</span>
            <p>{r.from ? `${r.from} told you: ${r.text}` : r.text}</p>
            <span className="qy-pair">
              <Why id={r.eventId} />
              {r.factId !== undefined ? (
                <ChoiceButton primary={false} disabled={busy} testId={`tip-${r.factId}`} onClick={() => void go({ kind: "tip", fact: r.factId })}>
                  Tip off a journalist
                </ChoiceButton>
              ) : null}
            </span>
          </article>
        )) : <p className="qy-muted">You have heard nothing private.</p>}
      </section>
    </div>
  );
}
