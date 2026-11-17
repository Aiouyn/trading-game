"use client";
// This week and the next four, day by day, with an open invitation you can answer.
import type { ReactNode } from "react";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { gameDate, presentNote } from "@/components/ui/format";
import { Result, useAct, Why } from "@/apps/profile/data";
import { viewportOf } from "@/shell/wm";
import { useSimSnap } from "@/shell/simSession";
import "@/apps/profile/life.css";
import "@/components/ui/named.css";
import { InviteActions } from "./Invite";
import { cleanTitle, costOnce, diaryWindow, kindWord, namedWho, parsePlans, quietLabel, showPlace, showReason, showWho, type DiaryPlan } from "./read";
import "./diary.css";

function WhoLine({ who }: { who: DiaryPlan["who"] }) {
  const store = useShellStore();
  if (!who.length) return <span>The circle</span>;
  return (
    <span className="dia-who">
      {who.map((w, i) => (
        <span className="dia-who-bit" key={`${w.person}-${i}`}>
          {i ? ", " : ""}
          {w.self || w.person < 0 ? (w.self ? "You" : w.name) : (
            <button type="button" className="name-link" onClick={() => store.getState().open("people", `who:${w.person}`)}>
              {w.name}
            </button>
          )}
        </span>
      ))}
    </span>
  );
}

function Aftermath({ plan }: { plan: DiaryPlan }) {
  return (
    <div className="dia-after" data-testid="aftermath">
      {plan.answer ? <p data-testid="invite-answer">{plan.answer}</p> : null}
      {plan.came ? <p>{plan.came}</p> : null}
      {plan.said ? <p className="dia-said">{presentNote(plan.said)}</p> : null}
      {plan.fallout ? <p>{presentNote(plan.fallout)}</p> : null}
      {plan.skipped ? <p>Skipped.</p> : null}
    </div>
  );
}

function dayRows(plans: DiaryPlan[], day: number): DiaryPlan[] {
  return plans.filter((p) => p.day === day).sort((a, b) => Number(b.open) - Number(a.open) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

function WeekDays({ plans, start, busy, onGo }: {
  plans: DiaryPlan[];
  start: number;
  busy: boolean;
  onGo: (cmd: Record<string, unknown>) => void;
}) {
  const chunks: { key: string; node: ReactNode }[] = [];
  let quietStart = -1;
  let quietEnd = -1;
  const flush = () => {
    if (quietStart < 0) return;
    const from = quietStart;
    const to = quietEnd;
    chunks.push({
      key: `quiet-${from}`,
      node: (
        <div className="dia-quiet" data-testid="diary-quiet" data-kind="quiet">
          <span>{quietLabel(from, to)}</span>
        </div>
      ),
    });
    quietStart = -1;
  };
  for (let i = 0; i < 7; i++) {
    const day = start + i;
    const rows = dayRows(plans, day);
    if (!rows.length) {
      if (quietStart < 0) quietStart = day;
      quietEnd = day;
      continue;
    }
    flush();
    for (const p of rows) chunks.push({ key: p.key, node: <Entry plan={p} busy={busy} onGo={onGo} /> });
  }
  flush();
  return <>{chunks.map((c) => <span className="dia-slot" key={c.key}>{c.node}</span>)}</>;
}

function Entry({ plan, primary, busy, onGo }: {
  plan: DiaryPlan;
  primary?: boolean;
  busy: boolean;
  onGo: (cmd: Record<string, unknown>) => void;
}) {
  return (
    <article className="dia-entry" data-testid="diary-entry" data-kind={plan.kind} data-past={plan.past ? "1" : "0"} data-open={plan.open ? "1" : "0"}>
      <header>
        <span className="label">{kindWord(plan.kind)}</span>
        <span className="num">{gameDate(plan.day)}</span>
      </header>
      <h3>{cleanTitle(plan.title) || kindWord(plan.kind)}</h3>
      {showWho(plan) ? <p>Who comes: <WhoLine who={namedWho(plan)} /></p> : null}
      {showPlace(plan) ? <p>Where: {plan.place}</p> : null}
      {costOnce(plan) ? <p className="dia-cost">{costOnce(plan)}</p> : null}
      {showReason(plan) ? <p className="dia-reason">{plan.reason}</p> : null}
      {plan.past ? <Aftermath plan={plan} /> : <InviteActions plan={plan} primary={primary} busy={busy} onGo={onGo} />}
      {plan.eventId >= 0 ? <p><Why id={plan.eventId} /></p> : null}
    </article>
  );
}

export default function DiaryApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const view = useSimSnap().view;
  const { note, busy, go } = useAct();
  if (!view?.date) {
    return <div className={`dia${phone ? " q-phone" : ""}`} data-testid="diary"><p className="quay-state" role="status">Reading the city…</p></div>;
  }
  const abs = view.date.abs;
  const win = diaryWindow(abs);
  const plans = parsePlans(view.plans).filter((p) => p.day >= win.start && p.day < win.end);
  const passed = parsePlans(view.plans).filter((p) => p.past && p.day >= abs - 2 && p.day < win.start);
  const open = plans.filter((p) => p.open).sort((a, b) => a.day - b.day || a.ask - b.ask);
  const soonest = open[0]?.key;
  const onGo = (cmd: Record<string, unknown>) => { void go(cmd); };
  const weeks = [0, 1, 2, 3, 4].map((n) => {
    const start = win.start + n * 7;
    const label = n === 0 ? "This week" : n === 1 ? "Next week" : gameDate(start);
    return { start, label };
  });

  return (
    <div className={`dia${phone ? " q-phone" : ""}`} data-testid="diary">
      <header className="dia-head">
        <h2>Diary</h2>
        <p className="dia-kicker">{gameDate(abs)}. This week and the next four.</p>
      </header>
      <Result note={note} />
      {open.length ? (
        <section className="dia-week" data-testid="diary-invites" aria-label="Open invitations">
          <h3>Open invitations</h3>
          {open.map((p) => <Entry key={`open-${p.key}`} plan={p} primary={p.key === soonest} busy={busy} onGo={onGo} />)}
        </section>
      ) : null}
      {passed.length ? (
        <section className="dia-week" aria-label="Just passed">
          <h3>Just passed</h3>
          {passed.map((p) => <Entry key={`past-${p.key}`} plan={p} busy={busy} onGo={onGo} />)}
        </section>
      ) : null}
      {weeks.map((week) => (
        <section className="dia-week" key={week.start} aria-label={week.label}>
          <h3>{week.label}</h3>
          <WeekDays plans={plans} start={week.start} busy={busy} onGo={onGo} />
        </section>
      ))}
    </div>
  );
}
