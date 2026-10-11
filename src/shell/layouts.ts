/**
 * Built-in named layouts (V:70-76, F:45). Pure: a function of the viewport and which apps are
 * unlocked. Feasibility follows DECISIONS "Infeasible layouts":
 *
 *   thirds  the designed slots; accepted only when every window meets its app minimum
 *   halves  Broker (or the main window) on the left half, the others stacked on the right
 *           half; a window that cannot fit its half is skipped; the main window must fit
 *   filled  the main window alone, filled to the work area
 *
 * Locked apps are skipped (C-25) and the Broker takes the freed space of a locked main window.
 * The Research entry needs a file id (a window cannot open without one); without it the entry is
 * skipped the same way. wm.ts never imports this module: ctx.ts wires `planLayout` into WmCtx.
 */

import { APPS, type AppId, type BuiltinLayout, type WinProps, isBuiltinLayout } from './apps';
import {
  BP_HALVES,
  type Rect,
  SLOT_FRAC,
  type Size,
  type Slot,
  type SlotName,
  fitsMin,
  layoutMode,
  sideOfFrac,
  slotRect,
} from './geometry';

export { isBuiltinLayout };
export type { BuiltinLayout };

/** What a plan needs besides the viewport: the Broker's ticker and the Research file (if any). */
export interface PlanOpts {
  ticker?: string;
  fileId?: string;
  /** Kept for callers: Review no longer depends on the built views (UX stage 2: one Portfolio and the Wire). */
  views?: readonly string[];
}

export interface Placement {
  app: AppId;
  props: WinProps;
  /** Slot to snap to, or null for a free window placed at `rect`. */
  slot: Slot | null;
  rect: Rect | null;
  /** Fill is on. The slot stays so that Fill toggles back to it. */
  filled: boolean;
  /** The second Portfolio window of Review (C-27, journal view). */
  second: boolean;
}

export type LayoutVariant = 'thirds' | 'halves' | 'filled';

export interface LayoutPlan {
  name: BuiltinLayout;
  variant: LayoutVariant;
  /** Placement order. The main window is last, so it takes focus. */
  placements: Placement[];
  /** Entries not placed: locked, or did not fit. */
  skipped: AppId[];
}

export type Unlocked = (app: AppId) => boolean;

interface Entry {
  app: AppId;
  slot: SlotName;
  main?: boolean;
  /** Takes the ticker passed to planLayout. */
  ticker?: boolean;
  /** Needs a Research file: taken from planLayout's fileId. Without one the entry is skipped. */
  file?: boolean;
  view?: string;
  second?: boolean;
}

const DEFS: Readonly<Record<Exclude<BuiltinLayout, 'review'>, readonly Entry[]>> = {
  trade: [
    { app: 'wire', slot: 'R3T' },
    { app: 'portfolio', slot: 'R3B' },
    { app: 'broker', slot: 'L23', main: true, ticker: true },
  ],
  research: [
    { app: 'research', slot: 'L23', main: true, file: true },
    { app: 'broker', slot: 'R3T', ticker: true },
    { app: 'wire', slot: 'R3B' },
  ],
};

/**
 * Review (UX stage 2): one Portfolio on the left and the Wire on the right, whether or not the journal view is built. The
 * journal is reached from the Portfolio itself, so Review never opens a second Portfolio (C-27 is kept as a Portfolio view).
 */
const REVIEW_WIRE: readonly Entry[] = [
  { app: 'portfolio', slot: 'L2', main: true },
  { app: 'wire', slot: 'R2' },
];

/** The entries of a layout. Review is Portfolio and the Wire at every view set. */
function entriesFor(name: BuiltinLayout): readonly Entry[] {
  if (name === 'review') return REVIEW_WIRE;
  return DEFS[name];
}

interface Cur {
  app: AppId;
  slot: SlotName;
  main: boolean;
  ticker: boolean;
  file: boolean;
  view?: string;
  second: boolean;
  i: number;
}

/**
 * Plans a built-in layout for a viewport. Pure. It does not check the layout mode for the
 * reducer; applyLayout refuses below 1200 (V:42), but the plan is useful at any width.
 */
