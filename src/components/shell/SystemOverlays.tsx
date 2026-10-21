"use client";
// 17 §7.1 system overlays (17A T5 §6): Held (z 150) and halt / disconnect / forced update (z 160). Full-window
// --bg0 92% [P], serif title, one action. The backdrop lets pointer and wheel events through, so read-only
// windows behind stay usable (17-AT-32); only the card takes input.
import { useState } from "react";
import { S } from "@/shell/strings";
import { Button } from "@/components/ui/Button";
import { useShell } from "./ShellContext";

export type OverlayKind = "held" | "halted" | "disconnected" | "update";

const COPY: Record<OverlayKind, { title: string; body: string; action?: string }> = {
  held: { title: S.held, body: S.heldBody },
  halted: { title: S.halted, body: S.haltedReason, action: S.haltedAction },
  disconnected: { title: S.disconnected, body: S.disconnectedBody, action: S.disconnectedAction },
  update: { title: S.updateRequired, body: S.updateBody, action: S.updateAction },
};

export function SystemOverlay({ kind, onAction }: { kind: OverlayKind; onAction?: () => void }) {
  const c = COPY[kind];
  return (
    <div className={`sys-overlay sys-${kind} ${kind === "held" ? "overlay-held" : "overlay-system"}`} data-testid={`overlay-${kind}`} role="status">
      <div className="sys-card">
        <h2 className="sys-title">{c.title}</h2>
        <p className="muted">{c.body}</p>
        {c.action && onAction && <Button variant="secondary" className="sys-action" data-testid={`overlay-${kind}-action`} onClick={onAction}>{c.action}</Button>}
      </div>
    </div>
  );
}

export function SystemOverlays() {
  const sys = useShell((s) => s.channels.system);
  // "Continue read-only" hides the halt overlay until the next halt event (halted → false → true).
  const [dismissedHalt, setDismissedHalt] = useState(false);
  const [lastHalted, setLastHalted] = useState(sys.halted);
  if (sys.halted !== lastHalted) { setLastHalted(sys.halted); if (!sys.halted) setDismissedHalt(false); }
  return (
    <>
      {sys.held && <SystemOverlay kind="held" />}
      {sys.halted && !dismissedHalt && <SystemOverlay kind="halted" onAction={() => setDismissedHalt(true)} />}
    </>
  );
}
