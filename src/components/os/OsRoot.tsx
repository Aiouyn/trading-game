'use client';

// The desktop (P2-110..P2-113, P2-056..P2-061, P2-065): wallpaper, rank hardware, the status strip,
// the windows of the active workspace, the shelf and the toasts. It binds the shell to the save and
// the earned rank, keeps the URL in step with the focused window, opens the windows the old screen
// calls ask for, and routes the desktop keys. The html element carries the Velvet root markers
// (data-testid, rank class, focus and compact classes, data-palette) so the CSS keys on <html>.
import { useEffect, useRef } from 'react';
import { t } from '@/i18n';
import { knownSeries, useGame } from '@/game/store';
import { rankOrdinal } from '@/shell/ctx';
import { useIsPhone } from '@/game/useMedia';
import { cycleTarget, keyIntent } from '@/shell/keys';
import { BP_HALVES, BP_PHONE, SHELF_H, STRIP_H, STRIP_H_FOCUS, layoutMode, slotFrac, viewportClass } from '@/shell/geometry';
import { toastPlace, visibleToasts } from '@/shell/toasts';
import { focusedId, isFocused, project } from '@/shell/wm';
import { APPS } from '@/shell/apps';
import { SCREEN_APP } from './appMap';
import { installTestHooks } from './e2eHooks';
import { Wallpaper } from './DesktopWallpaper';
import { type Rank, rankClass } from './hardware';
import { BellPanel } from './BellPanel';
import { EventBannerStrip, EventPanel, useBannerOn, useEventPanel } from './EventBanner';
import { EventTakeover } from './EventTakeover';
import { EVENT_BAND_H } from './eventSelect';
import { Launcher } from './Launcher';
import { OsToasts } from './OsToasts';
import { openFromShell } from './openApp';
import { RankHardware } from './RankHardware';
import { parseLocation, routeUrl, type UrlBase } from './routing';
import { PhoneDesk } from './PhoneDesk';
import { isPhoneViewport, phoneGoHome, phoneOpen, usePhone } from './phoneStore';
import { Shelf } from './Shelf';
import { SplitHandles } from './SplitHandles';
import { StatusStrip } from './StatusStrip';
import { WindowFrame, pruneDrawn } from './WindowFrame';
import { sharedEdges, type Tile } from './windowMath';
import {
  applyEarnedPalette,
  bindShell,
  closeWindow,
  closeLauncher,
  currentBand,
  dispatchWm,
  loadMotion,
  loadPalette,
  notify,
  openApp,
  openLauncher,
  syncViewport,
  useBinding,
  useCloseAsk,
  useFocusHint,
  useGhosts,
  useLauncher,
  useLayoutMenu,
  useShell,
  usePalette,
} from './shellStore';

/** The query flags and aliases read at the first load. The URL is written from these (DECISIONS "Routing"). */
let urlBase: UrlBase = { flags: {} };
/** The deep link opens once per page load, not once per mount (the shell remounts on a phone-desktop switch). */
let urlHandled = false;

/** Opens the window a deep link names. Unknown paths and locked apps land on the desktop with a toast (P2-115, P2-116). */
function openFromUrl(): void {
  const { route, base } = parseLocation(window.location.pathname, window.location.search);
  urlBase = base;
  if ('redirect' in route) {
    window.location.replace(route.redirect + window.location.search);
    return;
  }
  if (!('app' in route)) {
    notify(t('shell.notFound'), 'warn');
    return;
  }
  if (route.app === null) {
    if (isPhoneViewport()) phoneGoHome();
    return;
  }
  const props = route.view !== undefined ? { ...route.props, view: route.view } : route.props;
  // On the phone the link opens the app's own history entry, without adding one (P2-113, P2-114).
  if (isPhoneViewport()) phoneOpen(route.app, props, false);
  else openApp(route.app, props);
}