export function planLayout(name: BuiltinLayout, vp: Size, unlocked: Unlocked, opts: PlanOpts = {}): LayoutPlan {
  const defs = entriesFor(name);
  const kept: Cur[] = [];
  const dropped: Cur[] = [];
  defs.forEach((e, i) => {
    const c: Cur = {
      app: e.app,
      slot: e.slot,
      main: e.main === true,
      ticker: e.ticker === true,
      file: e.file === true,
      view: e.view,
      second: e.second === true,
      i,
    };
    const usable = unlocked(e.app) && (!c.file || opts.fileId !== undefined);
    (usable ? kept : dropped).push(c);
  });

  if (kept.length === 0) {
    return { name, variant: 'filled', placements: [], skipped: defs.map((e) => e.app) };
  }

  // C-25: the Broker takes the freed space of a locked main window (Research layout below R3).
  if (!kept.some((c) => c.main)) {
    const freedMain = dropped.find((c) => c.main);
    const broker = kept.find((c) => c.app === 'broker');
    if (freedMain && broker) {
      broker.slot = freedMain.slot;
      broker.main = true;
    } else {
      kept[0]!.main = true;
    }
  }
  const main = kept.find((c) => c.main)!;

  const propsOf = (c: Cur): WinProps => {
    const p: WinProps = {};
    if (c.ticker && opts.ticker !== undefined) p.ticker = opts.ticker;
    if (c.file && opts.fileId !== undefined) p.fileId = opts.fileId;
    if (c.view !== undefined) p.view = c.view;
    return p;
  };

  const done = (variant: LayoutVariant, items: { c: Cur; slot: SlotName; filled: boolean }[]): LayoutPlan => {
    const placedIdx = new Set(items.map((it) => it.c.i));
    const ordered = [...items.filter((it) => !it.c.main), ...items.filter((it) => it.c.main)];
    return {
      name,
      variant,
      placements: ordered.map((it) => ({
        app: it.c.app,
        props: propsOf(it.c),
        slot: it.slot,
        rect: null,
        filled: it.filled,
        second: it.c.second,
      })),
      skipped: defs.filter((_, i) => !placedIdx.has(i)).map((e) => e.app),
    };
  };

  // Thirds: the designed slots, every window must fit.
  if (layoutMode(vp.w) === 'full') {
    const fits = kept.every((c) => fitsMin(APPS[c.app], slotRect(c.slot, vp, false)));
    if (fits) return done('thirds', kept.map((c) => ({ c, slot: c.slot, filled: false })));
  }

  // Halves: the left group takes the left half, the right group stacks on the right half.
  if (vp.w >= BP_HALVES) {
    const items: { c: Cur; slot: SlotName; filled: boolean }[] = [];
    for (const side of ['L', 'R'] as const) {
      const list = kept.filter((c) => sideOfFrac(SLOT_FRAC[c.slot]) === side);
      const half: SlotName = side === 'L' ? 'L2' : 'R2';
      const quarters: [SlotName, SlotName] = side === 'L' ? ['TL', 'BL'] : ['TR', 'BR'];
      const hr = slotRect(half, vp, false);
      const fit = list.filter((c) => fitsMin(APPS[c.app], hr));
      if (fit.length === 0) continue;
      if (fit.length === 1) {
        items.push({ c: fit[0]!, slot: half, filled: false });
        continue;
      }
      // Two stack as quarters when both fit. Otherwise the first one shows and the second is
      // tabbed away (skipped). A third entry is skipped.
      const [top, bottom] = fit as [Cur, Cur];
      const stack =
        fitsMin(APPS[top.app], slotRect(quarters[0], vp, false)) &&
        fitsMin(APPS[bottom.app], slotRect(quarters[1], vp, false));
      if (stack) {
        items.push({ c: top, slot: quarters[0], filled: false }, { c: bottom, slot: quarters[1], filled: false });
      } else {
        items.push({ c: top, slot: half, filled: false });
      }
    }
    if (items.some((it) => it.c.main)) return done('halves', items);
  }

  // Filled: the main window alone.
  return done('filled', [{ c: main, slot: main.slot, filled: true }]);
}
