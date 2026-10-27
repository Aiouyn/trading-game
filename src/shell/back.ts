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
/** Seeded entries (the load's own entry and its deep-link stack) keep the load's query string, so state the page was loaded with (mock channel
 *  params, e2e hooks such as ?city=fail read later by lazily mounted apps) is not dropped by the rewrite. */
const withLoadQuery = (url: string) => (url.includes("?") ? url : url + location.search);

/** A deep link being applied: the store change it causes must not write history (see applyDeepLink). Also set while a
 *  popstate is replayed into the store. */
let quiet = false;

/**
 * Apply a deep link `/{app}/{screen}` (page load or a client-side navigation through the Next router), then seed
 * history for it. `open` runs quiet: on a client-side navigation Next has already committed the target URL, and the
 * focus change `open` causes would otherwise make the focus subscriber push a section-less `/{app}` over it
 * (`/settings/SET-08` → `/settings`, 17B S1-02); whether that write or Next's own URL sync landed last decided the URL.
 */
export function applyDeepLink(store: ShellStore, link: { app?: string; screen?: string }, open: () => void): void {
  quiet = true;
  try { open(); } finally { quiet = false; }
  seedHistory(store, link);
}

/**
 * Seed history for the page load or a client-side deep link, after the deep link (if any) is applied. On phone a deep
 * link builds the whole stack (Home, app, screen) so Back pops level by level. On desktop the current entry is
 * replaced with the focused window's URL, keeping the deep link's screen segment when that window is the linked app.
 */
let seeded = false;
function seedHistory(store: ShellStore, link: { app?: string; screen?: string }): void {
  seeded = true;
  const st = store.getState();
  const screenId = link.screen;
  if (viewportOf(st.vw) === "phone") {
    const a = st.phoneApp;
    write({ quay: "phone", lvl: 0 }, withLoadQuery("/"), true);
    if (!a) return;
    write({ quay: "phone", lvl: 1, app: a.app, context: a.context }, withLoadQuery(urlOf(a)));
    if (screenId) { setScreen(screenId); write({ quay: "phone", lvl: 2, app: a.app, context: a.context, screen: screenId }, withLoadQuery(urlOf(a, screenId))); }
  } else {
    const f = focusedOf(st);
    write({ quay: "desk", app: f?.app, instance: f?.instance }, withLoadQuery(urlOf(f, f && f.app === link.app ? screenId : undefined)), true);
  }
}

/** Wire the shell store to browser history: each new phone level or focused desktop window is one entry. */
export function useBackStack(store: ShellStore): void {
  useEffect(() => {
    const phone = () => viewportOf(store.getState().vw) === "phone";
    const push = write;
    const unsub = store.subscribe((st, prev) => {
      if (quiet || !seeded) return;
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
      quiet = true;
      try {
        if (e.quay === "phone") {
          setScreen(e.lvl === 2 ? e.screen ?? null : null);
          store.setState({ phoneApp: e.lvl === 0 || !e.app ? null : { app: e.app, context: e.context } });
        } else if (e.app) {
          const st = store.getState();
          const w = st.local.windows.find((x) => x.app === e.app && x.instance === e.instance);
          if (w) st.focus(w); // refocus only: never close, never re-create
        }
      } finally { quiet = false; }
    };
    window.addEventListener("popstate", onPop);
    return () => { unsub(); window.removeEventListener("popstate", onPop); };
  }, [store]);
}
