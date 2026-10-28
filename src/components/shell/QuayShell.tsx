"use client";
// Quay OS shell root: picks phone / compact / desktop, applies html attributes, wires keys and channels.
import { useEffect, useMemo, useState } from "react";
import "@/shell/intentLog";
import { useShellKeys } from "@/shell/keys";
import { applyDeepLink, useBackStack } from "@/shell/back";
import { clockAt, mockChannels, mockLocale, phaseOverride, TICK_MS } from "@/shell/mockChannels";
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
import { useDeepLinkNavigate } from "./PhoneBanners";
import { Shelf } from "./Shelf";
import { StatusStrip } from "./StatusStrip";
import { LiveNwUnlock } from "./useNw";
import { Desktop } from "./Desktop";
import { SystemOverlays } from "./SystemOverlays";
import { Banner, WorldEventBanner } from "./Banner";
import { Sheet } from "./Sheet";
import { FEED_HOOKS, mockFeedSource, useFeed } from "@/shell/feed";
import { closeSheet, openSheet, useSheetRequest } from "@/shell/sheetHost";
import { S } from "@/shell/strings";

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
  // Mock feed until Engine wires the real one (see TODO in shell/feed.ts). Read once per load, like mockChannels.
  const feedSource = useMemo(() => mockFeedSource(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)), []);
  const feed = useFeed(feedSource);
  const sheet = useSheetRequest();
  const navigate = useDeepLinkNavigate();
  const storeApi = useShellStore();
  const vwNow = useShell((s) => s.vw);
  const deskBannerH = viewportOf(vwNow) === "phone" ? 0 : (feed.alerts.length ? 34 : 0) + (feed.world ? 34 : 0);
  // Desktop banners shrink the work area; windows refit to it (wm.fitRect).
  useEffect(() => { storeApi.getState().setBannerH(deskBannerH); }, [storeApi, deskBannerH]);
  useEffect(() => {
    // Mock-only: `?sheet=demo` opens an empty shell sheet so the mount point can be exercised before any consumer.
    if (FEED_HOOKS && new URLSearchParams(window.location.search).get("sheet") === "demo") openSheet({ label: S.recent, content: <p className="muted">{S.noRecent}</p>, testId: "shell-sheet" });
  }, []);

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
          <Banner alerts={feed.alerts} onNavigate={navigate} />
          <WorldEventBanner event={feed.world} />
          <Desktop />
          {!focusMode && <Shelf />}
        </>
      )}
      {!phone && <LoadState />}
      <SystemOverlays />
      {launcherOpen && <Launcher />}
      {recentOpen && <Recent />}
      {keySheetOpen && <KeySheet />}
      {sheet && (
        <Sheet side={sheet.side ?? (phone ? "bottom" : "right")} label={sheet.label} onClose={closeSheet} testId={sheet.testId ?? "shell-sheet"}>
          {sheet.content}
        </Sheet>
      )}
    </div>
  );
}

/** Mock clock channel: one delta per tick (5 s). The TickRing follows it; it never runs its own timer. Its own component,
 *  first child of the provider: effects run children-first, in order, so the clock is the page's first timer, before
 *  the `me` feed the top bar subscribes (useNw) (17A T3-01 keys on that). */
function ShellClock({ store, query }: { store: ReturnType<typeof createShellStore>; query: string }) {
  useEffect(() => {
    const pinned = phaseOverride(new URLSearchParams(query));
    const t = window.setInterval(() => {
      const c = store.getState().channels;
      const next = clockAt(c.clock.tick + 1);
      store.getState().setChannels({ ...c, clock: pinned ? { ...next, phase: pinned } : next });
    }, TICK_MS);
    return () => window.clearInterval(t);
  }, [store, query]);
  return null;
}

let docStore: ReturnType<typeof createShellStore> | null = null;
// Once per document, like docStore: the loader hooks, the saved-window restore and the save subscription. A client-side
// deep link remounts QuayShell; re-running the restore would overwrite the live windows with the last saved snapshot
// (focus included) before the deep link applies.
let docBoot: Promise<void> | null = null;
/** e2e `?locale=fr` (mockLocale, build-gated): applied once, when the document's store is created. */
function seedLocale(store: ReturnType<typeof createShellStore>, q: URLSearchParams) {
  const locale = mockLocale(q);
  if (locale) store.getState().setPrefs({ locale });
  return store;
}

export function QuayShell({ route, query }: { route: string[]; query: string }) {
  // One store per document. The App Router remounts the catch-all page when the route param changes (a client-side
  // deep link such as /settings → /settings/SET-08), so the store lives at module scope: windows and focus survive
  // and the deep-link effect below focuses the existing instance (17B S1-02, Audit A-8).
  const [store] = useState(() => (docStore ??= seedLocale(createShellStore(mockChannels(new URLSearchParams(query))), new URLSearchParams(query))));
  useShellKeys(store);
  useBackStack(store);

  useEffect(() => {
    const fit = () => store.getState().setViewport(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener("resize", fit);
    // Deep link /{appId}/...: after restoring saved windows, open it, or focus and front the open instance
    // (Audit A-8, 17A T4-04): openApp never creates a window past the instance cap.
    const app = route[0];
    const deepLink = () => applyDeepLink(store, { app, screen: route[1] }, () => {
      if (app && isAppId(app)) store.getState().open(app, new URLSearchParams(query).get("asset") ?? undefined, { deepLink: true });
      // /settings/SET-xx opens that section (17B SET-01).
      if (app === "settings" && isSectionId(route[1])) settingsNav.open(route[1]);
    });
    // Device-local state: IndexedDB `quay.<accountId>` (17 §2.2).
    const ACCOUNT = "guest";
    let live = true;
    docBoot ??= (() => {
      initLoader(store, new URLSearchParams(query));
      return loadLocal(ACCOUNT).then((saved) => {
        if (saved) store.setState((st) => ({ local: { ...st.local, ...saved } }));
        // A new account starts in the Trade layout (17 §3.2.5), desktop only.
        if (!saved && !app && viewportOf(window.innerWidth) === "desktop") store.getState().layout(DEFAULT_LAYOUT);
        store.subscribe((st, prev) => { if (st.local !== prev.local) void queueSave(ACCOUNT, st.local).catch(() => {}); });
      }, () => {});
    })();
    void docBoot.then(() => { if (live) deepLink(); });
    return () => { live = false; window.removeEventListener("resize", fit); };
  }, [store, route, query]);

  return (
    <ShellCtx.Provider value={store}>
      <ShellClock store={store} query={query} />
      <LiveNwUnlock />
      <Surface />
    </ShellCtx.Provider>
  );
}
