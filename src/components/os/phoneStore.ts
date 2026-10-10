'use client';

// The phone's client state (P2-135..P2-137, P2-114, P2-162): the running-app stack and the app on screen.
// Opening an app pushes a history entry, so the browser Back and the app bar's chevron go back one app,
// and Back from the first app returns home. Each entry carries the app and its props (never a holding).
// The stack is unsaved: it lives in this store for the session (P2-135).
import { create } from 'zustand';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { APPS, type AppId, type WinProps, cleanProps, isAppId } from '@/shell/apps';
import { PHONE_HOME, type PhoneState, phoneCanOpen, phoneClose, phoneHome, phonePath, phoneShow } from '@/shell/phone';
import { notify, useShell } from './shellStore';

interface PhoneStore extends PhoneState {
  /** The Recent sheet is open (P2-155). */
  recentOpen: boolean;
  /** The game tick the Wire was last opened on. Recent counts the news since then (P2-159). */
  wireSeen: number;
  /** The player has closed a Recent entry this session, so the swipe hint goes (V:165). */
  closedOnce: boolean;
}

export const usePhone = create<PhoneStore>(() => ({ ...PHONE_HOME, recentOpen: false, wireSeen: 0, closedOnce: false }));

/** The phone layout is in force below 768 px (DECISIONS, PHONE_MAX). Read at call time, never stale. */
export function isPhoneViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/** What a history entry carries: the app and its props, or null for home. */
interface PhoneHistory {
  tgPhone: { app: AppId; props: WinProps } | null;
}

/** The current URL with the query flags kept (?e2e, ?seed, ?fresh...), plus the path's own ticker or file. */
function urlFor(path: string): string {
  const [base, own] = path.split('?');
  const sp = new URLSearchParams(window.location.search);
  if (own) for (const [k, v] of new URLSearchParams(own)) sp.set(k, v);
  const s = sp.toString();
  return s ? `${base}?${s}` : (base ?? '/');
}

function writeHistory(app: AppId | null, props: WinProps, push: boolean): void {
  if (typeof window === 'undefined') return;
  const state: PhoneHistory = { tgPhone: app === null ? null : { app, props } };
  const url = urlFor(app === null ? '/' : phonePath(app, props));
  if (push) window.history.pushState(state, '', url);
  else window.history.replaceState(state, '', url);
}

const nowTick = (): number => useGame.getState().frame?.tick ?? 0;

/**
 * Opens an app on the phone. A locked app never opens: the tip names the rank (P2-023, P2-115). A
 * deep link or a history step calls this with push false, so it replaces the entry rather than adding one.
 */
export function phoneOpen(app: AppId, props: WinProps = {}, push = true): boolean {
  const verdict = phoneCanOpen(app, useShell.getState().ctx.unlocked);
  if (verdict === 'unavailable') {
    notify(t('shell.comingLater'));
    return false;
  }
  if (verdict === 'locked') {
    const rank = APPS[app].minRank ?? 'R0';
    notify(t('shell.locked.tip', { app: t(APPS[app].titleKey), rank: t(`rank.${rank}`) }));
    return false;
  }
  const tick = nowTick();
  usePhone.setState({ ...phoneShow(usePhone.getState(), app, props, tick), recentOpen: false, ...(app === 'wire' ? { wireSeen: tick } : {}) });
  writeHistory(app, props, push);
  return true;
}

/** Shows home. The stack keeps its order (P2-136). The history entry becomes home, so Back does not stack up. */
export function phoneGoHome(): void {
  usePhone.setState((s) => ({ ...phoneHome(s), recentOpen: false }));
  writeHistory(null, {}, false);
}

/** The app bar's chevron and Android Back: one step back through the history (P2-114). */
export function phoneBack(): void {
  if (typeof window === 'undefined') return;
  if (window.history.state && (window.history.state as PhoneHistory).tgPhone) window.history.back();
  else phoneGoHome();
}

/** Recent's swipe to close. The app's state is kept; only its running entry goes (P2-163). */
export function phoneCloseApp(app: AppId): void {
  const before = usePhone.getState().current;
  usePhone.setState((s) => ({ ...phoneClose(s, app), closedOnce: true }));
  if (before === app) writeHistory(null, {}, false);
}

export function setRecentOpen(open: boolean): void {
  usePhone.setState({ recentOpen: open });
}

/** A browser Back or Forward: the entry says which app to show (the stack keeps its order). */
export function onPhonePop(e: PopStateEvent): void {
  const raw = (e.state as PhoneHistory | null)?.tgPhone ?? null;
  if (raw === null || !isAppId(raw.app)) {
    usePhone.setState((s) => ({ ...phoneHome(s), recentOpen: false }));
    return;
  }
  const props = cleanProps(raw.app, raw.props) ?? {};
  if (phoneCanOpen(raw.app, useShell.getState().ctx.unlocked) !== 'ok') {
    usePhone.setState((s) => ({ ...phoneHome(s), recentOpen: false }));
    return;
  }
  usePhone.setState({ ...phoneShow(usePhone.getState(), raw.app, props, nowTick()), recentOpen: false });
}
