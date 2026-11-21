"use client";
// Where to go tonight, who you have met, and evening courses. Calm: one thing to do at a time.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChoiceButton, Closed, Result, money, useAct, useLife } from "@/apps/profile/data";
import { gameDate, presentNote } from "@/components/ui/format";
import { useSimSnap } from "@/shell/simSession";
import "@/apps/profile/life.css";
import "./city-life.css";

interface VenueRow { id: string; name: string; where: string; cost: number; round: number; opens: string; line: string; say: string; news: string[]; friends: string[] }
interface Face { n: number; name: string; text: string; heard: string; exchanges: number }
interface Exchange { topic: string; text: string; lines: string[] }
const TOPICS = [
  { id: "", label: "Keep talking" }, { id: "work", label: "Work" },
  { id: "city", label: "The city" }, { id: "home", label: "Life at home" },
  { id: "money", label: "Money" },
];
interface Known { n: number; name: string; job: string; how: string; word: string; met: number; line: string }
interface CourseRow { id: string; name: string; weeks: number; fee: number; blurb: string; done: boolean; known: boolean }
interface Board {
  venues: VenueRow[];
  tonight: { venue: string; venueId: string; faces: Face[]; open: boolean; rounds: number; listened: boolean; spent: number } | null;
  people: Known[];
  loans: { name: string; cents: number; due: number }[];
  courses: { now: { name: string; sessions: number; weeks: number; nextIn: number; classmates: string[] } | null; rows: CourseRow[]; finished: string[] };
  cash: number;
  day: number;
}

const FAVOURS: { what: string; label: string }[] = [
  { what: "intro", label: "An introduction" },
  { what: "interview", label: "A word for an interview" },
  { what: "loan 500", label: "Lend me $500" },
  { what: "lender 1000", label: "A word with their bank" },
];

