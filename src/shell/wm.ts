/**
 * Quay window manager (F:23-62, V:48-76, DECISIONS "Behaviour gaps", "Module purity"). A pure
 * reducer: (state, action, ctx) -> WmResult. No React, no DOM, no clock, no store, no orders.
 * It imports only apps.ts and geometry.ts. Built-in layout plans come in through `ctx.plan`
 * (wired to layouts.ts by ctx.ts), so this module never reads layout tables.
 *
 * Rules the reducer keeps:
 *   - z-order is array order, last = top. Focus is derived: the top open window on activeWs.
 *   - a snapped window stores its slot; its rect is derived. A free window stores its last rect.
 *   - the stored state never changes with the viewport. `project` derives what is shown, so a
 *     layout saved at 1440 px comes back exactly when the viewport grows back (P2-060).
 *   - focus mode is per workspace: `focusWs` lists the workspaces in focus mode.
 *   - a refused action returns { ok: false, reason } and leaves the caller's state untouched.
 */

import {
  APPS,
  WORKSPACE_DEFAULT_APP,
  MAX_BROKERS,
  MAX_CUSTOM_LAYOUTS,
  MAX_LAYOUT_NAME,
  SHELF_ORDER,
  type AppId,
  type BuiltinLayout,
  type WinProps,
  cleanProps,
  isAppId,
  isBuiltinLayout,
  secondWindowReady,
} from './apps';
import {
  FULL_FRAC,
  SLOT_FRAC,
  type LayoutMode,
  type Rect,
  type Size,
  type Slot,
  type SlotName,
  clampRect,
  fitsMin,
  fracOfRect,
  fracToRect,
  gutterFor,
  isSlotName,
  layoutMode,
  nearestSlot,
  openRect,
  sideOfFrac,
  slotAllowedInMode,
  slotFrac,
  tileSlots,
  workArea,
} from './geometry';

export interface Win {
  /** Stable id: broker-<n>, research-<fileId>, portfolio-2 (Review), or the app id. */
  id: string;
  app: AppId;
  ws: number;
  /** Last free rect, relative to the work area. Used when `slot` is null. */
  rect: Rect;
  slot: Slot | null;
  state: 'open' | 'collapsed';
  filled: boolean;
  props: WinProps;
}

/** One window a built-in plan asks for. Built-in plans never carry a rect. */
export interface Placement {
  app: AppId;
  props: WinProps;
  slot: Slot | null;
  rect: Rect | null;
  filled: boolean;
  /** The second Portfolio window of Review (C-27, journal view). */
  second: boolean;
}

export interface LayoutEntry {
  app: AppId;
  slot: Slot | null;
  rect: Rect;
  props: WinProps;
  /** The second Portfolio window (Review). */
  second?: boolean;
}

export interface SavedLayout {
  name: string;
  wins: LayoutEntry[];
}

/** A window's placement when its workspace entered focus mode (P2-028). */
export interface Snapshot {
  ws: number;
  rect: Rect;
  slot: Slot | null;
  filled: boolean;
}

export interface ShellState {
  v: 1;
  wins: Win[];
  activeWs: number;
  /** Workspaces in focus mode, ascending. Focus mode is per workspace (DECISIONS "Behaviour gaps"). */
  focusWs: number[];
  /**
   * Snapshot of each window on a focused workspace, keyed by window id. Null when no workspace
   * is focused, or when none of the focused workspaces had windows.
   */
  focusRestore: Record<string, Snapshot> | null;
  /** Custom layouts, at most MAX_CUSTOM_LAYOUTS. Built-ins are not stored. */
  layouts: SavedLayout[];
  /** Shelf order. Broker stays first. Hidden apps are absent. */
  shelf: AppId[];
  vp: Size;
  /** Cosmetic shell look (C-28). Never gates anything. */
  look?: string;
}

/** What the reducer needs from outside. Built from the earned rank by ctx.ts. */
export interface WmCtx {
  /** Rank gate for an app (ctx.ts). */
  unlocked(app: AppId): boolean;
  /** Workspace count from the earned rank (F:60). */
  workspaces: number;
  /** A Broker with an unsent or pending order on this ticker (V:120). */
  hasPendingOrder(ticker: string): boolean;
  /**
   * Plans a built-in layout for a viewport (layouts.ts, wired by ctx.ts). Pure: a function of the
   * viewport, the unlocked apps and the options. The reducer never reads the layout tables.
   */
  plan(name: BuiltinLayout, vp: Size, opts: { ticker?: string; fileId?: string }): Placement[];
}

export type WmReason =
  | 'locked'
  | 'unavailable'
  | 'bad-props'
  | 'no-window'
  | 'confirm'
  | 'mode'
  | 'too-small'
  | 'too-large'
  | 'bad-rect'
  | 'bad-edge'
  | 'bad-slot'
  | 'no-workspace'
  | 'no-layout'
  | 'bad-name'
  | 'reserved'
  | 'layout-cap'
  | 'empty'
  | 'bad-order'
  | 'broker-first'
  | 'bad-size'
  | 'instance';

export type WmResult = { ok: true; state: ShellState } | { ok: false; reason: WmReason };

export type CycleDir = 'left' | 'right' | 'up' | 'down';

