"use client";
import { viewportOf, workArea, slotRect, type Area, fitRect } from "@/shell/wm";
import type { WindowRect } from "@/shell/types";
import { useShell } from "./ShellContext";
import { WindowFrame } from "./WindowFrame";

/**
 * The work surface. Every window stays mounted; windows not shown (other workspace, or covered in
 * compact) are `hidden` and their body gets background=true (City visibility, Spec 2 §6).
 * Desktop: free windows on the active workspace.
 * Compact (768–1199): only the top window, filling the work area; two halves from 1000 px when the two
 * top windows are snapped L1/2 + R1/2. Stored rects are untouched, so ≥1200 restores them exactly.
 */
export function Desktop() {
  const windows = useShell((s) => s.local.windows);
  const ws = useShell((s) => s.local.activeWorkspace);
  const focusMode = useShell((s) => s.local.focusMode);
  const vw = useShell((s) => s.vw);
  const vh = useShell((s) => s.vh);
  const vp = viewportOf(vw);
  const bannerH = useShell((s) => s.bannerH);
  const area = workArea(vw, vh, focusMode, bannerH);
  const full = workArea(vw, vh, focusMode);
  const onWs = windows.filter((w) => w.workspace === ws);

  const shown = new Map<WindowRect, Area>();
  if (vp === "desktop") {
    onWs.forEach((w) => shown.set(w, fitRect(w, area, full, vw)));
  } else {
    const [a, b] = onWs.slice(-2);
    const halves = vw >= 1000 && a && b && new Set([a.snap, b.snap]).size === 2 && [a.snap, b.snap].every((s) => s === "L1/2" || s === "R1/2");
    if (halves) [a, b].forEach((w) => shown.set(w, slotRect(w.snap === "L1/2" ? "L1/2" : "R1/2", area)));
    else onWs.slice(-1).forEach((w) => shown.set(w, slotRect("FILL", area)));
  }
  const top = onWs.at(-1);

  return (
    <main className={`desktop${focusMode ? " no-wallpaper" : ""}`} data-testid="desktop">
      {/* Stable DOM order (stacking is z-index only): reordering nodes on pointerdown would swallow the click. */}
      {[...windows].sort((a, b) => `${a.app}-${a.instance}`.localeCompare(`${b.app}-${b.instance}`)).map((win) => (
        <WindowFrame
          key={`${win.app}-${win.instance}`}
          win={win}
          rect={shown.get(win) ?? win}
          z={windows.indexOf(win)}
          active={top === win}
          movable={vp === "desktop"}
          background={!shown.has(win)}
        />
      ))}
    </main>
  );
}
