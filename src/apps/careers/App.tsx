"use client";
// Your job, the seats firms are short of, a raise, study, and the letters that come back.
import { useCallback, useEffect, useState } from "react";
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
  wageLabel: string;
  chance: string;
}
interface PendingSeat { n: number; firm: string; role: string; due: number; daysLeft: number }
interface StudyRow { field: string; name: string; days: number; cost: number }
interface Letter { day: number; text: string }
interface CareerCard {
  job: string;
  wage: number;
  tenure: number;
  performance: number;
  openings: string;
  eventId: number;
  study: StudyRow[];
  pending: PendingSeat[];
  course: { name: string; due: number; daysLeft: number } | null;
  letters: Letter[];
}

const FALLBACK_STUDY: StudyRow[] = [
  { field: "labourer", name: "labourer", days: 18, cost: 0 },
  { field: "trade", name: "trade", days: 24, cost: 0 },
  { field: "clerk", name: "clerk", days: 30, cost: 0 },
  { field: "engineer", name: "engineer", days: 36, cost: 0 },
  { field: "finance", name: "finance", days: 42, cost: 0 },
  { field: "manager", name: "manager", days: 48, cost: 0 },
  { field: "finance director", name: "finance director", days: 54, cost: 0 },
];

function careerOf(life: unknown): CareerCard | null {
  if (!life || typeof life !== "object") return null;
  const raw = (life as { career?: unknown }).career;
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const study = Array.isArray(c.study) ? c.study.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const field = str(r.field) || str(r.name);
    if (!field) return [];
    return [{ field, name: str(r.name) || field, days: num(r.days), cost: num(r.cost) }];
  }) : [];
  const pending = Array.isArray(c.pending) ? c.pending.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    return [{ n: num(r.n), firm: str(r.firm) || "a firm", role: str(r.role) || "a seat", due: num(r.due), daysLeft: num(r.daysLeft) }];
  }) : [];
  const courseRaw = c.course;
  const course = courseRaw && typeof courseRaw === "object"
    ? { name: str((courseRaw as Record<string, unknown>).name) || "a trade", due: num((courseRaw as Record<string, unknown>).due), daysLeft: num((courseRaw as Record<string, unknown>).daysLeft) }
    : null;
  const letters = Array.isArray(c.letters) ? c.letters.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const text = str(r.text);
    if (!text) return [];
    return [{ day: num(r.day), text }];
  }) : [];
  return {
    job: str(c.job) || "no job",
    wage: num(c.wage),
    tenure: num(c.tenure),
    performance: num(c.performance),
    openings: str(c.openings),
    eventId: num(c.eventId),
    study,
    pending,
    course,
    letters,
  };
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

function qualifies(chance: string): boolean {
  const c = chance.trim();
  return /^you qualify\b/i.test(c) || /^(likely|a fair chance|a long shot)$/i.test(c);
}

function centsOf(body: string): number {
  return Math.round(Number(body.replace(/[$,]/g, "")) * 100);
}

/** One seat, or a role with several firms. The number is what `apply` expects. */
function parseJobs(lines: string[]): Opening[] {
  const out: Opening[] = [];
  const wageRe = /^\$?([\d,]+(?:\.\d{2})?)(?:\s+to\s+\$?([\d,]+(?:\.\d{2})?))?\s+a week$/;
  for (const line of lines) {
    const parts = line.split(" — ").map((p) => p.trim());
    if (parts.length < 4) continue;
    const head = /^(\d+)\.\s+(.+)$/.exec(parts[0]);
    const wage = wageRe.exec(parts[2]);
    if (!head || !wage) continue;
    const grouped = parts[3].startsWith("asks ") && parts.length >= 5 && !/^you have\b/i.test(parts[4]);
    const chance = grouped
      ? parts.slice(4).join(" — ")
      : parts.length >= 6 ? parts.slice(5).join(" — ") : parts[parts.length - 1];
    out.push({
      n: Number(head[1]),
      firm: grouped ? parts[1] : head[2],
      role: grouped ? head[2] : parts[1],
      wage: centsOf(wage[1]),
      wageLabel: parts[2],
      chance,
    });
  }
  return out;
}

async function loadJobs(): Promise<Opening[]> {
  const res = await fetch("/api/sim/act", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "jobs" }),
  });
  const data = await res.json().catch(() => ({})) as { lines?: unknown };
  const lines = Array.isArray(data.lines) ? data.lines.filter((x): x is string => typeof x === "string") : [];
  return parseJobs(lines);
}

export default function CareersApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const card = careerOf(life);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [listed, setListed] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [studyField, setStudyField] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void loadJobs().then((rows) => { setOpenings(rows); setListed(true); }).catch(() => setListed(true));
  }, []);
  useEffect(() => { refresh(); }, [refresh, life?.date.abs]);

  if (!life || !card) return <Closed title="Careers" />;
  const employed = card.job !== "no job" && card.wage > 0;
  const pending = card.pending[0];
  const study = card.study.length ? card.study : FALLBACK_STUDY;
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
  const firstApply = openings.find((o) => qualifies(o.chance)) ?? openings[0];
  const raisePrimary = employed && !quitOpen && !picked && !pending;

  const apply = async (n: number) => {
    await go({ kind: "apply", n });
    refresh();
  };
  const raise = async () => {
    await go({ kind: "raise" });
    refresh();
  };
  const quit = async () => {
    await go({ kind: "quit" });
    setQuitOpen(false);
    refresh();
  };
  const studyGo = async (field: string) => {
    await go({ kind: "study", field });
    setStudyField(null);
    refresh();
  };

  return (
    <div className="qy-life cr" data-testid="careers">
      <header className="qy-block">
        <h2>Careers</h2>
        <p className="qy-kicker">{cap(card.job)}{card.openings ? ` · ${card.openings}` : ""}</p>
      </header>
      <Result note={note} />
      <section className="qy-block" data-testid="career-now">
        <h3>This job</h3>
        <div className="qy-row">
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
        {employed ? (
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
        ) : <p className="qy-muted">You are not on a payroll.</p>}
      </section>
      <section className="qy-block" data-testid="openings">
        <h3>Open seats</h3>
        {pending ? (
          <p className="qy-card" data-testid="application-pending">
            Waiting on {pending.firm} for {pending.role}. {daysWord(pending.daysLeft)}.
          </p>
        ) : null}
        {listed && openings.length === 0 ? <p className="qy-muted">No firm is short of staff.</p> : null}
        {[...groups.entries()].map(([role, rows]) => (
          <div key={role} className="qy-block" data-testid="role-group">
            <p className="label">{cap(role)}</p>
            {rows.map((row) => (
              <div className="qy-choice" key={row.n} data-testid={`opening-${row.n}`}>
                <p>
                  <span>{row.firm}</span>
                  <span className="qy-num num">{row.wageLabel}</span>
                  <span className="cr-chance">{cap(row.chance)}</span>
                </p>
                <ChoiceButton
                  primary={!raisePrimary && !quitOpen && !picked && !pending && firstApply?.n === row.n}
                  disabled={busy || !!pending}
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
