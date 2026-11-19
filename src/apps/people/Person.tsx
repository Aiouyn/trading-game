"use client";
// One person: the bond in words, what you have done, what they own, where they work, and what you can ask.
import { useEffect, useState } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import { Button } from "@/components/ui/Button";
import { Result, useAct, when, Why } from "@/apps/profile/data";
import { InviteActions } from "@/apps/diary/Invite";
import { gameDate, presentNote } from "@/components/ui/format";
import { costOnce, kindWord, parsePlans, plansFor } from "@/apps/diary/read";
import { initial, moneyLabel, roleWord, type CircleContact } from "@/apps/messages/circle";
import { useSimSnap } from "@/shell/simSession";
import { acceptLine, barFor, parseSociety } from "@/apps/society/read";

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

function StandingLine({ index, family }: { index: number; family: boolean }) {
  const view = useSimSnap().view;
  const soc = parseSociety(view?.society);
  if (!soc?.standing) return null;
  const mine = soc.rank?.person === index;
  const power = soc.powerful.find((p) => p.person === index);
  const door = mine ? null : acceptLine(soc.standing.score, family, barFor(index, soc.rich, soc.powerful));
  return (
    <p className="peo-standing" data-testid="person-standing">
      Your standing in the city is <span title={String(soc.standing.score)}>{soc.standing.word.toLowerCase()}</span>.
      {mine ? " This is you." : door ? ` ${door.line}` : ""}
      {power ? ` They are ${power.word}: ${power.role}.` : ""}
      {soc.standing.eventId >= 0 ? <> <Why id={soc.standing.eventId} /></> : null}
    </p>
  );
}

export function Person({ index, contact, firms, homes, knows, onPick, onBack }: {
  index: number;
  contact?: CircleContact;
  firms: { id: string; name: string }[];
  homes: HomeNote[];
  knows: { who: number; name: string; why: string }[];
  onPick: (who: number) => void;
  onBack: () => void;
}) {
  const store = useShellStore();
  const invites = plansFor(parsePlans(useSimSnap().view?.plans), index);
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
  const role = contact?.role || page?.circle?.role || "acquaintance";
  const stance = page?.circle?.stance || contact?.stance || "";
  const word = contact?.bond.word || page?.circle?.word || contact?.word || "";
  const score = Math.max(0, Math.min(100, contact?.bond.score ?? page?.circle?.score ?? 0));
  const why = contact?.bond.why.length ? contact.bond.why : (page?.circle?.why ?? []);
  const together = contact?.together.length ? contact.together : (page?.circle?.together ?? []);
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
        <StandingLine index={index} family={contact?.kind === "family"} />
        <Result note={note} />
        {invites.length ? (
          <div className="peo-block" data-testid="person-invites">
            <h3>Invitations</h3>
            {invites.map((p) => (
              <div key={p.key} data-testid="person-invite-card">
                <p>{kindWord(p.kind)} · {gameDate(p.day)}</p>
                {p.place ? <p>{p.place}</p> : null}
                {p.reason ? <p className="peo-muted">{p.reason}</p> : null}
                {costOnce(p) ? <p className="peo-muted">{costOnce(p)}</p> : null}
                {p.past ? (
                  <div data-testid="aftermath">
                    {p.answer ? <p data-testid="invite-answer">{p.answer}</p> : null}
                    {p.came ? <p>{p.came}</p> : null}
                    {p.said ? <p className="peo-muted">{presentNote(p.said)}</p> : null}
                    {p.fallout ? <p>{presentNote(p.fallout)}</p> : null}
                    {p.skipped ? <p>Skipped.</p> : null}
                  </div>
                ) : (
                  <InviteActions plan={p} busy={busy} onGo={(cmd) => void go(cmd)} />
                )}
              </div>
            ))}
          </div>
        ) : null}
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
          <h3>Who they know</h3>
          {knows.length ? knows.map((person) => (
            <p key={person.who}>
              <button className="name-link" type="button" onClick={() => onPick(person.who)}>{person.name}</button>
              {" · "}{presentNote(person.why)}
            </p>
          )) : <p className="peo-muted">You haven’t met anyone you know they’re connected to.</p>}
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
          <Button variant="primary" data-testid="person-message" disabled={!reach && !contact} onClick={() => store.getState().open("messages", `who:${index}`)}>
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
              {busy ? "Sending…" : "Invite"}
            </Button>
            <Button variant="secondary" disabled={busy || !reach} data-testid="person-introduce" onClick={() => void go({ kind: "introduce", slot })}>
              {busy ? "Sending…" : "Ask for an introduction"}
            </Button>
          </div>
          <label className="peo-field">
            Amount
            <input className="num" inputMode="decimal" value={amount} data-testid="person-amount" onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div className="peo-act-row">
            <Button variant="secondary" disabled={busy || !reach || !amountOk} data-testid="person-gift" onClick={() => void go({ kind: "gift", slot, cents })}>
              {busy ? "Sending…" : `Gift ${amountOk ? moneyLabel(cents) : ""}`.trim()}
            </Button>
            <Button variant="secondary" disabled={busy || !reach || !amountOk} data-testid="person-lend" onClick={() => void go({ kind: "lend", slot, cents })}>
              {busy ? "Sending…" : `Lend ${amountOk ? moneyLabel(cents) : ""}`.trim()}
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
                {busy ? "Sending…" : "Ask about the firm"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
