"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "./MoneyText";
import {
  actLine, clearNote, dollars, explain, leaveGame, setSpeed, startScenario, useSimSnap,
  type ActNote, type ExplainLine, type PauseAction,
} from "@/shell/simSession";
import { presentNote, seedDebug } from "@/components/ui/format";
import { closeNotes, useNotesOpen } from "./flowState";
import { CircleChrome, RequestInterrupt } from "@/apps/messages/notices";

const QUARTER = ["", "A quarter of the way", "Halfway", "Three quarters of the way", "The goal is met"];

function repWord(n: number): string {
  if (n >= 70) return "Admired";
  if (n >= 45) return "Known";
  if (n >= 25) return "Slight";
  return "Unknown";
}

function QuarterToasts() {
  const sc = useSimSnap().view?.scenario;
  const seen = useRef<{ key: string; q: number } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; q: number; meter?: string }[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    if (!sc || sc.meter === "no goal" || sc.goal === "no goal") return;
    const key = `${sc.id}:${sc.begun ?? 0}`;
    const q = Math.min(4, Math.floor(Math.max(0, sc.progress ?? 0) * 4));
    if (!seen.current || seen.current.key !== key) {
      seen.current = { key, q };
      return;
    }
    if (q <= seen.current.q) return;
    const from = seen.current.q;
    seen.current = { key, q };
    const added: { id: number; q: number; meter?: string }[] = [];
    for (let i = from + 1; i <= q; i++) added.push({ id: ++seq.current, q: i, meter: sc.meter });
    setToasts((cur) => [...cur, ...added].slice(-4));
    const ids = new Set(added.map((t) => t.id));
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => !ids.has(t.id))), 6000);
  }, [sc]);
  if (!toasts.length) return null;
  return (
    <div className="goal-toasts" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className="goal-toast" data-testid="goal-toast" title={t.meter}>{QUARTER[t.q]}</p>
      ))}
    </div>
  );
}

function WhyChain({ eventId }: { eventId: number }) {
  const [lines, setLines] = useState<ExplainLine[] | null>(null);
  useEffect(() => {
    let live = true;
    setLines(null);
    void explain(eventId).then((rows) => { if (live) setLines(rows); });
    return () => { live = false; };
  }, [eventId]);
  return (
    <div className="interrupt-why" data-testid="interrupt-why">
      <p className="label">Why</p>
      {lines === null ? <p className="muted">Reading the book…</p> : null}
      {lines && lines.length === 0 ? <p className="muted">The book has no earlier cause.</p> : null}
      {lines?.map((l, i) => {
        if (seedDebug(l.msg)) return null;
        const body = presentNote(l.msg);
        if (!body) return null;
        return (
          <p key={`${l.id}-${l.depth}-${i}`} style={{ paddingLeft: l.depth * 14 }}>
            {l.name ? <span className="why-name">{l.name}. </span> : null}{body}
          </p>
        );
      })}
    </div>
  );
}

function Interrupt({ why, text, eventId, actions }: { why: string; text?: string; eventId: number; actions?: PauseAction[] }) {
  const [result, setResult] = useState<ActNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const list = actions ?? [];
  const run = async (line: string) => {
    setBusy(true);
    setPending(line);
    setResult({ ok: true, text: "Sending…" });
    try {
      setResult(await actLine(line));
    } catch {
      setResult({ ok: false, text: "That did not go through." });
    }
    setBusy(false);
    setPending(null);
  };
  const carry = async () => {
    setBusy(true);
    setPending("carry");
    clearNote();
    await setSpeed("x1");
    setBusy(false);
    setPending(null);
  };
  return (
    <div className="flow-modal" role="presentation">
      <div className="flow-card" role="dialog" aria-modal="true" aria-labelledby="interrupt-title" data-testid="interrupt">
        <h2 id="interrupt-title">{why}</h2>
        {text ? <p className="flow-body">{text}</p> : null}
        <WhyChain eventId={eventId} />
        {result ? (
          <div className="flow-result">
            <p>{result.text}</p>
            {result.lines && result.lines.length > 1 ? (
              <ul>{result.lines.slice(0, 8).map((l, i) => <li key={i}>{l}</li>)}</ul>
            ) : null}
          </div>
        ) : null}
        <div className="flow-actions">
          {list.map((a, i) => (
            <Button key={a.line} variant={i === 0 ? "primary" : "secondary"} disabled={busy} onClick={() => void run(a.line)}>{busy && pending === a.line ? "Sending…" : a.label}</Button>
          ))}
          <Button variant={list.length === 0 ? "primary" : "secondary"} disabled={busy} onClick={() => void carry()}>{busy && pending === "carry" ? "Sending…" : "Carry on"}</Button>
        </div>
      </div>
    </div>
  );
}

