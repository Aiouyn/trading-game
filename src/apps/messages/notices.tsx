"use client";
// New letters: a toast and a dock count. A family loan is the only ask that interrupts the top bar.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import { useLife } from "@/apps/profile/data";
import { Button } from "@/components/ui/Button";
import {
  familyTrouble, isClose, isRivalMove, moneyLabel, readCircle, slotOf,
  type CircleAsk, type CircleSnap,
} from "./circle";
import "./messages.css";

interface Toast { id: number; who: number; text: string }
interface Trouble {
  msg: number;
  from: number;
  name: string;
  line: string;
  cents: number;
  slot: number;
  eventId: number;
}
interface MailState {
  unread: number;
  toasts: Toast[];
  trouble: Trouble | null;
  read: Set<number>;
}

let state: MailState = { unread: 0, toasts: [], trouble: null, read: new Set() };
const ears = new Set<() => void>();
let known = new Set<number>();
let primed = false;
let lastAbs = -1;
let toastSeq = 0;
const timers = new Set<number>();

function publish(patch: Partial<MailState>) {
  state = { ...state, ...patch };
  for (const fn of ears) fn();
}
function subscribe(fn: () => void) {
  ears.add(fn);
  return () => ears.delete(fn);
}
function resetMail() {
  for (const t of timers) window.clearTimeout(t);
  timers.clear();
  known = new Set();
  primed = false;
  state = { unread: 0, toasts: [], trouble: null, read: new Set() };
}

function troubleOf(snap: CircleSnap, ask: CircleAsk | null): Trouble | null {
  if (!ask) return null;
  const letter = snap.threads.flatMap((t) => t.messages).find((m) => m.id === ask.msg);
  const line = (letter?.text || ask.note || `${ask.name} asked for help`).replace(/\s+/g, " ");
  return {
    msg: ask.msg,
    from: ask.from,
    name: ask.name,
    line: line.length > 180 ? `${line.slice(0, 177)}…` : line,
    cents: ask.cents,
    slot: slotOf(snap.contacts, ask.from),
    eventId: ask.eventId,
  };
}

function countUnread(snap: CircleSnap, read: Set<number>): number {
  let n = 0;
  for (const thread of snap.threads) for (const m of thread.messages) if (!read.has(m.id)) n++;
  return n;
}

export function ingestCircle(life: unknown) {
  const snap = readCircle(life);
  if (!snap) return;
  if (lastAbs >= 0 && snap.abs < lastAbs) resetMail();
  lastAbs = snap.abs;
  const ids: number[] = [];
  for (const thread of snap.threads) for (const m of thread.messages) ids.push(m.id);
  const trouble = troubleOf(snap, familyTrouble(snap));
  if (!primed) {
    primed = true;
    known = new Set(ids);
    publish({ unread: countUnread(snap, state.read), trouble });
    return;
  }
  const fresh: { who: number; name: string; role: string; text: string }[] = [];
  for (const thread of snap.threads) {
    const person = snap.contacts.find((c) => c.who === thread.who);
    const word = person?.bond.word || person?.word || "";
    for (const m of thread.messages) {
      if (known.has(m.id)) continue;
      known.add(m.id);
      if (isClose(thread.role, word) || isRivalMove(thread.role, m.text)) {
        fresh.push({ who: thread.who, name: thread.name || person?.name || "Someone", role: thread.role, text: m.text });
      }
    }
  }
  let toasts = state.toasts;
  for (const item of fresh) {
    const id = ++toastSeq;
    const title = item.role === "rival" ? `${item.name} made a move` : `${item.name} wrote`;
    const line = item.text.replace(/\s+/g, " ");
    const text = `${title}. ${line.length > 140 ? `${line.slice(0, 137)}…` : line}`;
    toasts = [...toasts, { id, who: item.who, text }].slice(-3);
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      publish({ toasts: state.toasts.filter((t) => t.id !== id) });
    }, 6000);
    timers.add(timer);
  }
  publish({ toasts, unread: countUnread(snap, state.read), trouble });
}

export function markRead(ids: number[]) {
  if (!ids.length) return;
  const read = new Set(state.read);
  let added = false;
  for (const id of ids) if (!read.has(id)) { read.add(id); added = true; }
  if (!added) return;
  let unread = 0;
  for (const id of known) if (!read.has(id)) unread++;
  publish({ read, unread });
}

const EMPTY_READ = new Set<number>();

export function useUnread(): number {
  return useSyncExternalStore(subscribe, () => state.unread, () => 0);
}

export function useRead(): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, () => state.read, () => EMPTY_READ);
}

function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => state.toasts, () => []);
}
function useTrouble(): Trouble | null {
  return useSyncExternalStore(subscribe, () => state.trouble, () => null);
}

export function DockBadge({ app }: { app: string }) {
  const n = useUnread();
  if (app !== "messages" || n < 1) return null;
  return <span className="dock-badge" data-testid="messages-badge">{n > 9 ? "9+" : n}</span>;
}

export function CircleChrome() {
  const { life } = useLife();
  const toasts = useToasts();
  const store = useShellStore();
  useEffect(() => { ingestCircle(life); }, [life]);
  if (!toasts.length) return null;
  return (
    <div className="goal-toasts circle-toasts" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className="goal-toast"
          data-testid="circle-toast"
          onClick={() => store.getState().open("messages", t.who >= 0 ? `who:${t.who}` : undefined)}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

/** Family in trouble, on the top bar. Other requests stay in the thread. */
export function FamilyInterrupt() {
  const trouble = useTrouble();
  const { run } = useLife();
  const store = useShellStore();
  const [busy, setBusy] = useState(false);
  if (!trouble) return null;
  const go = (text: "yes" | "no") => {
    if (busy) return;
    setBusy(true);
    void run({ kind: "reply", msg: trouble.msg, text }).finally(() => setBusy(false));
  };
  return (
    <div className="goal-interrupt" data-testid="family-interrupt">
      <button type="button" className="goal-interrupt-text" onClick={() => store.getState().open("messages", `who:${trouble.from}`)}>
        <span className="label">Family</span>
        <span>{trouble.name} is in trouble. {trouble.line}</span>
      </button>
      <span className="goal-interrupt-acts">
        <Button variant="primary" disabled={busy} data-testid="interrupt-lend" onClick={() => go("yes")}>Lend {moneyLabel(trouble.cents)}</Button>
        <Button variant="secondary" disabled={busy} data-testid="interrupt-decline" onClick={() => go("no")}>Decline</Button>
      </span>
    </div>
  );
}
