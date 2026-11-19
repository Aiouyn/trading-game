"use client";
// Quay OS shell root: picks phone / compact / desktop, applies html attributes, wires keys and channels.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "@/shell/intentLog";
import { useShellKeys } from "@/shell/keys";
import { applyDeepLink, useBackStack } from "@/shell/back";
import { mockLocale } from "@/shell/mockChannels";
import { simBootChannels } from "@/shell/simChannels";
import { bindShell, startSim, useSimSnap } from "@/shell/simSession";
import { isAppId } from "@/shell/registry";
import { DEFAULT_LAYOUT } from "@/shell/layouts";
import { isShrouded } from "@/shell/v1Shroud";
import { loadLocal, queueSave } from "@/shell/persist";
import { initLoader } from "@/shell/loader";
import { registerServiceWorker } from "@/pwa/register";
import { LoadState } from "./LoadState";
import { createShellStore } from "@/shell/store";
import { viewportOf } from "@/shell/wm";
import { applyAppearance } from "@/shell/appearance";
import { isSectionId, settingsNav } from "@/apps/settings/sections";
import { Arrival, FirstStep, TitleScreen, applySound, arrangeScenario, useArrivalPending, useSavedClock } from "./TitleScreen";
import { KeySheet } from "./KeySheet";
import { Launcher } from "./Launcher";
import { PhoneHome } from "./PhoneHome";
import { Recent } from "./Recent";
import { ShellCtx, useShell, useShellStore } from "./ShellContext";
import { useDeepLinkNavigate } from "./PhoneBanners";
import { Shelf } from "./Shelf";
import { StatusStrip } from "./StatusStrip";
import { LiveNwUnlock } from "./useNw";
import { AuthAccountBoundary } from "./AuthAccountBoundary";
import { Desktop } from "./Desktop";
import { FillAckHost } from "./FillAckHost";
import { SystemOverlays, TakenOverlay } from "./SystemOverlays";
import { Banner, WorldEventBanner } from "./Banner";
import { Sheet } from "./Sheet";
import { FEED_HOOKS, mockFeedSource, useFeed } from "@/shell/feed";
import { closeSheet, openSheet, useSheetRequest } from "@/shell/sheetHost";
import { S } from "@/shell/strings";
import { ShellErrorBoundary } from "./ShellErrorBoundary";
import { GoalBar } from "./GoalBar";
import { GameFlow } from "./GameFlow";

function useHtmlAttributes() {
  const palette = useShell((s) => s.local.palette);
  const prefs = useShell((s) => s.prefs);
  const rank = useShell((s) => s.channels.rank);
  const entitlements = useShell((s) => s.channels.entitlements);
  useEffect(() => {
    applyAppearance(document.documentElement, { palette, prefs, rank, entitlements, media: (q) => window.matchMedia(q).matches });
  }, [palette, prefs, rank, entitlements]);
}

