"use client";
// A phone messenger: one thread a person, the event under the letter, the ask as buttons.
import { useEffect, useState } from "react";
import type { AppBodyProps } from "@/shell/appModules";
import { explain, useSimSnap, type ExplainLine } from "@/shell/simSession";
import { Button } from "@/components/ui/Button";
import { gameDate, presentNote } from "@/components/ui/format";
import { Named } from "@/components/ui/Named";
import { Closed, Result, useAct, useLife, when } from "@/apps/profile/data";
import "@/apps/profile/life.css";
import {
  askButtons, askForMessage, commandFor, contactOf, initial, moneyLabel, readCircle, roleWord, slotOf,
  type CircleAsk, type CircleContact, type CircleMsg, type CircleThread, type LocalReply,
} from "./circle";
import { markRead, useRead } from "./notices";
import { InviteActions } from "@/apps/diary/Invite";
import { kindWord, parsePlans, planForMessage, type DiaryPlan } from "@/apps/diary/read";
import "./messages.css";

function whoFrom(context?: string): number | null {
  if (!context?.startsWith("who:")) return null;
  const n = Number(context.slice(4));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function EventCard({ eventId, source }: { eventId: number; source: number }) {
  const id = source >= 0 ? source : eventId;
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ExplainLine[] | null>(null);
  useEffect(() => {
    if (id < 0) return;
    let live = true;
    void explain(id).then((rows) => { if (live) setLines(rows); });
    return () => { live = false; };
  }, [id]);
  if (id < 0) return null;
  const cause = lines?.find((l) => l.depth > 0 && !l.missing) ?? lines?.[0];
  return (
    <div>
      <button type="button" className="msg-event" data-testid="event-card" onClick={() => setOpen((v) => !v)}>
        <span className="label">The event</span>
        <span>{cause ? presentNote(cause.msg) : "Reading the book…"}</span>
      </button>
      {open ? (
        <div className="msg-chain" data-testid="event-chain">
          {lines && lines.length === 0 ? <p>The book has no earlier cause.</p> : null}
          {lines?.map((l, i) => (
            <p key={`${l.id}-${l.depth}-${i}`} style={{ paddingLeft: l.depth * 12 }}>
              {l.name ? `${l.name}. ` : ""}{presentNote(l.msg)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AskBox({ ask, slot, busy, onGo }: {
  ask: CircleAsk;
  slot: number;
  busy: boolean;
  onGo: (cmd: Record<string, unknown>, said: string) => void;
}) {
  const buttons = askButtons(ask);
  const lend = buttons.find((b) => b.kind === "lend");
  const [amount, setAmount] = useState(lend ? (lend.cents / 100).toFixed(2) : "");
  const cents = Math.round(Number(amount) * 100);
  const amountOk = !lend || (Number.isFinite(cents) && cents >= 1);
  return (
    <div className="msg-ask" data-testid="request">
      {lend ? (
        <label>
          Amount
          <input
            className="num"
            inputMode="decimal"
            value={amount}
            data-testid="lend-amount"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      ) : null}
      <div className="msg-ask-row">
        {buttons.map((b, i) => (
          <Button
            key={b.id}
            variant={i === 0 ? "primary" : "secondary"}
            disabled={busy || (b.kind === "lend" && !amountOk)}
            data-testid={b.testId}
            onClick={() => onGo(commandFor(ask, b, slot, cents), b.kind === "lend" ? `Lent ${moneyLabel(cents)}` : b.label)}
          >
            {busy ? "Sending…" : b.kind === "lend" ? `Lend ${amountOk ? moneyLabel(cents) : ""}`.trim() : b.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function InviteCard({ plan, busy, onGo }: { plan: DiaryPlan; busy: boolean; onGo: (cmd: Record<string, unknown>) => void }) {
  return (
    <div className="dia-card" data-testid="invite-card">
      <p className="label">{kindWord(plan.kind)} · {gameDate(plan.day)}</p>
      {plan.place ? <p>{plan.place}</p> : null}
      {plan.reason ? <p className="dia-reason">{plan.reason}</p> : null}
      {plan.past ? (
        <div data-testid="aftermath">
          {plan.answer ? <p data-testid="invite-answer">{plan.answer}</p> : null}
          {plan.came ? <p>{plan.came}</p> : null}
          {plan.said ? <p className="dia-said">{presentNote(plan.said)}</p> : null}
          {plan.fallout ? <p>{presentNote(plan.fallout)}</p> : null}
          {plan.skipped ? <p>Skipped.</p> : null}
        </div>
      ) : (
        <InviteActions plan={plan} busy={busy} onGo={onGo} />
      )}
    </div>
  );
}

export default function MessagesApp({ context }: AppBodyProps) {
  const { life } = useLife();
  const plans = parsePlans(useSimSnap().view?.plans);
  const { note, busy, go } = useAct();
  const snap = readCircle(life);
  const [who, setWho] = useState<number | null>(whoFrom(context));
  const [draft, setDraft] = useState("");
  const [mine, setMine] = useState<LocalReply[]>([]);
  useEffect(() => {
    const n = whoFrom(context);
    if (n !== null) setWho(n);
  }, [context]);
  const threads = snap?.threads ?? [];
  const open = threads.find((t) => t.who === who) ?? null;
  const openIds = open ? open.messages.map((m) => m.id).join(",") : "";
  const read = useRead();
  useEffect(() => {
    if (!openIds) return;
    markRead(openIds.split(",").map(Number));
  }, [openIds]);
  if (!life || !snap) return <Closed title="Messages" />;

  const send = async (thread: CircleThread, text: string) => {
    const last = thread.messages[thread.messages.length - 1];
    if (!last || !text.trim()) return;
    const said = text.trim();
    const key = `${thread.who}:${last.id}:${mine.length}:${said}`;
    const reply: LocalReply = { key, who: thread.who, afterId: last.id, text: said, day: snap.abs };
    setMine((cur) => [...cur, reply]);
    setDraft("");
    const result = await go({ kind: "reply", msg: last.id, text: said });
    if (!result.ok) setMine((cur) => cur.filter((r) => r.key !== key));
  };
  const actOn = async (thread: CircleThread, afterId: number, cmd: Record<string, unknown>, said: string) => {
    if (cmd.kind === "accept" || cmd.kind === "decline") {
      await go(cmd);
      return;
    }
    const key = `${thread.who}:${afterId}:${said}:${mine.length}`;
    setMine((cur) => [...cur, { key, who: thread.who, afterId, text: said, day: snap.abs }]);
    const result = await go(cmd);
    if (!result.ok) setMine((cur) => cur.filter((r) => r.key !== key));
  };

  return (
    <div className="msg" data-testid="messages" data-pane={open ? "thread" : "list"}>
      <div className="msg-split">
        <section className="msg-list" aria-label="Threads">
          <header className="msg-head">
            <div>
              <h2>Messages</h2>
              <p>{threads.length ? `${threads.length} people` : "No letters yet"}</p>
            </div>
          </header>
          <div className="msg-scroll">
            {threads.length ? threads.map((t) => {
              const last = t.messages[t.messages.length - 1];
              const shownUnread = t.who === open?.who ? 0 : t.messages.filter((m) => !read.has(m.id)).length;
              return (
                <button
                  key={t.who}
                  type="button"
                  className="msg-row"
                  data-testid="thread"
                  data-on={t.who === open?.who ? "1" : "0"}
                  onClick={() => setWho(t.who)}
                >
                  <span className="avatar" data-role={t.role}>{initial(t.name)}</span>
                  <span className="msg-row-text">
                    <strong className="msg-who">{t.name || "Someone"}</strong>
                    <span className="msg-role">{roleWord(t.role, t.stance)}</span>
                    <span className="msg-preview">{last?.text ? presentNote(last.text) : "No letter yet"}</span>
                  </span>
                  {shownUnread > 0 ? <span className="msg-unread">{shownUnread > 9 ? "9+" : shownUnread}</span> : null}
                </button>
              );
            }) : <p className="msg-empty">No one has written. Letters come when someone has a reason.</p>}
          </div>
        </section>
        <Thread
          thread={open}
          plans={plans}
          pending={snap.pending}
          contact={open ? contactOf(snap.contacts, open.who) : undefined}
          slot={open ? slotOf(snap.contacts, open.who) : -1}
          mine={mine.filter((r) => r.who === open?.who)}
          draft={draft}
          busy={busy}
          note={note}
          onDraft={setDraft}
          onBack={() => setWho(null)}
          onSend={(text) => { if (open) void send(open, text); }}
          onAsk={(afterId, cmd, said) => { if (open) void actOn(open, afterId, cmd, said); }}
        />
      </div>
    </div>
  );
}

function Thread({ thread, plans, pending, contact, slot, mine, draft, busy, note, onDraft, onBack, onSend, onAsk }: {
  thread: CircleThread | null;
  plans: DiaryPlan[];
  pending: CircleAsk[];
  contact?: CircleContact;
  slot: number;
  mine: LocalReply[];
  draft: string;
  busy: boolean;
  note: { ok: boolean; text: string; lines?: string[] } | null;
  onDraft: (v: string) => void;
  onBack: () => void;
  onSend: (text: string) => void;
  onAsk: (afterId: number, cmd: Record<string, unknown>, said: string) => void;
}) {
  const person = thread;
  const last = person?.messages[person.messages.length - 1];
  return (
    <section className="msg-talk" aria-label={person ? person.name : "Thread"}>
      <header className="msg-head">
        <button type="button" className="msg-back" onClick={onBack}>Back</button>
        {person ? (
          <span className="avatar" data-role={person.role}>{initial(person.name)}</span>
        ) : null}
        <div className="msg-row-text">
          <h2>{person?.name ? <Named name={person.name} /> : "Choose someone"}</h2>
          {person ? <p>{roleWord(person.role, person.stance)}{contact?.bond.word ? ` · ${contact.bond.word}` : ""}</p> : <p>A thread opens when they write.</p>}
        </div>
      </header>
      <div className="msg-scroll">
        <Result note={note} />
        {person ? (
          <div className="msg-log" data-testid="transcript">
            {person.messages.slice(-30).map((m) => (
              <Letter key={m.id} message={m} ask={askForMessage(pending, m)} plan={planForMessage(plans, m)} slot={slot} busy={busy} mine={mine.filter((r) => r.afterId === m.id)} onAsk={onAsk} />
            ))}
          </div>
        ) : <p className="msg-empty">Pick a person. Their letters, and what each one is about, sit here.</p>}
      </div>
      {person && last ? (
        <form className="msg-compose" onSubmit={(e) => { e.preventDefault(); onSend(draft); }}>
          <input
            value={draft}
            placeholder={`Reply to ${person.name.split(/\s+/)[0] || "them"}`}
            data-testid="reply-text"
            onChange={(e) => onDraft(e.target.value)}
          />
          <Button variant="primary" type="submit" disabled={busy || !draft.trim()} data-testid="reply-send">{busy ? "Sending…" : "Send"}</Button>
        </form>
      ) : null}
    </section>
  );
}

function Letter({ message, ask, plan, slot, busy, mine, onAsk }: {
  message: CircleMsg;
  ask?: CircleAsk;
  plan?: DiaryPlan;
  slot: number;
  busy: boolean;
  mine: LocalReply[];
  onAsk: (afterId: number, cmd: Record<string, unknown>, said: string) => void;
}) {
  return (
    <>
      <article className="msg-item" data-testid="letter">
        <p className="msg-role">{when(message.day)}</p>
        <p className="msg-bubble">{presentNote(message.text)}</p>
        <EventCard eventId={message.eventId} source={message.source} />
        {plan ? (
          <InviteCard plan={plan} busy={busy} onGo={(cmd) => onAsk(message.id, cmd, plan.answer || "")} />
        ) : ask ? (
          <AskBox ask={ask} slot={slot} busy={busy} onGo={(cmd, said) => onAsk(message.id, cmd, said)} />
        ) : null}
      </article>
      {mine.map((r) => (
        <article className="msg-item you" key={r.key} data-testid="my-reply">
          <p className="msg-role">You · {when(r.day)}</p>
          <p className="msg-bubble">{r.text}</p>
        </article>
      ))}
    </>
  );
}
