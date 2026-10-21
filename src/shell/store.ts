"use client";
// Shell store (Zustand). Holds channels, visibility and ShellLocalState; all window math is in wm.ts.
import { create } from "zustand";
import type { Channels } from "./channels";
import { applyLayout, type LayoutId } from "./layouts";
import { RANKS, type AppId, type Rank } from "./registry";
import type { AccountUiPrefs, PaletteId, ShellId, ShellLocalState, SnapSlot, WindowRect } from "./types";
import { evaluate, type Visibility } from "./unlock";
import * as wm from "./wm";
import { prefsClient } from "./prefs";

/** Account id for the prefs stub (same guest account as the device store in QuayShell). */
export const PREFS_ACCOUNT = "guest";

export const workspacesFor = (r: Rank): 1 | 2 | 3 => (RANKS.indexOf(r) >= 3 ? 3 : RANKS.indexOf(r) === 2 ? 2 : 1);

export interface ShellState {
  channels: Channels;
  vis: Record<AppId, Visibility>;
  sticky: Set<AppId>;
  fresh: Set<AppId>;              // newly unlocked, not yet opened: one accent dot
  local: ShellLocalState;
  prefs: Pick<AccountUiPrefs, "reducedMotion" | "reducedTransparency" | "highContrast" | "colorBlindPair" | "textScale" | "shell" | "locale">;
  /** Phone: an app's pushed screen (17B SET: "Back to Settings"). The app bar shows its title and the back chevron pops it. */
  /** Boot screen already shown on this page load (it never replays on a client-side route change). */
  booted: boolean;
  setBooted(): void;
  phoneSub: { title: string; backLabel: string; onBack: () => void } | null;
  setPhoneSub(sub: ShellState["phoneSub"]): void;
  vw: number;
  vh: number;
  recent: AppId[];
  launcherOpen: boolean;
  recentOpen: boolean;
  keySheetOpen: boolean;
  phoneApp: { app: AppId; context?: string } | null;

  setChannels(c: Channels): void;
  setViewport(w: number, h: number): void;
  /** Height of the open desktop banners (0 / 34 / 68), which shrinks the work area (17A T6). */
  bannerH: number;
  setBannerH(h: number): void;
  open(app: AppId, context?: string, opts?: { deepLink?: boolean }): void;
  close(w: WindowRect): void;
  focus(w: WindowRect): void;
  snap(w: WindowRect, slot: SnapSlot): void;
  resize(w: WindowRect, width: number, height: number): void;
  move(w: WindowRect, x: number, y: number): void;
  toggleCollapse(w: WindowRect): void;
  layout(id: LayoutId): void;
  setWorkspace(n: 1 | 2 | 3): void;
  toggleFocusMode(): void;
  setPalette(p: PaletteId): void;
  setPrefs(p: Partial<ShellState["prefs"]>): void;
  setLauncher(open: boolean): void;
  setRecent(open: boolean): void;
  setKeySheet(open: boolean): void;
  phoneBack(): void;
}

export const initialLocal = (): ShellLocalState => ({
  palette: "ink-brass", windows: [], compact: { visible: null, halves: null }, focusMode: false,
  activeWorkspace: 1, ticketDrafts: {}, lastSeenTick: 0, renderTierOverride: "auto", myCityOverlay: false, connectionNotes: {},
});

