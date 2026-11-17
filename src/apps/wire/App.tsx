"use client";
// The city's papers: outlet, voice, byline and beat. Rumours are marked. A correction names the story it corrects.
import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import { gameDate, presentNote, seedDebug } from "@/components/ui/format";
import { Button } from "@/components/ui/Button";
import { CauseLines, useAct } from "@/apps/profile/data";
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
}
interface Stance { id: string; label: string }
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

const FILTERS = ["papers", "you", "contacts", "holdings", "city", "markets"] as const;
type Filter = (typeof FILTERS)[number];
const LABEL: Record<Filter, string> = {
  papers: "Papers",
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
    <form className="paper-ask" data-testid="press-ask" onSubmit={(e) => { e.preventDefault(); if (words) onSend(stance, text.trim()); }}>
      <p className="paper-kicker">{ask.outlet}{ask.voice ? ` · ${ask.voice}` : ""}</p>
      <p>{ask.journalist} asks for comment on {presentNote(ask.about)}</p>
      <div className="sim-wire-filters" role="group" aria-label="Your stance">
        {stances.map((s) => (
          <button key={s.id} type="button" data-testid={`press-stance-${s.id}`} data-on={stance === s.id ? "1" : "0"} onClick={() => setStance(s.id)}>{s.label}</button>
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

/** What the player said to the paper: the words, or the stance when there were no words. */
function saidLine(ask: Ask, local: Answer | undefined): string {
  const stance = local?.stance ?? ask.stance;
  const words = local?.text ?? ask.said;
  if (!stance) return "";
  if (stance === "nocomment") return `You gave ${ask.outlet} no comment.`;
  if (stance === "declined") return `You did not answer ${ask.outlet} in time.`;
  return `You told ${ask.outlet}: ${words}`;
}

export default function WireApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const tick = useSimSnap().view?.date.abs;
  const { note, busy, go } = useAct();
  const [filter, setFilter] = useState<Filter>("papers");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [saidLocal, setSaidLocal] = useState<Record<number, Answer>>({});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [why, setWhy] = useState<ExplainLine[]>([]);
  const req = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    void fetch("/api/sim/panel?name=wire", { cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? r.json() as Promise<{ papers?: Paper[]; asks?: Ask[] }> : null))
      .then((j) => {
        if (j?.papers) { setPapers(j.papers); setAsks(j.asks ?? []); setFailed(false); }
        else setFailed(true);
        setReady(true);
      })
      .catch(() => { if (!ac.signal.aborted) { setFailed(true); setReady(true); } });
    return () => ac.abort();
  }, [tick, attempt]);

  const shown = useMemo(
    () => papers.filter((p) => filter === "papers" || p.tags.includes(filter)),
    [papers, filter],
  );
  const byId = useMemo(() => new Map(papers.map((p) => [p.eventId, p])), [papers]);

  const onOpen = (id: number) => {
    const n = ++req.current;
    setOpen(id);
    setWhy([]);
    void explain(id).then((lines) => { if (req.current === n) setWhy(lines.filter((l) => !seedDebug(l.msg))); });
  };
  const send = async (ask: Ask, stance: string, text: string) => {
    const result = await go({ kind: "press", request: ask.request, stance, text });
    if (result.ok) setSaidLocal((cur) => ({ ...cur, [ask.eventId]: { stance, text } }));
  };

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
      {note ? <p className="paper-note" data-ok={note.ok ? "1" : "0"}>{presentNote(note.text)}</p> : null}
      {asks.filter((a) => a.open && !saidLocal[a.eventId]).map((ask) => (
        <CommentBox key={ask.eventId} ask={ask} busy={busy} onSend={(stance, text) => { void send(ask, stance, text); }} />
      ))}
      {asks.filter((a) => !a.open || saidLocal[a.eventId]).map((ask) => {
        const line = saidLine(ask, saidLocal[ask.eventId]);
        return line ? <p className="paper-said" key={`said-${ask.eventId}`} data-testid="press-said">{line}</p> : null;
      })}
      {!ready ? <p className="quay-state" role="status">Reading the papers…</p> : null}
      {ready && failed && !shown.length ? (
        <p className="quay-state" data-kind="error" role="alert">
          The wire did not answer. <button type="button" className="name-link" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </p>
      ) : null}
      {shown.length ? shown.map((paper) => {
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
              <span className="num">{gameDate(paper.day)}</span>
            </p>
            {paper.roundup ? (
              <details className="paper-fold" data-testid="wire-roundup">
                <summary>{presentNote(paper.text).slice(0, 80)}{presentNote(paper.text).length > 80 ? "…" : ""}</summary>
                <p className="paper-body">{presentNote(paper.text)}</p>
              </details>
            ) : (
              <p className="paper-body">{presentNote(paper.text)}</p>
            )}
            {paper.journalist ? (
              <p className="paper-byline">
                {paper.journalist}
                {paper.beat ? `, ${paper.beat}` : ""}
              </p>
            ) : null}
            {paper.correction && paper.corrects >= 0 ? (
              <button type="button" className="name-link" data-testid="corrects" onClick={() => onOpen(paper.corrects)}>
                Corrects: {presentNote(corrected?.text || paper.correctsText) || "the earlier story"}
              </button>
            ) : null}
            <button type="button" className="name-link" onClick={() => onOpen(paper.eventId)}>Why?</button>
            {open === paper.eventId || open === paper.corrects ? (
              <div className="sim-wire-why" data-testid="wire-why">
                {why.length ? <CauseLines lines={why} /> : <p className="quay-state">Reading the cause…</p>}
              </div>
            ) : null}
          </article>
        );
      }) : ready && !failed ? <p className="quay-empty">Nothing in the papers on {LABEL[filter].toLowerCase()} yet.</p> : null}
    </div>
  );
}
