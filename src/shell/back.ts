"use client";
// Back behaviour (17A T4 §5) [P]. Browser history mirrors the shell so hardware/browser Back, the app-bar chevron
// and the left-edge swipe all do the same thing.
// - Phone: a stack Home (0) → app (1) → in-app screen (2). Each level is a pushState; Back pops one level; at Home
//   Back does nothing (no exit: there is nothing below level 0 that we created).
// - Desktop: each change of the focused window pushes its URL. Back refocuses the previously focused window; it
//   never closes windows or discards drafts.
import { useEffect, useSyncExternalStore } from "react";
import type { AppId } from "./registry";
import type { ShellStore } from "./store";
import type { WindowRect } from "./types";
import { viewportOf } from "./wm";

type PhoneEntry = { quay: "phone"; lvl: 0 | 1 | 2; app?: AppId; context?: string; screen?: string };
type DeskEntry = { quay: "desk"; app?: AppId; instance?: number };
type Entry = PhoneEntry | DeskEntry;

/** URL of a window (or home): `/{app}` plus `?asset=` for a Broker ticker. */
export const urlOf = (w: Pick<WindowRect, "app" | "context"> | null | undefined, screen?: string) =>
  !w ? "/" : `/${w.app}${screen ? `/${screen}` : ""}${w.context ? `?asset=${encodeURIComponent(w.context)}` : ""}`;

// Current phone in-app screen (level 2), readable by PhoneHome.
let screen: string | null = null;
const listeners = new Set<() => void>();
const setScreen = (s: string | null) => { screen = s; listeners.forEach((l) => l()); };
export const usePhoneScreen = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => screen, () => null);

const state = (): Entry | null => (history.state && typeof history.state === "object" && "quay" in history.state ? history.state as Entry : null);

/** One level back (chevron, edge swipe). At phone Home it does nothing. */
export function goBack(): void {
  const s = state();
  if (s?.quay === "phone" && s.lvl === 0) return;
  history.back();
}

const focusedOf = (st: ReturnType<ShellStore["getState"]>) =>
  st.local.windows.filter((w) => w.workspace === st.local.activeWorkspace).at(-1) ?? null;

const write = (e: Entry, url: string, replace = false) => {
  if (replace) history.replaceState(e, "", url); else history.pushState(e, "", url);
};

/**
 * Seed history for the page load, after the deep link (if any) is applied. On phone a deep link builds the whole
 * stack (Home, app, screen) so Back pops level by level. `screenId` is the deep link's second segment.
 */
let seeded = false;
export function seedHistory(store: ShellStore, screenId?: string): void {
  seeded = true;
  const st = store.getState();
  if (viewportOf(st.vw) === "phone") {
    const a = st.phoneApp;
    write({ quay: "phone", lvl: 0 }, "/", true);
    if (!a) return;
    write({ quay: "phone", lvl: 1, app: a.app, context: a.context }, urlOf(a));
    if (screenId) { setScreen(screenId); write({ quay: "phone", lvl: 2, app: a.app, context: a.context, screen: screenId }, urlOf(a, screenId)); }
  } else {
    const f = focusedOf(st);
    write({ quay: "desk", app: f?.app, instance: f?.instance }, urlOf(f), true);
  }
}

/** Wire the shell store to browser history: each new phone level or focused desktop window is one entry. */
export function useBackStack(store: ShellStore): void {
  useEffect(() => {
    let applying = false;
    const phone = () => viewportOf(store.getState().vw) === "phone";
    const push = write;
    const unsub = store.subscribe((st, prev) => {
      if (applying || !seeded) return;
      if (phone()) {
        if (st.phoneApp && st.phoneApp !== prev.phoneApp) {
          setScreen(null);
          push({ quay: "phone", lvl: 1, app: st.phoneApp.app, context: st.phoneApp.context }, urlOf(st.phoneApp));
        } else if (!st.phoneApp && prev.phoneApp) {
          // Home via the status-bar mark or the edge-bar swipe: this entry becomes Home; Back from it stays Home.
          setScreen(null);
          push({ quay: "phone", lvl: 0 }, "/", true);
        }
        return;
      }
      const f = focusedOf(st), pf = focusedOf(prev);
      if (f && (!pf || f.app !== pf.app || f.instance !== pf.instance)) push({ quay: "desk", app: f.app, instance: f.instance }, urlOf(f));
      else if (f && pf && f.context !== pf.context) push({ quay: "desk", app: f.app, instance: f.instance }, urlOf(f), true);
    });

    const onPop = () => {
      const e = state();
      if (!e) return;
      applying = true;
      try {
        if (e.quay === "phone") {
          setScreen(e.lvl === 2 ? e.screen ?? null : null);
          store.setState({ phoneApp: e.lvl === 0 || !e.app ? null : { app: e.app, context: e.context } });
        } else if (e.app) {
          const st = store.getState();
          const w = st.local.windows.find((x) => x.app === e.app && x.instance === e.instance);
          if (w) st.focus(w); // refocus only: never close, never re-create
        }
      } finally { applying = false; }
    };
    window.addEventListener("popstate", onPop);
    return () => { unsub(); window.removeEventListener("popstate", onPop); };
  }, [store]);
}
