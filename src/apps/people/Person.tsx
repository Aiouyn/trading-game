"use client";
// One person: the bond in words, what you have done, what they own, where they work, and what you can ask.
import { useEffect, useState } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import { Button } from "@/components/ui/Button";
import { Result, useAct, when, Why } from "@/apps/profile/data";
import { initial, moneyLabel, roleWord, type CircleContact } from "@/apps/messages/circle";

export interface HomeNote { neighbourhood?: string; owner?: { index: number; name: string } | null }
interface Line { day: number; text: string; eventId: number }
interface PersonPage {
  name: string;
  title: string;
  employer: { name: string } | null;
  good: string;
  wealthBand: string;
  moodWord: string;
  slot: number;
  circle: { role: string; stance: string; word: string; score: number; why: Line[]; together: Line[] } | null;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function lines(v: unknown): Line[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const text = str(r.text);
    if (!text) return [];
    return [{ day: num(r.day), text, eventId: num(r.eventId, -1) }];
  });
}

function readPerson(v: unknown, fallbackSlot: number): PersonPage | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (!str(p.name) && num(p.index, -1) < 0) return null;
  const employer = p.employer && typeof p.employer === "object"
    ? { name: str((p.employer as Record<string, unknown>).name) }
    : null;
  const contact = p.contact && typeof p.contact === "object" ? p.contact as Record<string, unknown> : null;
  const circle = p.circle && typeof p.circle === "object" ? p.circle as Record<string, unknown> : null;
  const bond = circle?.bond && typeof circle.bond === "object" ? circle.bond as Record<string, unknown> : null;
  return {
    name: str(p.name),
    title: str(p.title),
    employer: employer?.name ? employer : null,
    good: str(p.good),
    wealthBand: str(p.wealthBand),
    moodWord: str(p.moodWord),
    slot: contact ? num(contact.slot, fallbackSlot) : fallbackSlot,
    circle: circle ? {
      role: str(circle.role),
      stance: str(circle.stance),
      word: str(bond?.word),
      score: num(bond?.score),
      why: lines(bond?.why),
      together: lines(circle.together),
    } : null,
  };
}

function bandWord(band: string): string {
  if (!band) return "The books do not say what they own.";
  return band.charAt(0).toUpperCase() + band.slice(1);
}

