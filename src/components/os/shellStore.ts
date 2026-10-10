'use client';

// The desktop's client state (DECISIONS "Module purity", P2-006, P2-125). One zustand store runs the
// pure reducer from src/shell. It takes the earned rank and the viewport from outside, persists each
// settled change to tg-prefs under the save id, and never touches the engine.

import { create } from 'zustand';
import { t } from '@/i18n';
import { useGame } from '@/game/store';
import { APPS, type AppId, type WinProps } from '@/shell/apps';
import { makeWmCtx } from '@/shell/ctx';
import { type KeyValueStore, loadShell, saveShell, updatePrefs } from '@/shell/prefs';
import { createShellStore } from '@/shell/store';
import { type ShellState, type WmAction, type WmReason, type WmResult, initialShell, normalize } from '@/shell/wm';
import { DEFAULT_PALETTE, type PaletteSlug, applyPalette, isPaletteSlug, readPalette } from './palette';

const INIT_VP = { w: 1440, h: 900 };

/** localStorage as a KeyValueStore. Blocked storage gives null reads and no writes, never a throw. */
export function browserKv(): KeyValueStore {
  return {
    getItem: (k) => {
      try { return window.localStorage.getItem(k); } catch { return null; }
    },
    setItem: (k, v) => {
      try { window.localStorage.setItem(k, v); } catch { /* blocked: the in-memory state still works */ }
    },
    removeItem: (k) => {
      try { window.localStorage.removeItem(k); } catch { /* blocked */ }
    },
  };
}

/** A Broker with an unsent or open order on this ticker (V:120). Read at call time, so it is never stale. */
export function hasPendingOrder(ticker: string): boolean {
  const me = useGame.getState().me;
  return me !== null && me.orders.some((o) => o.assetId === ticker && o.status === 'open');
}

let boundId: string | null = null;

/** Whether the shell is bound to a save yet. The desktop draws its windows only after this. */
export const useBinding = create<{ saveId: string | null }>(() => ({ saveId: null }));
let boundRank: string | null = null;

function persist(s: ShellState): void {
  if (boundId !== null) saveShell(browserKv(), boundId, s);
}

const initCtx = makeWmCtx('R0', hasPendingOrder);

export const useShell = createShellStore(
  { shell: initialShell(INIT_VP, initCtx), ctx: initCtx },
  { onSettled: persist },
);

/**
 * Binds the shell to a save and its earned rank. A new save loads its stored shell (or the Trade
 * layout). A rank change rebuilds the context and normalizes the shell, so locked windows drop and
 * workspaces follow the rank (P2-029).
 */
export function bindShell(id: string, rank: string, vp: { w: number; h: number }, ticker: string): void {
  const ctx = makeWmCtx(rank, hasPendingOrder);
  const sameSave = boundId === id;
  const sameRank = boundRank === rank;
  boundId = id;
  boundRank = rank;
  useBinding.setState({ saveId: id });
  const store = useShell.getState();
  if (!sameSave) {
    store.setCtx(ctx);
    store.replace(loadShell(browserKv(), id, ctx, vp, ticker));
    return;
  }
  if (!sameRank) {
    store.setCtx(ctx);
    store.replace(normalize(store.shell, ctx));
    persist(useShell.getState().shell);
  }
}

/** Keeps the shell's viewport in step with the window size. Not persisted (P2-125). */
export function syncViewport(): void {
  useShell.getState().dispatch({ type: 'viewport', w: window.innerWidth, h: window.innerHeight }, { settled: false });
}

/** Shows a short message in the toast column. */
export function notify(text: string, tone: 'gain' | 'loss' | 'warn' | 'info' | 'brass' = 'info'): void {
  useGame.getState().toast({ tone, text });
}

/** Runs one reducer action. Settled by default, so the change is saved (P2-125). */
export function dispatchWm(action: WmAction, settled = true): WmResult {
  return useShell.getState().dispatch(action, { settled });
}

const REFUSAL_TEXT: Partial<Record<WmReason, () => string>> = {
  locked: () => t('shell.locked'),
  unavailable: () => t('shell.comingLater'),
};

/** Opens an app, or focuses the window that holds it. A refusal shows a toast, never a silent no-op. */
export function openApp(app: AppId, props: WinProps = {}): void {
  if (!APPS[app].available) {
    notify(t('shell.comingLater'));
    return;
  }
  const r = dispatchWm({ type: 'open', app, props });
  if (!r.ok) {
    const text = REFUSAL_TEXT[r.reason];
    if (text) notify(text(), 'warn');
  }
}

// ---------------------------------------------------------------- palette

interface PaletteStore {
  palette: PaletteSlug;
  setPalette: (p: PaletteSlug) => void;
}

/** The palette on this device. It changes token values only (P2-181); the wallpaper art follows it. */
export const usePalette = create<PaletteStore>((set) => ({
  palette: DEFAULT_PALETTE,
  setPalette(palette) {
    if (!isPaletteSlug(palette)) return;
    updatePrefs(browserKv(), (p) => ({ ...p, palette }));
    applyPalette(palette, document.documentElement);
    set({ palette });
  },
}));

/** Reads the saved palette into the store and onto <html>. Called once when the shell mounts. */
export function loadPalette(): void {
  const p = readPalette();
  applyPalette(p, document.documentElement);
  usePalette.setState({ palette: p });
}
