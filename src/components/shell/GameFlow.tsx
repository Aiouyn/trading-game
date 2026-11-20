"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyText } from "./MoneyText";
import {
  actLine, clearNote, dollars, explain, leaveGame, startScenario, useSimSnap,
  type ActNote, type ExplainLine, type PauseAction,
} from "@/shell/simSession";
import { gameDate, presentNote, seedDebug } from "@/components/ui/format";
import { closeNotes, toggleNotes, useNotesOpen } from "./flowState";
import { bellRows, markBellSeen, worldKey } from "./bell";
import { useLife } from "@/apps/profile/data";
import { useShellStore } from "./ShellContext";
import "./desk.css";
import { ResultPanel, isResult } from "./ResultPanel";
import { CircleChrome, RequestsPanel } from "@/apps/messages/notices";

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
    <div className="toast-group" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className="toast" data-testid="goal-toast" title={t.meter}>{QUARTER[t.q]}</p>
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

// A card the player has closed never comes back for the same event, across reloads.
const SEEN_KEY = "quay.seenPause";
let seenPause: Set<string> | null = null;
const seenSubs = new Set<() => void>();
function seenSet(): Set<string> {
  if (seenPause) return seenPause;
  try { seenPause = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); } catch { seenPause = new Set(); }
  return seenPause;
}
function markPauseSeen(key: string) {
  const next = new Set(seenSet());
  next.add(key);
  seenPause = next;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-200))); } catch { /* this sitting only */ }
  seenSubs.forEach((f) => f());
}
function usePauseSeen(key: string): boolean {
  return useSyncExternalStore(
    (f) => { seenSubs.add(f); return () => seenSubs.delete(f); },
    () => (key ? seenSet().has(key) : false),
    () => false,
  );
}