function EndScreen({ id, name, outcome, reason, score, code, lines }: {
  id: string;
  name?: string;
  outcome: "win" | "loss";
  reason?: string;
  score?: { worth: number; worthX: number; indexX: number; firms: number; reputation: number; convictions: number };
  code?: string;
  lines?: { title: string; text: string; cause: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const ahead = (score?.worthX ?? 0) >= (score?.indexX ?? 0);
  const firms = score?.firms ?? 0;
  const convictions = score?.convictions ?? 0;
  const beats = (lines ?? []).filter((l) => l.title).slice(0, 5);
  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); }
    catch { setCopied(false); }
  };
  return (
    <div className="flow-modal" role="presentation">
      <div className="flow-card flow-end" role="dialog" aria-modal="true" aria-labelledby="end-title" data-testid="end-screen">
        <p className="label">{outcome === "win" ? "The aim was met" : "The aim was missed"}</p>
        <h2 id="end-title">{name || "The run"}</h2>
        {reason ? <p className="flow-body">{reason}</p> : null}
        {score ? (
          <ul className="end-score">
            <li>Worth <MoneyText amount={dollars(score.worth)} ctx="sentence" /></li>
            <li>you {score.worthX.toFixed(2)}×, the index {score.indexX.toFixed(2)}× · {ahead ? "ahead of the index" : "behind the index"}</li>
            <li title={String(score.reputation)}>{repWord(score.reputation)}</li>
            <li>{firms <= 0 ? "No firm under your control" : firms === 1 ? "One firm under your control" : `${firms} firms under your control`}</li>
            <li title={convictions > 1 ? String(convictions) : undefined}>{convictions <= 0 ? "No convictions" : convictions === 1 ? "One conviction" : "Convictions on the book"}</li>
          </ul>
        ) : null}
        {beats.length ? (
          <ol className="end-story">
            {beats.map((b, i) => (
              <li key={i}>
                <span className="end-title">{b.title}</span>
                {b.text ? <span className="end-text">{b.text}</span> : null}
                {b.cause ? <span className="end-cause">{b.cause}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {code ? (
          <label className="end-code-label">
            Challenge
            <input className="num" data-testid="end-code" readOnly value={code} onFocus={(e) => e.currentTarget.select()} />
          </label>
        ) : null}
        <div className="flow-actions">
          <Button variant="primary" data-testid="play-again" onClick={() => void startScenario(id, { again: true })}>Play again</Button>
          {code ? <Button variant="secondary" onClick={() => void copy()}>{copied ? "Copied" : "Copy the code"}</Button> : null}
          <Button variant="secondary" onClick={() => void leaveGame()}>Choose another</Button>
        </div>
      </div>
    </div>
  );
}

function Notes() {
  const open = useNotesOpen();
  const feed = useSimSnap().view?.feed ?? [];
  const [why, setWhy] = useState<{ id: number; lines: ExplainLine[] } | null>(null);
  if (!open) return null;
  const rows = [...feed].reverse();
  return (
    <aside className="notes-panel" data-testid="notes-panel" role="dialog" aria-label="Notices">
      <header>
        <span className="label">Notices</span>
        <button type="button" className="goal-dismiss" onClick={() => closeNotes()}>Close</button>
      </header>
      {rows.length === 0 ? <p className="muted">Nothing has reached you yet.</p> : null}
      <ul>
        {rows.map((line, i) => (
          <li key={`${line.eventId}-${i}`}>
            <p>{line.text}</p>
            <button type="button" className="goal-dismiss" onClick={() => {
              void explain(line.eventId).then((lines) => setWhy({ id: line.eventId, lines }));
            }}>Why</button>
            {why && why.id === line.eventId ? (
              <div className="notes-why">
                {why.lines.length === 0 ? <p className="muted">The book has no earlier cause.</p> : null}
                {why.lines.map((l, n) => (
                  <p key={`${l.id}-${n}`} style={{ paddingLeft: l.depth * 12 }}>{l.name ? `${l.name}. ` : ""}{l.msg}</p>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function NoteToast() {
  const note = useSimSnap().note;
  const paused = !!useSimSnap().view?.pause;
  const [shown, setShown] = useState<ActNote | null>(null);
  useEffect(() => {
    if (!note || paused) return;
    setShown(note);
    const stay = note.text.includes("\n") || (note.lines?.length ?? 0) > 1;
    if (stay) return;
    const t = window.setTimeout(() => setShown((cur) => (cur === note ? null : cur)), 5000);
    return () => window.clearTimeout(t);
  }, [note, paused]);
  if (!shown || paused) return null;
  const stay = shown.text.includes("\n") || (shown.lines?.length ?? 0) > 1;
  return (
    <div className="goal-toast note-toast" role="status">
      <p className="note-toast-text">{presentNote(shown.text)}</p>
      {stay ? <button type="button" className="goal-dismiss" onClick={() => setShown(null)}>Dismiss</button> : null}
    </div>
  );
}

/** Interrupts, the end of a run, quarter toasts, and the notices list. */
export function GameFlow() {
  const view = useSimSnap().view;
  const sc = view?.scenario;
  const pause = view?.pause;
  const ended = sc?.outcome === "win" || sc?.outcome === "loss";
  return (
    <>
      <QuarterToasts />
      <CircleChrome />
      <Notes />
      <NoteToast />
      {ended && sc ? (
        <EndScreen
          id={sc.id}
          name={sc.name}
          outcome={sc.outcome as "win" | "loss"}
          reason={sc.reason}
          score={sc.score}
          code={sc.code}
          lines={sc.lines}
        />
      ) : pause ? (
        <Interrupt key={pause.eventId} why={pause.why} text={pause.text} eventId={pause.eventId} actions={pause.actions} />
      ) : (
        <RequestInterrupt />
      )}
    </>
  );
}
