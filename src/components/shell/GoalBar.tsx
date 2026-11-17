"use client";
import { useEffect, useRef, useState } from "react";
import { useSimSnap } from "@/shell/simSession";
import { Glyph } from "./Glyph";
import { useShellStore } from "./ShellContext";
import { toggleNotes } from "./flowState";

/** Scenario goal, progress and time left. Desktop pins its height into the window work area. */
export function GoalBar({ pin = false }: { pin?: boolean }) {
  const store = useShellStore();
  const sc = useSimSnap().view?.scenario;
  const [gone, setGone] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const freshKey = sc ? `${sc.id}:${sc.begun ?? 0}` : "";
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
  }, [pin, store, freshKey, gone, sc?.goal, sc?.timeLeft]);
  if (!sc) return null;
  const progress = Math.max(0, sc.progress ?? 0);
  const width = Math.max(0, Math.min(1, progress));
  const showFirst = !!sc.fresh && !!sc.first && gone !== freshKey;
  return (
    <div
      className={`goal-bar${pin ? " goal-bar-pin" : ""}`}
      data-testid="goal-bar"
      ref={bar}
    >
      <div className="goal-row">
        <p className="goal-text" title={sc.meter || undefined}>{sc.goal || sc.name}</p>
        <span className="goal-meter" data-testid="goal-progress" title={sc.meter || undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width * 100)} aria-label={sc.goal || "Goal"}>
          <span style={{ width: `${width * 100}%` }} />
        </span>
        <span className="goal-time" data-testid="goal-time">{sc.timeLeft || ""}</span>
        {pin ? null : (
          <button type="button" className="icon-btn" aria-label="Notices" data-testid="notes-bell" onClick={() => toggleNotes()}>
            <Glyph name="bell" size={16} />
          </button>
        )}
      </div>
      {showFirst ? (
        <div className="goal-first" data-testid="first-line">
          <p>{sc.first}</p>
          <button type="button" className="goal-dismiss" onClick={() => setGone(freshKey)}>Dismiss</button>
        </div>
      ) : null}
    </div>
  );
}