export const createShellStore = (channels: Channels) =>
  create<ShellState>()((set, get) => {
    const first = evaluate(channels, new Set());
    // Stored rects use the full work area; banners are applied at display time (wm.fitRect), so nothing double-shrinks.
    const area = () => wm.workArea(get().vw, get().vh, get().local.focusMode);
    const setWindows = (windows: WindowRect[], extra: Partial<ShellLocalState> = {}) =>
      set((s) => ({ local: { ...s.local, ...extra, windows } }));
    const touchRecent = (app: AppId) =>
      set((s) => ({ recent: [app, ...s.recent.filter((a) => a !== app)].slice(0, 6), fresh: without(s.fresh, app) }));

    return {
      channels, vis: first.vis, sticky: first.sticky, fresh: new Set(), local: initialLocal(),
      prefs: { reducedMotion: "system", reducedTransparency: "system", highContrast: false, colorBlindPair: false, textScale: 1, shell: channels.rank.rank.toLowerCase() as ShellId, locale: "en" },
      booted: false,
      setBooted() { set({ booted: true }); },
      phoneSub: null,
      setPhoneSub(phoneSub) { set({ phoneSub }); },
      vw: 1440, vh: 900, recent: [], launcherOpen: false, recentOpen: false, keySheetOpen: false, phoneApp: null,

      setChannels(c) {
        const prev = get();
        const next = evaluate(c, prev.sticky);
        const fresh = new Set(prev.fresh);
        for (const id of Object.keys(next.vis) as AppId[]) {
          if (next.vis[id] === "unlocked" && prev.vis[id] !== "unlocked") fresh.add(id);
        }
        set({ channels: c, vis: next.vis, sticky: next.sticky, fresh });
      },
      setViewport(vw, vh) { set({ vw, vh }); },
      bannerH: 0,
      setBannerH(h) { if (get().bannerH !== h) set({ bannerH: h }); },
      open(app, context, opts) {
        const v = get().vis[app];
        // Locked apps open only from a deep link, showing the LockTile body; hidden apps never open.
        if (v === "hidden" || (v === "locked" && !opts?.deepLink)) return;
        touchRecent(app);
        if (wm.viewportOf(get().vw) === "phone") { set({ phoneApp: { app, context }, recentOpen: false }); return; }
        const r = wm.openApp(get().local.windows, app, area(), context);
        setWindows(r.windows, { activeWorkspace: 1 });
      },
      // TODO(17A T4): ask before closing a window with unsent ticket input (trigger: ticket input exists).
      close(w) { setWindows(wm.closeWin(get().local.windows, w)); },
      focus(w) { setWindows(wm.bringToFront(get().local.windows, w)); },
      snap(w, slot) { setWindows(wm.snapWin(get().local.windows, w, slot, area())); },
      resize(w, width, height) { const s = get(); setWindows(wm.resizeWin(s.local.windows, w, width, height, wm.workArea(s.vw, s.vh, s.local.focusMode, s.bannerH))); },
      move(w, x, y) {
        // AC-WM-SHELF-CLAMP: drag stops at the banner-aware work area on desktop.
        const s = get(), desk = wm.viewportOf(s.vw) === "desktop";
        setWindows(wm.moveWin(s.local.windows, w, x, y, s.local.focusMode, desk ? wm.workArea(s.vw, s.vh, s.local.focusMode, s.bannerH) : undefined, s.vw));
      },
      toggleCollapse(w) { setWindows(wm.updateWin(get().local.windows, w, { collapsed: !w.collapsed })); },
      layout(id) {
        const vis = get().vis;
        const windows = applyLayout(id, area(), (a) => vis[a] === "unlocked");
        if (windows.length === 0) return;
        setWindows(windows, { activeWorkspace: 1 });
        set((s) => ({ recent: [...new Set([...windows.map((w) => w.app).reverse(), ...s.recent])].slice(0, 6) }));
      },
      setWorkspace(n) {
        if (n <= workspacesFor(get().channels.rank.rank)) set((s) => ({ local: { ...s.local, activeWorkspace: n } }));
      },
      toggleFocusMode() { set((s) => ({ local: { ...s.local, focusMode: !s.local.focusMode } })); },
      setPalette(palette) { set((s) => ({ local: { ...s.local, palette } })); },
      setPrefs(p) {
        const textScale = p.textScale === undefined ? undefined : Math.min(2, Math.max(1, p.textScale)); // 1.0..2.0 (17 §2.1)
        set((s) => ({ prefs: { ...s.prefs, ...p, ...(textScale === undefined ? {} : { textScale }) } }));
        // Account prefs go through the REST stub (19 owns PUT /account/prefs; 17 §2.1). The palette never does (device-local).
        void prefsClient.get(PREFS_ACCOUNT).then((cur) => prefsClient.put({ ...cur, ...get().prefs }));
      },
      setLauncher(launcherOpen) { set({ launcherOpen }); },
      setRecent(recentOpen) { set({ recentOpen }); },
      setKeySheet(keySheetOpen) { set({ keySheetOpen }); },
      phoneBack() { const sub = get().phoneSub; if (sub) sub.onBack(); else set({ phoneApp: null }); },
    };
  });

function without<T>(s: Set<T>, v: T): Set<T> {
  const n = new Set(s);
  n.delete(v);
  return n;
}

export type ShellStore = ReturnType<typeof createShellStore>;