/** The part of the day the city is in, so the heading at noon does not say evening. */
function partOfDay(clock: string | undefined): string {
  const h = Number(/(d{1,2}):d{2}/.exec(clock ?? "")?.[1] ?? 19);
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export default function CityLifeApp() {
  const { life } = useLife();
  const clock = useSimSnap().view?.live?.label;
  const { note, busy, go } = useAct();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [talking, setTalking] = useState<number | null>(null);
  const conversation = useRef<HTMLElement>(null);
  useEffect(() => { if (talking !== null) conversation.current?.scrollIntoView({ block: "nearest" }); }, [talking]);
  const [transcript, setTranscript] = useState<Record<number, Exchange[]>>({});
  const [tab, setTab] = useState<"out" | "people" | "school">("out");
  const [rev, setRev] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const day = life?.date.abs ?? -1;

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=citylife", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Board>) : null))
      .then((j) => { if (j?.venues) { setBoard(j); setFailed(false); } else if (!ac.signal.aborted) setFailed(true); })
      .catch(() => { if (!ac.signal.aborted) setFailed(true); });
    return () => ac.abort();
  }, [day, rev]);

  const say = useCallback(async (line: string) => {
    await go({ line });
    setRev((n) => n + 1);
  }, [go]);

  const out = async (op: "go" | "leave" | "round" | "listen", arg?: string) => {
    setQuiet(op === "go");
    const next = await go({ kind: "out", op, arg });
    if (next.ok && (op === "go" || op === "leave")) {
      setTalking(null);
      setTranscript({});
    }
    setRev((n) => n + 1);
  };
  const talk = async (n: number, topic = "") => {
    setTalking(n);
    setQuiet(false);
    const next = await go({ kind: "out", op: "talk", n, arg: topic });
    if (next.ok) {
      const label = TOPICS.find((choice) => choice.id === topic)?.label ?? "Keep talking";
      setTranscript((old) => {
        const before = old[n] ?? [];
        return { ...old, [n]: [...before, { topic: before.length ? label : "Introduce yourself", text: next.text, lines: next.lines ?? [] }] };
      });
    }
    setRev((k) => k + 1);
  };

  if (!life) return <Closed title="City life" />;
  if (!board) {
    return (
      <div className="qy-life cl" data-testid="citylife">
        <h2>City life</h2>
        <p className="qy-muted">{failed ? "The city did not answer." : "Looking around…"}</p>
      </div>
    );
  }
  const t = board.tonight?.open ? board.tonight : null;
  const venue = t ? board.venues.find((row) => row.id === t.venueId) : undefined;
  const face = t?.faces.find((row) => row.n === talking);
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "out", label: "Tonight" },
    { id: "people", label: `People${board.people.length ? ` (${board.people.length})` : ""}` },
    { id: "school", label: "Courses" },
  ];

  return (
    <div className="qy-life cl" data-testid="citylife">
      <header className="qy-block">
        <h2>City life</h2>
        <p className="qy-kicker">{t ? `${t.venue} · The clock waits while you’re here` : `Find somewhere to spend the ${partOfDay(clock)}`}</p>
      </header>
      <div className="cl-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-on={tab === x.id ? "1" : "0"} data-testid={`cl-tab-${x.id}`} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <Result note={quiet || (note?.ok && transcript[talking ?? -1]?.at(-1)?.text === note.text) ? null : note} />

      {tab === "out" ? (
        <section className="qy-block" data-testid="cl-out">
          {t ? (
            <>
              <div className="cl-venue-now qy-card">
                <div>
                  <h3>{t.venue}</h3>
                  <p className="qy-muted">{venue?.say}</p>
                  <p className="qy-muted">{clock} · Spent {money(t.spent)}</p>
                </div>
                <div className="cl-acts">
                  <ChoiceButton primary={false} disabled={busy || t.rounds >= 3 || (venue ? board.cash < venue.round : false)} testId="round" onClick={() => void out("round")}>
                    Buy a round{venue ? ` · ${money(venue.round)}` : ""}
                  </ChoiceButton>
                  <ChoiceButton primary={false} disabled={busy || t.listened} testId="listen" onClick={() => void out("listen")}>Listen</ChoiceButton>
                  <ChoiceButton primary={false} disabled={busy} testId="leave-venue" onClick={() => void out("leave")}>Leave</ChoiceButton>
                </div>
              </div>
              {face ? (
                <section ref={conversation} className="qy-card cl-conversation" aria-label="Conversation" data-testid="venue-conversation">
                  <h3>{face.name || "Conversation"}</h3>
                  <ol className="cl-dialogue" aria-live="polite">
                    {(transcript[face.n] ?? []).map((exchange, i) => (
                      <li key={i}>
                        <span className="label">{exchange.topic}</span>
                        <p>{presentNote(exchange.text)}</p>
                        {exchange.lines.map((line) => <p className="qy-muted" key={line}>{presentNote(line)}</p>)}
                      </li>
                    ))}
                  </ol>
                  <div className="cl-acts">
                    {TOPICS.map((topic) => (
                      <ChoiceButton key={topic.label} primary={!topic.id} disabled={busy} testId={`topic-${topic.id || "next"}`} onClick={() => void talk(face.n, topic.id)}>
                        {topic.label}
                      </ChoiceButton>
                    ))}
                  </div>
                </section>
              ) : null}
              <h3>Who is here</h3>
              <div className="cl-faces">
                {t.faces.map((f) => (
                  <article className="qy-card" key={f.n} data-testid={`face-${f.n}`}>
                    <p>{f.text}</p>
                    {f.heard && !f.text.includes(f.heard) ? <p className="qy-muted">{f.heard}</p> : null}
                    <ChoiceButton primary={false} disabled={busy} testId={`approach-${f.n}`} onClick={() => {
                      if (transcript[f.n]?.length) setTalking(f.n);
                      else void talk(f.n);
                    }}>{f.exchanges || transcript[f.n]?.length ? "Talk again" : "Introduce yourself"}</ChoiceButton>
                  </article>
                ))}
              </div>
              {!t.faces.length ? <p className="qy-muted">The room is quiet tonight.</p> : null}
            </>
          ) : (
            <>
              <h3>Venues</h3>
              {board.venues.map((v) => (
                <div className="qy-choice" key={v.id} data-testid={`venue-${v.id}`}>
                  <p>
                    <span>{v.name} <span className="cl-word">{v.where}</span></span>
                    <span className="cl-line">{v.line}</span>
                    <span className="cl-line">Opens at {v.opens} · Rounds {money(v.round)}</span>
                    {v.news.length ? <span className="cl-news">In the papers · {v.news.join(", ")}</span> : null}
                    {v.friends.length ? <span className="cl-news">You might see {v.friends.join(", ")}</span> : null}
                  </p>
                  <ChoiceButton primary={false} disabled={busy || board.cash < v.cost} testId={`go-${v.id}`} onClick={() => void out("go", v.id)}>Go · {money(v.cost)}</ChoiceButton>
                </div>
              ))}
            </>
          )}
        </section>
      ) : null}

      {tab === "people" ? (
        <section className="qy-block" data-testid="cl-people">
          <h3>People you know</h3>
          {board.people.length === 0 ? <p className="qy-muted">Nobody yet. Spend an evening out and talk to someone.</p> : null}
          {board.people.map((p) => (
            <div className="qy-card" key={p.n} data-testid={`person-${p.n}`}>
              <button type="button" className="cl-row" aria-expanded={open === p.n} onClick={() => setOpen(open === p.n ? null : p.n)}>
                <span>{p.name}</span>
                <span className="cl-word">{p.word}</span>
              </button>
              <p className="qy-muted" data-testid="known-line">{p.job ? p.job.charAt(0).toUpperCase() + p.job.slice(1) : "No role on the book"}{p.word ? ` · ${p.word}` : ""}. {p.how ? `${p.how.charAt(0).toUpperCase()}${p.how.slice(1)}, ` : ""}{p.met === 1 ? "once" : `${p.met} times`}.</p>
              {open === p.n ? (
                <div className="cl-acts">
                  <ChoiceButton primary={false} disabled={busy} testId={`shop-${p.n}`} onClick={() => void say(`business ${p.n}`)}>Talk shop</ChoiceButton>
                  {FAVOURS.map((f) => (
                    <ChoiceButton key={f.what} primary={false} disabled={busy} testId={`favour-${p.n}-${f.what.split(" ")[0]}`} onClick={() => void say(`favour ${p.n} ${f.what}`)}>{f.label}</ChoiceButton>
                  ))}
                  <ChoiceButton primary={false} disabled={busy} testId={`offer-${p.n}`} onClick={() => void say(`offer ${p.n}`)}>Offer a job</ChoiceButton>
                </div>
              ) : null}
            </div>
          ))}
          {board.loans.length ? <p className="qy-muted">You owe {board.loans.map((l) => `${l.name} ${money(l.cents)} (due ${gameDate(l.due)})`).join(", ")}.</p> : null}
        </section>
      ) : null}

      {tab === "school" ? (
        <section className="qy-block" data-testid="cl-school">
          <h3>Evening courses</h3>
          {board.courses.now ? (
            <p className="qy-card" data-testid="class-now">
              {board.courses.now.name}: class {board.courses.now.sessions} of {board.courses.now.weeks}. The next one is in {board.courses.now.nextIn} days.
              {board.courses.now.classmates.length ? ` Your class: ${board.courses.now.classmates.join(", ")}.` : ""}
            </p>
          ) : null}
          {board.courses.rows.map((c) => (
            <div className="qy-choice" key={c.id}>
              <p>
                <span>{c.name}</span>
                <span className="cl-line">{c.blurb}. {c.weeks} weekly evenings, {money(c.fee)}.</span>
              </p>
              <ChoiceButton primary={false} disabled={busy || c.done || c.known || !!board.courses.now || board.cash < c.fee} testId={`enrol-${c.id}`} onClick={() => void say(`enrol ${c.id}`)}>{c.done ? "Finished" : c.known ? "Known from work" : "Enrol"}</ChoiceButton>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
