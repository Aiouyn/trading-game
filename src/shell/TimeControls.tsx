"use client";
import "./startGate.css";
import type { SimSpeed } from "./channels";
import { setSpeed, useSimSnap } from "./simSession";

const SPEEDS: { id: SimSpeed; label: string }[] = [
  { id: "pause", label: "Pause" },
  { id: "day", label: "1 day" },
  { id: "week", label: "1 week" },
  { id: "month", label: "1 month" },
];

/** Pause, a day, a week, a month. The simulation auto-pauses and names the reason. */
export function TimeControls() {
  const { view } = useSimSnap();
  const speed = view?.speed ?? "pause";
  const why = view?.pause?.why;
  return (
    <div className="sim-time" data-testid="sim-time">
      {SPEEDS.map((s) => (
        <button key={s.id} type="button" data-testid={`speed-${s.id}`} data-on={speed === s.id ? "1" : "0"} onClick={() => void setSpeed(s.id)}>
          {s.label}
        </button>
      ))}
      {why ? <span className="sim-pause" data-testid="sim-pause" title={why}>{why}</span> : null}
    </div>
  );
}
