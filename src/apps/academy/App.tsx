"use client";
// The lesson, one hint at a time, and the help topics.
import { useMemo, useState } from "react";
import { HELP, LESSON, Result, useAct, useLife } from "@/apps/profile/data";
import "@/apps/profile/life.css";

export default function AcademyApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
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

  return (
    <div className="qy-life" data-testid="academy">
      <header className="qy-block">
        <h2>Academy</h2>
        <p className="qy-kicker">{tutorial && !tutorial.done ? tutorial.goal : "Help, when you want it"}</p>
      </header>
      <section className="qy-block" data-testid="lesson">
        <h3>The lesson</h3>
        {!tutorial || (tutorial.done && !step) ? (
          <p className="qy-muted">This life has no lesson running.</p>
        ) : (
          <ol className="qy-check">
            {LESSON.map((s, i) => {
              const done = tutorial.done || (at >= 0 && i < at);
              const current = !tutorial.done && s.id === step;
              return (
                <li key={s.id} data-done={done ? "1" : "0"} data-on={current ? "1" : "0"}>
                  <span>{done ? "Done · " : current ? "Now · " : ""}{current && tutorial.goal ? tutorial.goal : s.goal}</span>
                  {current && tutorial.hint ? <p className="qy-hint" data-testid="lesson-hint">{tutorial.hint}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
        {tutorial?.done && step === "done" ? <p className="qy-muted">You have finished the first hour.</p> : null}
        {tutorial?.step === "skip" ? <p className="qy-muted">{tutorial.goal}</p> : null}
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
        <Result note={note} />
      </section>
    </div>
  );
}
