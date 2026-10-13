'use client';

/**
 * The chart's drawings in the client (R-10-5): per symbol, the list the player sees, the tool in hand, the magnet, the lock and
 * hide switches, the selection, and an undo and redo history per symbol. A change is saved to the server (drawings.save) after a
 * short pause, so a drag does not send a save per pointer move; a drag records one undo step when it ends.
 */
import { create } from 'zustand';
import type { ChartDrawing, DrawingKind } from '@/world/drawings';
import { useGame } from '@/game/store';
import { t } from '@/i18n';

/** The cursor tool (select and move), the cross (the same, with a crosshair), or a drawing tool. */
export type Tool = 'cursor' | 'cross' | DrawingKind;

export const UNDO_LIMIT = 50;
/** The pause after the last change before a symbol's drawings are sent to the server. */
export const SAVE_DELAY_MS = 500;

interface DrawingState {
  /** the drawings of each symbol, as the player sees them now */
  byAsset: Record<string, ChartDrawing[]>;
  /** the symbols whose saved drawings have been read (a symbol is read once per session) */
  loaded: Record<string, true>;
  /** the undo and redo steps of each symbol: the list before each change */
  past: Record<string, ChartDrawing[][]>;
  future: Record<string, ChartDrawing[][]>;
  tool: Tool;
  magnet: boolean;
  /** lock all: no drawing moves, changes or is added by a drag */
  locked: boolean;
  /** hide all: the shapes are not drawn (they are kept) */
  hidden: boolean;
  selected: string | null;

  setTool(tool: Tool): void;
  setMagnet(on: boolean): void;
  setLocked(on: boolean): void;
  setHidden(on: boolean): void;
  select(id: string | null): void;
  /** reads the symbol's saved drawings once, and keeps any the player drew while the read was on the way */
  load(assetId: string): Promise<void>;
  /** a change that is one undo step: the list before it (the current one, or `before` for a gesture that began earlier) is kept, and the change is saved */
  commit(assetId: string, list: ChartDrawing[], before?: ChartDrawing[]): void;
  /** a change that is part of a gesture still going on (a drag): shown now, saved and undone with the gesture's end */
  preview(assetId: string, list: ChartDrawing[]): void;
  undo(assetId: string): void;
  redo(assetId: string): void;
}

/** The debounce timers of the saves, per symbol. */
const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Sends a symbol's drawings to the server after the pause; a refused save says so, and the list stays on the chart. */
function persist(assetId: string): void {
  clearTimeout(timers[assetId]);
  timers[assetId] = setTimeout(() => {
    delete timers[assetId];
    const list = useDrawings.getState().byAsset[assetId] ?? [];
    void useGame.getState().act({ type: 'drawings.save', assetId, drawings: list }, { silent: true }).then((r) => {
      if (!r.ok) useGame.getState().toast({ tone: 'loss', text: t('broker.drawings.refused') });
    });
  }, SAVE_DELAY_MS);
}

export const useDrawings = create<DrawingState>()((set, get) => ({
  byAsset: {},
  loaded: {},
  past: {},
  future: {},
  tool: 'cursor',
  magnet: false,
  locked: false,
  hidden: false,
  selected: null,

  setTool(tool) { set({ tool, selected: tool === 'cursor' || tool === 'cross' ? get().selected : null }); },
  setMagnet(on) { set({ magnet: on }); },
  setLocked(on) { set({ locked: on }); },
  setHidden(on) { set({ hidden: on, selected: on ? null : get().selected }); },
  select(id) { set({ selected: id }); },

  async load(assetId) {
    if (get().loaded[assetId]) return;
    set({ loaded: { ...get().loaded, [assetId]: true } });
    const saved = await useGame.getState().loadDrawings(assetId);
    // a drawing made while the read was on the way is kept after the saved ones
    const now = get().byAsset[assetId] ?? [];
    const ids = new Set(saved.map((d) => d.id));
    set({ byAsset: { ...get().byAsset, [assetId]: [...saved, ...now.filter((d) => !ids.has(d.id))] } });
  },

  commit(assetId, list, prior) {
    const before = prior ?? get().byAsset[assetId] ?? [];
    const past = [...(get().past[assetId] ?? []), before].slice(-UNDO_LIMIT);
    set({
      byAsset: { ...get().byAsset, [assetId]: list },
      past: { ...get().past, [assetId]: past },
      future: { ...get().future, [assetId]: [] },
    });
    persist(assetId);
  },

  preview(assetId, list) {
    set({ byAsset: { ...get().byAsset, [assetId]: list } });
    persist(assetId);
  },

  undo(assetId) {
    const past = get().past[assetId] ?? [];
    if (past.length === 0) return;
    const cur = get().byAsset[assetId] ?? [];
    const prev = past[past.length - 1]!;
    set({
      byAsset: { ...get().byAsset, [assetId]: prev },
      past: { ...get().past, [assetId]: past.slice(0, -1) },
      future: { ...get().future, [assetId]: [...(get().future[assetId] ?? []), cur].slice(-UNDO_LIMIT) },
      selected: null,
    });
    persist(assetId);
  },

  redo(assetId) {
    const future = get().future[assetId] ?? [];
    if (future.length === 0) return;
    const cur = get().byAsset[assetId] ?? [];
    const next = future[future.length - 1]!;
    set({
      byAsset: { ...get().byAsset, [assetId]: next },
      future: { ...get().future, [assetId]: future.slice(0, -1) },
      past: { ...get().past, [assetId]: [...(get().past[assetId] ?? []), cur].slice(-UNDO_LIMIT) },
      selected: null,
    });
    persist(assetId);
  },
}));

/** A new drawing's id: unique in the symbol and short (the save keeps it as is). */
export function newDrawingId(list: ChartDrawing[]): string {
  const taken = new Set(list.map((d) => d.id));
  for (let i = list.length + 1; ; i++) {
    const id = `d${i.toString(36)}`;
    if (!taken.has(id)) return id;
  }
}
