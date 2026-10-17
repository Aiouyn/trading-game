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
  /** reads the symbol once; local edits made during the read take precedence over its snapshot */
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

/**
 * The text a refused save shows: the server's reason when it has one (the cap that was hit), the generic line otherwise. The list
 * stays on the chart either way.
 */
export function refusalText(code: string | undefined): string {
  switch (code) {
    case 'drawingBad': case 'drawingsFull': case 'drawingsTooLarge': case 'drawingsSymbols':
      return t(`broker.drawings.refused.${code}`);
    default:
      return t('broker.drawings.refused');
  }
}

/** Sends a symbol's drawings to the server now; a refused save says why, and the list stays on the chart. */
function send(assetId: string): void {
  const list = useDrawings.getState().byAsset[assetId] ?? [];
  void useGame.getState().act({ type: 'drawings.save', assetId, drawings: list }, { silent: true }).then((r) => {
    if (!r.ok) useGame.getState().toast({ tone: 'loss', text: refusalText(r.error) });
  }).catch(() => useGame.getState().toast({ tone: 'loss', text: refusalText(undefined) }));
}

/** Sends a symbol's drawings after the pause (a drag does not send one save per pointer move). */
function persist(assetId: string): void {
  clearTimeout(timers[assetId]);
  timers[assetId] = setTimeout(() => {
    delete timers[assetId];
    send(assetId);
  }, SAVE_DELAY_MS);
}

/** Flush pending debounces on hide. Delivery at page unload is best effort over the existing WebSocket. */
export function flushDrawingSaves(): void {
  for (const assetId of Object.keys(timers)) {
    clearTimeout(timers[assetId]);
    delete timers[assetId];
    send(assetId);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushDrawingSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDrawingSaves();
  });
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
    const before = get().byAsset[assetId];
    set({ loaded: { ...get().loaded, [assetId]: true } });
    try {
      const saved = await useGame.getState().loadDrawings(assetId);
      // The wire can return an offline/timeout acknowledgement instead of a drawing list.
      if (!Array.isArray(saved)) throw new Error('drawings unavailable');
      const now = get().byAsset[assetId];
      // A local clear wins. Otherwise merge untouched saved objects with local edits and additions.
      if (now !== before) {
        if (!now?.length) return;
        const localIds = new Set(now.map((d) => d.id));
        const removedIds = new Set((before ?? []).filter((d) => !localIds.has(d.id)).map((d) => d.id));
        const merged = [...saved.filter((d) => !localIds.has(d.id) && !removedIds.has(d.id)), ...now];
        set({ byAsset: { ...get().byAsset, [assetId]: merged } });
        persist(assetId);
        return;
      }
      set({ byAsset: { ...get().byAsset, [assetId]: saved } });
    } catch {
      const loaded = { ...get().loaded };
      delete loaded[assetId];
      set({ loaded });
    }
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
