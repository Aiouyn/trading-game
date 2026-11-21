"use client";
// The city's papers: the Daily Herald each morning and the Evening Gazette each evening lead; the wire follows, with
// outlet, voice, byline and beat. Rumours are marked. A correction names the story it corrects. Coin launches are one line.
import { calDate } from "@/shell/calendar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { useSimSnap } from "@/shell/simSession";
import { gameDate, presentNote } from "@/components/ui/format";
import { Button } from "@/components/ui/Button";
import { useAct } from "@/apps/profile/data";
import { StoryWhy } from "./StoryWhy";
import { CityTicker } from "@/apps/society/ticker";
import "./wire.css";

interface Paper {
  eventId: number;
  day: number;
  outlet: string;
  voice: string;
  journalist: string;
  beat: string;
  text: string;
  rumour: boolean;
  correction: boolean;
  corrects: number;
  correctsText: string;
  roundup: boolean;
  tags: string[];
  /** The request this story answers (the player's comment), or -1. */
  answers: number;
}
interface Stance { id: string; label: string }

/** What each stance risks, in one line. The stance ids come from the simulation. */
const RISK: Record<string, string> = {
  explain: "Your words run in full. A careless line becomes the headline.",
  deny: "Short and firm. If the facts come out later, the denial becomes the story.",
  nocomment: "Nothing of yours runs. The paper says you declined, and it counts against you.",
  attack: "Hits back at the paper. Its trust in you falls furthest of the four.",
};
interface Ask {
  request: number;
  eventId: number;
  day: number;
  until: number;
  open: boolean;
  journalist: string;
  journalistIndex: number;
  outlet: string;
  voice: string;
  about: string;
  stance: string;
  said: string;
  stances: Stance[];
}
interface Answer { stance: string; text: string }

const FILTERS = ["papers", "all", "you", "contacts", "holdings", "city", "markets"] as const;
type Filter = (typeof FILTERS)[number];
const LABEL: Record<Filter, string> = {
  papers: "Today's papers",
  all: "The wire",
  you: "You",
  contacts: "Contacts",
  holdings: "Holdings",
  city: "City",
  markets: "Markets",
};

function beatWord(beat: string): string {
  if (!beat) return "";
  if (beat === "rumours") return "Rumours";
  return beat.charAt(0).toUpperCase() + beat.slice(1);
}

function CommentBox({ ask, busy, onSend }: { ask: Ask; busy: boolean; onSend: (stance: string, text: string) => void }) {
  const stances = ask.stances.length ? ask.stances : [{ id: "explain", label: "Explain" }];
  const [stance, setStance] = useState(stances[0].id);
  const [text, setText] = useState("");
  const words = stance === "nocomment" || text.trim().length > 0;
  return (
    <form className="paper-ask" id={askId(ask.request)} data-testid="press-ask" onSubmit={(e) => { e.preventDefault(); if (words) onSend(stance, text.trim()); }}>
      <p className="paper-kicker">{ask.outlet}{ask.voice ? ` · ${ask.voice}` : ""}</p>
      <p>{ask.journalist} asks for comment on {presentNote(ask.about)}</p>
      <div className="press-stances" role="group" aria-label="Your stance">
        {stances.map((s) => (
          <button key={s.id} type="button" className="press-stance" aria-pressed={stance === s.id} data-testid={`press-stance-${s.id}`} data-on={stance === s.id ? "1" : "0"} onClick={() => setStance(s.id)}>
            <span className="press-stance-label">{s.label}</span>
            <span className="press-stance-risk">{RISK[s.id] ?? ""}</span>
          </button>
        ))}
      </div>
      {stance !== "nocomment" ? (
        <label>
          Your comment
          <textarea value={text} data-testid="press-comment" rows={3} onChange={(e) => setText(e.target.value)} />
        </label>
      ) : null}
      <Button variant="primary" type="submit" disabled={busy || !words} data-testid="press-send">{busy ? "Sending…" : "Send to the paper"}</Button>
    </form>
  );
}

/** The anchor of a request on the page, so a story can link back to it. */
function askId(request: number): string {
  return `press-ask-${request}`;
}

/** What the player said to the paper: the words, or the stance when there were no words. */
function saidLine(ask: Ask, local: Answer | undefined): string {
  const stance = local?.stance ?? ask.stance;
  const words = local?.text ?? ask.said;
  if (!stance) return "";
  if (stance === "nocomment") return `You gave ${ask.outlet} no comment.`;
  if (stance === "declined") return `You did not answer ${ask.outlet} in time.`;
  return `You told ${ask.outlet}: ${words}`;
}

