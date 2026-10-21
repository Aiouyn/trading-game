"use client";
// TickRing (17 §3.5, 17A T3): one sweep per server tick. `key={tick}` remounts the sweep, so the clock channel
// restarts it and nothing else does (no free timer). States: running, reconnecting (dashed 2/2 --fg-faint),
// halted (static --steel pause glyph, no sweep). Reduced motion steps once per second (pulse.css).
import { S } from "@/shell/strings";
import { useShell } from "./ShellContext";

export type TickRingState = "running" | "reconnecting" | "halted";

export function TickRing({ tick, size = 22, verbose = false }: { tick: number; size?: number; /** a11y verbose mode (pref stub) */ verbose?: boolean }) {
  const sys = useShell((s) => s.channels.system);
  const state: TickRingState = sys.halted ? "halted" : sys.connection === "reconnecting" ? "reconnecting" : "running";
  const m = size / 2;
  const r = m - 2;
  return (
    <span className="tickring" data-testid="tickring" data-state={state}>
      <svg className="tickring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={m} cy={m} r={r} className="tickring-track" />
        {state === "running" && (
          <circle key={tick} cx={m} cy={m} r={r} pathLength={100} className="tickring-sweep" transform={`rotate(-90 ${m} ${m})`} />
        )}
        {state === "halted" && <path className="tickring-pause" d={`M${m - 2.5} ${m - 4}v8M${m + 2.5} ${m - 4}v8`} />}
      </svg>
      {/* Announces "Tick" only in verbose mode; the key remounts it so each tick is a new announcement. */}
      <span className="sr-only" aria-live="polite" data-testid="tick-live">{verbose && state === "running" ? <span key={tick}>{S.tick}</span> : null}</span>
    </span>
  );
}