function Interrupt({ why, text, eventId, actions, onClose }: { why: string; text?: string; eventId: number; actions?: PauseAction[]; onClose: () => void }) {
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
  // Closing the card leaves the clock as it is: the strip says it is paused and the player picks the speed.
  const carry = () => {
    clearNote();
    onClose();
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
          <Button variant={list.length === 0 ? "primary" : "secondary"} disabled={busy} data-testid="interrupt-close" onClick={carry}>Close</Button>
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
  const view = useSimSnap().view;
  const { life } = useLife();
  const rows = useMemo(() => bellRows(view, life), [view, life]);
  const world = worldKey(view);
  const [why, setWhy] = useState<{ id: number; lines: ExplainLine[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const store = useShellStore();
  const newest = rows[0]?.at ?? -1;
  useEffect(() => { if (open && world && newest >= 0) markBellSeen(world, newest); }, [open, world, newest]);
  if (!open) return null;
  const run = (line: string) => {
    // "app:portfolio" opens a window rather than sending a command.
    if (line.startsWith("app:")) { store.getState().open(line.slice(4) as Parameters<ReturnType<typeof store.getState>["open"]>[0]); closeNotes(); return; }
    if (busy) return;
    setBusy(true);
    void actLine(line).finally(() => setBusy(false));
  };
  return (
    <aside className="notes-panel" data-testid="notes-panel" role="dialog" aria-label="Notices">
      <header>
        <span className="label">What happened to you</span>
        <button type="button" className="goal-dismiss" onClick={() => closeNotes()}>Close</button>
      </header>
      {rows.length === 0 ? <p className="muted" data-testid="notes-empty">Nothing has happened to you yet. Answers, letters, invitations, fills and rent will show here.</p> : null}
      <ul>
        {rows.map((row) => (
          <li key={row.key} data-testid="notes-row">
            <p className="notes-when muted">{dayWord(row.day, view?.date.abs ?? row.day)}</p>
            <p className="notes-title">{presentNote(row.title)}</p>
            {row.body ? <p className="notes-body">{presentNote(row.body)}</p> : null}
            {row.reason ? <p className="notes-reason muted">Why: {presentNote(row.reason)}</p> : null}
            <div className="notes-acts">
              {row.actions.map((a) => (
                <button key={a.line} type="button" className="goal-dismiss" disabled={busy} onClick={() => run(a.line)}>{a.label}</button>
              ))}
              {row.eventId >= 0 ? (
                <button type="button" className="goal-dismiss" onClick={() => {
                  void explain(row.eventId).then((lines) => setWhy({ id: row.eventId, lines }));
                }}>What led to this</button>
              ) : null}
            </div>
            {why && why.id === row.eventId ? (
              <div className="notes-why">
                {why.lines.length === 0 ? <p className="muted">The book has no earlier cause.</p> : null}
                {why.lines.filter((l) => !seedDebug(l.msg)).map((l, n) => (
                  <p key={`${l.id}-${n}`} style={{ paddingLeft: l.depth * 12 }}>{l.name ? `${l.name}. ` : ""}{presentNote(l.msg)}</p>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function dayWord(day: number, today: number): string {
  if (day === today) return "Today";
  if (day === today - 1) return "Yesterday";
  return gameDate(day).replace(/, year \d+$/, "");
}

/** New notices (an answer, a letter, an offer, rent due) raise a short toast; the bell keeps them. */
function BellToasts() {
  const view = useSimSnap().view;
  const { life } = useLife();
  const rows = useMemo(() => bellRows(view, life), [view, life]);
  const world = worldKey(view);
  const known = useRef<{ world: string; keys: Set<string> } | null>(null);
  const [toasts, setToasts] = useState<{ key: string; text: string }[]>([]);
  useEffect(() => {
    if (!world) return;
    if (!known.current || known.current.world !== world) {
      known.current = { world, keys: new Set(rows.map((r) => r.key)) };
      return;
    }
    const fresh = rows.filter((r) => !known.current!.keys.has(r.key) && r.key.startsWith("n:"));
    for (const r of rows) known.current.keys.add(r.key);
    if (!fresh.length) return;
    const add = fresh.slice(0, 2).map((r) => ({ key: r.key, text: presentNote(r.title) }));
    setToasts((cur) => [...cur, ...add].slice(-3));
    const keys = new Set(add.map((a) => a.key));
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => !keys.has(t.key))), 6000);
  }, [rows, world]);
  if (!toasts.length) return null;
  return (
    <div className="toast-group" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.key} type="button" className="toast" data-testid="bell-toast" title={t.text} onClick={() => { setToasts((cur) => cur.filter((x) => x.key !== t.key)); toggleNotes(); }}>
          {t.text}
        </button>
      ))}
    </div>
  );
}

function NoteToast({ blocked }: { blocked: boolean }) {
  const note = useSimSnap().note;
  const [shown, setShown] = useState<ActNote | null>(null);
  useEffect(() => {
    // An app shows its own answer in its window; only a typed command or the shell itself speaks here.
    if (!note || blocked || note.app) return;
    setShown(note);
    if (isResult(note)) return;
    const t = window.setTimeout(() => setShown((cur) => (cur === note ? null : cur)), 5000);
    return () => window.clearTimeout(t);
  }, [note, blocked]);
  if (!shown || blocked) return null;
  const close = () => { setShown(null); clearNote(); };
  if (isResult(shown)) return <ResultPanel note={shown} onClose={close} />;
  const text = presentNote(shown.text);
  if (!text) return null;
  return (
    <div className="toast-group">
      <div className="toast note-toast" role="status" data-testid="note-toast" title={text}>
        <p className="note-toast-text">{text}</p>
        <button type="button" className="note-toast-close" aria-label="Close" onClick={close}>Close</button>
      </div>
    </div>
  );
}

/** Keeps the toast corner clear of the dock's tools. */
function useToastCorner() {
  useEffect(() => {
    const place = () => {
      const tools = document.querySelector<HTMLElement>("[data-testid=shelf-tools]");
      const right = tools ? Math.round(window.innerWidth - tools.getBoundingClientRect().left + 12) : 16;
      document.documentElement.style.setProperty("--toast-right", `${right}px`);
    };
    place();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    const tools = document.querySelector<HTMLElement>("[data-testid=shelf-tools]");
    if (tools && ro) ro.observe(tools);
    window.addEventListener("resize", place);
    const t = window.setInterval(place, 3000);
    return () => { ro?.disconnect(); window.removeEventListener("resize", place); window.clearInterval(t); };
  }, []);
}

/** Interrupts, the end of a run, the toasts, and the notices list. */
export function GameFlow() {
  const view = useSimSnap().view;
  const sc = view?.scenario;
  const pause = view?.pause;
  const ended = sc?.outcome === "win" || sc?.outcome === "loss";
  const pauseKey = pause ? `${worldKey(view)}:${pause.eventId}` : "";
  const seen = usePauseSeen(pauseKey);
  const showPause = !!pause && !seen;
  useToastCorner();
  return (
    <>
      <div className="toast-stack" data-testid="toast-stack">
        <QuarterToasts />
        <CircleChrome />
        <BellToasts />
        {showPause ? null : <NoteToast blocked={false} />}
      </div>
      <Notes />
      <RequestsPanel />
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
      ) : pause && showPause ? (
        <Interrupt key={pause.eventId} why={pause.why} text={pause.text} eventId={pause.eventId} actions={pause.actions} onClose={() => markPauseSeen(pauseKey)} />
      ) : null}
    </>
  );
}
