/**
 * Tape desktop-shell hunts (tape-desktop-shell.md section 1, window-manager reducer), the rows the existing suites did not
 * name: wm_focus_is_top (2,000 seeded sequences), wm_free_clamp (a free window dragged off screen keeps its title bar on
 * screen) and wm_slot_exact (every snapped slot matches geometry within 1 px, with an 8 px gutter at 1440 x 900 and
 * 1920 x 1080). Test code only: these read the reducer and the projection, never the app.
 */
import { describe, expect, it } from 'vitest';
import { APPS, APP_IDS, type AppId } from './apps';
import { makeWmCtx } from './ctx';
import { GUTTER, SLOT_NAMES, type Size, slotRect, workArea } from './geometry';
import { type ShellState, type WmAction, focusedId, initialShell, project, reduce } from './wm';

const CTX = makeWmCtx('R3');
const VP_1440: Size = { w: 1440, h: 900 };
const VP_1920: Size = { w: 1920, h: 1080 };
const TITLE_MIN_VISIBLE = 48;

/** Seeded PRNG (mulberry32): the same 2,000 sequences on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VPS: Size[] = [VP_1440, VP_1920, { w: 1000, h: 800 }, { w: 900, h: 800 }, { w: 390, h: 844 }, { w: 1199, h: 800 }];
const APP_POOL: AppId[] = APP_IDS.filter((a) => APPS[a].available);

function randomAction(rnd: () => number, s: ShellState): WmAction {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const ids = s.wins.map((w) => w.id);
  const id = ids.length ? pick(ids) : 'nope';
  const roll = rnd();
  if (roll < 0.14) {
    const app = pick(APP_POOL);
    const props =
      app === 'broker' && rnd() < 0.6
        ? { ticker: pick(['HLCN', 'BRNT', 'AAA', 'BBB', 'CCC', 'DDD']) }
        : app === 'research'
          ? { fileId: pick(['f1', 'f2', 'f3']) }
          : undefined;
    return { type: 'open', app, props };
  }
  if (roll < 0.24) return { type: 'focus', id };
  if (roll < 0.3) return { type: 'close', id, force: rnd() < 0.5 };
  if (roll < 0.34) return { type: 'collapse', id };
  if (roll < 0.38) return { type: 'restore', id };
  if (roll < 0.42) return { type: 'fill', id };
  if (roll < 0.5) return { type: 'snap', id, slot: pick(SLOT_NAMES) };
  if (roll < 0.56) return { type: 'snapCycle', id, dir: pick(['left', 'right', 'up', 'down'] as const) };
  if (roll < 0.6) return { type: 'unsnap', id };
  if (roll < 0.66) {
    return { type: 'move', id, rect: { x: Math.floor(rnd() * 1500) - 100, y: Math.floor(rnd() * 900) - 50, w: 400 + Math.floor(rnd() * 300), h: 300 + Math.floor(rnd() * 300) } };
  }
  if (roll < 0.7) return { type: 'resize', id, rect: { x: 0, y: 0, w: 300 + Math.floor(rnd() * 900), h: 200 + Math.floor(rnd() * 700) } };
  if (roll < 0.73) return { type: 'switchWs', ws: Math.floor(rnd() * 3) };
  if (roll < 0.76) return { type: 'moveToWs', id, ws: Math.floor(rnd() * 3) };
  if (roll < 0.79) return { type: 'focusMode', on: rnd() < 0.5 };
  if (roll < 0.83) return { type: 'viewport', ...pick(VPS) };
  if (roll < 0.87) return { type: 'applyLayout', name: pick(['trade', 'review', 'research'] as const), ticker: rnd() < 0.5 ? undefined : 'HLCN' };
  if (roll < 0.9) return { type: 'saveLayout', name: pick(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']) };
  if (roll < 0.95) {
    const pair = s.wins.length >= 2 ? [s.wins[0]!.id, s.wins[1]!.id] : [id, id];
    return { type: 'splitEdge', a: pair[0]!, b: pair[1]!, axis: 'x', at: 0.3 + rnd() * 0.4 };
  }
  return { type: 'reorderShelf', order: [...s.shelf].reverse() };
}

/** The window an accepted action raises to the top, or null (the Cycle and Unsnap raise too). */
function raisedBy(action: WmAction): string | null {
  switch (action.type) {
    case 'focus':
    case 'restore':
    case 'fill':
    case 'snap':
    case 'snapCycle':
    case 'unsnap':
    case 'move':
    case 'resize':
      return action.id;
    case 'splitEdge':
      return action.a;
    default:
      return null;
  }
}