export type WmAction =
  /** fresh: a Broker opens a new window even when one already shows this ticker (launcher Shift+Enter, New Broker). */
  | { type: 'open'; app: AppId; props?: unknown; fresh?: boolean }
  | { type: 'focus'; id: string }
  | { type: 'close'; id: string; force?: boolean }
  | { type: 'collapse'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'fill'; id: string }
  | { type: 'snap'; id: string; slot: SlotName }
  | { type: 'snapCycle'; id: string; dir: CycleDir }
  | { type: 'unsnap'; id: string }
  | { type: 'move'; id: string; rect: Rect }
  | { type: 'resize'; id: string; rect: Rect }
  | { type: 'splitEdge'; a: string; b: string; axis: 'x' | 'y'; at: number }
  | { type: 'applyLayout'; name: string; ticker?: string }
  | { type: 'saveLayout'; name: string }
  | { type: 'switchWs'; ws: number }
  | { type: 'moveToWs'; id: string; ws: number }
  | { type: 'focusMode'; on: boolean }
  | { type: 'toggleFocusMode' }
  | { type: 'viewport'; w: number; h: number }
  | { type: 'reorderShelf'; order: AppId[] };

/** What is shown: rects for the windows on the active workspace, in z-order. */
export interface Projection {
  mode: LayoutMode;
  wa: Size;
  gutter: number;
  rects: Record<string, Rect>;
  order: string[];
}

const ok = (state: ShellState): WmResult => ({ ok: true, state });
const fail = (reason: WmReason): WmResult => ({ ok: false, reason });

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const finite = (n: number): boolean => typeof n === 'number' && Number.isFinite(n);
const isWsIndex = (ws: number, ctx: WmCtx): boolean => Number.isInteger(ws) && ws >= 0 && ws < ctx.workspaces;

/** The shelf and the default layout at first run: the table order. */
export function defaultShelf(): AppId[] {
  return [...SHELF_ORDER];
}

// ---------------------------------------------------------------- derived state

/** The focused window: the top-most open window on the active workspace. */
export function focusedId(state: ShellState): string | null {
  for (let i = state.wins.length - 1; i >= 0; i--) {
    const w = state.wins[i]!;
    if (w.ws === state.activeWs && w.state === 'open') return w.id;
  }
  return null;
}

/** Whether a workspace (the active one by default) is in focus mode. */
export function isFocused(state: ShellState, ws: number = state.activeWs): boolean {
  return state.focusWs.includes(ws);
}

function sideOfWin(w: Win, wa: Size): 'L' | 'R' {
  if (w.slot !== null) return sideOfFrac(slotFrac(w.slot));
  return sideOfFrac(fracOfRect(w.rect, wa));
}

function placeFull(w: Win, wa: Size, g: number): Rect {
  if (w.filled) return fracToRect(FULL_FRAC, wa, g);
  if (w.slot !== null) return fracToRect(slotFrac(w.slot), wa, g);
  const def = APPS[w.app];
  if (w.rect.w > wa.w || w.rect.h > wa.h) return fracToRect(FULL_FRAC, wa, g);
  const r = clampRect(w.rect, wa);
  if (fitsMin(def, r)) return r;
  // F rule 4: a free window under its minimum after clamping re-snaps to the nearest slot.
  const near = nearestSlot(r, wa, g, def, 'full');
  return near ? fracToRect(SLOT_FRAC[near], wa, g) : fracToRect(FULL_FRAC, wa, g);
}

/**
 * Derives what is shown. Phone has no layout. Single mode fills the top window. Halves mode
 * shows the top window on each side (or the top filled one). Full mode places every window.
 * Collapsed windows and other workspaces are not shown.
 */
export function project(state: ShellState): Projection {
  const mode = layoutMode(state.vp.w);
  const foc = isFocused(state);
  const wa = workArea(state.vp, foc);
  const g = gutterFor(foc);
  const rects: Record<string, Rect> = {};
  const on = state.wins.filter((w) => w.ws === state.activeWs && w.state === 'open');
  if (mode === 'phone' || on.length === 0) return { mode, wa, gutter: g, rects, order: [] };

  if (mode === 'single') {
    rects[on[on.length - 1]!.id] = fracToRect(FULL_FRAC, wa, g);
  } else if (mode === 'halves') {
    // The top-most window decides: a filled top window fills, so a window opened on top is always shown.
    const top = on[on.length - 1]!;
    if (top.filled) {
      rects[top.id] = fracToRect(FULL_FRAC, wa, g);
    } else {
      const pick: Partial<Record<'L' | 'R', Win>> = {};
      for (const w of [...on].reverse()) {
        const side = sideOfWin(w, wa);
        if (!pick[side]) pick[side] = w;
      }
      if (pick.L) rects[pick.L.id] = fracToRect(SLOT_FRAC.L2, wa, g);
      if (pick.R) rects[pick.R.id] = fracToRect(SLOT_FRAC.R2, wa, g);
    }
  } else {
    for (const w of on) rects[w.id] = placeFull(w, wa, g);
  }
  return { mode, wa, gutter: g, rects, order: on.map((w) => w.id).filter((id) => hasOwn(rects, id)) };
}

// ---------------------------------------------------------------- helpers

function raise(wins: Win[], id: string, patch?: Partial<Win>): Win[] {
  const i = wins.findIndex((w) => w.id === id);
  if (i < 0) return wins;
  const w = patch ? { ...wins[i]!, ...patch } : wins[i]!;
  return [...wins.slice(0, i), ...wins.slice(i + 1), w];
}

function patchWin(wins: Win[], id: string, patch: Partial<Win>): Win[] {
  return wins.map((w) => (w.id === id ? { ...w, ...patch } : w));
}

/** The snapshot map without one window's entry. Null when nothing is left. */
function snapWithout(snap: Record<string, Snapshot> | null, id: string): Record<string, Snapshot> | null {
  if (snap === null || !hasOwn(snap, id)) return snap;
  const rest: Record<string, Snapshot> = {};
  for (const k of Object.keys(snap)) if (k !== id) rest[k] = snap[k]!;
  return Object.keys(rest).length > 0 ? rest : null;
}