export function Person({ index, contact, firms, homes, onBack }: {
  index: number;
  contact?: CircleContact;
  firms: { id: string; name: string }[];
  homes: HomeNote[];
  onBack: () => void;
}) {
  const store = useShellStore();
  const { note, busy, go } = useAct();
  const [page, setPage] = useState<PersonPage | null>(null);
  const [miss, setMiss] = useState(false);
  const [place, setPlace] = useState("dinner");
  const [amount, setAmount] = useState("100.00");
  const [firm, setFirm] = useState(firms[0]?.id ?? "");
  const stamp = `${contact?.bond.word ?? ""}:${contact?.together.length ?? 0}:${contact?.slot ?? -1}`;
  useEffect(() => {
    setFirm((cur) => (firms.some((f) => f.id === cur) ? cur : firms[0]?.id ?? ""));
  }, [firms]);
  useEffect(() => {
    let live = true;
    setMiss(false);
    void fetch(`/api/sim/person/${index}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: unknown) => {
        if (!live) return;
        const next = readPerson(v, contact?.slot ?? -1);
        setPage(next);
        setMiss(!next);
      })
      .catch(() => { if (live) setMiss(true); });
    return () => { live = false; };
  }, [index, stamp, contact?.slot]);

  const slot = page?.slot ?? contact?.slot ?? -1;
  const name = page?.name || contact?.name || "Someone";
  const role = page?.circle?.role || contact?.role || "colleague";
  const stance = page?.circle?.stance || contact?.stance || "";
  const word = page?.circle?.word || contact?.bond.word || contact?.word || "";
  const score = Math.max(0, Math.min(100, page?.circle?.score ?? contact?.bond.score ?? 0));
  const why = page?.circle?.why.length ? page.circle.why : (contact?.bond.why ?? []);
  const together = page?.circle?.together.length ? page.circle.together : (contact?.together ?? []);
  const owned = homes.filter((h) => h.owner?.index === index && h.neighbourhood);
  const cents = Math.round(Number(amount) * 100);
  const amountOk = Number.isFinite(cents) && cents >= 1;
  const reach = slot >= 0;
  const work = page?.employer
    ? `${page.title || "On the staff"} at ${page.employer.name}${page.good ? `, ${page.good}` : ""}`
    : (page?.title || "The books do not say where they work.");

  return (
    <section className="peo-person" data-testid="person" aria-label={name}>
      <header className="peo-head">
        <button type="button" className="peo-back" onClick={onBack}>Back</button>
        <span className="avatar" data-role={role}>{initial(name)}</span>
        <div className="peo-row-text">
          <h2>{name}</h2>
          <p className="peo-muted">{roleWord(role, stance)}{word ? ` · ${word}` : ""}</p>
        </div>
      </header>
      <div className="peo-scroll">
        <Result note={note} />
        {miss && !page ? <p className="peo-empty">The books did not answer.</p> : null}
        <div className="peo-block">
          <h3>The bond</h3>
          <div className="bond" aria-label={word || "The bond"}><span style={{ width: `${score}%` }} /></div>
          {word ? <p>{word}</p> : <p className="peo-muted">No bond written down yet.</p>}
          {why.map((w, i) => (
            <div className="peo-why" key={`${w.eventId}-${i}`}>
              {w.text}{w.eventId >= 0 ? <> <Why id={w.eventId} /></> : null}
            </div>
          ))}
        </div>
        <div className="peo-block">
          <h3>Together</h3>
          {together.length ? together.slice(-4).map((t, i) => (
            <p key={`${t.day}-${i}`}>{when(t.day)}. {t.text}</p>
          )) : <p className="peo-muted">Nothing done together yet.</p>}
        </div>
        <div className="peo-block">
          <h3>What they own</h3>
          <p>{bandWord(page?.wealthBand ?? "")}</p>
          {owned.length ? owned.map((h) => <p key={h.neighbourhood}>A home in {h.neighbourhood}.</p>) : <p className="peo-muted">No home in your book.</p>}
          {page?.moodWord ? <p className="peo-muted">{page.moodWord}</p> : null}
        </div>
        <div className="peo-block">
          <h3>Where they work</h3>
          <p>{work}</p>
        </div>
        <div className="peo-acts">
          <Button variant="primary" data-testid="person-message" onClick={() => store.getState().open("messages", `who:${index}`)}>
            Message
          </Button>
          {!reach ? <p className="peo-muted">You cannot reach them yet.</p> : null}
          <label className="peo-field">
            Invitation
            <select value={place} data-testid="invite-place" onChange={(e) => setPlace(e.target.value)}>
              <option value="dinner">Dinner</option>
              <option value="club">Club</option>
              <option value="gala">Gala</option>
            </select>
          </label>
          <div className="peo-act-row">
            <Button variant="secondary" disabled={busy || !reach} data-testid="person-invite" onClick={() => void go({ kind: "invite", slot, place })}>
              Invite
            </Button>
            <Button variant="secondary" disabled={busy || !reach} data-testid="person-introduce" onClick={() => void go({ kind: "introduce", slot })}>
              Ask for an introduction
            </Button>
          </div>
          <label className="peo-field">
            Amount
            <input className="num" inputMode="decimal" value={amount} data-testid="person-amount" onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="peo-act-row">
            <Button variant="secondary" disabled={busy || !reach || !amountOk} data-testid="person-gift" onClick={() => void go({ kind: "gift", slot, cents })}>
              Gift {amountOk ? moneyLabel(cents) : ""}
            </Button>
            <Button variant="secondary" disabled={busy || !reach || !amountOk} data-testid="person-lend" onClick={() => void go({ kind: "lend", slot, cents })}>
              Lend {amountOk ? moneyLabel(cents) : ""}
            </Button>
          </div>
          {firms.length ? (
            <>
              <label className="peo-field">
                Ask about a firm
                <select value={firm} data-testid="ask-firm" onChange={(e) => setFirm(e.target.value)}>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
              <Button variant="secondary" disabled={busy || !reach || !firm} data-testid="person-ask" onClick={() => void go({ kind: "ask", slot, firm })}>
                Ask about the firm
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