/**
 * Desktop keys (P2-100..P2-104, P2-102). Window intents run here. Escape closes the topmost thing that is
 * open, in this order: the launcher, the layout menu, the close prompt, then the first toast on screen.
 */
function onKey(e: KeyboardEvent): void {
  // The window keys belong to the desktop. The phone has its own Escape (the Recent sheet).
  if (isPhoneViewport()) return;
  const target = e.target as HTMLElement | null;
  const textField =
    !!target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
  const st = useShell.getState();
  const intent = keyIntent(
    { code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey },
    { focused: focusedId(st.shell), shelf: st.shell.shelf, activeWs: st.shell.activeWs, workspaces: st.ctx.workspaces, textField },
  );
  if (intent === null) return;
  if (intent.kind === 'escape') {
    if (useLauncher.getState().open) {
      e.preventDefault();
      closeLauncher();
      return;
    }
    if (useLayoutMenu.getState().open) {
      e.preventDefault();
      useLayoutMenu.setState({ open: false });
      return;
    }
    if (useCloseAsk.getState().id !== null) {
      e.preventDefault();
      useCloseAsk.setState({ id: null });
      return;
    }
    if (useEventPanel.getState().open) {
      e.preventDefault();
      useEventPanel.setState({ open: false });
      return;
    }
    if (useGame.getState().inboxOpen) {
      e.preventDefault();
      useGame.getState().setInbox(false);
      return;
    }
    const top = visibleToasts(useGame.getState().toasts, isFocused(st.shell))[0];
    if (top !== undefined) {
      e.preventDefault();
      useGame.getState().dismissToast(top.id);
    }
    return;
  }
  if (intent.kind === 'launcher') {
    e.preventDefault();
    if (useBinding.getState().saveId !== null) openLauncher();
    return;
  }
  if (intent.kind === 'help') {
    e.preventDefault();
    openApp('settings', {}, { focus: true });
    return;
  }
  if (intent.kind === 'cycle') {
    // The cycle walks the windows on screen (a halves or single layout hides the rest).
    const id = cycleTarget(project(st.shell).order, intent.back);
    if (id === null) return;
    e.preventDefault();
    dispatchWm({ type: 'focus', id });
    useFocusHint.setState({ id });
    return;
  }
  if (intent.kind !== 'wm') return;
  e.preventDefault();
  const action = intent.action;
  if (action.type === 'open') {
    openApp(action.app, action.app === 'broker' ? { ticker: useGame.getState().selected } : {}, { focus: true, fresh: action.fresh === true });
    return;
  }
  if (action.type === 'close') {
    closeWindow(action.id);
    return;
  }
  dispatchWm(action);
}

const RANK_CLASS = /^shell-r\d$/;

/** The selection the desktop starts on: the saved ticker when this universe lists it, else the first asset. */
function startTicker(): string {
  const g = useGame.getState();
  if (knownSeries(g.config, g.selected)) return g.selected;
  return g.config.assets[0]?.id ?? g.selected;
}

