"use client";
// You, as a person: the six stats, the choices, and the chronicle.
import { useState } from "react";
import { gameDate, presentNote } from "@/components/ui/format";
import {
  ChoiceButton, Closed, Result, StatLine, WordNum, ageWord, coolWord, money, useAct, useLife,
} from "./data";
import "./life.css";

const ORDER = ["holiday", "clinic", "overtime", "donate", "lawyer"];

export default function ProfileApp() {
  const { life, run } = useLife();
  const { note, busy, go } = useAct();
  const [lines, setLines] = useState<string[] | null>(null);
  if (!life) return <Closed title="Profile" />;
  const age = life.age ?? 0;
  const job = life.employer ? `Works at ${life.employer}` : "No job";
  const wage = life.tape?.events?.wage;
  const choices = [...(life.choices ?? [])].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const primary = choices.find((c) => c.left <= 0)?.id;
  const story = life.story ?? [];

  const chronicle = () => {
    void run({ kind: "story" }).then((n) => setLines(n.lines ?? []));
  };

  return (
    <div className="qy-life" data-testid="profile">
      <header className="qy-block">
        <h2>{life.name || "You"}</h2>
        <p className="qy-kicker">
          <WordNum word={ageWord(age)} hover={`${age} years`} eventId={life.ageEvent} />
          {" · "}
          <WordNum word={job} hover={life.firm || "no employer"} eventId={life.jobEvent} />
        </p>
      </header>
      <Result note={note} />
      <section className="qy-block">
        <h3>How you are</h3>
        <div className="qy-stats">
          {(life.stats ?? []).map((s) => <StatLine key={s.id} s={s} />)}
        </div>
      </section>
      <section className="qy-block">
        <h3>Choices</h3>
        <div className="qy-actions">
          {choices.map((c) => (
            <div className="qy-choice" key={c.id}>
              <div>
                <strong>{c.label}</strong>
                <p>{c.line}</p>
                <p>
                  <WordNum word={coolWord(c.left)} hover={c.left > 0 ? `${c.left} days` : ""} />
                  {" · "}
                  <WordNum word="The cost" hover={money(c.cost)} eventId={wage} />
                </p>
              </div>
              <ChoiceButton
                primary={c.id === primary}
                disabled={busy || c.left > 0}
                testId={`choice-${c.id}`}
                onClick={() => void go({ kind: c.id })}
              >
                {c.label}
              </ChoiceButton>
            </div>
          ))}
        </div>
      </section>
      <section className="qy-block qy-story">
        <h3>This life so far</h3>
        {story.length ? story.slice(-12).reverse().map((s) => (
          <article key={`${s.eventId}-${s.day}`}>
            <span className="qy-muted">{gameDate(s.day)}</span>
            <span>{presentNote(s.text)} <WordNum word="" hover="" eventId={s.eventId} /></span>
          </article>
        )) : <p className="qy-muted">Nothing has been written down yet.</p>}
        <ChoiceButton primary={!primary} disabled={busy} testId="chronicle" onClick={chronicle}>
          Write the chronicle
        </ChoiceButton>
        {lines ? <pre className="qy-lines" data-testid="chronicle-text">{lines.map(presentNote).join("\n")}</pre> : null}
      </section>
    </div>
  );
}