function Surface({ query }: { query: string }) {
  const vw = useShell((s) => s.vw);
  const launcherOpen = useShell((s) => s.launcherOpen);
  const recentOpen = useShell((s) => s.recentOpen);
  const keySheetOpen = useShell((s) => s.keySheetOpen);
  const focusMode = useShell((s) => s.local.focusMode);
  // M2-05: offline dims the strip clock like reconnecting (pulse.css); nothing shown is live.
  const reconnecting = useShell((s) => s.channels.system.connection === "reconnecting" || s.channels.system.offline);
  const sim = useShell((s) => s.channels.me.source === "sim");
  const { mode, taken } = useSimSnap();
  const pending = useArrivalPending();
  const store = useShellStore();
  useHtmlAttributes();
  useSavedClock(mode === "play" && !pending);
  useLayoutEffect(() => {
    if (!store.getState().booted) store.getState().setBooted();
    applySound();
  }, [store]);
  // The old banner feed stays mounted so its hook order does not move. The simulation does not show it.
  const feedSource = useMemo(() => mockFeedSource(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)), []);
  const feed = useFeed(feedSource);
  const sheet = useSheetRequest();
  const navigate = useDeepLinkNavigate();
  const storeApi = useShellStore();
  const vwNow = useShell((s) => s.vw);
  // The simulation's goal bar measures itself. Mock banners still report a fixed height.
  const deskBannerH = sim || viewportOf(vwNow) === "phone" ? null : (feed.alerts.length ? 34 : 0) + (feed.world ? 34 : 0);
  useEffect(() => {
    if (deskBannerH === null) return;
    storeApi.getState().setBannerH(deskBannerH);
  }, [storeApi, deskBannerH]);
  useEffect(() => {
    // Mock-only: `?sheet=demo` opens an empty shell sheet so the mount point can be exercised before any consumer.
    if (FEED_HOOKS && new URLSearchParams(window.location.search).get("sheet") === "demo") openSheet({ label: S.recent, content: <p className="muted">{S.noRecent}</p>, testId: "shell-sheet" });
  }, []);

  if (mode !== "play") return <><TitleScreen />{taken ? <TakenOverlay /> : null}</>;
  const phone = viewportOf(vw) === "phone";
  return (
    <AuthAccountBoundary query={query}>
    <div className={`quay${phone ? " is-phone" : " is-desktop"}${focusMode && !phone ? " focus-mode" : ""}${reconnecting ? " reconnecting" : ""}`} data-testid="quay-ready">
      {phone ? <PhoneHome /> : (
        <>
          <StatusStrip />
          {sim ? <GoalBar pin /> : null}
          {!sim && <Banner alerts={feed.alerts} onNavigate={navigate} />}
          {!sim && <WorldEventBanner event={feed.world} />}
          <Desktop />
          {!focusMode && <Shelf />}
          <FillAckHost variant="desktop" />
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
      <FirstMinute />
      {pending ? <Arrival /> : <FirstStep />}
      <GameFlow />
      {taken ? <TakenOverlay /> : null}
    </div>
    </AuthAccountBoundary>
  );
}


/** Lays out the scenario's apps once, when a new game opens. */
function FirstMinute() {
  const store = useShellStore();
  const { mode, layoutNonce, view } = useSimSnap();
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "play") return;
    if (seen.current === layoutNonce) return;
    seen.current = layoutNonce;
    if (layoutNonce === 0) return;
    arrangeScenario(store, view?.scenario?.id);
  }, [mode, layoutNonce, store, view?.scenario?.id]);
  return null;
}

/** Binds the shell before the account boundary's layout effect, then opens the simulation stream. */
function SimLink({ store }: { store: ReturnType<typeof createShellStore> }) {
  useLayoutEffect(() => {
    bindShell(store);
    return startSim();
  }, [store]);
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
  const [store] = useState(() => (docStore ??= seedLocale(createShellStore(simBootChannels()), new URLSearchParams(query))));
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
      registerServiceWorker(); // M2-05: offline fallback + installability (production only)
      return loadLocal(ACCOUNT).then((saved) => {
        if (saved) {
          const flags = store.getState().channels.me.flags;
          // A window saved while a flag was on must not come back after the flag is off.
          const windows = saved.windows?.filter((w) => !isShrouded(w.app, flags));
          // Focus mode hides the dock and the top-left of the strip: it never survives a reload.
          store.setState((st) => ({ local: { ...st.local, ...saved, ...(windows ? { windows } : {}), focusMode: false } }));
        }
        // A new account, or a desk saved with every window closed, starts in the Trade layout (17 §3.2.5), desktop only.
        const empty = !saved || !(saved.windows?.length);
        if (empty && !app && viewportOf(window.innerWidth) === "desktop") store.getState().layout(DEFAULT_LAYOUT);
        store.subscribe((st, prev) => { if (st.local !== prev.local) void queueSave(ACCOUNT, st.local).catch(() => {}); });
      }, () => {});
    })();
    void docBoot.then(() => { if (live) deepLink(); });
    return () => { live = false; window.removeEventListener("resize", fit); };
  }, [store, route, query]);

  return (
    <ShellCtx.Provider value={store}>
      <ShellErrorBoundary>
        <SimLink store={store} />
        <LiveNwUnlock />
        <Surface query={query} />
      </ShellErrorBoundary>
    </ShellCtx.Provider>
  );
}