/** Leaves focus mode on one workspace: restores its windows exactly, then drops its snapshot. */
function exitFocus(state: ShellState, ws: number): ShellState {
  if (!state.focusWs.includes(ws)) return state;
  const snap = state.focusRestore ?? {};
  const wins = state.wins.map((w) => {
    if (!hasOwn(snap, w.id)) return w;
    const s = snap[w.id]!;
    if (s.ws !== ws) return w;
    return { ...w, rect: s.rect, slot: s.slot, filled: s.filled };
  });
  const rest: Record<string, Snapshot> = {};
  for (const k of Object.keys(snap)) if (snap[k]!.ws !== ws) rest[k] = snap[k]!;
  return {
    ...state,
    wins,
    focusWs: state.focusWs.filter((x) => x !== ws),
    focusRestore: Object.keys(rest).length > 0 ? rest : null,
  };
}

/** Enters focus mode on one workspace (F:59): snapshots its windows, then slots an unsnapped one. */
function enterFocus(state: ShellState, ws: number): ShellState {
  if (state.focusWs.includes(ws)) return state;
  const snap: Record<string, Snapshot> = { ...(state.focusRestore ?? {}) };
  for (const w of state.wins) {
    if (w.ws === ws) snap[w.id] = { ws, rect: w.rect, slot: w.slot, filled: w.filled };
  }
  let wins = state.wins;
  const here = wins.filter((w) => w.ws === ws && w.state === 'open');
  // An unsnapped workspace takes the Trade slots for the windows already open here (F:59).
  // No window is opened, so leaving focus mode restores the same set of windows.
  if (here.length > 0 && !here.some((w) => w.slot !== null) && layoutMode(state.vp.w) === 'full') {
    const wa = workArea(state.vp, true);
    const topBroker = [...here].reverse().find((w) => w.app === 'broker')?.id;
    wins = wins.map((w) => {
      if (w.ws !== ws || w.state !== 'open') return w;
      let slot: SlotName | null = null;
      if (w.app === 'broker') slot = w.id === topBroker ? 'L23' : null;
      else if (w.app === 'wire') slot = 'R3T';
      else if (w.app === 'portfolio') slot = 'R3B';
      if (slot === null || !fitsMin(APPS[w.app], fracToRect(SLOT_FRAC[slot], wa, 1))) return w;
      return { ...w, slot, filled: false };
    });
  }
  return {
    ...state,
    wins,
    focusWs: [...state.focusWs, ws].sort((a, b) => a - b),
    focusRestore: Object.keys(snap).length > 0 ? snap : null,
  };
}

/** Focuses a window: switches to its workspace, restores it if collapsed, and raises it. */
function focusId(state: ShellState, id: string): ShellState {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return state;
  const s = w.ws === state.activeWs ? state : { ...state, activeWs: w.ws };
  return { ...s, wins: raise(s.wins, id, { state: 'open' }) };
}

type Acq = { ok: true; wins: Win[]; id: string; created: boolean } | { ok: false; reason: WmReason };
const failAcq = (reason: WmReason): Acq => ({ ok: false, reason });

/**
 * A new window's free rect (Velvet window rules): the app's preferred size, centred for the first
 * open window on the workspace and cascaded by 24 px for the next ones. Counts open windows only, so
 * a collapsed window does not push the next one along.
 */
function newWin(state: ShellState, id: string, app: AppId, props: WinProps): Win {
  const wa = workArea(state.vp, false);
  const open = state.wins.filter((x) => x.ws === state.activeWs && x.state === 'open').length;
  return {
    id,
    app,
    ws: state.activeWs,
    rect: openRect(APPS[app], wa, open),
    slot: null,
    state: 'open',
    filled: false,
    props,
  };
}

/**
 * The Broker opened alone on an empty workspace (defect A): the left two thirds in the full mode, or
 * filled below 1200 px. Any other open window on the workspace leaves the new one as a free window.
 * A slot the Broker cannot fit is refused, and the free rect stays.
 */
function placeAlone(state: ShellState, id: string): ShellState {
  const alone = !state.wins.some((w) => w.id !== id && w.ws === state.activeWs && w.state === 'open');
  if (!alone) return state;
  const mode = layoutMode(state.vp.w);
  if (mode === 'full') {
    const wa = workArea(state.vp, false);
    if (!fitsMin(APPS.broker, fracToRect(SLOT_FRAC.L23, wa, gutterFor(false)))) return state;
    return { ...state, wins: patchWin(state.wins, id, { slot: 'L23', filled: false }) };
  }
  if (mode === 'halves' || mode === 'single') {
    return { ...state, wins: patchWin(state.wins, id, { filled: true }) };
  }
  return state;
}

/** The right-hand slots a Trade side panel takes, in order (UX stage 2): the whole column first, then its two halves. */
const SIDE_SLOTS: readonly SlotName[] = ['R3', 'R3T', 'R3B'];

/**
 * Trade is the terminal (UX stage 2): an app opened from the dock while the Broker is on Trade opens as a right side panel
 * beside the chart, not over it. The Broker takes the left 70% and each panel one slot of the right 30%; with
 * more panels than slots the oldest panel collapses to the shelf. Null when no Broker sits on Trade, or when a slot does not
 * fit (the caller falls back to the ordinary placement).
 */
