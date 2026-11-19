"use client";
import "./startGate.css";
import type { SimSpeed } from "./channels";
import { setSpeed, useSimSnap } from "./simSession";

const SPEEDS: { id: SimSpeed; label: string }[] = [
  { id: "pause", label: "Pause" },
  { id: "x1", label: "x1" },
  { id: "x2", label: "x2" },
  { id: "x5", label: "x5" },
  { id: "x10", label: "x10" },
  { id: "x25", label: "x25" },
];

/** Pause and x1 to x25. At x1 one real hour is one game day. The simulation auto-pauses and names the reason. */
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
