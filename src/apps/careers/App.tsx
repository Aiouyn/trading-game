"use client";
// Your job, the seats firms are short of, a raise, study, and the letters that come back.
import { useState } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import { ChoiceButton, Closed, Result, WordNum, money, useAct, useLife } from "@/apps/profile/data";
import { readCircle } from "@/apps/messages/circle";
import { gameDate } from "@/components/ui/format";
import "@/apps/profile/life.css";
import "./careers.css";

interface Unlock { need: string; text: string; course?: string; courseName?: string; line?: string }
interface Opening {
  n: number;
  firm: string;
  role: string;
  wage: number;
  seats: number;
  chance: string;
  canApply: boolean;
  vouched: boolean;
  unlock?: Unlock | null;
}
interface Offer {
  id: number;
  firm: string;
  role: string;
  wage: number;
  startDate: string;
  expiresDate: string;
  status: string;
  why: string;
  fromName: string;
  note: string;
}
interface Colleague { who: number; name: string; role: string; boss: boolean }
interface Shift { label: string; line: string; start: number; end: number }
interface WorkCard {
  offers?: Offer[];
  shift?: Shift | null;
  daysInSeat?: number;
  startedDate?: string;
  colleagues?: Colleague[];
  returnLine?: string;
}
interface PendingSeat { n: number; firm: string; role: string; due: number; dueTime?: string; daysLeft: number }
interface StudyRow { field: string; name: string; days: number; cost: number }
interface Letter { day: number; text: string }
export interface CareerCard {
  job: string;
  wage: number;
  tenure: number;
  performance: number;
  openingList: Opening[];
  eventId: number;
  study?: StudyRow[];
  pending: PendingSeat[];
  course: { name: string; due: number; daysLeft: number } | null;
  letters: Letter[];
  work?: WorkCard | null;
}

function perfWord(n: number): string {
  if (n >= 80) return "Standing out";
  if (n >= 60) return "Solid";
  if (n >= 40) return "Ordinary";
  return "Thin";
}

function seatWord(days: number): string {
  if (days < 1) return "First day in the seat";
  if (days < 14) return "Just started";
  if (days < 90) return "A few weeks in the seat";
  if (days < 360) return "Settled in this seat";
  const years = Math.floor(days / 360);
  return years === 1 ? "A year in this seat" : `${years} years in this seat`;
}

