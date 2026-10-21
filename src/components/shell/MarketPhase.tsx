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
export type PhaseTone = "gain" | "warn" | "faint" | "steel";
export const phaseTone = (phase: Phase, halted: boolean): PhaseTone =>
  halted ? "steel" : phase === "continuous" ? "gain" : phase === "open_auction" || phase === "close_auction" ? "warn" : "faint";
export const phaseLabel = (phase: Phase, halted: boolean, city: string) => `${halted ? S.phaseHalted : PHASE_LABEL[phase]} · ${city}`;

export function MarketPhase({ phase, city, halted = false, variant = "full" }: { phase: Phase; city: string; halted?: boolean; variant?: "full" | "dot" }) {
  const label = phaseLabel(phase, halted, city);
  const tone = phaseTone(phase, halted);
  // Previous label kept in state (React's "adjust state on prop change" pattern) so it can fade out.
  const [cur, setCur] = useState(label);
  const [old, setOld] = useState<string | null>(null);
  if (cur !== label) { setOld(cur); setCur(label); }
  if (variant === "dot") {
    return <span className="mp mp-dot-only" data-testid="phase" data-tone={tone} role="img" aria-label={label}><span className={`dot mp-dot mp-${tone}`} /></span>;
  }
  return (
    <span className="mp phase" data-testid="phase" data-tone={tone}>
      <span className={`dot mp-dot mp-${tone}`} aria-hidden="true" />
      <span className="mp-label">
        {old && <span className="mp-text mp-out" aria-hidden="true" key={`o-${old}`}>{old}</span>}
        <span className="mp-text mp-in" key={label} data-testid="phase-label">{label}</span>
      </span>
    </span>
  );
}
