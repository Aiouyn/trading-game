'use client';

// The desktop's client state (DECISIONS "Module purity", P2-006, P2-125). One zustand store runs the
// pure reducer from src/shell. It takes the earned rank and the viewport from outside, persists each
// settled change to tg-prefs under the save id, and never touches the engine.

import { create } from 'zustand';
import { t } from '@/i18n';
import { knownSeries, useGame } from '@/game/store';
import { APPS, MAX_BROKERS, type AppId, type WinProps } from '@/shell/apps';
import { makeWmCtx } from '@/shell/ctx';
import { type KeyValueStore, loadShell, readPrefs, saveShell, updatePrefs } from '@/shell/prefs';
import { createShellStore } from '@/shell/store';
import { BP_PHONE, type Rect } from '@/shell/geometry';
import { type ShellState, type WmAction, type WmReason, type WmResult, focusedId, initialShell, normalize, project } from '@/shell/wm';
import { DEFAULT_PALETTE, type PaletteSlug, applyPalette, isPaletteSlug, readPalette } from './palette';
import { bannerBand, selectEventBanner } from './eventSelect';

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
    // Recent is this save's own and this session's only: never another save's (T:101).
    useRecent.setState({ items: [] });
    return;
  }
  if (!sameRank) {
    store.setCtx(ctx);
    store.replace(normalize(store.shell, ctx));
    persist(useShell.getState().shell);
  }
}

/**
 * The strip the world event banner takes under the status strip right now (0 when none). The windows lay out
 * above it, so the viewport the shell sees is the window height less this band (velvet-world-events.md section 3).
 */
export function currentBand(): number {
  const g = useGame.getState();
  const banner = selectEventBanner(g.frame?.worldEvent ?? null, g.wire, g.frame?.tick ?? 0, g.world?.config.ticksPerDay ?? 720);
  return bannerBand(banner, window.innerWidth, BP_PHONE);
}

/** Keeps the shell's viewport in step with the window size. Not persisted (P2-125). */
export function syncViewport(): void {
  useShell.getState().dispatch({ type: 'viewport', w: window.innerWidth, h: window.innerHeight - currentBand() }, { settled: false });
}

/** Window motion (P2-215): open 220 ms, close 120 ms. Reduced motion zeroes the CSS animation (P2-220). */
export const WIN_OPEN_MS = 220;
export const WIN_CLOSE_MS = 120;

/** A closed window kept on screen for the close animation. It is drawn as a frame only, never with its app body. */
export interface Ghost {
  key: string;
  id: string;
  app: AppId;
  ws: number;
  rect: Rect;
}
export const useGhosts = create<{ list: Ghost[] }>(() => ({ list: [] }));
let ghostSeq = 0;

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
  mode: () => t('shell.refuse.mode'),
  instance: () => t('shell.refuse.instance'),
  'too-small': () => t('shell.refuse.small'),
  'layout-cap': () => t('shell.refuse.cap'),
  empty: () => t('shell.refuse.empty'),
  'no-layout': () => t('shell.refuse.noLayout'),
  'bad-name': () => t('shell.refuse.name'),
  reserved: () => t('shell.refuse.reserved'),
};

/** The words a refused action shows, or null when the refusal is silent by design. */
export function refusalText(reason: WmReason): string | null {
  const f = REFUSAL_TEXT[reason];
  return f ? f() : null;
}

/** The window id whose close prompt is showing (P2-030). Shared, so the button and Alt W ask the same way. */
export const useCloseAsk = create<{ id: string | null }>(() => ({ id: null }));

/** The window a keyboard or launcher open should focus once it is on screen (the frame takes DOM focus). */
export const useFocusHint = create<{ id: string | null }>(() => ({ id: null }));

/** Apps and tickers opened this session, most recent first. Session memory only: never in a save. */
export interface RecentRef {
  app: AppId;
  ticker?: string;
}
export const useRecent = create<{ items: RecentRef[] }>(() => ({ items: [] }));
const RECENT_MAX = 6;

function noteRecent(ref: RecentRef): void {
  const rest = useRecent.getState().items.filter((x) => !(x.app === ref.app && x.ticker === ref.ticker));
  useRecent.setState({ items: [ref, ...rest].slice(0, RECENT_MAX) });
}

/** The launcher panel: open, its query and the highlighted row (P2-075). */
export const useLauncher = create<{ open: boolean; query: string; active: number }>(() => ({
  open: false,
  query: '',
  active: 0,
}));

/** The element that had focus before the launcher opened. Closing returns focus there (P2-235). */
let launcherReturn: Element | null = null;

export function openLauncher(): void {
  if (useLauncher.getState().open) return;
  launcherReturn = typeof document === 'undefined' ? null : document.activeElement;
  useLauncher.setState({ open: true, query: '', active: 0 });
}

