"use client";
// Quay OS shell root: picks phone / compact / desktop, applies html attributes, wires keys and channels.
import { useEffect, useState } from "react";
import "@/shell/intentLog";
import { useShellKeys } from "@/shell/keys";
import { clockAt, mockChannels, phaseOverride, TICK_MS } from "@/shell/mockChannels";
import { isAppId, RANKS } from "@/shell/registry";
import { DEFAULT_LAYOUT } from "@/shell/layouts";
import { loadLocal, queueSave } from "@/shell/persist";
import { initLoader } from "@/shell/loader";
import { LoadState } from "./LoadState";
import { createShellStore } from "@/shell/store";
import { viewportOf } from "@/shell/wm";
import { applyAppearance } from "@/shell/appearance";
import { isSectionId, settingsNav } from "@/apps/settings/sections";
import { Glyph } from "./Glyph";
import { KeySheet } from "./KeySheet";
import { Launcher } from "./Launcher";
import { PhoneHome } from "./PhoneHome";
import { Recent } from "./Recent";
import { ShellCtx, useShell, useShellStore } from "./ShellContext";
import { Shelf } from "./Shelf";
import { StatusStrip } from "./StatusStrip";
import { Desktop } from "./Desktop";
import { SystemOverlays } from "./SystemOverlays";

const BOOT_MS = [900, 500, 0, 0, 0, 0, 0];

function useHtmlAttributes() {
  const palette = useShell((s) => s.local.palette);
  const prefs = useShell((s) => s.prefs);
  const rank = useShell((s) => s.channels.rank);
  const entitlements = useShell((s) => s.channels.entitlements);
  useEffect(() => {
    applyAppearance(document.documentElement, { palette, prefs, rank, entitlements, media: (q) => window.matchMedia(q).matches });
  }, [palette, prefs, rank, entitlements]);
}

function Surface() {
  const vw = useShell((s) => s.vw);
  const launcherOpen = useShell((s) => s.launcherOpen);
  const recentOpen = useShell((s) => s.recentOpen);
  const keySheetOpen = useShell((s) => s.keySheetOpen);
  const focusMode = useShell((s) => s.local.focusMode);
  const rank = useShell((s) => s.channels.rank.rank);
  const reconnecting = useShell((s) => s.channels.system.connection === "reconnecting");
  const booted = useShell((s) => s.booted);
  const store = useShellStore();
  useHtmlAttributes();

  useEffect(() => {
    if (store.getState().booted) return; // once per page load (module-scope store)
    const t = window.setTimeout(() => store.getState().setBooted(), BOOT_MS[RANKS.indexOf(rank)]);
    return () => window.clearTimeout(t);
    // Boot runs once per load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!booted) {
    return <div className="boot" data-testid="boot"><span className="fg"><Glyph name="quay" size={48} /></span></div>;
  }
  const phone = viewportOf(vw) === "phone";
  return (
    <div className={`quay${phone ? " is-phone" : " is-desktop"}${focusMode && !phone ? " focus-mode" : ""}${reconnecting ? " reconnecting" : ""}`} data-testid="quay-ready">
      {phone ? <PhoneHome /> : (
        <>
          <StatusStrip />
          <div className="banner-slot" data-testid="alert-banner-slot" />
          <div className="banner-slot" data-testid="world-banner-slot" />
          <Desktop />
          {!focusMode && <Shelf />}
        </>
      )}
      {!phone && <LoadState />}
      <SystemOverlays />
      {launcherOpen && <Launcher />}
      {recentOpen && <Recent />}
      {keySheetOpen && <KeySheet />}
    </div>
  );
}

let docStore: ReturnType<typeof createShellStore> | null = null;

export function QuayShell({ route, query }: { route: string[]; query: string }) {
  // One store per document. The App Router remounts the catch-all page when the route param changes (a client-side
  // deep link such as /settings → /settings/SET-08), so the store lives at module scope: windows and focus survive
  // and the deep-link effect below focuses the existing instance (17B S1-02, Audit A-8).
  const [store] = useState(() => (docStore ??= createShellStore(mockChannels(new URLSearchParams(query)))));
  useShellKeys(store);

  useEffect(() => {
    const s = store.getState();
    initLoader(store, new URLSearchParams(query));
    const fit = () => store.getState().setViewport(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    // Mock clock channel: one delta per tick (5 s). The TickRing follows it; it never runs its own timer.
    const pinned = phaseOverride(new URLSearchParams(query));
    const t = window.setInterval(() => {
      const c = store.getState().channels;
      const next = clockAt(c.clock.tick + 1);
      store.getState().setChannels({ ...c, clock: pinned ? { ...next, phase: pinned } : next });
    }, TICK_MS);
    // Deep link /{appId}/...: open, or focus the open instance (Audit A-8).
    const app = route[0];
    if (app && isAppId(app)) s.open(app, new URLSearchParams(query).get("asset") ?? undefined, { deepLink: true });
    // /settings/SET-xx opens that section (17B SET-01).
    if (app === "settings" && isSectionId(route[1])) settingsNav.open(route[1]);
    // Device-local state: IndexedDB `quay.<accountId>` (17 §2.2). Restored unless a deep link opened a window.
    const ACCOUNT = "guest";
    let unsub = () => {};
    loadLocal(ACCOUNT).then((saved) => {
      if (saved && !app) store.setState((st) => ({ local: { ...st.local, ...saved } }));
      // A new account starts in the Trade layout (17 §3.2.5), desktop only.
      if (!saved && !app && viewportOf(window.innerWidth) === "desktop") store.getState().layout(DEFAULT_LAYOUT);
      unsub = store.subscribe((st, prev) => { if (st.local !== prev.local) void queueSave(ACCOUNT, st.local).catch(() => {}); });
    }).catch(() => {});
    return () => { window.removeEventListener("resize", fit); window.clearInterval(t); unsub(); };
  }, [store, route, query]);

  return (
    <ShellCtx.Provider value={store}>
      <Surface />
    </ShellCtx.Provider>
  );
}
