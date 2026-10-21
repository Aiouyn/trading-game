"use client";
// MarketPhase (17 §3.2.1, §3.1.3, 17A T3): 6 px dot + "Market open · Port Avalon". The label is always present
// (colour is never the only signal); the phone variant shows the dot only and keeps the label in aria-label.
// A phase change cross-fades the label over --dur-base (0 under reduced motion).
import { useState } from "react";
import type { MarketPhase as Phase } from "@/shell/channels";
import { S } from "@/shell/strings";

export const PHASE_LABEL: Record<Phase, string> = {
  pre: "Pre-market", open_auction: "Opening auction", continuous: "Market open",
  close_auction: "Closing auction", after: "After hours", weekend: "Weekend",
};
export type PhaseTone = "gain" | "warn" | "faint" | "steel" | "reconnecting";
/** Halted wins over reconnecting; both are carried by shape too (pause bars / dashed ring), not colour alone. */
export const phaseTone = (phase: Phase, halted: boolean, reconnecting = false): PhaseTone =>
  halted ? "steel" : reconnecting ? "reconnecting" : phase === "continuous" ? "gain" : phase === "open_auction" || phase === "close_auction" ? "warn" : "faint";
export const phaseLabel = (phase: Phase, halted: boolean, city: string, reconnecting = false) =>
  `${halted ? S.phaseHalted : reconnecting ? S.reconnecting : PHASE_LABEL[phase]} · ${city}`;

export function MarketPhase({ phase, city, halted = false, reconnecting = false, variant = "full" }: { phase: Phase; city: string; halted?: boolean; reconnecting?: boolean; variant?: "full" | "dot" }) {
  const label = phaseLabel(phase, halted, city, reconnecting);
  const tone = phaseTone(phase, halted, reconnecting);
  // Previous label kept in state (React's "adjust state on prop change" pattern) so it can fade out.
  const [cur, setCur] = useState(label);
  const [old, setOld] = useState<string | null>(null);
  if (cur !== label) { setOld(cur); setCur(label); }
  // Phase changes are always announced (polite), never the initial state; per-tick announcements are separate.
  const announce = <span className="sr-only" aria-live="polite" data-testid="phase-live">{old ? label : ""}</span>;
  if (variant === "dot") {
    return (
      <span className="mp mp-dot-only" data-testid="phase" data-tone={tone}>
        <span className={`dot mp-dot mp-${tone}`} role="img" aria-label={label} data-testid="phase-dot" />
        {announce}
      </span>
    );
  }
  return (
    <span className="mp phase" data-testid="phase" data-tone={tone}>
      <span className={`dot mp-dot mp-${tone}`} aria-hidden="true" />
      <span className="mp-label">
        {old && <span className="mp-text mp-out" aria-hidden="true" key={`o-${old}`}>{old}</span>}
        <span className="mp-text mp-in" key={label} data-testid="phase-label">{label}</span>
      </span>
      {announce}
    </span>
  );
}