/** Closes the launcher. `restore` false when the close is followed by opening a window that takes focus. */
export function closeLauncher(restore = true): void {
  const back = launcherReturn;
  launcherReturn = null;
  useLauncher.setState({ open: false, query: '', active: 0 });
  if (restore && back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
}

/** The shelf's layout menu (Trade, Review, Research, saved layouts, save). */
export const useLayoutMenu = create<{ open: boolean }>(() => ({ open: false }));

/** Applies a built-in layout on the active workspace. A refusal says why; a layout never orders anything. */
export function applyNamedLayout(name: 'trade' | 'review' | 'research' | string, ticker: string): void {
  const r = dispatchWm({ type: 'applyLayout', name, ticker });
  if (!r.ok) {
    const text = refusalText(r.reason);
    if (text) notify(text, 'warn');
  }
}

/** Runs a launcher command (P2-077). Pause and speed need a clock control the world does not have yet. */
export function runCommand(cmd: 'trade' | 'review' | 'research' | 'focus' | 'new-broker', ticker: string): void {
  if (cmd === 'focus') {
    dispatchWm({ type: 'toggleFocusMode' });
    return;
  }
  if (cmd === 'new-broker') {
    openApp('broker', { ticker }, { focus: true, fresh: true });
    return;
  }
  applyNamedLayout(cmd, ticker);
}

/**
 * Closes a window. A Broker with a pending order returns "confirm": the window shows the prompt
 * and the close goes through only when the player answers yes (P2-030). The order is never touched.
 */
export function closeWindow(id: string, force = false): void {
  const before = useShell.getState().shell;
  const r = dispatchWm({ type: 'close', id, force });
  if (r.ok) {
    if (useCloseAsk.getState().id === id) useCloseAsk.setState({ id: null });
    const w = before.wins.find((x) => x.id === id);
    const rect = project(before).rects[id];
    if (w !== undefined && rect !== undefined) {
      const key = `${id}-${++ghostSeq}`;
      useGhosts.setState((s) => ({ list: [...s.list, { key, id, app: w.app, ws: w.ws, rect }] }));
      window.setTimeout(() => useGhosts.setState((s) => ({ list: s.list.filter((g) => g.key !== key) })), WIN_CLOSE_MS);
    }
    return;
  }
  if (r.reason === 'confirm') useCloseAsk.setState({ id });
}

export interface OpenOpts {
  /** Move DOM focus into the window once it is on screen. Keyboard, shelf and launcher opens do; a screen call does not. */
  focus?: boolean;
  /** A Broker always opens a new window, even when one already shows the ticker (P2-078, New Broker). */
  fresh?: boolean;
}

/** Opens an app, or focuses the window that holds it. A refusal shows a toast, never a silent no-op. */
export function openApp(app: AppId, props: WinProps = {}, opts: OpenOpts = {}): void {
  if (!APPS[app].available) {
    notify(t('shell.comingLater'));
    return;
  }
  let p = props;
  // A ticker that is not in this universe never reaches a chart (P2-117): the Broker opens on the current one.
  if (app === 'broker' && props.ticker !== undefined && !knownSeries(useGame.getState().config, props.ticker)) {
    notify(t('shell.ticker.unknown', { ticker: props.ticker }), 'warn');
    p = { ticker: useGame.getState().selected };
  }
  // At the Broker cap a plain open of a new ticker hands the least-recently-focused Broker that ticker. That
  // window is not the one the player is in, so the change is announced.
  const brokers = useShell.getState().shell.wins.filter((w) => w.app === 'broker');
  const retargets = app === 'broker' && opts.fresh !== true && p.ticker !== undefined
    && brokers.length >= MAX_BROKERS && !brokers.some((w) => w.props.ticker === p.ticker);
  const r = dispatchWm({ type: 'open', app, props: p, fresh: opts.fresh === true });
  if (!r.ok) {
    const text = app === 'broker' && r.reason === 'instance' ? t('broker.cap', { n: MAX_BROKERS }) : refusalText(r.reason);
    if (text) notify(text, 'warn');
    return;
  }
  if (retargets) notify(t('broker.cap.retarget', { n: MAX_BROKERS, ticker: p.ticker! }), 'info');
  const id = focusedId(r.state);
  const w = r.state.wins.find((x) => x.id === id);
  if (w !== undefined) noteRecent({ app: w.app, ticker: w.props.ticker });
  if (opts.focus) useFocusHint.setState({ id: id ?? null });
}

/**
 * Focuses the top-most window of an app that is open, or opens one. A notice's click uses this, so a
 * fill focuses the Broker that holds it rather than opening another.
 */
export function focusOrOpen(app: AppId): void {
  const w = [...useShell.getState().shell.wins].reverse().find((x) => x.app === app);
  if (w !== undefined) {
    dispatchWm({ type: 'focus', id: w.id });
    useFocusHint.setState({ id: w.id });
    return;
  }
  openApp(app, app === 'broker' ? { ticker: useGame.getState().selected } : {}, { focus: true });
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

// ---------------------------------------------------------------- motion

interface MotionStore {
  /** The device choice (Settings > Reduce motion). null means the system setting decides. */
  reduced: boolean | null;
  setReduced: (v: boolean) => void;
}

/** Writes the choice onto <html>. Only an explicit "on" is marked; the system query covers the rest (P2-220). */
function applyMotion(reduced: boolean | null): void {
  const html = document.documentElement;
  if (reduced === true) html.dataset.motion = 'reduce';
  else delete html.dataset.motion;
}

/** Reduce motion on this device. A change is saved to tg-prefs and applies at once, with no reload. */
export const useMotion = create<MotionStore>((set) => ({
  reduced: null,
  setReduced(v) {
    updatePrefs(browserKv(), (p) => ({ ...p, reducedMotion: v }));
    applyMotion(v);
    set({ reduced: v });
  },
}));

/** Reads the saved motion choice onto <html>. Called once when the shell mounts. */
export function loadMotion(): void {
  const v = readPrefs(browserKv()).reducedMotion;
  applyMotion(v);
  useMotion.setState({ reduced: v });
}
