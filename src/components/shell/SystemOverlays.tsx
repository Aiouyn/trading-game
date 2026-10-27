"use client";
// 17 §7.1 system overlays (17A T5 §6): Held (z 150) and halt / disconnect / forced update (z 160). Full-window
// --bg0 92% [P], serif title, one action. The backdrop lets pointer and wheel events through, so read-only
// windows behind stay usable (17-AT-32); only the card takes input.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

// Halt dismissal is shared by the overlay and the strip / status-bar chip. "Continue read-only" hides the overlay
// until the next halt (halted → false → true); the chip reopens it.
let haltHidden = false;
const subs = new Set<() => void>();
const setHaltHidden = (v: boolean) => { if (haltHidden !== v) { haltHidden = v; subs.forEach((f) => f()); } };
const useHaltHidden = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => haltHidden, () => false);

/** Order entry lock for any order surface (OrderPad, tickets): disabled while halted. Tooltip (Studio final):
 *  "Orders are paused while trading is halted. Reason: {reason}." — the second sentence is dropped with no reason.
 *  NOTE: only testable on the /__ds/notices mock until a real order entry exists. */
export function orderEntryLock(halted: boolean, reason?: string | null): { disabled: boolean; reason: string | null } {
  if (!halted) return { disabled: false, reason: null };
  const why = reason?.trim();
  return { disabled: true, reason: why ? `${S.orderEntryHalted} ${S.orderEntryHaltReason(why)}` : S.orderEntryHalted };
}

/** Persistent steel chip while the halt lasts (Studio 08:04): strip (desktop) and status bar (phone). Reopens the overlay. */
export function HaltChip({ halted }: { halted: boolean }) {
  if (!halted) return null;
  return (
    <button className="chip halt-chip" data-testid="halt-chip" onClick={() => setHaltHidden(false)}>
      {S.haltedChip}
    </button>
  );
}

/** Polite announcement when trading resumes (halted true → false). */
export function HaltAnnouncer({ halted }: { halted: boolean }) {
  const prev = useRef(halted);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (prev.current && !halted) setMsg(S.haltedResumed);
    if (!prev.current && halted) setMsg("");
    prev.current = halted;
  }, [halted]);
  return <div className="sr-only" role="status" aria-live="polite" data-testid="halt-live">{msg}</div>;
}

/** Halt overlay + announcer, driven by a `halted` flag (channel in the shell, a toggle in /__ds/notices). */
export function HaltLayer({ halted }: { halted: boolean }) {
  const hidden = useHaltHidden();
  const [last, setLast] = useState(halted);
  if (halted !== last) { setLast(halted); if (!halted) setHaltHidden(false); }
  return (
    <>
      {halted && !hidden && <SystemOverlay kind="halted" onAction={() => setHaltHidden(true)} />}
      <HaltAnnouncer halted={halted} />
    </>
  );
}

// TODO(17A T5): wire the "disconnected" and "update" overlays when the connection-state source exists
// (trigger: the connection-state source, which arrives with the server unit). SystemOverlay supports both kinds now.
export function SystemOverlays() {
  const sys = useShell((s) => s.channels.system);
  return (
    <>
      {sys.held && <SystemOverlay kind="held" />}
      <HaltLayer halted={sys.halted} />
    </>
  );
}
