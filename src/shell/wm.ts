/**
 * Quay window manager (F:23-62, V:48-76, DECISIONS "Behaviour gaps"). A pure reducer:
 * (state, action, ctx) -> WmResult. No React, no DOM, no clock, no store, no orders.
 *
 * Rules the reducer keeps:
 *   - z-order is array order, last = top. Focus is derived: the top open window on activeWs.
 *   - a snapped window stores its slot; its rect is derived. A free window stores its last rect.
 *   - the stored state never changes with the viewport. `project` derives what is shown, so a
 *     layout saved at 1440 px comes back exactly when the viewport grows back (P2-060).
 *   - a refused action returns { ok: false, reason } and leaves the caller's state untouched.
 */

import {
  APPS,
  MAX_BROKERS,
  MAX_CUSTOM_LAYOUTS,
  MAX_LAYOUT_NAME,
  SHELF_ORDER,
  type AppId,
  type WinProps,
  cleanProps,
  isAppId,
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
  sideOfFrac,
  slotAllowedInMode,
  slotFrac,
  workArea,
} from './geometry';
import { type Placement, isBuiltinLayout, planLayout } from './layouts';

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

export interface Snapshot {
  rect: Rect;
  slot: Slot | null;
  filled: boolean;
}

export interface ShellState {
  v: 1;
  wins: Win[];
  activeWs: number;
  focusMode: boolean;
  /** Snapshot of every window taken when focus mode was entered (C-08, P2-028). */
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
  | { type: 'open'; app: AppId; props?: unknown }
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
  const wa = workArea(state.vp, state.focusMode);
  const g = gutterFor(state.focusMode);
  const rects: Record<string, Rect> = {};
  const on = state.wins.filter((w) => w.ws === state.activeWs && w.state === 'open');
  if (mode === 'phone' || on.length === 0) return { mode, wa, gutter: g, rects, order: [] };

