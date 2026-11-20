"use client";
// New letters: a toast and a dock count. Invitations and loans wait in their own panel, opened from the strip.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useShellStore } from "@/components/shell/ShellContext";
import { useLife } from "@/apps/profile/data";
import { Button } from "@/components/ui/Button";
import {
  askButtons, askTitle, commandFor, deadlineWord, familyTrouble, isClose, isRivalMove, moneyLabel, readCircle, slotOf, waitingOn,
  type CircleAsk, type CircleSnap,
} from "./circle";
import { clipWords, kindWord, parsePlans, type DiaryPlan } from "@/apps/diary/read";
import { parseHosted, type HostedRow } from "@/apps/society/read";
import { gameDate } from "@/components/ui/format";
import { LaunchBadge } from "@/apps/launchpad/notes";
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
  for (const thread of snap.threads) for (const m of thread.messages) if (!m.mine && !read.has(m.id)) n++;
  return n;
}

export function ingestCircle(life: unknown) {
  const snap = readCircle(life);
  if (!snap) return;
  if (lastAbs >= 0 && snap.abs < lastAbs) resetMail();
  lastAbs = snap.abs;
  const ids: number[] = [];
  for (const thread of snap.threads) for (const m of thread.messages) if (!m.mine) ids.push(m.id);
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
      if (m.mine) continue;
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
  if (app === "launchpad") return <LaunchBadge />;
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
    <div className="toast-group" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className="toast"
          data-testid="circle-toast"
          title={t.text}
          onClick={() => store.getState().open("messages", t.who >= 0 ? `who:${t.who}` : undefined)}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

function lineOf(snap: CircleSnap, ask: CircleAsk): string {
  const letter = snap.threads.flatMap((t) => t.messages).find((m) => m.id === ask.msg);
  const line = (letter?.text || ask.note || `${ask.name} is waiting on an answer`).replace(/\s+/g, " ");
  return clipWords(line, 160);
}

/** The whole letter an ask came with, so the offer can be read before it is accepted. */
function fullLine(snap: CircleSnap, ask: CircleAsk): string {
  const letter = snap.threads.flatMap((t) => t.messages).find((m) => m.id === ask.msg);
  return (letter?.text || ask.note || `${ask.name} is waiting on an answer`).replace(/\s+/g, " ");
}

/** Invitations and loan requests with the day they lapse, as a bar (the phone's top bar). */
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
    setBusy(`${ask.id}:${yes ? "yes" : "no"}`);
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

// The requests panel is opened from the strip; a tiny store keeps the button and the panel apart.
let reqOpen = false;
const reqSubs = new Set<() => void>();
export function toggleRequests(v?: boolean): void {
  const next = v ?? !reqOpen;
  if (next === reqOpen) return;
  reqOpen = next;
  reqSubs.forEach((f) => f());
}
function useRequestsOpen(): boolean {
  return useSyncExternalStore((f) => { reqSubs.add(f); return () => reqSubs.delete(f); }, () => reqOpen, () => false);
}

/** Who else will be there, from the plan behind an invitation. */
function guests(plan: DiaryPlan | undefined, ask: CircleAsk): string[] {
  const names = (plan?.who ?? []).filter((w) => !w.self && w.name).map((w) => w.name);
  if (ask.name && !names.includes(ask.name)) names.unshift(ask.name);
  if (ask.otherName && !names.includes(ask.otherName)) names.push(ask.otherName);
  return names;
}

function whatItIs(ask: CircleAsk, plan: DiaryPlan | undefined): string {
  if (ask.kind === "loan") return `${ask.name || "Someone"} asks to borrow ${moneyLabel(ask.cents)}`;
  const kind = plan ? kindWord(plan.kind) : askTitle(ask).replace(/^A /, "");
  const where = plan?.place || ask.place;
  const host = ask.name ? `${ask.name} invites you` : "An invitation";
  return `${host}: ${kind.toLowerCase()}${where && !/^(dinner|gala|club)$/i.test(where) ? ` at ${where}` : ""}`;
}

function costLine(ask: CircleAsk, plan: DiaryPlan | undefined): string {
  if (ask.kind === "loan") return `You lend ${moneyLabel(ask.cents)}`;
  if (plan?.cost) return plan.cost;
  return ask.cents > 0 ? `Your share is ${moneyLabel(ask.cents)}` : "It costs you nothing";
}

function bookedEvenings(life: unknown): HostedRow[] {
  return parseHosted((life as { hosted?: unknown } | null)?.hosted).filter((h) => h.status === "booked");
}

/** The count of waiting requests on the strip; it opens the requests panel. A booked evening keeps the button up. */
export function RequestsButton() {
  const { life } = useLife();
  const snap = readCircle(life);
  const n = snap ? waitingOn(snap).length : 0;
  const evenings = bookedEvenings(life).length;
  if (!n && !evenings) return null;
  const label = n && evenings
    ? `${n === 1 ? "1 request" : `${n} requests`} · ${evenings === 1 ? "1 evening" : `${evenings} evenings`}`
    : n
      ? (n === 1 ? "1 request" : `${n} requests`)
      : (evenings === 1 ? "1 evening booked" : `${evenings} evenings booked`);
  return (
    <button type="button" className="strip-requests" data-testid="requests-btn" onClick={() => toggleRequests()}>
      {label}
    </button>
  );
}

/** Invitations and loans, each saying what it is, who is there, what it costs and when it lapses. Opened by the player. */
export function RequestsPanel() {
  const open = useRequestsOpen();
  const { life, run } = useLife();
  const store = useShellStore();
  const [busy, setBusy] = useState<string | null>(null);
  const snap = readCircle(life);
  const plans = parsePlans((life as { plans?: unknown } | null)?.plans);
  const asks = snap ? waitingOn(snap) : [];
  const evenings = bookedEvenings(life);
  useEffect(() => { if (open && !asks.length && !evenings.length) toggleRequests(false); }, [open, asks.length, evenings.length]);
  if (!open || (!snap && !evenings.length)) return null;
  const go = (ask: CircleAsk, yes: boolean) => {
    if (busy || !snap) return;
    setBusy(`${ask.id}:${yes ? "yes" : "no"}`);
    const buttons = askButtons(ask);
    const button = buttons.find((b) => (yes ? b.kind !== "decline" : b.kind === "decline")) ?? buttons[buttons.length - 1];
    const slot = slotOf(snap.contacts, ask.from);
    void run(commandFor(ask, button, slot, ask.cents)).finally(() => setBusy(null));
  };
  return (
    <aside className="requests-panel" data-testid="requests-panel" role="dialog" aria-label="Requests">
      <header>
        <span className="label">{asks.length ? "Waiting on your answer" : "Evenings you booked"}</span>
        <button type="button" className="goal-dismiss" onClick={() => toggleRequests(false)}>Close</button>
      </header>
      {evenings.length ? (
        <ul data-testid="hosted-bookings">
          {evenings.map((h) => (
            <li key={h.id} data-testid="hosted-booking">
              <p className="label">Your {h.kind === "gala" ? "gala" : "dinner"}</p>
              <h3>{h.place}{h.time ? ` · ${h.time}` : ""}</h3>
              <dl>
                <dt>When</dt><dd>{gameDate(h.day).replace(/, year \d+$/, "")}</dd>
                {h.guests.length ? <><dt>Guests</dt><dd>{h.guests.map((g) => g.name).filter(Boolean).join(", ")}</dd></> : null}
                <dt>Price</dt><dd>{h.cents > 0 ? moneyLabel(h.cents) : "Nothing more to pay"}</dd>
                <dt>You</dt><dd>You booked it. You are in.</dd>
              </dl>
              <div className="requests-acts">
                <Button variant="primary" size="sm" disabled={!!busy} data-testid="hosted-attend" onClick={() => {
                  if (busy) return;
                  setBusy(`hosted:${h.id}`);
                  void run({ kind: "out", op: "attend" }).finally(() => setBusy(null));
                }}>Open the evening</Button>
                <button type="button" className="goal-dismiss" onClick={() => { toggleRequests(false); store.getState().open("society", `day:${h.day}`); }}>Open the day</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {snap ? <ul>
        {asks.map((ask) => {
          const plan = plans.find((p) => (ask.id >= 0 && p.ask === ask.id) || (ask.msg >= 0 && p.msg === ask.msg));
          const people = guests(plan, ask);
          const loan = ask.kind === "loan";
          return (
            <li key={ask.id} data-testid="request-card">
              <p className="label">{loan ? "A loan" : plan ? kindWord(plan.kind) : askTitle(ask)} · {deadlineWord(snap.abs, ask.due)}</p>
              <h3>{whatItIs(ask, plan)}</h3>
              <dl>
                {plan && plan.day >= 0 ? <><dt>When</dt><dd>{gameDate(plan.day).replace(/, year \d+$/, "")}</dd></> : null}
                {people.length ? <><dt>{loan ? "Who" : "Who is there"}</dt><dd>{people.join(", ")}</dd></> : null}
                <dt>Cost</dt><dd>{costLine(ask, plan)}</dd>
              </dl>
              <p className="requests-letter">{clipWords(fullLine(snap, ask), 420)}</p>
              <div className="requests-acts">
                <Button variant="primary" size="sm" disabled={!!busy} data-testid={loan ? "request-lend" : "request-accept"} onClick={() => go(ask, true)}>
                  {loan ? `Lend ${moneyLabel(ask.cents)}` : "Accept"}
                </Button>
                <Button variant="secondary" size="sm" disabled={!!busy} data-testid="request-decline" onClick={() => go(ask, false)}>Decline</Button>
                <button type="button" className="goal-dismiss" onClick={() => { toggleRequests(false); store.getState().open("messages", `who:${ask.from}`); }}>Open the letter</button>
              </div>
            </li>
          );
        })}
      </ul> : null}
    </aside>
  );
}