describe('wm_focus_is_top (2,000 seeded sequences)', () => {
  it('after every accepted action the focus is the top-most open window on the active workspace, with no stored focus or z field', () => {
    let checked = 0;
    for (let seq = 0; seq < 2000; seq++) {
      const rnd = rng(0x9000 + seq);
      let s = initialShell(VP_1440, CTX, 'HLCN');
      for (let step = 0; step < 40; step++) {
        const action = randomAction(rnd, s);
        const r = reduce(s, action, CTX);
        if (!r.ok) continue;
        s = r.state;
        checked++;
        // the focus is derived: the last open window on the active workspace in z-order (array order, last = top)
        let top: string | null = null;
        for (const w of s.wins) if (w.ws === s.activeWs && w.state === 'open') top = w.id;
        expect(focusedId(s), `seq ${seq} step ${step} ${action.type}`).toBe(top);
        // a raising action makes its window the focus when that window is open on the active workspace
        const raised = raisedBy(action);
        const w = raised ? s.wins.find((x) => x.id === raised) : undefined;
        if (w && w.state === 'open' && w.ws === s.activeWs) expect(focusedId(s), `raise ${raised}`).toBe(raised);
        // no z or focus field is stored on a window or on the shell
        for (const win of s.wins) {
          expect(Object.keys(win)).not.toContain('z');
          expect(Object.keys(win)).not.toContain('focus');
        }
        expect(Object.keys(s)).not.toContain('focus');
        expect(Object.keys(s)).not.toContain('z');
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });
});

describe('wm_free_clamp (a free window dragged off screen keeps its title bar on screen)', () => {
  function withFreePortfolio(): ShellState {
    let s = initialShell(VP_1440, CTX, 'HLCN');
    const r = reduce(s, { type: 'unsnap', id: 'portfolio' }, CTX);
    expect(r.ok).toBe(true);
    s = r.ok ? r.state : s;
    return s;
  }

  const cases: { name: string; rect: { x: number; y: number; w: number; h: number } }[] = [
    { name: 'off the right edge', rect: { x: 5000, y: 100, w: 600, h: 400 } },
    { name: 'off the left edge', rect: { x: -5000, y: 100, w: 600, h: 400 } },
    { name: 'above the top edge', rect: { x: 200, y: -3000, w: 600, h: 400 } },
    { name: 'below the bottom edge', rect: { x: 200, y: 5000, w: 600, h: 400 } },
  ];

  for (const c of cases) {
    it(`a window dragged ${c.name} keeps at least ${TITLE_MIN_VISIBLE} px of its title bar inside the work area`, () => {
      const s0 = withFreePortfolio();
      const r = reduce(s0, { type: 'move', id: 'portfolio', rect: c.rect }, CTX);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const p = project(r.state);
      const rect = p.rects['portfolio']!;
      expect(rect, 'rect').toBeDefined();
      // horizontal: at least 48 px of the window is on screen
      const visibleW = Math.min(rect.x + rect.w, p.wa.w) - Math.max(rect.x, 0);
      expect(visibleW).toBeGreaterThanOrEqual(TITLE_MIN_VISIBLE);
      // vertical: the title bar (the top 48 px of the window) is on screen
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + Math.min(TITLE_MIN_VISIBLE, rect.h)).toBeLessThanOrEqual(p.wa.h);
    });
  }
});

describe('wm_slot_exact (snapped rects match geometry within 1 px, gutter 8)', () => {
  for (const vp of [VP_1440, VP_1920]) {
    it(`every slot the Broker can take at ${vp.w} x ${vp.h} is placed within 1 px of its geometry`, () => {
      const base = initialShell(vp, CTX, 'HLCN');
      let placed = 0;
      for (const slot of SLOT_NAMES) {
        const r = reduce(base, { type: 'snap', id: 'broker-1', slot }, CTX);
        if (!r.ok) continue; // a slot that cannot fit the Broker's minimum or the mode is refused, not placed wrongly
        const rect = project(r.state).rects['broker-1']!;
        const want = slotRect(slot, vp, false);
        placed++;
        expect(Math.abs(rect.x - want.x), `${slot} x`).toBeLessThanOrEqual(1);
        expect(Math.abs(rect.y - want.y), `${slot} y`).toBeLessThanOrEqual(1);
        expect(Math.abs(rect.w - want.w), `${slot} w`).toBeLessThanOrEqual(1);
        expect(Math.abs(rect.h - want.h), `${slot} h`).toBeLessThanOrEqual(1);
      }
      expect(placed).toBeGreaterThanOrEqual(4);
    });
  }

  it('the halves at 1440 x 900 leave exactly 8 px between them and 8 px at the outer edges', () => {
    const wa = workArea(VP_1440, false);
    const left = slotRect('L2', VP_1440, false);
    const right = slotRect('R2', VP_1440, false);
    expect(left.x).toBe(GUTTER);
    expect(right.x - (left.x + left.w)).toBe(GUTTER);
    expect(right.x + right.w).toBe(wa.w - GUTTER);
    expect(left.y).toBe(GUTTER);
    expect(left.h).toBe(wa.h - 2 * GUTTER);
  });

  it('the thirds at 1920 x 1080 leave exactly 8 px between the stacked slots and 8 px at the edges', () => {
    const wa = workArea(VP_1920, false);
    const top = slotRect('R3T', VP_1920, false);
    const bottom = slotRect('R3B', VP_1920, false);
    expect(bottom.y - (top.y + top.h)).toBe(GUTTER);
    expect(top.y).toBe(GUTTER);
    expect(bottom.y + bottom.h).toBe(wa.h - GUTTER);
  });
});
