"use client";
// Shell store (Zustand). Holds channels, visibility and ShellLocalState; all window math is in wm.ts.
import { create } from "zustand";
import type { Channels } from "./channels";
import { applyLayout, type LayoutId } from "./layouts";
import { RANKS, type AppId, type Rank } from "./registry";
import type { AccountUiPrefs, PaletteId, ShellLocalState, SnapSlot, WindowRect } from "./types";
import { evaluate, type Visibility } from "./unlock";
import * as wm from "./wm";

export const workspacesFor = (r: Rank): 1 | 2 | 3 => (RANKS.indexOf(r) >= 3 ? 3 : RANKS.indexOf(r) === 2 ? 2 : 1);

export interface ShellState {
  channels: Channels;
  vis: Record<AppId, Visibility>;
  sticky: Set<AppId>;
  fresh: Set<AppId>;              // newly unlocked, not yet opened: one accent dot
  local: ShellLocalState;
  prefs: Pick<AccountUiPrefs, "reducedMotion" | "reducedTransparency" | "highContrast" | "colorBlindPair">;
  vw: number;
  vh: number;
  recent: AppId[];
  launcherOpen: boolean;
  recentOpen: boolean;
  keySheetOpen: boolean;
  phoneApp: { app: AppId; context?: string } | null;

  setChannels(c: Channels): void;
  setViewport(w: number, h: number): void;
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
    const area = () => wm.workArea(get().vw, get().vh, get().local.focusMode);
    const setWindows = (windows: WindowRect[], extra: Partial<ShellLocalState> = {}) =>
      set((s) => ({ local: { ...s.local, ...extra, windows } }));
    const touchRecent = (app: AppId) =>
      set((s) => ({ recent: [app, ...s.recent.filter((a) => a !== app)].slice(0, 6), fresh: without(s.fresh, app) }));

    return {
      channels, vis: first.vis, sticky: first.sticky, fresh: new Set(), local: initialLocal(),
      prefs: { reducedMotion: "system", reducedTransparency: "system", highContrast: false, colorBlindPair: false },
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
      open(app, context, opts) {
        const v = get().vis[app];
        // Locked apps open only from a deep link, showing the LockTile body; hidden apps never open.
        if (v === "hidden" || (v === "locked" && !opts?.deepLink)) return;
        touchRecent(app);
        if (wm.viewportOf(get().vw) === "phone") { set({ phoneApp: { app, context }, recentOpen: false }); return; }
        const r = wm.openApp(get().local.windows, app, area(), context);
        setWindows(r.windows, { activeWorkspace: 1 });
      },
      close(w) { setWindows(wm.closeWin(get().local.windows, w)); },
      focus(w) { setWindows(wm.bringToFront(get().local.windows, w)); },
      snap(w, slot) { setWindows(wm.snapWin(get().local.windows, w, slot, area())); },
      resize(w, width, height) { setWindows(wm.resizeWin(get().local.windows, w, width, height, area())); },
      move(w, x, y) { setWindows(wm.updateWin(get().local.windows, w, { x, y, snap: null })); },
      toggleCollapse(w) { setWindows(wm.updateWin(get().local.windows, w, { collapsed: !w.collapsed })); },
      layout(id) {
        const vis = get().vis;
        setWindows(applyLayout(id, area(), (a) => vis[a] === "unlocked"), { activeWorkspace: 1 });
      },
      setWorkspace(n) {
        if (n <= workspacesFor(get().channels.rank.rank)) set((s) => ({ local: { ...s.local, activeWorkspace: n } }));
      },
      toggleFocusMode() { set((s) => ({ local: { ...s.local, focusMode: !s.local.focusMode } })); },
      setPalette(palette) { set((s) => ({ local: { ...s.local, palette } })); },
      setPrefs(p) { set((s) => ({ prefs: { ...s.prefs, ...p } })); },
      setLauncher(launcherOpen) { set({ launcherOpen }); },
      setRecent(recentOpen) { set({ recentOpen }); },
      setKeySheet(keySheetOpen) { set({ keySheetOpen }); },
      phoneBack() { set({ phoneApp: null }); },
    };
  });

function without<T>(s: Set<T>, v: T): Set<T> {
  const n = new Set(s);
  n.delete(v);
  return n;
}

export type ShellStore = ReturnType<typeof createShellStore>;
