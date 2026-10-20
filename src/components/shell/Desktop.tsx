"use client";
import { viewportOf, workArea, slotRect, type Area } from "@/shell/wm";
import type { WindowRect } from "@/shell/types";
import { useShell } from "./ShellContext";
import { WindowFrame } from "./WindowFrame";

/**
 * The work surface. Desktop: free windows on the active workspace.
 * Compact (768–1199): only the top window, filling the work area; two halves from 1000 px when
 * the two top windows are snapped L1/2 + R1/2. Stored rects are untouched, so ≥1200 restores them.
 */
export function Desktop() {
  const windows = useShell((s) => s.local.windows);
  const ws = useShell((s) => s.local.activeWorkspace);
  const focusMode = useShell((s) => s.local.focusMode);
  const vw = useShell((s) => s.vw);
  const vh = useShell((s) => s.vh);
  const vp = viewportOf(vw);
  const area = workArea(vw, vh, focusMode);
  const onWs = windows.filter((w) => w.workspace === ws);

  let shown: { win: WindowRect; rect: Area }[];
  if (vp === "desktop") {
    shown = onWs.map((win) => ({ win, rect: win }));
  } else {
    const [a, b] = onWs.slice(-2);
    const halves = vw >= 1000 && a && b && new Set([a.snap, b.snap]).size === 2 && [a.snap, b.snap].every((s) => s === "L1/2" || s === "R1/2");
    shown = halves
      ? [a, b].map((win) => ({ win, rect: slotRect(win.snap === "L1/2" ? "L1/2" : "R1/2", area) }))
      : onWs.slice(-1).map((win) => ({ win, rect: slotRect("FILL", area) }));
  }
  const top = onWs.at(-1);

  return (
    <main className={`desktop${focusMode ? " no-wallpaper" : ""}`} data-testid="desktop">
      {shown.map(({ win, rect }) => (
        <WindowFrame
          key={`${win.app}-${win.instance}`}
          win={win}
          rect={rect}
          z={onWs.indexOf(win)}
          active={top === win}
          movable={vp === "desktop"}
        />
      ))}
    </main>
  );
}
