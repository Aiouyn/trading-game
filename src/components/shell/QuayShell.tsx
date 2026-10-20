"use client";
// Quay OS shell root: picks phone / compact / desktop, applies html attributes, wires keys and channels.
import { useEffect, useState } from "react";
import "@/shell/intentLog";
import { useShellKeys } from "@/shell/keys";
import { clockAt, mockChannels, TICK_MS } from "@/shell/mockChannels";
import { isAppId, RANKS } from "@/shell/registry";
import { DEFAULT_LAYOUT } from "@/shell/layouts";
import { loadLocal, saveLocal } from "@/shell/persist";
import { createShellStore } from "@/shell/store";
import { viewportOf } from "@/shell/wm";
import { Glyph } from "./Glyph";
import { KeySheet } from "./KeySheet";
import { Launcher } from "./Launcher";
import { PhoneHome } from "./PhoneHome";
import { Recent } from "./Recent";
import { ShellCtx, useShell } from "./ShellContext";
import { Shelf } from "./Shelf";
import { StatusStrip } from "./StatusStrip";
import { Desktop } from "./Desktop";
import { SystemOverlays } from "./SystemOverlays";

const BOOT_MS = [900, 500, 0, 0, 0, 0, 0];

function useHtmlAttributes() {
  const palette = useShell((s) => s.local.palette);
  const prefs = useShell((s) => s.prefs);
  const rank = useShell((s) => s.channels.rank.rank);
  useEffect(() => {
    const html = document.documentElement;
    const mq = (q: string) => window.matchMedia(q).matches;
    const motion = prefs.reducedMotion === "on" || (prefs.reducedMotion === "system" && mq("(prefers-reduced-motion: reduce)"));
    const transp = prefs.reducedTransparency === "on" || (prefs.reducedTransparency === "system" && mq("(prefers-reduced-transparency: reduce)"));
    html.dataset.palette = palette;
    const toggle = (k: string, on: boolean, v: string) => { if (on) html.dataset[k] = v; else delete html.dataset[k]; };
    toggle("motion", motion, "reduce");
    toggle("transparency", transp, "reduce");
    toggle("hc", prefs.highContrast, "1");
    toggle("cb", prefs.colorBlindPair, "1");
    html.style.setProperty("--text-scale", String(prefs.textScale)); // every --fs-* scales (17 §2.1 textScale)
    RANKS.forEach((r) => html.classList.toggle(`shell-${r.toLowerCase()}`, r === rank));
  }, [palette, prefs, rank]);
}

function Surface() {
  const vw = useShell((s) => s.vw);
  const launcherOpen = useShell((s) => s.launcherOpen);
  const recentOpen = useShell((s) => s.recentOpen);
  const keySheetOpen = useShell((s) => s.keySheetOpen);
  const focusMode = useShell((s) => s.local.focusMode);
  const rank = useShell((s) => s.channels.rank.rank);
  const reconnecting = useShell((s) => s.channels.system.connection === "reconnecting");
  const [booted, setBooted] = useState(false);
  useHtmlAttributes();

  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), BOOT_MS[RANKS.indexOf(rank)]);
    return () => window.clearTimeout(t);
    // Boot runs once per load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!booted) {
    return <div className="boot" data-testid="boot"><span className="acc"><Glyph name="quay" size={48} /></span></div>;
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
      <SystemOverlays />
      {launcherOpen && <Launcher />}
      {recentOpen && <Recent />}
      {keySheetOpen && <KeySheet />}
    </div>
  );
}

export function QuayShell({ route, query }: { route: string[]; query: string }) {
  const [store] = useState(() => createShellStore(mockChannels(new URLSearchParams(query))));
  useShellKeys(store);

  useEffect(() => {
    const s = store.getState();
    const fit = () => store.getState().setViewport(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    // Mock clock channel: one delta per tick (5 s). The TickRing follows it; it never runs its own timer.
    const t = window.setInterval(() => {
      const c = store.getState().channels;
      store.getState().setChannels({ ...c, clock: clockAt(c.clock.tick + 1) });
    }, TICK_MS);
    // Deep link /{appId}/...: open, or focus the open instance (Audit A-8).
    const app = route[0];
    if (app && isAppId(app)) s.open(app, new URLSearchParams(query).get("asset") ?? undefined, { deepLink: true });
    // Device-local state: IndexedDB `quay.<accountId>` (17 §2.2). Restored unless a deep link opened a window.
    const ACCOUNT = "guest";
    let unsub = () => {};
    loadLocal(ACCOUNT).then((saved) => {
      if (saved && !app) store.setState((st) => ({ local: { ...st.local, ...saved } }));
      // A new account starts in the Trade layout (17 §3.2.5), desktop only.
      if (!saved && !app && viewportOf(window.innerWidth) === "desktop") store.getState().layout(DEFAULT_LAYOUT);
      unsub = store.subscribe((st, prev) => { if (st.local !== prev.local) void saveLocal(ACCOUNT, st.local); });
    }).catch(() => {});
    return () => { window.removeEventListener("resize", fit); window.clearInterval(t); unsub(); };
  }, [store, route, query]);

  return (
    <ShellCtx.Provider value={store}>
      <Surface />
    </ShellCtx.Provider>
  );
}