interface EditionStory { id: number; section: string; kicker: string; headline: string; body: string; eventId: number; you?: boolean }
interface Edition {
  id: number; day: number; date: string; outlet: string; edition: string; time: string; headline: string;
  stories: EditionStory[]; column: { title: string; lines: string[] } | null;
}

/** A coin launch line from the wire: one person, one coin, one pool. */
const LAUNCH = /^(.+?) launched (.+?) \(([A-Z0-9]{2,8})\) and seeded the pool with (\$[\d,.]+)\.?$/;

type Item =
  | { kind: "paper"; paper: Paper }
  | { kind: "launches"; day: number; coins: { name: string; symbol: string }[]; key: string };

/** The wire's stories, with every coin launch of a day gathered into one Launchpad line. */
function gather(papers: Paper[]): Item[] {
  const out: Item[] = [];
  const byDay = new Map<number, Extract<Item, { kind: "launches" }>>();
  for (const paper of papers) {
    const m = LAUNCH.exec(paper.text.trim());
    if (!m || paper.outlet) { out.push({ kind: "paper", paper }); continue; }
    let row = byDay.get(paper.day);
    if (!row) {
      row = { kind: "launches", day: paper.day, coins: [], key: `launch-${paper.day}-${paper.eventId}` };
      byDay.set(paper.day, row);
      out.push(row);
    }
    if (!row.coins.some((c) => c.symbol === m[3])) row.coins.push({ name: m[2], symbol: m[3] });
  }
  return out;
}

/** "Wednesday 17 January": the year only once there is more than one. */
function dayText(day: number, today: number): string {
  const label = gameDate(day);
  const year = calDate(day).year;
  const now = calDate(today).year;
  return year === now ? label.replace(/, year \d+$/, "") : label;
}

/** Story text without the first year's number in it ("17 January, year 1" reads "17 January"). */
function noYear(text: string, today: number): string {
  const now = calDate(today).year;
  return text.replace(new RegExp(`,? year ${now}\\b`, "g"), "");
}

function EditionView({ ed, today, open, onWhy, match }: { ed: Edition; today: number; open: number | null; onWhy: (id: number) => void; match: (text: string, beat: string) => boolean }) {
  const [lead, ...rest] = ed.stories.filter((st) => match(`${st.kicker} ${st.headline} ${st.body}`, st.section));
  if (!lead) return null;
  const story = (st: EditionStory, isLead: boolean) => (
    <section key={st.id} className={isLead ? "edition-lead" : "edition-story"} data-you={st.you ? "1" : "0"}>
      {st.kicker ? <p className="edition-kicker">{st.kicker}</p> : null}
      {isLead ? <h3>{noYear(presentNote(st.headline), today)}</h3> : <h4>{noYear(presentNote(st.headline), today)}</h4>}
      {st.body ? <p className="edition-body">{noYear(presentNote(st.body), today)}</p> : null}
      {st.eventId > 0 ? <button type="button" className="name-link why-link" onClick={() => onWhy(st.eventId)}>Why?</button> : null}
      {open === st.eventId && st.eventId > 0 ? (
        <div className="sim-wire-why" data-testid="wire-why">
          <StoryWhy id={st.eventId} text={st.headline} />
        </div>
      ) : null}
    </section>
  );
  return (
    <article className="edition" data-testid="wire-edition" data-outlet={ed.outlet}>
      <header className="edition-mast">
        <span className="edition-outlet">{ed.outlet}</span>
        <span className="edition-date">{ed.edition === "evening" ? "Evening" : "Morning"} · {ed.date || dayText(ed.day, today)} · {ed.time}</span>
      </header>
      {lead ? story(lead, true) : null}
      {rest.map((st) => story(st, false))}
      {ed.column && ed.column.lines.length ? (
        <p className="edition-column" data-testid="wire-launchpad">
          <span className="edition-kicker">{ed.column.title || "The Launchpad"}</span> {ed.column.lines.join(" ")}
        </p>
      ) : null}
    </article>
  );
}

/** What a story is about, for the kind filter: the beat the wire gave it, or the section of the paper. */
const KINDS = [
  { id: "", label: "Every kind" },
  { id: "rates", label: "Rates and the bank" },
  { id: "companies", label: "Companies" },
  { id: "markets", label: "Markets" },
  { id: "rumours", label: "Rumours" },
  { id: "jobs", label: "Jobs" },
  { id: "courts", label: "Courts" },
  { id: "city", label: "City and people" },
] as const;
function kindOfBeat(beat: string, text: string): string {
  const b = beat.toLowerCase();
  if (b === "rumours" || /^(rumour|sources say)\b/i.test(text)) return "rumours";
  if (b === "rates" || b === "bank" || /\b(central bank|policy rate|rate day|yield)\b/i.test(text)) return "rates";
  if (b === "companies" || b === "industry" || b === "earnings" || b === "business") return "companies";
  if (b === "markets" || b === "crypto") return "markets";
  if (b === "jobs" || b === "labour" || b === "work") return "jobs";
  if (b === "courts" || b === "law" || b === "crime") return "courts";
  return "city";
}

