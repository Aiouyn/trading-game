"use client";
// You, as a person: the six stats, the choices, and the chronicle.
import { useEffect, useState } from "react";
import { ResidenceDetails } from "@/apps/property/App";
import { useShellStore } from "@/components/shell/ShellContext";
import { gameDate, presentNote } from "@/components/ui/format";
import {
  ChoiceButton, Closed, Result, StatLine, WordNum, ageWord, coolWord, money, useAct, useLife,
} from "./data";
import "./life.css";

const ORDER = ["holiday", "clinic", "overtime", "donate", "lawyer"];

function CoinRecord() {
  const [dev, setDev] = useState<{ word: string; line: string; following: number } | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/sim/coins", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (!live || !j || typeof j !== "object") return;
        const d = (j as { dev?: { word?: string; line?: string; following?: number } }).dev;
        if (d && typeof d.word === "string" && typeof d.line === "string") {
          setDev({ word: d.word, line: d.line, following: typeof d.following === "number" ? d.following : 0 });
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  if (!dev) return null;
  return (
    <section className="qy-block" data-testid="profile-dev">
      <h3>Your coins</h3>
      <p data-testid="lp-dev-word">{dev.word}</p>
      <p>{dev.line}</p>
      <p>{dev.following} {dev.following === 1 ? "person holds" : "people hold"} your live coins.</p>
    </section>
  );
}

export default function ProfileApp() {
  const store = useShellStore();
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
  const background = life.life;

  const chronicle = () => {
    void run({ kind: "story" }).then((n) => setLines(n.lines ?? []));
  };

  return (
    <div className="qy-life" data-testid="profile">
      <header className="qy-block">
        <h2>{life.name || "You"}</h2>
        <p className="qy-kicker qy-kicker-row">
          <WordNum word={ageWord(age)} hover={`${age} years`} eventId={life.ageEvent} />
          <span aria-hidden="true">·</span>
          <WordNum word={job} hover={life.employer || ""} eventId={life.jobEvent} />
        </p>
      </header>
      <Result note={note} />
      <section className="qy-block">
        <h3>
          <button type="button" className="name-link" data-testid="home-card" onClick={() => store.getState().open("property")}>Your home</button>
        </h3>
        <ResidenceDetails home={life.residence} />
        <ChoiceButton primary={false} disabled={false} testId="browse-homes" onClick={() => store.getState().open("property")}>Browse homes</ChoiceButton>
      </section>
      <CoinRecord />
      {background ? (
        <section className="qy-block" data-testid="profile-background">
          <h3>Background and skills</h3>
          {background.past ? <p><strong>{background.past.name}</strong> · {background.past.line}</p> : null}
          {background.origin ? <p><strong>{background.origin.name}</strong> · {background.origin.line}</p> : null}
          {background.skills ? (
            <p>{background.skills.school} years of schooling{background.skills.trade ? ` · ${background.skills.years} years as a ${background.skills.trade}` : ""}</p>
          ) : null}
          {background.knows.length ? <p>Knowledge · {background.knows.join(", ")}</p> : null}
        </section>
      ) : null}
      <section className="qy-block" data-testid="household-budget">
        <h3>Household budget</h3>
        {life.budget ? (
          <>
            <p>Gross {money(life.budget.gross)} a week · tax {money(life.budget.tax)} · take-home {money(life.budget.takeHome)}.</p>
            <p>Benefit {money(life.budget.benefit)} a week. {life.budget.benefitEnd}</p>
            {life.budget.lines.map((line) => (
              <div className="qy-row" key={line.id} data-testid={`budget-${line.id}`}>
                <span className="label">{line.label}</span>
                <span className="num">{money(line.cents)} a week</span>
                <span className="qy-muted">{line.note}</span>
              </div>
            ))}
            <p data-testid="budget-runway">
              A week out is {money(life.budget.weekly)}: {life.budget.lines.map((line) => `${line.label.toLowerCase()} ${money(line.cents)}`).join(" + ")} = {money(life.budget.weekly)}. Runway is {money(life.budget.cash)} / {money(life.budget.weekly)} = {life.budget.runwayWeeks >= 99.5 ? "more than 99" : life.budget.runwayWeeks.toFixed(1)} weeks.
            </p>
          </>
        ) : <p className="qy-muted">The household book is not open yet.</p>}
      </section>
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
                <strong>{c.label.charAt(0).toUpperCase() + c.label.slice(1)}</strong>
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
                {busy ? "Sending…" : c.label.charAt(0).toUpperCase() + c.label.slice(1)}
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
          {busy ? "Sending…" : "Write the chronicle"}
        </ChoiceButton>
        {lines ? <pre className="qy-lines" data-testid="chronicle-text">{lines.map(presentNote).join("\n")}</pre> : null}
      </section>
    </div>
  );
}