  if (mode === 'single') {
    rects[on[on.length - 1]!.id] = fracToRect(FULL_FRAC, wa, g);
  } else if (mode === 'halves') {
    const topFilled = [...on].reverse().find((w) => w.filled);
    if (topFilled) {
      rects[topFilled.id] = fracToRect(FULL_FRAC, wa, g);
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

/** Restores the snapshot taken when focus mode was entered, then leaves focus mode. */
function exitFocus(state: ShellState): ShellState {
  if (!state.focusMode) return state;
  const snap = state.focusRestore ?? {};
  const wins = state.wins.map((w) => {
    if (!hasOwn(snap, w.id)) return w;
    const s = snap[w.id]!;
    return { ...w, rect: s.rect, slot: s.slot, filled: s.filled };
  });
  return { ...state, wins, focusMode: false, focusRestore: null };
}

function enterFocus(state: ShellState): ShellState {
  if (state.focusMode) return state;
  const snap: Record<string, Snapshot> = {};
  for (const w of state.wins) snap[w.id] = { rect: w.rect, slot: w.slot, filled: w.filled };
  let wins = state.wins;
  const on = wins.filter((w) => w.ws === state.activeWs && w.state === 'open');
  // An unsnapped workspace takes the Trade slots for the windows already open here (F:59).
  // No window is opened, so focus mode off restores the same set of windows.
  if (on.length > 0 && !on.some((w) => w.slot !== null) && layoutMode(state.vp.w) === 'full') {
    const wa = workArea(state.vp, true);
    const topBroker = [...on].reverse().find((w) => w.app === 'broker')?.id;
    wins = wins.map((w) => {
      if (w.ws !== state.activeWs || w.state !== 'open') return w;
      let slot: SlotName | null = null;
      if (w.app === 'broker') slot = w.id === topBroker ? 'L23' : null;
      else if (w.app === 'wire') slot = 'R3T';
      else if (w.app === 'portfolio') slot = 'R3B';
      if (slot === null || !fitsMin(APPS[w.app], fracToRect(SLOT_FRAC[slot], wa, 1))) return w;
      return { ...w, slot, filled: false };
    });
  }
  return { ...state, wins, focusMode: true, focusRestore: snap };
}

/** Focuses a window: restores it if collapsed, switches to its workspace, raises it. */
function focusId(state: ShellState, id: string): ShellState {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return state;
  let s = state;
  if (w.ws !== s.activeWs) s = exitFocus({ ...s, activeWs: w.ws });
  return { ...s, wins: raise(s.wins, id, { state: 'open' }) };
}

interface Acquired {
  ok: true;
  wins: Win[];
  id: string;
  created: boolean;
}

function newWin(state: ShellState, id: string, app: AppId, props: WinProps): Win {
  const wa = workArea(state.vp, false);
  const def = APPS[app];
  const w = Math.min(wa.w, Math.max(def.minW, Math.round(wa.w * 0.6)));
  const h = Math.min(wa.h, Math.max(def.minH, Math.round(wa.h * 0.7)));
  const step = state.wins.filter((x) => x.ws === state.activeWs).length % 5;
  const off = step * 24;
  return {
    id,
    app,
    ws: state.activeWs,
    rect: {
      x: Math.min(off, Math.max(0, wa.w - w)),
      y: Math.min(off, Math.max(0, wa.h - h)),
      w,
      h,
    },
    slot: null,
    state: 'open',
    filled: false,
    props,
  };
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
 *   Broker: same ticker focuses that Broker. Otherwise a new one (up to 4). At the cap the
 *           least-recently-focused Broker (bottom-most) takes the ticker. No ticker: it is focused.
 *   Research: one window per file id.
 *   Second Portfolio (Review only): id portfolio-2, at most two Portfolio windows.
 *   Single: the existing window, with defined props merged in; otherwise a new one.
 */
function acquire(state: ShellState, app: AppId, props: WinProps, second: boolean): Acquired | { ok: false; reason: WmReason } {
  const wins = state.wins.slice();
  if (second) {
    const id = 'portfolio-2';
    if (wins.some((w) => w.id === id)) return { ok: true, wins, id, created: false };
    if (wins.filter((w) => w.app === 'portfolio').length >= 2) return { ok: false, reason: 'instance' };
    wins.push(newWin(state, id, 'portfolio', props));
    return { ok: true, wins, id, created: true };
  }

  if (app === 'broker') {
    if (props.ticker !== undefined) {
      const hit = wins.find((w) => w.app === 'broker' && w.props.ticker === props.ticker);
      if (hit) return { ok: true, wins, id: hit.id, created: false };
    }
    const brokers = wins.filter((w) => w.app === 'broker');
    if (brokers.length < MAX_BROKERS) {
      const id = nextBrokerId(wins);
      wins.push(newWin(state, id, 'broker', props));
      return { ok: true, wins, id, created: true };
    }
    const lru = brokers[0]!;
    if (props.ticker !== undefined) {
      const i = wins.findIndex((w) => w.id === lru.id);
      wins[i] = { ...wins[i]!, props: { ticker: props.ticker } };
    }
    return { ok: true, wins, id: lru.id, created: false };
  }

  if (APPS[app].instances.kind === 'per-file') {
    const hit = wins.find((w) => w.app === app && w.props.fileId === props.fileId);
    if (hit) return { ok: true, wins, id: hit.id, created: false };
    const id = props.fileId !== undefined ? `research-${props.fileId}` : app;
    wins.push(newWin(state, id, app, props));
    return { ok: true, wins, id, created: true };
  }

  const i = wins.findIndex((w) => w.app === app);
  if (i >= 0) {
    const merged: WinProps = { ...wins[i]!.props };
    if (props.view !== undefined) merged.view = props.view;
    wins[i] = { ...wins[i]!, props: merged };
    return { ok: true, wins, id: wins[i]!.id, created: false };
  }
  wins.push(newWin(state, app, app, props));
  return { ok: true, wins, id: app, created: true };
}

function applyPlacements(state: ShellState, placements: Placement[]): ShellState {
  let s = state;
  const placedIds: string[] = [];
  for (const p of placements) {
    // A layout's Broker for a new ticker reuses the Broker already open on this workspace (the
    // top-most one), so applying Trade retargets it instead of opening a second Broker.
    const ticker = p.props.ticker;
    const reuse =
      p.app === 'broker' && ticker !== undefined && !s.wins.some((w) => w.app === 'broker' && w.props.ticker === ticker)
        ? [...s.wins].reverse().find((w) => w.app === 'broker' && w.ws === s.activeWs && w.state === 'open' && !placedIds.includes(w.id))
        : undefined;
    const r: Acquired | { ok: false; reason: WmReason } = reuse
      ? { ok: true, wins: s.wins.slice(), id: reuse.id, created: false }
      : acquire(s, p.app, p.props, p.second);
    if (!r.ok) continue;
    const cur = r.wins.find((w) => w.id === r.id)!;
    s = {
      ...s,
      wins: raise(r.wins, r.id, {
        ws: s.activeWs,
        state: 'open',
        slot: p.slot,
        filled: p.filled,
        rect: p.rect ?? cur.rect,
        props: p.props,
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

/** A fresh save: the Trade layout with the Broker focused (F:119). Also the fallback for a corrupt shell. */
export function initialShell(vp: Size, ctx: WmCtx, ticker?: string): ShellState {
  const base: ShellState = {
    v: 1,
    wins: [],
    activeWs: 0,
    focusMode: false,
    focusRestore: null,
    layouts: [],
    shelf: defaultShelf(),
    vp: { w: vp.w, h: vp.h },
  };
  const plan = planLayout('trade', vp, ctx.unlocked, { ticker });
  return applyPlacements(base, plan.placements);
}

/**
 * Invariants on a state read from a save (F:67, P2-126): unknown or locked apps are dropped,
 * Brokers are capped at 4, ids are unique, windows on a removed workspace move to 0, activeWs
 * is in range, and layouts are capped. Pure; the caller already checked the shapes.
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
  return {
    ...state,
    wins,
    activeWs,
    layouts: state.layouts.slice(0, MAX_CUSTOM_LAYOUTS),
    focusRestore: state.focusMode ? state.focusRestore : null,
  };
}

// ---------------------------------------------------------------- actions

function openAction(state: ShellState, app: AppId, rawProps: unknown, ctx: WmCtx): WmResult {
  if (!isAppId(app)) return fail('bad-props');
  if (!APPS[app].available) return fail('unavailable');
  if (!ctx.unlocked(app)) return fail('locked');
  const props = cleanProps(app, rawProps);
  if (props === null) return fail('bad-props');
  const r = acquire(state, app, props, false);
  if (!r.ok) return fail(r.reason);
  let s: ShellState = { ...state, wins: r.wins };
  // Opening a new window exits focus mode (DECISIONS "Behaviour gaps").
  if (r.created) s = exitFocus(s);
  return ok(focusId(s, r.id));
}

function snapTo(state: ShellState, id: string, slot: SlotName): WmResult {
  const w = state.wins.find((x) => x.id === id);
  if (!w) return fail('no-window');
  const mode = layoutMode(state.vp.w);
  if (!slotAllowedInMode(slot, mode)) return fail('mode');
  const wa = workArea(state.vp, state.focusMode);
  const r = fracToRect(SLOT_FRAC[slot], wa, gutterFor(state.focusMode));
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
  const wa = workArea(state.vp, state.focusMode);
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
  const wa = workArea(state.vp, state.focusMode);
  const g = gutterFor(state.focusMode);
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
    placements = planLayout(name, state.vp, ctx.unlocked, { ticker }).placements;
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
  return ok(applyPlacements(exitFocus(state), placements));
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

/** Applies one action. Refusals return { ok: false, reason } and never touch the input. */
export function reduce(state: ShellState, action: WmAction, ctx: WmCtx): WmResult {
  switch (action.type) {
    case 'open':
      return openAction(state, action.app, action.props, ctx);

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
      return ok({ ...state, wins: state.wins.filter((x) => x.id !== action.id) });
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

    case 'snapCycle':
      return cycleAction(state, action.id, action.dir);

    case 'unsnap':
      return unsnapAction(state, action.id);

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
      return ok(exitFocus({ ...state, activeWs: action.ws }));
    }

    case 'moveToWs': {
      const w = state.wins.find((x) => x.id === action.id);
      if (!w) return fail('no-window');
      if (!ctx.unlocked(w.app)) return fail('locked');
      if (!isWsIndex(action.ws, ctx)) return fail('no-workspace');
      return ok({ ...state, wins: patchWin(state.wins, action.id, { ws: action.ws }) });
    }

    case 'focusMode':
      if (action.on === state.focusMode) return ok(state);
      return ok(action.on ? enterFocus(state) : exitFocus(state));

    case 'toggleFocusMode':
      return ok(state.focusMode ? exitFocus(state) : enterFocus(state));

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