function daysWord(n: number): string {
  if (n <= 0) return "Due today";
  if (n === 1) return "1 day left";
  return `${n} days left`;
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function openUnlock(store: ReturnType<typeof useShellStore>, row: Opening, go: (cmd: unknown) => Promise<unknown>) {
  const u = row.unlock;
  if (!u) return;
  if (u.need === "health" || u.line === "clinic") {
    store.getState().open("health");
    void go({ kind: "clinic" });
    return;
  }
  if (u.course || (u.line ?? "").startsWith("enrol")) {
    store.getState().open("academy");
    if (u.line) void go({ line: u.line });
    return;
  }
  if ((u.line ?? "").startsWith("study ")) {
    void go({ kind: "study", field: u.line!.slice(6).trim() });
  }
}

export default function CareersApp() {
  const store = useShellStore();
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const card = life?.career;
  const [quitOpen, setQuitOpen] = useState(false);
  const [studyField, setStudyField] = useState<string | null>(null);
  const [q, setQ] = useState("");
  if (!life || !card) return <Closed title="Careers" />;
  const employed = card.job !== "no job" && card.wage > 0;
  const pending = card.pending[0];
  const study = card.study ?? [];
  const work = card.work ?? null;
  const days = work?.daysInSeat ?? 0;
  const offers = (work?.offers ?? []).filter((o) => o.status === "open" || o.status === "accepted" || o.status === "declined");
  const waiting = new Set(card.pending.map((a) => `${a.firm}|${a.role}`));
  const query = q.trim().toLowerCase();
  const openings = [...(card.openingList ?? [])]
    .sort((a, b) => Number(b.vouched) - Number(a.vouched) || a.firm.localeCompare(b.firm) || a.wage - b.wage || a.n - b.n)
    .filter((row) => {
      if (!query) return true;
      const pay = money(row.wage).toLowerCase();
      return row.firm.toLowerCase().includes(query) || row.role.toLowerCase().includes(query) || pay.includes(query) || String(row.wage).includes(query);
    });
  const picked = study.find((s) => s.field === studyField) ?? null;
  const circle = readCircle(life);
  const fromWork = (circle?.threads ?? []).flatMap((t) => t.role === "work" ? t.messages.map((m) => ({ day: m.day, text: m.text, eventId: m.eventId })) : []);
  const letters = card.letters.length ? card.letters : fromWork.map((m) => ({ day: m.day, text: m.text }));
  const firstApply = openings.find((o) => o.canApply);
  const raiseReady = employed && days >= 90;
  const raisePrimary = raiseReady && !quitOpen && !picked && !pending;

  const apply = async (n: number) => {
    await go({ kind: "apply", n });
  };
  const raise = async () => {
    await go({ kind: "raise" });
  };
  const quit = async () => {
    await go({ kind: "quit" });
    setQuitOpen(false);
  };
  const studyGo = async (field: string) => {
    await go({ kind: "study", field });
    setStudyField(null);
  };

  return (
    <div className="qy-life cr" data-testid="careers">
      <header className="qy-block">
        <h2>Careers</h2>
        <p className="qy-kicker" data-testid="career-job">{employed ? cap(card.job) : "No job on the book"}</p>
      </header>
      <Result note={note} />
      <section className="qy-block" data-testid="career-now">
        <h3>This job</h3>
        {employed ? <><div className="qy-row">
          <span className="label">Wage</span>
          <WordNum word={employed ? "A week's pay" : "No wage"} hover={money(card.wage)} eventId={card.eventId} />
        </div>
        <div className="qy-row">
          <span className="label">Tenure</span>
          <WordNum word={seatWord(days)} hover={work?.startedDate ? `In this seat since ${work.startedDate}` : `${days} days in this seat`} eventId={card.eventId} />
        </div>
        {work?.shift ? (
          <div className="qy-row" data-testid="career-shift">
            <span className="label">Shift</span>
            <span>{work.shift.label}{work.shift.line ? ` · ${work.shift.line}` : ""}</span>
          </div>
        ) : null}
        {work?.colleagues?.length ? (
          <div className="qy-row" data-testid="career-colleagues">
            <span className="label">With you</span>
            <span>{work.colleagues.map((c) => `${c.name}${c.boss ? ", your boss" : ""} (${c.role})`).join("; ")}</span>
          </div>
        ) : null}
        <div className="qy-row">
          <span className="label">Performance</span>
          <WordNum word={perfWord(card.performance)} hover={String(card.performance)} eventId={card.eventId} />
        </div>
          <div className="qy-actions">
            {raiseReady ? (
              <ChoiceButton primary={raisePrimary} disabled={busy} testId="ask-raise" onClick={() => void raise()}>
                Ask for a raise
              </ChoiceButton>
            ) : <p className="qy-muted">A raise waits until you have been in this seat a season.</p>}
            {quitOpen ? (
              <div className="qy-card" data-testid="quit-confirm">
                <p>Leaving {card.job} gives up {money(card.wage)} a week. {seatWord(days)} no longer counts toward a raise here, and the firm can fill the seat.</p>
                <div className="cr-acts">
                  <ChoiceButton primary disabled={busy} testId="quit" onClick={() => void quit()}>Leave the job</ChoiceButton>
                  <ChoiceButton primary={false} disabled={busy} testId="quit-stay" onClick={() => setQuitOpen(false)}>Stay</ChoiceButton>
                </div>
              </div>
            ) : (
              <ChoiceButton primary={false} disabled={busy} testId="quit-open" onClick={() => setQuitOpen(true)}>Quit</ChoiceButton>
            )}
          </div>
        </> : <p className="qy-muted">Your next job can start with an application below.</p>}
        {work?.returnLine ? <p data-testid="career-return">{work.returnLine}</p> : null}
      </section>
      {offers.length ? (
        <section className="qy-block" data-testid="job-offers">
          <h3>Offers</h3>
          {offers.map((o) => (
            <div className="qy-choice" key={o.id} data-testid={`offer-${o.id}`}>
              <p>
                <span>{o.firm} · {cap(o.role)}</span>
                <span className="qy-num num">{money(o.wage)} a week · starts {o.startDate}</span>
                <span className="cr-chance">{o.why}{o.fromName ? ` · from ${o.fromName}` : ""}{o.expiresDate ? ` · answer by ${o.expiresDate}` : ""}</span>
              </p>
              {o.status === "open" ? (
                <div className="cr-acts">
                  <ChoiceButton primary disabled={busy} testId={`offer-accept-${o.id}`} onClick={() => void go({ kind: "job", id: o.id, answer: "accept" })}>Accept</ChoiceButton>
                  <ChoiceButton primary={false} disabled={busy} testId={`offer-decline-${o.id}`} onClick={() => void go({ kind: "job", id: o.id, answer: "decline" })}>Decline</ChoiceButton>
                </div>
              ) : (
                <p data-testid={`offer-state-${o.id}`}>{o.status === "accepted" ? "Accepted" : o.status === "declined" ? "Declined" : "Closed"}</p>
              )}
            </div>
          ))}
        </section>
      ) : null}
      <section className="qy-block" data-testid="openings">
        <h3>Open seats</h3>
        <label className="qy-field">
          Search by firm, role or pay
          <input value={q} data-testid="career-search" placeholder="Firm, role or pay" onChange={(e) => setQ(e.target.value)} />
        </label>
        {card.pending.map((application) => (
          <p className="qy-card qy-muted" key={application.n} data-testid="application-pending" style={{ fontSize: "var(--fs-14, 0.875rem)" }}>
            Waiting on {application.firm} for {application.role}. Decision expected {gameDate(application.due)}{application.dueTime ? ` at ${application.dueTime}` : ""}.
          </p>
        ))}
        {!openings.length ? <p className="qy-muted">{query ? "No seat matches that." : "No open seats today."}</p> : null}
        {openings.map((row) => (
          <div className="qy-choice" key={`${row.firm}-${row.role}-${row.n}`} data-testid={`opening-${row.n}`} data-firm={row.firm} data-role={row.role} data-seats={row.seats} data-vouched={row.vouched ? "1" : "0"} data-open={row.canApply ? "1" : "0"}>
            <p>
              <span>{row.firm} · {cap(row.role)}</span>
              <span className="qy-num num">{money(row.wage)} a week · {row.seats} {row.seats === 1 ? "seat" : "seats"}</span>
              <span className="cr-chance">{cap(row.chance)}{row.vouched ? " · With a reference" : ""}</span>
              {!row.canApply && row.unlock?.text ? <span className="cr-chance" data-testid={`unlock-${row.n}`}>{row.unlock.text}</span> : null}
            </p>
            {!row.canApply && row.unlock ? (
              <ChoiceButton primary={false} disabled={busy} testId={`unlock-link-${row.n}`} onClick={() => openUnlock(store, row, go)}>
                {row.unlock.courseName ? `Open ${row.unlock.courseName}` : row.unlock.need === "health" ? "Open the clinic" : "Open what unlocks it"}
              </ChoiceButton>
            ) : (
              <ChoiceButton
                primary={!raisePrimary && !quitOpen && !picked && !waiting.has(`${row.firm}|${row.role}`) && firstApply?.n === row.n}
                disabled={busy || waiting.has(`${row.firm}|${row.role}`) || !row.canApply}
                testId={`apply-${row.n}`}
                onClick={() => void apply(row.n)}
              >
                Apply
              </ChoiceButton>
            )}
          </div>
        ))}
      </section>
      <section className="qy-block" data-testid="study">
        <h3>Study</h3>
        {card.course ? <p className="qy-muted">You are studying {card.course.name}. {daysWord(card.course.daysLeft)}.</p> : null}
        {picked ? (
          <div className="qy-card" data-testid="study-confirm">
            <p>
              {cap(picked.name)} costs {picked.cost > 0 ? money(picked.cost) : "a fee taken from cash"} and takes {picked.days} days. The money leaves when you start, and you cannot start a second course.
            </p>
            <div className="cr-acts">
              <ChoiceButton primary={!quitOpen} disabled={busy || !!card.course} testId="study-go" onClick={() => void studyGo(picked.field)}>
                Start studying
              </ChoiceButton>
              <ChoiceButton primary={false} disabled={busy} testId="study-back" onClick={() => setStudyField(null)}>Not now</ChoiceButton>
            </div>
          </div>
        ) : study.map((row) => (
          <div className="qy-choice" key={row.field}>
            <p>
              <span>{cap(row.name)}</span>
              <span className="cr-chance">{row.days} days{row.cost > 0 ? ` · ${money(row.cost)}` : ""}</span>
            </p>
            <ChoiceButton primary={false} disabled={busy || !!card.course} testId={`study-${row.field}`} onClick={() => setStudyField(row.field)}>
              Study
            </ChoiceButton>
          </div>
        ))}
      </section>
      <section className="qy-block" data-testid="employer-letters">
        <h3>Letters</h3>
        {letters.length ? letters.map((letter, i) => (
          <article className="qy-card" key={`${letter.day}-${i}`}>
            <span className="label">{letter.day ? gameDate(letter.day) : "Today"}</span>
            <p>{letter.text.replace(/^Letter:\s*/, "")}</p>
          </article>
        )) : <p className="qy-muted">No letter from an employer yet.</p>}
      </section>
    </div>
  );
}
