"use client";
// Health, the hospital, the bill, and what is moving through the city.
import { Named } from "@/components/ui/Named";
import {
  ChoiceButton, Closed, Result, WordNum, healthWord, money, useAct, useLife, when,
} from "@/apps/profile/data";
import "@/apps/profile/life.css";

export default function HealthApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
  if (!life) return <Closed title="Health" />;
  const panel = life.healthPanel;
  const stat = (life.stats ?? []).find((s) => s.id === "health");
  const word = stat?.word ?? healthWord(panel?.health ?? 0);
  const hover = stat?.hover ?? String(Math.round(panel?.health ?? 0));
  const eventId = stat?.eventId ?? panel?.eventId ?? 0;
  const owed = panel?.owed ?? 0;
  const epi = panel?.epidemic ?? null;
  const visits = panel?.visits ?? [];
  const waves = panel?.waves ?? [];
  const clinic = (life.choices ?? []).find((c) => c.id === "clinic");

  return (
    <div className="qy-life" data-testid="health">
      <header className="qy-block">
        <h2>Health</h2>
        <p className="qy-kicker">
          <WordNum word={word} hover={hover} eventId={eventId} />
          {panel?.illness ? ` · ${panel.illness}` : " · Well"}
          {panel ? ` · ${panel.cover === "insured" ? "Covered" : "No cover"}` : ""}
        </p>
      </header>
      <Result note={note} />
      <section className="qy-block">
        <h3>The bill</h3>
        <div className="qy-row">
          <span className="label">Medical debt</span>
          <WordNum word={owed > 0 ? "A bill is outstanding" : "Clear"} hover={money(owed)} eventId={panel?.eventId} />
        </div>
        {clinic ? (
          <div className="qy-choice">
            <p>{clinic.line}</p>
            <ChoiceButton primary={clinic.left <= 0} disabled={busy || clinic.left > 0} testId="clinic" onClick={() => void go({ kind: "clinic" })}>
              See a doctor
            </ChoiceButton>
          </div>
        ) : (
          <ChoiceButton primary disabled={busy} testId="clinic" onClick={() => void go({ kind: "clinic" })}>
            See a doctor
          </ChoiceButton>
        )}
      </section>
      <section className="qy-block">
        <h3>Hospital</h3>
        {visits.length ? visits.map((v, i) => (
          <article className="qy-card" key={`${v.eventId}-${v.kind}-${i}`} data-testid="visit">
            <span className="label">{when(v.day)} · {visitWord(v.kind)}</span>
            <p>
              {v.text}
              {v.hospital ? ` · ${v.hospital}` : ""}
              {v.until ? ` until day ${v.until}` : ""}
            </p>
            {v.owed ? <WordNum word="Still owed" hover={money(v.owed)} eventId={v.eventId} /> : <WordNum word="On the record" hover={when(v.day)} eventId={v.eventId} />}
          </article>
        )) : <p className="qy-muted">No hospital visit on the books.</p>}
      </section>
      <section className="qy-block" data-testid="epidemic">
        <h3>The city</h3>
        {epi ? (
          <div className="qy-card">
            <WordNum word={epi.name} hover={`${epi.cases} people sick`} eventId={epi.eventId} />
            <p className="qy-muted">{epi.quarantine ? "The port is closed." : "It is moving through the city."}</p>
          </div>
        ) : <p className="qy-muted">The city is clear of epidemics.</p>}
        {waves.map((w) => (
          <p key={w.eventId}>{w.text} <WordNum word={when(w.day)} hover={when(w.day)} eventId={w.eventId} /></p>
        ))}
      </section>
      {panel?.house?.length ? (
        <section className="qy-block">
          <h3>The household</h3>
          {panel.house.filter((h, i, all) => all.findIndex((x) => x.index === h.index) === i).map((h) => (
            <div className="qy-row" key={h.index}>
              <Named name={h.name} />
              <WordNum
                word={h.illness ? h.illness : healthWord(h.health)}
                hover={h.owed > 0 ? money(h.owed) : String(Math.round(h.health))}
                eventId={h.eventId}
              />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function visitWord(kind: string): string {
  if (kind === "stay") return "Away, under care";
  if (kind === "bill") return "A hospital bill";
  if (kind === "player.clinic") return "The clinic";
  if (kind === "health.injury") return "An injury";
  if (kind === "health.debt") return "Care the family cannot pay";
  if (kind === "player.health") return "Health";
  return "Care";
}