function sidePanel(state: ShellState, id: string): ShellState | null {
  if (layoutMode(state.vp.w) !== 'full') return null;
  const wa = workArea(state.vp, false);
  const g = gutterFor(false);
  const broker = state.wins.find((w) => w.app === 'broker' && w.ws === 0 && w.state === 'open' && w.id !== id);
  if (!broker || !fitsMin(APPS.broker, fracToRect(SLOT_FRAC.L23, wa, g))) return null;
  const app = state.wins.find((w) => w.id === id);
  if (!app) return null;
  // Open panels in z-order, oldest first (wins is kept in raise order). One panel takes the whole column; two share it as
  // halves (UX stage 6: the second panel reflows the first into the top half instead of overlapping it). A third panel
  // collapses the oldest and takes its half.
  const panels = state.wins.filter(
    (w) => w.ws === 0 && w.state === 'open' && w.id !== id && w.app !== 'broker' && w.slot !== null && SIDE_SLOTS.includes(w.slot as SlotName),
  );
  let slot: SlotName = 'R3';
  let reslot: { id: string; slot: SlotName } | null = null;
  let collapse: string | null = null;
  if (panels.length === 1) {
    slot = 'R3B';
    reslot = { id: panels[0]!.id, slot: 'R3T' };
  } else if (panels.length >= 2) {
    const oldest = panels[0]!;
    slot = oldest.slot as SlotName;
    collapse = oldest.id;
  }
  if (!fitsMin(APPS[app.app], fracToRect(SLOT_FRAC[slot], wa, g))) return null;
  if (reslot !== null && !fitsMin(APPS[panels[0]!.app], fracToRect(SLOT_FRAC[reslot.slot], wa, g))) return null;
  const wins = state.wins.map((w) => {
    if (w.id === broker.id) return { ...w, slot: 'L23' as SlotName, filled: false };
    if (w.id === id) return { ...w, slot, filled: false };
    if (reslot !== null && w.id === reslot.id) return { ...w, slot: reslot.slot, filled: false };
    if (collapse !== null && w.id === collapse) return { ...w, state: 'collapsed' as const };
    return w;
  });
  return { ...state, wins: raise(wins, id) };
}

/**
 * Tiles the open windows of the active workspace when a new one opens (UX stage 2): 2 = halves, 3 = one large plus
 * two stacked, 4 = quarters, 5+ = grid, in z-order. Only in the full mode (and halves for two
 * windows), and only when every window fits its tile; otherwise the cascade stays as it was. Filled windows are
 * restored to their tile, because tiling is the layout the user asked for by opening another window.
 */
function tileWorkspace(state: ShellState, ws: number = state.activeWs): ShellState {
  const open = state.wins.filter((w) => w.ws === ws && w.state === 'open');
  if (open.length < 2) return state;
  const mode = layoutMode(state.vp.w);
  if (mode === 'phone' || mode === 'single') return state;
  if (mode === 'halves' && open.length !== 2) return state;
  const tiles = tileSlots(open.length);
  const wa = workArea(state.vp, false);
  const g = gutterFor(false);
  // Z-order: the oldest window takes the main tile and the newest the last one, so a new window lands on the right.
  const order = open;
  const fits = order.every((w, i) => fitsMin(APPS[w.app], fracToRect(slotFrac(tiles[i]!), wa, g)));
  if (!fits) return state;
  const wins = state.wins.map((w) => {
    const i = order.findIndex((x) => x.id === w.id);
    return i < 0 ? w : { ...w, slot: tiles[i]!, filled: false };
  });
  return { ...state, wins };
}

function nextBrokerId(wins: Win[]): string {
  for (let n = 1; ; n++) {
    const id = `broker-${n}`;
    if (!wins.some((w) => w.id === id)) return id;
  }
}

/**
 * Finds or creates the window an app and its props name. Does not focus or switch workspace;
 * callers do that. Rules (F:55, C-12, C-02, C-27):
 *   Broker: same ticker focuses that Broker. Otherwise a new one (up to 4). At the cap a fresh
 *           open (New Broker, Shift+Enter) is refused, so no other window changes. A plain open at
 *           the cap lets the least-recently-focused Broker (bottom-most) take the ticker. No ticker:
 *           no change.
 *   Research: one window per file id. A file id is required.
 *   Second Portfolio (Review only, and only once its journal view is built: apps.ts READY_VIEWS):
 *           id portfolio-2, at most two Portfolio windows.
 *   Single: the window whose id is the app id. A user open also accepts any window of the app
 *           (a Review journal), so the shelf focuses the one Portfolio that is there. A layout
 *           always names the window by id, so Review never picks up the journal window by mistake.
 *           A new single window is refused when the app already has its maximum (1, or 2 for
 *           Portfolio).
 */