export default function WireApp({ context }: { context?: string }) {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const today = tick ?? 0;
  const { note, busy, go } = useAct();
  const [filter, setFilter] = useState<Filter>("papers");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [saidLocal, setSaidLocal] = useState<Record<number, Answer>>({});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [kind, setKind] = useState<string>(context === "rates" ? "rates" : "");
  const [query, setQuery] = useState("");
  const clock = useSimSnap().view?.live?.min;
  // The wire updates while it is open: every quarter of a game hour, and at most every two real seconds.
  // The timer is not reset when the quarter changes. At x25 a quarter is shorter than two seconds, and
  // resetting it would leave the open wire stuck on the morning paper through the decision.
  const quarter = typeof clock === "number" ? Math.floor(clock / 15) : 0;
  const [pulse, setPulse] = useState(0);
  const lastRead = useRef(0);
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current) return;
    const wait = Math.max(0, 2000 - (Date.now() - lastRead.current));
    pending.current = window.setTimeout(() => {
      pending.current = 0;
      lastRead.current = Date.now();
      setPulse((n) => n + 1);
    }, wait);
  }, [quarter, tick]);
  useEffect(() => () => { if (pending.current) window.clearTimeout(pending.current); }, []);
  // the bank's meeting chip opens the wire on the rates
  useEffect(() => { if (context === "rates") { setKind("rates"); setFilter("all"); } }, [context]);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=wire", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<{ papers?: Paper[]; asks?: Ask[]; editions?: Edition[] }> : null))
      .then((j) => {
        if (j?.papers) { setPapers(j.papers); setAsks(j.asks ?? []); setEditions(Array.isArray(j.editions) ? j.editions : []); setFailed(false); }
        else setFailed(true);
        setReady(true);
      })
      .catch(() => { if (!ac.signal.aborted) { setFailed(true); setReady(true); } });
    return () => ac.abort();
  }, [pulse, attempt]);

  const q = query.trim().toLowerCase();
  const match = (text: string, beat: string): boolean => (!kind || kindOfBeat(beat, text) === kind) && (!q || text.toLowerCase().includes(q));
  const shown = useMemo(
    () => gather(papers.filter((p) => (filter === "papers" || filter === "all" || p.tags.includes(filter)) && (!kind || kindOfBeat(p.beat, p.text) === kind) && (!q || `${p.outlet} ${p.text} ${p.journalist}`.toLowerCase().includes(q)))),
    [papers, filter, kind, q],
  );
  const byId = useMemo(() => new Map(papers.map((p) => [p.eventId, p])), [papers]);

  const onOpen = (id: number) => setOpen((cur) => (cur === id ? null : id));
  const send = async (ask: Ask, stance: string, text: string) => {
    const result = await go({ kind: "press", request: ask.request, stance, text });
    if (result.ok) setSaidLocal((cur) => ({ ...cur, [ask.eventId]: { stance, text } }));
  };
  const onPapers = filter === "papers";

  return (
    <div className={`sim-wire${phone ? " q-phone" : ""}`} data-testid="wire">
      <CityTicker where="wire" />
      <header className="paper-head">
        <h2>The papers</h2>
      </header>
      <div className="sim-wire-filters" role="group" aria-label="Wire">
        {FILTERS.map((f) => (
          <button key={f} type="button" data-on={filter === f ? "1" : "0"} onClick={() => setFilter(f)}>{LABEL[f]}</button>
        ))}
      </div>
      <div className="sim-wire-find" role="search">
        <input type="search" value={query} placeholder="Search the papers: a name, a firm, a word" aria-label="Search the papers" data-testid="wire-search" onChange={(e) => setQuery(e.target.value)} />
        <select value={kind} aria-label="Kind of story" data-testid="wire-kind" onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </div>
      {note ? <p className="paper-note" data-ok={note.ok ? "1" : "0"}>{presentNote(note.text)}</p> : null}
      {asks.filter((a) => a.open && !saidLocal[a.eventId]).map((ask) => (
        <CommentBox key={ask.eventId} ask={ask} busy={busy} onSend={(stance, text) => { void send(ask, stance, text); }} />
      ))}
      {asks.filter((a) => !a.open || saidLocal[a.eventId]).map((ask) => {
        const line = saidLine(ask, saidLocal[ask.eventId]);
        return line ? <p className="paper-said" id={askId(ask.request)} key={`said-${ask.eventId}`} data-testid="press-said">{line}</p> : null;
      })}
      {!ready ? <p className="quay-state" role="status">Reading the papers…</p> : null}
      {ready && failed && !papers.length ? (
        <p className="quay-state" data-kind="error" role="alert">
          The wire did not answer. <button type="button" className="name-link" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </p>
      ) : null}
      {onPapers && ready && !failed ? (
        editions.length ? editions.map((ed) => <EditionView key={ed.id} ed={ed} today={today} open={open} onWhy={onOpen} match={match} />)
          : <p className="quay-empty" data-testid="wire-no-edition">The Daily Herald comes out at 07:00 and the Evening Gazette at 18:00. Until then, the wire.</p>
      ) : null}
      {onPapers && editions.length ? null : shown.length ? shown.map((item) => {
        if (item.kind === "launches") {
          const names = item.coins.slice(0, 4).map((c) => `${c.name} (${c.symbol})`).join(", ");
          const more = item.coins.length > 4 ? ` and ${item.coins.length - 4} more` : "";
          return (
            <article key={item.key} className="paper paper-launches" data-testid="wire-launchpad">
              <p className="paper-marks"><span className="paper-mark">Launchpad</span><span className="num">{dayText(item.day, today)}</span></p>
              <p className="paper-body">{item.coins.length === 1 ? `A new coin: ${names}.` : `${item.coins.length} new coins: ${names}${more}.`}</p>
            </article>
          );
        }
        const paper = item.paper;
        const corrected = paper.corrects >= 0 ? byId.get(paper.corrects) : undefined;
        return (
          <article key={paper.eventId} className="paper" data-testid="wire-item" data-rumour={paper.rumour ? "1" : "0"} data-correction={paper.correction ? "1" : "0"} data-roundup={paper.roundup ? "1" : "0"}>
            {paper.outlet ? (
              <header className="paper-mast">
                <span className="paper-outlet">{paper.outlet}</span>
                {paper.voice ? <span className="paper-voice">{paper.voice}</span> : null}
              </header>
            ) : null}
            <p className="paper-marks">
              {paper.rumour ? <span className="paper-mark" data-kind="rumour">Rumour</span> : null}
              {paper.correction ? <span className="paper-mark" data-kind="correction">Correction</span> : null}
              {paper.roundup ? <span className="paper-mark" data-kind="roundup">Roundup</span> : null}
              {paper.beat ? <span>{beatWord(paper.beat)}</span> : null}
              <span className="num">{dayText(paper.day, today)}</span>
            </p>
            {paper.roundup ? (
              <details className="paper-fold" data-testid="wire-roundup">
                <summary>{noYear(presentNote(paper.text), today).slice(0, 80)}{presentNote(paper.text).length > 80 ? "…" : ""}</summary>
                <p className="paper-body">{noYear(presentNote(paper.text), today)}</p>
              </details>
            ) : (
              <p className="paper-body">{noYear(presentNote(paper.text), today)}</p>
            )}
            {paper.journalist ? (
              <p className="paper-byline">
                {paper.journalist}
                {paper.beat ? `, ${paper.beat}` : ""}
              </p>
            ) : null}
            {paper.answers >= 0 && asks.some((a) => a.request === paper.answers) ? (
              <button type="button" className="name-link" data-testid="answers-request" onClick={() => document.getElementById(askId(paper.answers))?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                In answer to {asks.find((a) => a.request === paper.answers)?.journalist ?? "the paper"}&apos;s request
              </button>
            ) : null}
            {paper.correction && paper.corrects >= 0 ? (
              <button type="button" className="name-link" data-testid="corrects" onClick={() => onOpen(paper.corrects)}>
                Corrects: {presentNote(corrected?.text || paper.correctsText) || "the earlier story"}
              </button>
            ) : null}
            <button type="button" className="name-link why-link" onClick={() => onOpen(paper.eventId)}>Why?</button>
            {open === paper.eventId || open === paper.corrects ? (
              <div className="sim-wire-why" data-testid="wire-why">
                <StoryWhy id={open} text={open === paper.eventId ? paper.text : corrected?.text ?? paper.correctsText} />
              </div>
            ) : null}
          </article>
        );
      }) : ready && !failed && !(onPapers && editions.length) ? <p className="quay-empty">{q || kind ? "Nothing in the papers matches that." : `Nothing in the papers on ${LABEL[filter].toLowerCase()} yet.`}</p> : null}
    </div>
  );
}
