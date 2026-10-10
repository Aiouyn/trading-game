/**
 * Phone app stack (P2-135..P2-137, P2-162, P2-163, P2-169). Pure: no React, no DOM, no clock. The
 * phone keeps no layout in the save. It keeps this unsaved stack of running apps, most recent first,
 * and which app is on screen. The stack holds at most six entries. A stack entry is one app, so the
 * Recent rows are one per app (`recents-row-<app>`).
 */

import { type AppId, type WinProps, APPS } from './apps';

export const PHONE_STACK_MAX = 6;

export interface PhoneEntry {
  app: AppId;
  props: WinProps;
  /** The game tick the app was last opened on. Recent shows it as a clock time or a day. */
  tick: number;
}

export interface PhoneState {
  /** Most recent first. */
  stack: PhoneEntry[];
  /** The app on screen, or null for home. */
  current: AppId | null;
}

export const PHONE_HOME: PhoneState = { stack: [], current: null };

/** Opens an app on top of the stack (or moves it there), and shows it. A new app past the cap drops the oldest. */
export function phoneShow(s: PhoneState, app: AppId, props: WinProps, tick: number): PhoneState {
  const rest = s.stack.filter((e) => e.app !== app);
  return { stack: [{ app, props, tick }, ...rest].slice(0, PHONE_STACK_MAX), current: app };
}

/** Shows home. The stack keeps its order and its entries (P2-136). */
export function phoneHome(s: PhoneState): PhoneState {
  return s.current === null ? s : { ...s, current: null };
}

/** Removes one app from the stack (Recent's swipe to close, P2-163). Closing the visible app shows home. */
export function phoneClose(s: PhoneState, app: AppId): PhoneState {
  const stack = s.stack.filter((e) => e.app !== app);
  return { stack, current: s.current === app ? null : s.current };
}

/** The entry for an app, if it is running. */
export function phoneEntry(s: PhoneState, app: AppId): PhoneEntry | undefined {
  return s.stack.find((e) => e.app === app);
}

/**
 * Why a phone open is refused. A locked app never opens (P2-023, P2-115). `unlocked` comes from ctx.ts,
 * so this module reads no rank content itself.
 */
export function phoneCanOpen(app: AppId, unlocked: (app: AppId) => boolean): 'ok' | 'locked' | 'unavailable' {
  if (!APPS[app].available) return 'unavailable';
  return unlocked(app) ? 'ok' : 'locked';
}

/**
 * The URL path for a phone app (P2-111, P2-114). Opening an app pushes this path, so Back returns home.
 * Tickers ride in the query (P2-112), and the same parser reads them back.
 */
export function phonePath(app: AppId, props: WinProps): string {
  if (app === 'broker' && props.ticker !== undefined) return `/broker?t=${encodeURIComponent(props.ticker)}`;
  if (app === 'research' && props.fileId !== undefined) return `/research?file=${encodeURIComponent(props.fileId)}`;
  if (app === 'portfolio' && props.view !== undefined) return `/portfolio/${encodeURIComponent(props.view)}`;
  return `/${app}`;
}