function acquire(state: ShellState, app: AppId, props: WinProps, role: 'user' | 'layout', second: boolean, fresh = false): Acq {
  const wins = state.wins.slice();
  if (second) {
    // Refused until the view it names is built (apps.ts READY_VIEWS): no journal window before Phase 3.
    if (app !== 'portfolio' || !secondWindowReady(app)) return failAcq('bad-props');
    const id = 'portfolio-2';
    if (wins.some((w) => w.id === id)) return { ok: true, wins, id, created: false };
    if (wins.filter((w) => w.app === 'portfolio').length >= (APPS.portfolio.secondInstance?.max ?? 1)) {
      return failAcq('instance');
    }
    wins.push(newWin(state, id, 'portfolio', props));
    return { ok: true, wins, id, created: true };
  }

  if (app === 'broker') {
    if (props.ticker !== undefined && !fresh) {
      const hit = wins.find((w) => w.app === 'broker' && w.props.ticker === props.ticker);
      if (hit) return { ok: true, wins, id: hit.id, created: false };
    }
    const brokers = wins.filter((w) => w.app === 'broker');
    if (brokers.length < MAX_BROKERS) {
      const id = nextBrokerId(wins);
      wins.push(newWin(state, id, 'broker', props));
      return { ok: true, wins, id, created: true };
    }
    // A fresh window never retargets another one: the user asked for a new window, so the cap refuses it.
    if (fresh) return failAcq('instance');
    const lru = brokers[0]!;
    if (props.ticker !== undefined) {
      const i = wins.findIndex((w) => w.id === lru.id);
      wins[i] = { ...wins[i]!, props: { ticker: props.ticker } };
    }
    return { ok: true, wins, id: lru.id, created: false };
  }

  if (app === 'research') {
    // The Research Desk itself is one window (Velvet: "one window per app, except ... Research Desk files").
    // Each file it opens is its own window, one per file id.
    if (props.fileId === undefined) {
      const desk = wins.find((w) => w.app === 'research' && w.props.fileId === undefined);
      if (desk !== undefined) return { ok: true, wins, id: desk.id, created: false };
      wins.push(newWin(state, 'research', 'research', props));
      return { ok: true, wins, id: 'research', created: true };
    }
    const hit = wins.find((w) => w.app === 'research' && w.props.fileId === props.fileId);
    if (hit) return { ok: true, wins, id: hit.id, created: false };
    const id = `research-${props.fileId}`;
    wins.push(newWin(state, id, 'research', props));
    return { ok: true, wins, id, created: true };
  }

  let i = wins.findIndex((w) => w.id === app);
  if (i < 0 && role === 'user') i = wins.findIndex((w) => w.app === app);
  if (i >= 0) {
    const merged: WinProps = { ...wins[i]!.props };
    if (props.view !== undefined) merged.view = props.view;
    wins[i] = { ...wins[i]!, props: merged };
    return { ok: true, wins, id: wins[i]!.id, created: false };
  }
  const cap = APPS[app].secondInstance?.max ?? 1;
  if (wins.filter((w) => w.app === app).length >= cap) return failAcq('instance');
  wins.push(newWin(state, app, app, props));
  return { ok: true, wins, id: app, created: true };
}

/**
 * A layout's Broker for a ticker reuses the Broker already on this workspace (the top-most one),
 * so applying Trade retargets it instead of opening a second Broker. A ticker that already has a
 * Broker is left to `acquire`, which focuses that one. A Broker placed without a ticker keeps the
 * one it already has (see applyPlacements).
 */
function brokerToReuse(s: ShellState, ticker: string | undefined, placed: string[]): Win | undefined {
  if (ticker !== undefined && s.wins.some((w) => w.app === 'broker' && w.props.ticker === ticker)) return undefined;
  return [...s.wins]
    .reverse()
    .find((w) => w.app === 'broker' && w.ws === s.activeWs && !placed.includes(w.id));
}

function applyPlacements(state: ShellState, placements: Placement[]): ShellState {
  let s = state;
  const placedIds: string[] = [];
  for (const p of placements) {
    const reuse = p.app === 'broker' ? brokerToReuse(s, p.props.ticker, placedIds) : undefined;
    const r: Acq = reuse
      ? { ok: true, wins: s.wins.slice(), id: reuse.id, created: false }
      : acquire(s, p.app, p.props, 'layout', p.second);
    if (!r.ok) continue;
    const cur = r.wins.find((w) => w.id === r.id)!;
    // A Broker placed with no ticker keeps the ticker it has. Other windows take the placement's props.
    const props = p.app === 'broker' && p.props.ticker === undefined ? cur.props : p.props;
    s = {
      ...s,
      wins: raise(r.wins, r.id, {
        ws: s.activeWs,
        state: 'open',
        slot: p.slot,
        filled: p.filled,
        rect: p.rect ?? cur.rect,
        props,
      }),
    };
    placedIds.push(r.id);
  }
  // Windows on this workspace that the layout does not use go to the shelf. Their state is kept.
  const wins = s.wins.map((w) =>
    w.ws === s.activeWs && w.state === 'open' && !placedIds.includes(w.id) ? { ...w, state: 'collapsed' as const } : w,
  );
  return { ...s, wins };
}

// ---------------------------------------------------------------- start and load

/** A fresh shell: the Trade layout with the Broker focused (F:119). Also the fallback for a corrupt shell. */
export function initialShell(vp: Size, ctx: WmCtx, ticker?: string): ShellState {
  const base: ShellState = {
    v: 1,
    wins: [],
    activeWs: 0,
    focusWs: [],
    focusRestore: null,
    layouts: [],
    shelf: defaultShelf(),
    vp: { w: vp.w, h: vp.h },
  };
  return applyPlacements(base, ctx.plan('trade', vp, { ticker }));
}

/**
 * The first-run desktop (spec 1.1, UX redesign): a save with no stored shell opens the Broker alone, maximized to the work
 * area as the Trade workspace, not the Trade layout's three windows and a tip card. The Trade layout stays a named layout
 * the launcher offers.
 */
export function firstRunShell(vp: Size, ctx: WmCtx, ticker?: string): ShellState {
  const base: ShellState = {
    v: 1,
    wins: [],
    activeWs: 0,
    focusWs: [],
    focusRestore: null,
    layouts: [],
    shelf: defaultShelf(),
    vp: { w: vp.w, h: vp.h },
  };
  const broker = ctx.plan('trade', vp, { ticker }).filter((p) => p.app === 'broker');
  return applyPlacements(base, broker.map((p) => ({ ...p, filled: true })));
}

/**
 * Invariants on a state read from a save (F:67, P2-126): unknown or locked apps are dropped,
 * Brokers are capped at 4, ids are unique, windows on a removed workspace move to 0,
 * activeWs and focusWs are in range, and layouts are capped. Pure; the caller checked the shapes.
 */
