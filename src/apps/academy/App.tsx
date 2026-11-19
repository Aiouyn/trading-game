"use client";
// The lesson, one hint at a time, and the help topics.
import { useEffect, useMemo, useState } from "react";
import { ChoiceButton, HELP, LESSON, Result, money, useAct, useLife } from "@/apps/profile/data";
import { lessonDo } from "@/shell/lessonDo";
import { Button } from "@/components/ui/Button";
import "@/apps/profile/life.css";

interface CourseRow { id: string; name: string; weeks: number; fee: number; blurb: string; done: boolean }
interface Courses { now: { name: string; sessions: number; weeks: number; nextIn: number } | null; rows: CourseRow[]; finished: string[] }

export default function AcademyApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const [courses, setCourses] = useState<Courses | null>(null);
  const [cash, setCash] = useState(0);
  const [rev, setRev] = useState(0);
  const day = life?.date.abs ?? -1;
  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=citylife", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { courses?: Courses; cash?: number } | null) => { if (j?.courses) { setCourses(j.courses); setCash(j.cash ?? 0); } })
      .catch(() => {});
    return () => ac.abort();
  }, [day, rev]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const tutorial = life?.tutorial;
  const step = tutorial?.step ?? "";
  const at = LESSON.findIndex((s) => s.id === step);
  const topics = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return HELP;
    return HELP.filter((h) => h.title.toLowerCase().includes(needle) || h.about.toLowerCase().includes(needle) || h.id.includes(needle));
  }, [q]);
  if (!life) return <div className="qy-life" data-testid="academy"><h2>Academy</h2><p className="qy-muted">The books are not open.</p></div>;

  const read = (id: string) => {
    setOpen(id);
    void go({ kind: "help", command: id });
  };
  const action = tutorial && !tutorial.done ? lessonDo(tutorial.hint) : null;
  const doLesson = () => {
    if (action) void go({ line: action.line });
  };

  return (
    <div className="qy-life" data-testid="academy">
      <header className="qy-block">
        <h2>Academy</h2>
        <p className="qy-kicker">{tutorial && !tutorial.done ? tutorial.goal : "Courses, what you know, and help"}</p>
      </header>
      <section className="qy-block" data-testid="academy-courses">
        <h3>Courses</h3>
        {courses?.now ? <p className="qy-card" data-testid="class-now">In class: {courses.now.name}, evening {courses.now.sessions} of {courses.now.weeks}. The next one is in {courses.now.nextIn} days.</p> : null}
        {courses?.rows.map((c) => (
          <div className="qy-choice" key={c.id} data-testid={`course-${c.id}`}>
            <p>
              <strong>{c.name}</strong>
              <span className="qy-muted" style={{ display: "block" }}>{c.blurb}. {c.weeks} weekly evenings, {money(c.fee)}.</span>
            </p>
            <ChoiceButton primary={false} disabled={busy || c.done || !!courses.now || cash < c.fee} testId={`academy-enrol-${c.id}`} onClick={() => void go({ line: `enrol ${c.id}` }).then(() => setRev((n) => n + 1))}>
              {c.done ? "Finished" : "Enrol"}
            </ChoiceButton>
          </div>
        ))}
        {courses && !courses.rows.length ? <p className="qy-muted">No courses are running.</p> : null}
        {life.life ? (
          <p className="qy-muted" data-testid="academy-knows">
            What you know: {life.life.knows.length ? life.life.knows.join(", ") : "nothing formal yet"}
            {life.life.skills ? ` · ${life.life.skills.school} years of schooling${life.life.skills.trade ? `, ${life.life.skills.years} years as a ${life.life.skills.trade}` : ""}` : ""}
            {courses?.finished.length ? ` · Finished: ${courses.finished.join(", ")}` : ""}
          </p>
        ) : null}
      </section>
      <section className="qy-block" data-testid="lesson">
        <h3>The lesson</h3>
        {!tutorial || (tutorial.done && !step) ? (
          <p className="qy-muted">No lesson in this life. Open the broker, the bank, or someone you know. The clock runs the years.</p>
        ) : (
          <ol className="qy-check">
            {LESSON.map((s, i) => {
              const done = tutorial.done || (at >= 0 && i < at);
              const current = !tutorial.done && s.id === step;
              return (
                <li key={s.id} data-done={done ? "1" : "0"} data-on={current ? "1" : "0"}>
                  <span>{done ? "Done · " : current ? "Now · " : ""}{current && tutorial.goal ? tutorial.goal : s.goal}</span>
                  {current && tutorial.hint ? <p className="qy-hint" data-testid="lesson-hint">{tutorial.hint}</p> : null}
                  {current && action ? (
                    <Button variant="primary" size="sm" disabled={busy} data-testid="academy-lesson-do" onClick={doLesson}>
                      {busy ? "Sending…" : action.label}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {tutorial?.done && step === "done" ? <p className="qy-muted">You have finished the first hour.</p> : null}
        {tutorial?.step === "skip" ? <p className="qy-muted">{tutorial.goal}</p> : null}
        <Result note={note} />
      </section>
      <section className="qy-block">
        <h3>Help</h3>
        <label className="qy-field">
          <span className="label">Search</span>
          <input type="search" value={q} placeholder="A topic or a command" data-testid="help-search" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="qy-topics">
          {topics.map((h) => (
            <button key={h.id} type="button" data-on={open === h.id ? "1" : "0"} data-testid={`help-${h.id}`} disabled={busy} onClick={() => read(h.id)}>
              <span>{h.title}</span>
              <small>{h.about}</small>
            </button>
          ))}
          {!topics.length ? <p className="qy-muted">Nothing matches.</p> : null}
        </div>
      </section>
    </div>
  );
}
