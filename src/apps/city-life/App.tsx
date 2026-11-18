"use client";
// Where to go tonight, who you have met, and evening courses. Calm: one thing to do at a time.
import { useCallback, useEffect, useState } from "react";
import { ChoiceButton, Closed, Result, money, useAct, useLife } from "@/apps/profile/data";
import "@/apps/profile/life.css";
import "./city-life.css";

interface VenueRow { n: number; id: string; name: string; where: string; cost: number; count: number; line: string; news: string[]; friends: string[]; here: boolean }
interface Face { n: number; name: string; text: string; news: string; known: string }
interface Known { n: number; name: string; job: string; how: string; word: string; met: number; line: string }
interface CourseRow { id: string; name: string; weeks: number; fee: number; blurb: string; done: boolean }
interface Board {
  venues: VenueRow[];
  tonight: { venue: string; faces: Face[]; asked: number; rounds: number; listened: boolean } | null;
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

export default function CityLifeApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState<"out" | "people" | "school">("out");
  const [rev, setRev] = useState(0);
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

  if (!life) return <Closed title="City life" />;
  if (!board) {
    return (
      <div className="qy-life cl" data-testid="citylife">
        <h2>City life</h2>
        <p className="qy-muted">{failed ? "The city did not answer." : "Looking around…"}</p>
      </div>
    );
  }
  const t = board.tonight;
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "out", label: "Tonight" },
    { id: "people", label: `People${board.people.length ? ` (${board.people.length})` : ""}` },
    { id: "school", label: "Courses" },
  ];

  return (
    <div className="qy-life cl" data-testid="citylife">
      <header className="qy-block">
        <h2>City life</h2>
        <p className="qy-kicker">{t ? `Out at ${t.venue}` : board.courses.now ? `In class: ${board.courses.now.name}` : "An evening is yours"}</p>
      </header>
      <div className="cl-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} data-on={tab === x.id ? "1" : "0"} data-testid={`cl-tab-${x.id}`} onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <Result note={note} />

      {tab === "out" ? (
        <section className="qy-block" data-testid="cl-out">
          {t ? (
            <>
              <h3>Who is here</h3>
              {t.faces.map((f) => (
                <div className="qy-choice" key={f.n} data-testid={`face-${f.n}`}>
                  <p>
                    <span>{f.text}</span>
                    {f.known ? <span className="cl-word">{f.known}</span> : null}
                  </p>
                  <ChoiceButton primary={false} disabled={busy || t.asked >= 3} testId={`approach-${f.n}`} onClick={() => void say(`approach ${f.n}`)}>Talk</ChoiceButton>
                </div>
              ))}
              <div className="cl-acts">
                <ChoiceButton primary={false} disabled={busy || t.rounds >= 2} testId="round" onClick={() => void say("round")}>Buy a round</ChoiceButton>
                <ChoiceButton primary={false} disabled={busy || t.listened} testId="listen" onClick={() => void say("listen")}>Just listen</ChoiceButton>
              </div>
              <p className="qy-muted">Three conversations make an evening.</p>
            </>
          ) : (
            <>
              <h3>Where to go tonight</h3>
              {board.courses.now && board.courses.now.nextIn === 7 ? <p className="qy-muted">Class tonight: {board.courses.now.name}.</p> : null}
              {board.venues.map((v) => (
                <div className="qy-choice" key={v.id} data-testid={`venue-${v.id}`}>
                  <p>
                    <span>{v.name} <span className="cl-word">{v.where}</span></span>
                    <span className="cl-line">{v.line}</span>
                    {v.news.length ? <span className="cl-news">From the paper: {v.news.join("; ")}</span> : null}
                    {v.friends.length ? <span className="cl-news">You know: {v.friends.join(", ")}</span> : null}
                  </p>
                  <ChoiceButton primary={false} disabled={busy || board.cash < v.cost} testId={`go-${v.id}`} onClick={() => void say(`go ${v.id}`)}>Go · {money(v.cost)}</ChoiceButton>
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
              <p className="qy-muted">{p.name} {p.job}. {p.how.replace(/^met at/, "Met at")}, {p.met === 1 ? "once" : `${p.met} times`}.{p.line.includes(";") ? ` ${p.line.slice(p.line.indexOf(";") + 2)}.` : ""}</p>
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
          {board.loans.length ? <p className="qy-muted">You owe {board.loans.map((l) => `${l.name} ${money(l.cents)}`).join(", ")}.</p> : null}
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
              <ChoiceButton primary={false} disabled={busy || c.done || !!board.courses.now || board.cash < c.fee} testId={`enrol-${c.id}`} onClick={() => void say(`enrol ${c.id}`)}>{c.done ? "Finished" : "Enrol"}</ChoiceButton>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