export function normalize(state: ShellState, ctx: WmCtx): ShellState {
  const seen = new Set<string>();
  let brokers = 0;
  const wins: Win[] = [];
  for (const w of state.wins) {
    if (seen.has(w.id)) continue;
    if (!APPS[w.app].available || !ctx.unlocked(w.app)) continue;
    if (w.app === 'broker') {
      if (brokers >= MAX_BROKERS) continue;
      brokers++;
    }
    seen.add(w.id);
    wins.push(isWsIndex(w.ws, ctx) ? w : { ...w, ws: 0 });
  }
  const activeWs = isWsIndex(state.activeWs, ctx) ? state.activeWs : 0;
  const focusWs = [...new Set(state.focusWs.filter((ws) => isWsIndex(ws, ctx)))].sort((a, b) => a - b);
  const ids = new Set(wins.map((w) => w.id));
  const snap: Record<string, Snapshot> = {};
  for (const [id, s] of Object.entries(state.focusRestore ?? {})) {
    if (ids.has(id) && focusWs.includes(s.ws)) snap[id] = s;
  }
  return {
    ...state,
    wins,
    activeWs,
    focusWs,
    focusRestore: Object.keys(snap).length > 0 ? snap : null,
    layouts: state.layouts.slice(0, MAX_CUSTOM_LAYOUTS),
  };
}

// ---------------------------------------------------------------- actions

function openAction(state: ShellState, app: AppId, rawProps: unknown, ctx: WmCtx, fresh = false): WmResult {
  if (!isAppId(app)) return fail('bad-props');
  if (!APPS[app].available) return fail('unavailable');
  if (!ctx.unlocked(app)) return fail('locked');
  const props = cleanProps(app, rawProps);
  if (props === null) return fail('bad-props');
  const r = acquire(state, app, props, 'user', false, fresh);
  if (!r.ok) return fail(r.reason);
  let s: ShellState = { ...state, wins: r.wins };
  // Opening a window exits focus mode on the workspace it lands on (DECISIONS "Behaviour gaps"): a new window,
  // or a collapsed one restored to the screen. Focusing a window already on screen keeps focus mode.
  const before = state.wins.find((w) => w.id === r.id);
  const restored = before !== undefined && before.state === 'collapsed';
  if (r.created) {
    s = exitFocus(s, state.activeWs);
    if (app === 'broker') s = placeAlone(s, r.id);
    const panel = state.activeWs === 0 && app !== 'broker' ? sidePanel(s, r.id) : null;
    s = panel ?? tileWorkspace(s);
  } else if (restored) {
    const landing = s.wins.find((w) => w.id === r.id);
    if (landing !== undefined) s = exitFocus(s, landing.ws);
  }
  return ok(focusId(s, r.id));
}

function snapTo(state: ShellState, id: string, slot: SlotName): WmResult {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return fail('no-window');
  const mode = layoutMode(state.vp.w);
  if (!slotAllowedInMode(slot, mode)) return fail('mode');
  const foc = isFocused(state, w.ws);
  const wa = workArea(state.vp, foc);
  const r = fracToRect(SLOT_FRAC[slot], wa, gutterFor(foc));
  if (!fitsMin(APPS[w.app], r)) return fail('too-small');
  return ok({ ...state, wins: raise(state.wins, id, { slot, filled: false }) });
}

const CYCLE_LEFT: readonly SlotName[] = ['L2', 'L3', 'L23'];
const CYCLE_RIGHT: readonly SlotName[] = ['R2', 'R3', 'R23'];
const UP_TARGET: Partial<Record<SlotName, SlotName>> = {
  L2: 'TL', L3: 'TL', L23: 'TL', BL: 'TL',
  R2: 'TR', R3: 'TR', R23: 'TR', BR: 'TR',
  R3B: 'R3T',
};
const DOWN_TARGET: Partial<Record<SlotName, SlotName>> = {
  L2: 'BL', L3: 'BL', L23: 'BL', TL: 'L2',
  R2: 'BR', R3: 'BR', R23: 'BR', TR: 'R2',
  R3T: 'R3B',
};

function cycleAction(state: ShellState, id: string, dir: CycleDir): WmResult {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return fail('no-window');
  const cur = w.slot !== null && isSlotName(w.slot) ? w.slot : null;
  if (dir === 'left' || dir === 'right') {
    // Ctrl Left: 1/2, then 1/3, then 2/3, then 1/2 again (F:41 and V:64).
    const seq = dir === 'left' ? CYCLE_LEFT : CYCLE_RIGHT;
    const idx = cur === null ? -1 : seq.indexOf(cur);
    return snapTo(state, id, seq[(idx + 1) % seq.length]!);
  }
  if (dir === 'up') {
    if (w.filled) return ok(state);
    const target = cur === null ? undefined : UP_TARGET[cur];
    if (target === undefined) return fillOn(state, id);
    return snapTo(state, id, target);
  }
  // down: un-fill first; otherwise step to the half or quarter below.
  if (w.filled) return ok({ ...state, wins: patchWin(state.wins, id, { filled: false }) });
  const target = cur === null ? undefined : DOWN_TARGET[cur];
  if (target === undefined) return ok(state);
  return snapTo(state, id, target);
}

function fillOn(state: ShellState, id: string): WmResult {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return fail('no-window');
  if (w.filled) return ok(state);
  return ok({ ...state, wins: raise(state.wins, id, { filled: true }) });
}

function unsnapAction(state: ShellState, id: string): WmResult {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return fail('no-window');
  if (w.slot === null) return ok(state);
  const shown = project(state).rects;
  const rect = hasOwn(shown, id) ? shown[id]! : w.rect;
  return ok({ ...state, wins: raise(state.wins, id, { slot: null, rect, filled: false }) });
}