export function OsRoot() {
  const shell = useShell((s) => s.shell);
  const ghosts = useGhosts((s) => s.list);
  const status = useGame((s) => s.status);
  const playerId = useGame((s) => s.playerId);
  const rankId = useGame((s) => s.me?.rank.id ?? null);
  const screenNonce = useGame((s) => s.screenNonce);
  const presetNonce = useGame((s) => s.ticketPreset?.nonce ?? 0);
  const palette = usePalette((s) => s.palette);
  const bound = useBinding((s) => s.saveId !== null);
  const chatOpen = useGame((s) => s.chatOpen);
  // The world event strip takes its band under the status strip (desktop only): the windows lay out above it.
  const bannerOn = useBannerOn();

  const focus = focusedId(shell);
  const focusMode = isFocused(shell);
  const compact = viewportClass(shell.vp.w) === 'compact';
  const rankNum = rankOrdinal(rankId ?? 'R0');
  const proj = project(shell);
  const mode = layoutMode(shell.vp.w);
  const focusWin = shell.wins.find((w) => w.id === focus);
  const focusTicker = focusWin?.app === 'broker' ? focusWin.props.ticker : undefined;
  const narrow = shell.vp.w < BP_HALVES;
  const phone = useIsPhone();

  // The root markers on <html>, and the saved palette before the first paint of this mount.
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.testid = 'os-root';
    html.classList.add('os-root');
    loadPalette();
    loadMotion();
    return () => {
      html.classList.remove('os-root', 'focus-mode', 'os-compact', 'os-narrow');
      for (const c of Array.from(html.classList)) if (RANK_CLASS.test(c)) html.classList.remove(c);
      delete html.dataset.testid;
    };
  }, []);

  // The streak accents of this player (6D.4), as one key so the effect runs only when they change. Until the world's view
  // arrives there is no key, and the saved palette stays as it was loaded.
  const accentKey = useGame((s) => (s.me?.sixd?.streak ? s.me.sixd.streak.accents.join(',') : null));
  useEffect(() => {
    if (accentKey !== null) applyEarnedPalette(accentKey ? accentKey.split(',') : []);
  }, [accentKey]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('focus-mode', focusMode);
    html.classList.toggle('os-compact', compact);
    // Below 1000 px the launcher field keeps only its glyph and Ctrl K (P2-057).
    html.classList.toggle('os-narrow', narrow);
    for (const c of Array.from(html.classList)) if (RANK_CLASS.test(c)) html.classList.remove(c);
    html.classList.add(rankClass(rankNum as Rank));
  }, [focusMode, compact, narrow, rankNum]);

  useEffect(() => {
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  // The banner appearing or going re-lays the windows above or below its band (no-op on the phone).
  useEffect(() => {
    if (bound) syncViewport();
  }, [bannerOn, bound]);

  // The chat button and a profile's Message button raise chatOpen; the Messages app opens on its chat tab.
  // Messages already on screen switches to its chat tab by itself, so only a closed Messages opens here.
  useEffect(() => {
    if (!chatOpen || !bound) return;
    const onScreen = isPhoneViewport() ? usePhone.getState().current === 'messages' : useShell.getState().shell.wins.some((w) => w.app === 'messages');
    if (!onScreen) openFromShell('messages', { view: 'chat' }, { focus: true });
  }, [chatOpen, bound]);

  // window.__tg: the always-present hooks, and the ?e2e set under the flag (tape-e2e-conventions.md).
  useEffect(() => installTestHooks(), []);

  // Bind to the save once the game is ready. A rank change re-normalizes the shell (P2-029). A stale or
  // unknown saved ticker is replaced before anything reads it (the chart crashed on one before).
  useEffect(() => {
    if (status !== 'ready' || playerId === null || rankId === null) return;
    const ticker = startTicker();
    if (useGame.getState().selected !== ticker) useGame.getState().select(ticker);
    bindShell(playerId, rankId, { w: window.innerWidth, h: window.innerHeight - currentBand() }, ticker);
    if (!urlHandled) {
      urlHandled = true;
      openFromUrl();
    }
  }, [status, playerId, rankId]);

  // The URL follows the focused window with replaceState, so history is not spammed (P2-113).
  useEffect(() => {
    if (!bound || isPhoneViewport()) return;
    const url = routeUrl(useShell.getState().shell, urlBase);
    const cur = window.location.pathname + window.location.search;
    if (url !== cur) window.history.replaceState(window.history.state, '', url);
  }, [bound, shell]);

  // Every screen call from an old call site (setScreen in Overlays, Wire, Security...) opens its window.
  // It counts calls, not screen changes, so a second call to the same screen opens the window again.
  const prevNav = useRef(screenNonce);
  useEffect(() => {
    if (prevNav.current === screenNonce) return;
    prevNav.current = screenNonce;
    if (!bound) return;
    const g = useGame.getState();
    openFromShell(SCREEN_APP[g.screen], g.screen === 'market' ? { ticker: g.selected } : {});
  }, [screenNonce, bound]);

  // A ticket preset (the stop explainer, a note) opens or focuses the Broker (C-24).
  const prevNonce = useRef(presetNonce);
  useEffect(() => {
    if (prevNonce.current === presetNonce) return;
    prevNonce.current = presetNonce;
    if (bound && presetNonce !== 0) openFromShell('broker', { ticker: useGame.getState().selected });
  }, [presetNonce, bound]);

  // A focused Broker shows its ticker in the game's selection.
  useEffect(() => {
    if (!bound || focusTicker === undefined) return;
    const g = useGame.getState();
    if (g.selected !== focusTicker) g.select(focusTicker);
  }, [bound, focus, focusTicker]);

  // Drawn state follows the windows that exist, so a reopened window gets its open animation (P2-215).
  useEffect(() => {
    pruneDrawn(shell.wins.map((w) => w.id));
  }, [shell.wins]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (phone) return <PhoneDesk rank={rankNum as Rank} />;
  const stripH = focusMode ? STRIP_H_FOCUS : STRIP_H;
  const shelfH = focusMode ? 0 : SHELF_H;
  // The event band sits under the status strip and pushes the workspace down by the same 34 px (desktop only).
  const band = bannerOn && shell.vp.w >= BP_PHONE ? EVENT_BAND_H : 0;
  // The toast column moves over the chart when a maximized Broker covers its corner (P2-088, UX stage 6).
  const brokerRect = focusWin?.app === 'broker' && focus !== null ? (proj.rects[focus] ?? null) : null;
  const toastCol = toastPlace(shell.vp, brokerRect, stripH, shelfH);
  // Shared edges exist only in the full mode (the reducer refuses a split below it).
  const tiles: Tile[] = shell.wins.flatMap((w) =>
    w.id in proj.rects && !w.filled && w.slot !== null ? [{ id: w.id, f: slotFrac(w.slot) }] : [],
  );
  const edges = mode === 'full' ? sharedEdges(tiles) : [];
  return (
    <div className="os-desktop" data-testid="os-desktop" data-layout="os">
      <Wallpaper slug={palette} idPrefix="desk" />
      <RankHardware rank={rankNum as Rank} />
      <StatusStrip />
      <EventBannerStrip />
      <div className="os-workspace" style={{ position: 'absolute', left: 0, right: 0, top: stripH + band, bottom: shelfH }}>
        {bound &&
          // The DOM order follows the window ids, not the z-order: raising a window moves its frame's stacking
          // (z-index), never its node. A node moved by a focus click would swallow the click on its own control.
          [...shell.wins]
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            .map((w) => {
              const r = proj.rects[w.id];
              if (r === undefined) return null;
              return (
                <WindowFrame
                  key={w.id}
                  win={w}
                  rect={r}
                  active={w.id === focus}
                  z={2 + shell.wins.indexOf(w)}
                  mode={mode}
                  wa={proj.wa}
                  gutter={proj.gutter}
                />
              );
            })}
        {ghosts
          .filter((g) => g.ws === shell.activeWs)
          .map((g) => (
            // A closed window fades out for 120 ms (P2-215). It is a frame with its title only: no app body, no input.
            <div
              key={g.key}
              className="os-win closing"
              aria-hidden
              data-testid="os-closing"
              style={{ position: 'absolute', left: g.rect.x, top: g.rect.y, width: g.rect.w, height: g.rect.h, pointerEvents: 'none' }}
            >
              <div className="os-tb">
                <span className="os-tb-nm">{t(APPS[g.app].titleKey)}</span>
              </div>
            </div>
          ))}
        {bound && <SplitHandles edges={edges} wa={proj.wa} />}
      </div>
      <Shelf />
      {bound && <Launcher />}
      {bound && <BellPanel />}
      {bound && <EventPanel />}
      {bound && <EventTakeover />}
      <OsToasts focusMode={focusMode} place={toastCol} />
    </div>
  );
}
