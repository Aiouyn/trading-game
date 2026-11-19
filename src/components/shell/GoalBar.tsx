"use client";
import { useEffect, useRef, useState } from "react";
import { setSpeed, useSimSnap, type ActNote } from "@/shell/simSession";
import { goalSpeak, hintSpeak, lessonDo, timeSpeak } from "@/shell/lessonDo";
import { presentNote } from "@/components/ui/format";
import { useLife } from "@/apps/profile/data";
import { Button } from "@/components/ui/Button";
import { Glyph } from "./Glyph";
import { useShellStore } from "./ShellContext";
import { toggleNotes } from "./flowState";
import { ARRIVAL } from "@/shell/desk";
import { FamilyInterrupt } from "@/apps/messages/notices";

/** Scenario goal, progress and time left. Desktop pins its height into the window work area. */
export function GoalBar({ pin = false }: { pin?: boolean }) {
  const store = useShellStore();
  const sc = useSimSnap().view?.scenario;
  const { life, run } = useLife();
  const [gone, setGone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActNote | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const hint = life?.tutorial && !life.tutorial.done ? life.tutorial.hint : "";
  const opening = sc?.fresh && sc.first && !hint ? sc.first : "";
  const prose = hint || opening;
  const stepKey = hint ? `hint:${hint}` : (sc ? `open:${sc.id}:${sc.begun ?? 0}` : "");
  // The first paycheck's first step is the card on the desk. Later steps stay on this bar.
  const cardOwns = !!sc?.tutorial && !sc.tutorial.done && sc.tutorial.step === "sheet";
  const action = cardOwns ? null : lessonDo(prose);
  useEffect(() => {
    if (!pin) return;
    const el = bar.current;
    if (!el) return;
    const apply = () => {
      const h = el.offsetHeight;
      if (h > 0) store.getState().setBannerH(h);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => { ro.disconnect(); store.getState().setBannerH(0); };
  }, [pin, store, stepKey, gone, sc?.goal, sc?.timeLeft, prose, result?.text]);
  if (!sc) return null;
  // A new life has no goal, no clock and no score to show. Only a family request can still reach the desk here.
  if (sc.id === ARRIVAL) return <div className="goal-quiet" ref={bar}><FamilyInterrupt float={pin} /></div>;
  const ended = sc.outcome === "win" || sc.outcome === "loss";
  const progress = Math.max(0, sc.progress ?? 0);
  const width = Math.max(0, Math.min(1, progress));
  const showProse = !ended && !!prose && gone !== stepKey;
  const ahead = !ended && !!sc.pullback;
  const doIt = async () => {
    if (!action || busy) return;
    setBusy(true);
    setResult({ ok: true, text: "Sending…" });
    try {
      setResult(await run({ line: action.line }));
    } catch {
      setResult({ ok: false, text: "That did not go through." });
    } finally {
      setBusy(false);
    }
  };
  const passMonth = async () => {
    if (busy) return;
    setBusy(true);
    setResult({ ok: true, text: "Sending…" });
    try {
      await setSpeed("month");
      setResult({ ok: true, text: "A month is passing." });
    } catch {
      setResult({ ok: false, text: "That did not go through." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className={`goal-bar${pin ? " goal-bar-pin" : ""}`}
      data-testid="goal-bar"
      ref={bar}
    >
      <div className="goal-row">
        <p className="goal-text" title={sc.meter || undefined}>{goalSpeak(sc.goal) || sc.name}</p>
        <span className="goal-meter" data-testid="goal-progress" title={sc.meter || undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width * 100)} aria-label={sc.goal || "Goal"}>
          <span style={{ width: `${width * 100}%` }} />
        </span>
        <span className="goal-time" data-testid="goal-time">{ended ? "The run is over" : timeSpeak(sc.timeLeft)}</span>
        {pin ? null : (
          <button type="button" className="icon-btn" aria-label="Notices" data-testid="notes-bell" onClick={() => toggleNotes()}>
            <Glyph name="bell" size={16} />
          </button>
        )}
      </div>
      {ahead ? <p className="goal-next" data-testid="goal-ahead">{sc.pullback}</p> : null}
      {!ended && (showProse || action) ? (
        <div className="goal-next" data-testid="first-line">
          {showProse ? <p>{hintSpeak(prose)}</p> : null}
          {action ? (
            <Button variant="primary" size="sm" disabled={busy} data-testid="lesson-do" onClick={() => void doIt()}>
              {busy ? "Sending…" : action.label}
            </Button>
          ) : null}
          {action?.line === "wait 1d" ? (
            <Button variant="secondary" size="sm" disabled={busy} data-testid="lesson-month" onClick={() => void passMonth()}>
              {busy ? "Sending…" : "Let a month pass"}
            </Button>
          ) : null}
          {showProse ? <button type="button" className="goal-dismiss" onClick={() => setGone(stepKey)}>Dismiss</button> : null}
        </div>
      ) : null}
      {result ? <p className="goal-result" data-ok={result.ok ? "1" : "0"} data-testid="lesson-result">{presentNote(result.text)}</p> : null}
      <FamilyInterrupt float={pin} />
    </div>
  );
}