function freeRectAction(state: ShellState, id: string, r: Rect): WmResult {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return fail('no-window');
  if (layoutMode(state.vp.w) !== 'full') return fail('mode');
  if (!finite(r.x) || !finite(r.y) || !finite(r.w) || !finite(r.h)) return fail('bad-rect');
  const rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  const def = APPS[w.app];
  if (rect.w < def.minW || rect.h < def.minH) return fail('too-small');
  const wa = workArea(state.vp, isFocused(state, w.ws));
  if (rect.w > wa.w || rect.h > wa.h) return fail('too-large');
  return ok({ ...state, wins: raise(state.wins, id, { rect: clampRect(rect, wa), slot: null, filled: false }) });
}

function splitEdgeAction(state: ShellState, a: string, b: string, axis: 'x' | 'y', at: number): WmResult {
  if (a === b) return fail('bad-edge');
  const wa0 = state.wins.find((x) => x.id === a);
  const wb0 = state.wins.find((x) => x.id === b);
  if (!wa0 || !wb0) return fail('no-window');
  if (layoutMode(state.vp.w) !== 'full') return fail('mode');
  if (wa0.ws !== wb0.ws || wa0.slot === null || wb0.slot === null || wa0.filled || wb0.filled) return fail('bad-edge');
  if (!finite(at) || at <= 0 || at >= 1) return fail('bad-edge');
  const fa = slotFrac(wa0.slot);
  const fb = slotFrac(wb0.slot);
  const lo = axis === 'x' ? 'x0' : 'y0';
  const hi = axis === 'x' ? 'x1' : 'y1';
  let first: Win;
  let second: Win;
  let ff: typeof fa;
  let sf: typeof fb;
  if (fa[hi] === fb[lo]) {
    first = wa0; second = wb0; ff = fa; sf = fb;
  } else if (fb[hi] === fa[lo]) {
    first = wb0; second = wa0; ff = fb; sf = fa;
  } else {
    return fail('bad-edge');
  }
  if (!(at > ff[lo] && at < sf[hi])) return fail('bad-edge');
  const newFirst = { ...ff, [hi]: at };
  const newSecond = { ...sf, [lo]: at };
  const wa = workArea(state.vp, isFocused(state, wa0.ws));
  const g = gutterFor(isFocused(state, wa0.ws));
  if (!fitsMin(APPS[first.app], fracToRect(newFirst, wa, g)) || !fitsMin(APPS[second.app], fracToRect(newSecond, wa, g))) {
    return fail('too-small');
  }
  let wins = patchWin(state.wins, first.id, { slot: { custom: newFirst }, filled: false });
  wins = patchWin(wins, second.id, { slot: { custom: newSecond }, filled: false });
  return ok({ ...state, wins: raise(wins, a) });
}

function applyLayoutAction(state: ShellState, name: string, ticker: string | undefined, ctx: WmCtx): WmResult {
  if (layoutMode(state.vp.w) !== 'full') return fail('mode');
  let placements: Placement[];
  if (isBuiltinLayout(name)) {
    // Research needs a file: the Research window on this workspace, if one is open (top-most).
    const fileId = [...state.wins]
      .reverse()
      .find((w) => w.app === 'research' && w.ws === state.activeWs && w.props.fileId !== undefined)?.props.fileId;
    placements = ctx.plan(name, state.vp, { ticker, fileId });
  } else {
    const saved = state.layouts.find((l) => l.name === name);
    if (!saved) return fail('no-layout');
    placements = [];
    const wa = workArea(state.vp, false);
    for (const e of saved.wins) {
      if (!APPS[e.app].available || !ctx.unlocked(e.app)) continue;
      const r = e.slot !== null ? fracToRect(slotFrac(e.slot), wa, gutterFor(false)) : e.rect;
      if (!fitsMin(APPS[e.app], r)) return fail('too-small');
      placements.push({
        app: e.app,
        props: e.props,
        slot: e.slot,
        rect: e.rect,
        filled: false,
        second: e.second === true,
      });
    }
  }
  return ok(applyPlacements(exitFocus(state, state.activeWs), placements));
}

function saveLayoutAction(state: ShellState, rawName: string): WmResult {
  const name = rawName.trim();
  if (name.length < 1 || name.length > MAX_LAYOUT_NAME) return fail('bad-name');
  if (isBuiltinLayout(name.toLowerCase())) return fail('reserved');
  const idx = state.layouts.findIndex((l) => l.name === name);
  if (idx < 0 && state.layouts.length >= MAX_CUSTOM_LAYOUTS) return fail('layout-cap');
  const wins: LayoutEntry[] = state.wins
    .filter((w) => w.ws === state.activeWs && w.state === 'open')
    .map((w) => ({ app: w.app, slot: w.slot, rect: w.rect, props: w.props, second: w.id === 'portfolio-2' }));
  if (wins.length === 0) return fail('empty');
  const layout: SavedLayout = { name, wins };
  const layouts =
    idx < 0 ? [...state.layouts, layout] : state.layouts.map((l, i) => (i === idx ? layout : l));
  return ok({ ...state, layouts });
}

function reorderAction(state: ShellState, order: AppId[]): WmResult {
  const have = new Set(state.shelf);
  if (order.length !== state.shelf.length || new Set(order).size !== order.length || order.some((a) => !have.has(a))) {
    return fail('bad-order');
  }
  if (state.shelf.includes('broker') && order[0] !== 'broker') return fail('broker-first');
  return ok({ ...state, shelf: [...order] });
}

/**
 * Snapping reflows (UX stage 2): when a tiled workspace loses a window, the windows left on it, all tiled, take the new
 * tiles. Trade keeps its terminal layout (the Broker stays on the left two thirds), and a workspace with a free or
 * filled window is left as it is.
 */
