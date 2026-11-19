"use client";
// Your job, the seats firms are short of, a raise, study, and the letters that come back.
import { useState } from "react";
import { ChoiceButton, Closed, Result, WordNum, money, useAct, useLife } from "@/apps/profile/data";
import { readCircle } from "@/apps/messages/circle";
import { gameDate } from "@/components/ui/format";
import "@/apps/profile/life.css";
import "./careers.css";

interface Opening {
  n: number;
  firm: string;
  role: string;
  wage: number;
  seats: number;
  chance: string;
  canApply: boolean;
  vouched: boolean;
}
interface PendingSeat { n: number; firm: string; role: string; due: number; daysLeft: number }
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
}

function perfWord(n: number): string {
  if (n >= 80) return "Standing out";
  if (n >= 60) return "Solid";
  if (n >= 40) return "Ordinary";
  return "Thin";
}

function tenureWord(years: number): string {
  if (years < 1) return "New in the trade";
  if (years < 2) return "A year in";
  if (years < 5) return "Settled in";
  return "Long in the trade";
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

export default function CareersApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const card = life?.career;
  const [quitOpen, setQuitOpen] = useState(false);
  const [studyField, setStudyField] = useState<string | null>(null);
  if (!life || !card) return <Closed title="Careers" />;
  const employed = card.job !== "no job" && card.wage > 0;
  const pending = card.pending[0];
  const study = card.study ?? [];
  const openings = card.openingList ?? [];
  const picked = study.find((s) => s.field === studyField) ?? null;
  const circle = readCircle(life);
  const fromWork = (circle?.threads ?? []).flatMap((t) => t.role === "work" ? t.messages.map((m) => ({ day: m.day, text: m.text, eventId: m.eventId })) : []);
  const letters = card.letters.length ? card.letters : fromWork.map((m) => ({ day: m.day, text: m.text }));
  const groups = new Map<string, Opening[]>();
  for (const row of openings) {
    const list = groups.get(row.role) ?? [];
    list.push(row);
    groups.set(row.role, list);
  }
  const firstApply = openings.find((o) => o.canApply);
  const raisePrimary = employed && !quitOpen && !picked && !pending;

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
        <p className="qy-kicker">{cap(card.job)}</p>
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
          <WordNum word={tenureWord(card.tenure)} hover={card.tenure === 1 ? "1 year" : `${card.tenure} years`} eventId={card.eventId} />
        </div>
        <div className="qy-row">
          <span className="label">Performance</span>
          <WordNum word={perfWord(card.performance)} hover={String(card.performance)} eventId={card.eventId} />
        </div>
          <div className="qy-actions">
            <ChoiceButton primary={raisePrimary} disabled={busy} testId="ask-raise" onClick={() => void raise()}>
              Ask for a raise
            </ChoiceButton>
            {quitOpen ? (
              <div className="qy-card" data-testid="quit-confirm">
                <p>Leaving {card.job} gives up {money(card.wage)} a week. The {card.tenure < 1 ? "time you have just started" : tenureWord(card.tenure).toLowerCase()} no longer counts toward a raise here, and the firm can fill the seat.</p>
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
      </section>
      <section className="qy-block" data-testid="openings">
        <h3>Open seats</h3>
        {card.pending.map((application) => (
          <p className="qy-card qy-muted" key={application.n} data-testid="application-pending" style={{ fontSize: "var(--fs-14, 0.875rem)" }}>
            Waiting on {application.firm} for {application.role}. Decision expected {gameDate(application.due)}.
          </p>
        ))}
        {!openings.length ? <p className="qy-muted">No open seats today.</p> : null}
        {[...groups.entries()].map(([role, rows]) => (
          <div key={role} className="qy-block" data-testid="role-group">
            <p className="label">{cap(role)}</p>
            {rows.map((row) => (
              <div className="qy-choice" key={row.n} data-testid={`opening-${row.n}`}>
                <p>
                  <span>{row.firm}</span>
                  <span className="qy-num num">{money(row.wage)} a week · {row.seats} {row.seats === 1 ? "seat" : "seats"}</span>
                  <span className="cr-chance">{cap(row.chance)}{row.vouched ? " · You have a reference" : ""}</span>
                </p>
                <ChoiceButton
                  primary={!raisePrimary && !quitOpen && !picked && !pending && firstApply?.n === row.n}
                  disabled={busy || !!pending || !row.canApply}
                  testId={`apply-${row.n}`}
                  onClick={() => void apply(row.n)}
                >
                  Apply
                </ChoiceButton>
              </div>
            ))}
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
