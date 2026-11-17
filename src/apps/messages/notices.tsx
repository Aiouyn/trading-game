"use client";
// New letters: a toast and a dock count. A family loan is the only ask that interrupts the top bar.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import { useLife } from "@/apps/profile/data";
import { Button } from "@/components/ui/Button";
import {
  askButtons, askTitle, commandFor, deadlineWord, familyTrouble, isClose, isRivalMove, moneyLabel, pausesClock, readCircle, slotOf, waitingOn,
  type CircleAsk, type CircleSnap,
} from "./circle";
import { setSpeed, useSimSnap } from "@/shell/simSession";
import { clipWords } from "@/apps/diary/read";
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
    line: clipWords(line, 180),
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
    const text = `${title}. ${clipWords(line, 140)}`;
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

const released = new Set<number>();
let wePaused = 0;
let sawAbs = -1;

function noteDay(abs: number) {
  if (sawAbs >= 0 && abs + 1 < sawAbs) {
    released.clear();
    wePaused = 0;
  }
  sawAbs = abs;
}

function lineOf(snap: CircleSnap, ask: CircleAsk): string {
  const letter = snap.threads.flatMap((t) => t.messages).find((m) => m.id === ask.msg);
  const line = (letter?.text || ask.note || `${ask.name} is waiting on an answer`).replace(/\s+/g, " ");
  return clipWords(line, 160);
}

/** Invitations and loan requests, with the day they lapse, on the top bar. */
export function WaitingRequests() {
  const { life, run } = useLife();
  const store = useShellStore();
  const [busy, setBusy] = useState<string | null>(null);
  const snap = readCircle(life);
  if (!snap) return null;
  const asks = waitingOn(snap);
  if (!asks.length) return null;
  const go = (ask: CircleAsk, yes: boolean) => {
    if (busy) return;
    const key = `${ask.id}:${yes ? "yes" : "no"}`;
    setBusy(key);
    const buttons = askButtons(ask);
    const button = buttons.find((b) => (yes ? b.kind !== "decline" : b.kind === "decline")) ?? buttons[buttons.length - 1];
    const slot = slotOf(snap.contacts, ask.from);
    void run(commandFor(ask, button, slot, ask.cents)).finally(() => setBusy(null));
  };
  return (
    <div className="waiting" data-testid="waiting-requests">
      {asks.map((ask) => {
        const loan = ask.kind === "loan";
        return (
          <div className="goal-interrupt" key={ask.id} data-testid={loan && ask.role === "family" ? "family-interrupt" : "waiting-request"}>
            <button type="button" className="goal-interrupt-text" onClick={() => store.getState().open("messages", `who:${ask.from}`)}>
              <span className="label">{askTitle(ask)} · {deadlineWord(snap.abs, ask.due)}</span>
              <span>{ask.name ? `${ask.name}. ` : ""}{lineOf(snap, ask)}</span>
            </button>
            <span className="goal-interrupt-acts">
              <Button variant="secondary" disabled={!!busy} data-testid={loan ? "interrupt-lend" : "interrupt-accept"} onClick={() => go(ask, true)}>
                {loan ? `Lend ${moneyLabel(ask.cents)}` : "Accept"}
              </Button>
              <Button variant="secondary" disabled={!!busy} data-testid="interrupt-decline" onClick={() => go(ask, false)}>Decline</Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** FamilyInterrupt was the family-loan bar. The bar now lists every invitation and loan. */
export const FamilyInterrupt = WaitingRequests;

/**
 * A family or close-friend request pauses the clock the way a margin call does.
 * Carry on resumes. Answering the request does too.
 */
export function RequestInterrupt() {
  const { life, run } = useLife();
  const mode = useSimSnap().mode;
  const view = useSimSnap().view;
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const snap = readCircle(life);
  const asks = snap ? waitingOn(snap) : [];
  if (snap) noteDay(snap.abs);
  const hot = snap ? asks.find((a) => pausesClock(a, snap) && !released.has(a.id)) ?? null : null;
  const hotId = hot?.id ?? 0;
  const openIds = asks.map((a) => a.id).join(",");
  useEffect(() => {
    if (mode !== "play" || !hotId || view?.pause) return;
    if (view?.speed === "pause") return;
    wePaused = hotId;
    void setSpeed("pause");
  }, [hotId, mode, view?.pause, view?.speed]);
  useEffect(() => {
    if (!wePaused || openIds.split(",").includes(String(wePaused))) return;
    const id = wePaused;
    wePaused = 0;
    released.add(id);
    if (view?.speed === "pause" && !view.pause) void setSpeed("day");
  }, [openIds, view?.pause, view?.speed]);
  if (mode !== "play" || view?.pause || !snap || !hot) return null;
  const answer = (yes: boolean) => {
    if (busy) return;
    setBusy(true);
    const buttons = askButtons(hot);
    const button = buttons.find((b) => (yes ? b.kind !== "decline" : b.kind === "decline")) ?? buttons[buttons.length - 1];
    const slot = slotOf(snap.contacts, hot.from);
    void run(commandFor(hot, button, slot, hot.cents)).finally(() => setBusy(false));
  };
  const carry = () => {
    released.add(hot.id);
    if (wePaused === hot.id) wePaused = 0;
    setTick((n) => n + 1);
    void setSpeed("day");
  };
  return (
    <div className="flow-modal" role="presentation">
      <div className="flow-card" role="dialog" aria-modal="true" aria-labelledby="request-title" data-testid="request-interrupt" data-rev={tick}>
        <p className="label">{askTitle(hot)} · {deadlineWord(snap.abs, hot.due)}</p>
        <h2 id="request-title">{hot.name || "Someone"} is waiting</h2>
        <p className="flow-body">{lineOf(snap, hot)}</p>
        <div className="flow-actions">
          <Button variant="primary" disabled={busy} onClick={() => answer(true)}>{hot.kind === "loan" ? `Lend ${moneyLabel(hot.cents)}` : "Accept"}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => answer(false)}>Decline</Button>
          <Button variant="secondary" disabled={busy} onClick={carry}>Carry on</Button>
        </div>
      </div>
    </div>
  );
}
