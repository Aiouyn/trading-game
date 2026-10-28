"use client";
// Inline cancel for one open order (UI card 6): idle "Cancel" -> confirm ("Keep order" / "Yes, cancel") -> cancelling.
// Presentational only: OpenOrders owns the state, the intent and the focus moves. No accent anywhere (one primary per
// view stays "Place order").
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { BrStrings } from "./strings";

export type CancelPhase =
  | { kind: "idle"; disabled: boolean }
  | { kind: "confirm" }
  | { kind: "cancelling"; atTick: number };

export interface CancelControlProps {
  t: BrStrings;
  phase: CancelPhase;
  /** cancelAria for this order. */
  label: string;
  onCancel: () => void;
  onKeep: () => void;
  onYes: () => void;
}

export function CancelControl({ t, phase, label, onCancel, onKeep, onYes }: CancelControlProps) {
  if (phase.kind === "cancelling") {
    return <p className="br-oo-actions br-oo-cancelling" role="status" data-testid="br-oo-cancelling">{t.cancelling(String(phase.atTick))}</p>;
  }
  if (phase.kind === "confirm") {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onKeep();
    };
    return (
      <div className="br-oo-actions br-oo-confirm" role="group" aria-label={label} data-testid="br-oo-confirm" onKeyDown={onKey}>
        <span className="br-oo-ask" data-testid="br-oo-ask">{t.cancelConfirm}</span>
        <span className="br-oo-confirm-btns">
          <Button variant="secondary" size="sm" className="br-oo-btn br-oo-keep" data-testid="br-oo-keep" onClick={onKeep}>{t.keepOrder}</Button>
          <Button variant="secondary" size="sm" className="br-oo-btn br-oo-yes" data-testid="br-oo-yes" onClick={onYes}>{t.confirmCancel}</Button>
        </span>
      </div>
    );
  }
  return (
    <div className="br-oo-actions" data-testid="br-oo-actions">
      <Button variant="secondary" size="sm" className="br-oo-btn br-oo-cancel" data-testid="br-oo-cancel" aria-label={label} disabled={phase.disabled} onClick={onCancel}>{t.cancel}</Button>
    </div>
  );
}

/** The line under a row after a refused or unsent cancel (role=alert). Cleared by the next Cancel press. */
export function CancelNote({ text }: { text: string }) {
  return <p className="br-oo-note" role="alert" data-testid="br-oo-note">{text}</p>;
}
