/**
 * Quay keyboard bindings (P2-100..P2-107, DECISIONS "Window-snap keys"). Pure: a key event and
 * the shell facts it needs in, a reducer intent out. No DOM and no listeners here; the browser
 * layer calls `keyIntent` and dispatches what comes back.
 *
 * Bindings match `event.code`, never `event.key`, so they work on AZERTY (P2-100). Ctrl+Alt+Arrow
 * is not used because it collides with display rotation on some drivers; snap uses Ctrl+Shift+Arrow
 * (DECISIONS). Ctrl W and Ctrl Tab are not bound in V1 (C-17: standalone and fullscreen only, dormant).
 */

import type { AppId } from './apps';
import type { CycleDir, WmAction } from './wm';

export interface KeyEvt {
  /** event.code, for example "KeyK", "Digit1", "ArrowLeft", "Period". */
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export interface KeyEnv {
  /** The focused window id, or null. */
  focused: string | null;
  /** The shelf in order (Alt+Digit opens the n-th tile). */
  shelf: readonly AppId[];
  activeWs: number;
  workspaces: number;
  /** Focus is in a text field (ticket quantity, search): only Escape is bound there (P2-101). */
  textField: boolean;
}

export type KeyIntent =
  | { kind: 'wm'; action: WmAction }
  | { kind: 'launcher' }
  | { kind: 'escape' }
  /** Alt+` cycles the windows on the active workspace (P2-102 tab fallback); Shift reverses. */
  | { kind: 'cycle'; back: boolean }
  /** Shift with the question-mark key opens the keyboard list in Settings. */
  | { kind: 'help' };

const ARROW_DIR: Readonly<Record<string, CycleDir>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** The read-only shortcut list for Settings (P2-106 remapping is Phase 8). Order is display order. */
export const SHORTCUTS: readonly { id: string; keys: string }[] = [
  { id: 'launcher', keys: 'Ctrl K' },
  { id: 'focus-mode', keys: 'Ctrl .' },
  { id: 'collapse', keys: 'Ctrl M' },
  { id: 'snap', keys: 'Ctrl Shift Arrow' },
  { id: 'workspace', keys: 'Ctrl Alt Left / Right' },
  { id: 'shelf-open', keys: 'Alt 1..9' },
  { id: 'broker', keys: 'Alt N' },
  { id: 'new-broker', keys: 'Alt Shift N' },
  { id: 'close', keys: 'Alt W' },
  { id: 'cycle', keys: 'Alt `' },
  { id: 'help', keys: '?' },
  { id: 'escape', keys: 'Esc' },
];

/**
 * The window the cycle key focuses next, among the windows on screen (bottom first, as project() orders
 * them): the bottom-most going forward (it rises to the top, so the next press reaches the next one), the one under
 * the top going back. A window the layout hides is never a target. Null when fewer than two are on screen.
 */
export function cycleTarget(visible: readonly string[], back: boolean): string | null {
  if (visible.length < 2) return null;
  return back ? visible[visible.length - 2]! : visible[0]!;
}

/**
 * The intent for a key event, or null when nothing is bound. Escape is bound everywhere; every
 * other binding is ignored while focus is in a text field.
 */
export function keyIntent(e: KeyEvt, env: KeyEnv): KeyIntent | null {
  if (e.meta) return null;
  const mods = (ctrl: boolean, shift: boolean, alt: boolean): boolean =>
    e.ctrl === ctrl && e.shift === shift && e.alt === alt;

  if (e.code === 'Escape' && mods(false, false, false)) return { kind: 'escape' };
  if (env.textField) return null;

  const focused = env.focused;

  if (e.code === 'Backquote' && e.alt && !e.ctrl) return { kind: 'cycle', back: e.shift };
  // The question mark is Shift+Slash on QWERTY and Shift+Comma on AZERTY, so both codes open the list.
  if ((e.code === 'Slash' || e.code === 'Comma') && e.shift && !e.ctrl && !e.alt) return { kind: 'help' };

  if (mods(true, false, false)) {
    if (e.code === 'KeyK') return { kind: 'launcher' };
    if (e.code === 'Period') return { kind: 'wm', action: { type: 'toggleFocusMode' } };
    if (e.code === 'KeyM' && focused !== null) return { kind: 'wm', action: { type: 'collapse', id: focused } };
    return null;
  }

  if (mods(false, false, true)) {
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) {
      const app = env.shelf[Number(digit[1]) - 1];
      return app === undefined ? null : { kind: 'wm', action: { type: 'open', app } };
    }
    // Alt N puts the selected ticker in the focused Broker (or focuses the Broker that shows it): no window opens by accident.
    if (e.code === 'KeyN') return { kind: 'wm', action: { type: 'open', app: 'broker' } };
    // Alt W closes the focused window: Ctrl W is reserved for the browser (C-17, Alt W is the V1 path).
    if (e.code === 'KeyW' && focused !== null) return { kind: 'wm', action: { type: 'close', id: focused } };
    return null;
  }

  // Alt Shift N is the explicit new Broker window (a second window of the same ticker is allowed).
  if (mods(false, true, true)) {
    if (e.code === 'KeyN') return { kind: 'wm', action: { type: 'open', app: 'broker', fresh: true } };
    return null;
  }

  if (mods(true, false, true)) {
    if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return null;
    const ws = env.activeWs + (e.code === 'ArrowRight' ? 1 : -1);
    if (ws < 0 || ws >= env.workspaces) return null;
    return { kind: 'wm', action: { type: 'switchWs', ws } };
  }

  if (mods(true, true, false)) {
    const dir = ARROW_DIR[e.code];
    if (dir === undefined || focused === null) return null;
    return { kind: 'wm', action: { type: 'snapCycle', id: focused, dir } };
  }

  return null;
}