function reflow(state: ShellState, ws: number): ShellState {
  if (ws === 0) return state;
  const open = state.wins.filter((w) => w.ws === ws && w.state === 'open');
  // Only named slots reflow: a custom split (a dragged edge) is the user's own layout and stays.
  if (open.length < 2 || !open.every((w) => typeof w.slot === 'string' && !w.filled)) return state;
  return tileWorkspace(state, ws);
}

/** Applies one action. Refusals return { ok: false, reason } and never touch the input. */
export function reduce(state: ShellState, action: WmAction, ctx: WmCtx): WmResult {
  switch (action.type) {
    case 'open':
      return openAction(state, action.app, action.props, ctx, action.fresh === true);

    case 'focus':
    case 'restore': {
      if (!state.wins.some((w) => w.id === action.id)) return fail('no-window');
      return ok(focusId(state, action.id));
    }

    case 'close': {
      const w = state.wins.find((x) => x.id === action.id);
      if (!w) return fail('no-window');
      if (w.app === 'broker' && !action.force && w.props.ticker !== undefined && ctx.hasPendingOrder(w.props.ticker)) {
        return fail('confirm');
      }
      const closed: ShellState = {
        ...state,
        wins: state.wins.filter((x) => x.id !== action.id),
        focusRestore: snapWithout(state.focusRestore, action.id),
      };
      return ok(reflow(closed, w.ws));
    }

    case 'collapse': {
      const w = state.wins.find((x) => x.id === action.id);
      if (!w) return fail('no-window');
      if (w.state === 'collapsed') return ok(state);
      return ok({ ...state, wins: patchWin(state.wins, action.id, { state: 'collapsed' }) });
    }

    case 'fill': {
      const w = state.wins.find((x) => x.id === action.id);
      if (!w) return fail('no-window');
      return ok({ ...state, wins: raise(state.wins, action.id, { filled: !w.filled }) });
    }

    case 'snap':
      if (!isSlotName(action.slot)) return fail('bad-slot');
      return snapTo(state, action.id, action.slot);

    // Cycle and unsnap raise the window even when nothing changes, so the window the user acted
    // on is the focused one (a window stays the top of the z-order after any accepted action).
    case 'snapCycle': {
      const r = cycleAction(state, action.id, action.dir);
      return r.ok ? ok({ ...r.state, wins: raise(r.state.wins, action.id) }) : r;
    }

    case 'unsnap': {
      const r = unsnapAction(state, action.id);
      return r.ok ? ok({ ...r.state, wins: raise(r.state.wins, action.id) }) : r;
    }

    case 'move':
    case 'resize':
      return freeRectAction(state, action.id, action.rect);

    case 'splitEdge':
      return splitEdgeAction(state, action.a, action.b, action.axis, action.at);

    case 'applyLayout':
      return applyLayoutAction(state, action.name, action.ticker, ctx);

    case 'saveLayout':
      return saveLayoutAction(state, action.name);

    case 'switchWs': {
      if (!isWsIndex(action.ws, ctx)) return fail('no-workspace');
      if (action.ws === state.activeWs) return ok(state);
      // Focus mode is per workspace: switching does not change either workspace's focus.
      const next: ShellState = { ...state, activeWs: action.ws };
      // A workspace that has never held a window opens its default app (Trade the Broker, News the Wire, Portfolio the
      // Portfolio). A workspace that holds no window yet is the one that opens it.
      const app = WORKSPACE_DEFAULT_APP[action.ws] ?? null;
      // A single-window app that is already open on another workspace is not opened twice (one window per app).
      const empty = !state.wins.some((w) => w.ws === action.ws);
      const taken = state.wins.some((w) => w.app === app);
      if (app === null || !empty || taken || !ctx.unlocked(app)) return ok(next);
      const opened = openAction(next, app, {}, ctx);
      if (!opened.ok) return ok(next);
      // News and Portfolio open their app maximized, as Trade opens the Broker maximized: the workspace is the app's own desk.
      if (app === 'wire' || app === 'portfolio') return ok({ ...opened.state, wins: patchWin(opened.state.wins, app, { filled: true }) });
      return opened;
    }

    case 'moveToWs': {
      const w = state.wins.find((x) => x.id === action.id);
      if (!w) return fail('no-window');
      if (!ctx.unlocked(w.app)) return fail('locked');
      if (!isWsIndex(action.ws, ctx)) return fail('no-workspace');
      if (action.ws === w.ws) return ok(state);
      // A window in focus mode (either side of the move) keeps its snapshot, so it cannot move.
      if (isFocused(state, w.ws) || isFocused(state, action.ws)) return fail('mode');
      return ok({ ...state, wins: patchWin(state.wins, action.id, { ws: action.ws }) });
    }

    case 'focusMode': {
      if (action.on === isFocused(state)) return ok(state);
      return ok(action.on ? enterFocus(state, state.activeWs) : exitFocus(state, state.activeWs));
    }

    case 'toggleFocusMode':
      return ok(isFocused(state) ? exitFocus(state, state.activeWs) : enterFocus(state, state.activeWs));

    case 'viewport': {
      if (!finite(action.w) || !finite(action.h) || action.w <= 0 || action.h <= 0) return fail('bad-size');
      return ok({ ...state, vp: { w: Math.round(action.w), h: Math.round(action.h) } });
    }

    case 'reorderShelf':
      return reorderAction(state, action.order);
  }
}

/** The Broker count, for tests and the shelf. */
export function brokerCount(state: ShellState): number {
  return state.wins.filter((w) => w.app === 'broker').length;
}
