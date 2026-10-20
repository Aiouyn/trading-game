"use client";
// Desktop keyboard map, skeleton subset of 17 §3.2.6. Disabled in text inputs and on touch-only devices.
import { useEffect } from "react";
import { LAYOUTS } from "./layouts";
import { shelfOrder } from "./prefs";
import { APP_IDS, type AppId } from "./registry";
import type { ShellStore } from "./store";
import { nextSnap } from "./wm";

const G_TARGETS: Record<string, AppId> = { p: "portfolio", w: "wire", m: "messages", l: "legal", s: "security" };

export function isTextInput(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

const touchOnly = () => typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

export function useShellKeys(store: ShellStore): void {
  useEffect(() => {
    let gPending = false;
    const onKey = (e: KeyboardEvent) => {
      const s = store.getState();
      if (e.key === "Escape") {
        s.setLauncher(false);
        s.setKeySheet(false);
        s.setRecent(false);
        return;
      }
      if (touchOnly()) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "k") { e.preventDefault(); s.setLauncher(true); return; }
      if (isTextInput(e.target)) return;
      const top = s.local.windows.filter((w) => w.workspace === s.local.activeWorkspace).at(-1);
      const arrows: Record<string, "left" | "right" | "up" | "down"> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

      if (ctrl && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const n = s.local.activeWorkspace + (e.key === "ArrowLeft" ? -1 : 1);
        if (n >= 1 && n <= 3) s.setWorkspace(n as 1 | 2 | 3);
        return;
      }
      if (ctrl && arrows[e.key]) {
        e.preventDefault();
        if (!top) return;
        const n = nextSnap(top.snap, arrows[e.key]);
        if (n === "collapse") s.toggleCollapse(top); else s.snap(top, n);
        return;
      }
      if (ctrl && e.key === ".") { e.preventDefault(); s.toggleFocusMode(); return; }
      if (ctrl && e.key.toLowerCase() === "m") { e.preventDefault(); if (top) s.toggleCollapse(top); return; }
      if ((ctrl || e.altKey) && e.key.toLowerCase() === "w") { e.preventDefault(); if (top) s.close(top); return; }
      if (e.altKey && e.code.startsWith("Digit")) {
        const i = Number(e.code.slice(5)) - 1;
        const apps = shelfOrder(APP_IDS).filter((a) => s.vis[a] === "unlocked");
        if (i >= 0 && i < 9 && apps[i]) { e.preventDefault(); s.open(apps[i]); }
        return;
      }
      if (e.altKey && e.code === "KeyN") { e.preventDefault(); s.open("broker"); return; }
      if (ctrl || e.altKey) return;
      if (gPending) {
        gPending = false;
        const t = G_TARGETS[e.key.toLowerCase()];
        if (t) s.open(t);
        return;
      }
      if (e.key === "g" || e.key === "G") { gPending = true; return; }
      if (e.key === "?") s.setKeySheet(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}

export const KEY_SHEET: readonly [string, string][] = [
  ["Ctrl K", "Launcher"], ["Alt 1–9", "Open or focus shelf app"], ["Ctrl ← → ↑ ↓", "Snap active window"],
  ["Ctrl Alt ← →", "Workspace"], ["Ctrl W / Alt W", "Close window"], ["Ctrl M", "Collapse"], ["Ctrl .", "Focus mode"],
  ["Alt N", "New Broker window"], ["G then P W M L S", "Portfolio, Wire, Messages, Legal, Security"], ["?", "Key sheet"], ["Esc", "Close launcher"],
];
export const LAYOUT_NAMES = LAYOUTS.map((l) => l.name);
