import { describe, expect, it } from 'vitest';
import { makeWmCtx } from './ctx';
import { TAB_H, workArea } from './geometry';
import { type ShellState, type WmAction, type WmResult, focusedId, initialShell, project, reduce } from './wm';

// Window management in the desktop (UX evaluation, track B): snaps never overlap, a window pushed out is reported, focus mode
// isolates the focused window, the tab strip shows in the narrow modes, and a layout keeps the windows it does not place.

const R3 = makeWmCtx('R3');
const VP_1920 = { w: 1920, h: 1080 };
const VP_1440 = { w: 1440, h: 900 };
const VP_1000 = { w: 1000, h: 800 };

function fresh(vp = VP_1440, ticker = 'HLCN'): ShellState {
  return initialShell(vp, R3, ticker);
}

/** An empty workspace at a viewport: the Trade layout dropped. */
function empty(vp: { w: number; h: number }): ShellState {
  return { ...fresh(vp), wins: [], focusWs: [], focusRestore: null };
}

function run(s: ShellState, action: WmAction): WmResult {
  return reduce(s, action, R3);
}

function go(s: ShellState, action: WmAction): ShellState {
  const r = run(s, action);
  if (!r.ok) throw new Error(`refused ${action.type}: ${r.reason}`);
  return r.state;
}

/** True when two shown rects share interior area. */
function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Every pair of windows shown on the active workspace is disjoint. */
function assertNoOverlap(s: ShellState): void {
  const rects = project(s).rects;
  const ids = Object.keys(rects);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      expect(overlap(rects[ids[i]!]!, rects[ids[j]!]!), `${ids[i]} and ${ids[j]} overlap`).toBe(false);
    }
  }
}

describe('snap never leaves two windows on top of each other', () => {
  it('dropping Wire on the right half re-tiles the Broker to the left half and pushes out the Portfolio it covers', () => {
    // Trade at 1440: Broker on the left 70%, Wire on the top right panel, Portfolio on the bottom right panel.
    let s = fresh(VP_1440);
    s = go(s, { type: 'open', app: 'wire' });
    s = go(s, { type: 'open', app: 'portfolio' });
    const r = run(s, { type: 'snap', id: 'wire', slot: 'R2' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const wins = r.state.wins;
    expect(wins.find((w) => w.id === 'broker-1')!.slot).toBe('L2');
    expect(wins.find((w) => w.id === 'wire')!.slot).toBe('R2');
    expect(wins.find((w) => w.id === 'portfolio')!.state).toBe('collapsed');
    expect(r.notes?.pushed).toEqual(['portfolio']);
    expect(focusedId(r.state)).toBe('wire');
    assertNoOverlap(r.state);
  });

  it('a window snapped into a third re-tiles a neighbour that overlaps it to the remaining third', () => {
    let s = fresh(VP_1920);
    s = go(s, { type: 'open', app: 'wire' });
    s = go(s, { type: 'open', app: 'portfolio' });
    // Portfolio to the right two thirds, Broker still on the left 70%: the Broker must end on the left third.
    s = go(s, { type: 'snap', id: 'portfolio', slot: 'R23' });
    expect(s.wins.find((w) => w.id === 'broker-1')!.slot).toBe('L3');
    assertNoOverlap(s);
  });

  it('reports nothing pushed when the snap only re-tiles', () => {
    let s = go(empty(VP_1920), { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    s = go(s, { type: 'open', app: 'wire' });
    const r = run(s, { type: 'snap', id: 'wire', slot: 'R3B' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notes).toBeUndefined();
  });
});

describe('a window pushed out by an action is reported', () => {
  it('a third panel on Trade pushes the oldest panel to the shelf and says so in the notes', () => {
    let s = fresh(VP_1920);
    s = go(s, { type: 'open', app: 'wire' });
    s = go(s, { type: 'open', app: 'portfolio' });
    const r = run(s, { type: 'open', app: 'learn' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notes?.pushed).toEqual(['wire']);
    expect(r.state.wins.find((w) => w.id === 'wire')!.state).toBe('collapsed');
  });

  it('closing a window or collapsing it by hand reports nothing', () => {
    const s = go(fresh(VP_1920), { type: 'open', app: 'wire' });
    const closed = run(s, { type: 'close', id: 'wire' });
    expect(closed.ok && closed.notes).toBeUndefined();
    const collapsed = run(s, { type: 'collapse', id: 'wire' });
    expect(collapsed.ok && collapsed.notes).toBeUndefined();
  });
});

describe('a layout keeps the windows it does not place', () => {
  it('reports a Research layout with no file open as skipped, and keeps the other windows', () => {
    const s = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    const r = run(s, { type: 'applyLayout', name: 'research', ticker: 'HLCN' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notes?.skipped).toEqual(['research']);
    const cal = r.state.wins.find((w) => w.app === 'calendar')!;
    expect(cal.state).toBe('open');
    // Trade's Portfolio is not in the Research layout either, so it is kept with the calendar.
    expect([...(r.notes?.kept ?? [])].sort()).toEqual(['calendar', 'portfolio']);
  });

  it('keeps a kept window behind the placed ones in the stacking order', () => {
    const s = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    const r = run(s, { type: 'applyLayout', name: 'trade', ticker: 'HLCN' });
    if (!r.ok) throw new Error('refused');
    expect(r.state.wins[0]!.id).toBe('calendar');
    expect(focusedId(r.state)).toBe('broker-1');
  });
});

describe('focus mode isolates the focused window', () => {
  it('shows only the focused window, filling the work area', () => {
    const s = go(go(fresh(VP_1920), { type: 'open', app: 'wire' }), { type: 'focusMode', on: true });
    const p = project(s);
    expect(p.order).toEqual([focusedId(s)]);
    expect(Object.keys(p.rects)).toEqual([focusedId(s)]);
    expect(p.tabs).toBe(false);
  });

  it('leaves focus mode with every window back where it was', () => {
    const before = go(fresh(VP_1920), { type: 'open', app: 'wire' });
    const focused = go(before, { type: 'focusMode', on: true });
    const back = go(focused, { type: 'focusMode', on: false });
    expect(project(back).order.sort()).toEqual(project(before).order.sort());
  });
});

describe('the window tab strip in the narrow modes', () => {
  it('shows with two or more windows open in halves, and takes its foot from the work area', () => {
    let s = fresh(VP_1000);
    s = go(s, { type: 'open', app: 'wire' });
    const p = project(s);
    expect(p.tabs).toBe(true);
    expect(p.wa.h).toBe(workArea(VP_1000, false).h - TAB_H);
  });

  it('does not show with one window', () => {
    expect(project(go(empty(VP_1000), { type: 'open', app: 'broker', props: { ticker: 'HLCN' } })).tabs).toBe(false);
  });

  it('a third window in halves gets a rect of its own, not the rect of the window before it', () => {
    let s = empty(VP_1000);
    s = go(s, { type: 'open', app: 'calendar' });
    s = go(s, { type: 'open', app: 'messages' });
    s = go(s, { type: 'open', app: 'learn' });
    s = go(s, { type: 'open', app: 'bank' });
    const free = s.wins.filter((w) => w.slot === null && w.state === 'open');
    const keys = free.map((w) => `${w.rect.x},${w.rect.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('a snap in focus mode', () => {
  it('leaves the hidden neighbours alone, and leaving focus restores every slot', () => {
    const before = fresh(VP_1920);
    let s = go(before, { type: 'focusMode', on: true });
    s = go(s, { type: 'snap', id: 'wire', slot: 'R2' });
    expect(s.wins.find((w) => w.id === 'broker-1')!.slot).toBe('L23');
    expect(s.wins.find((w) => w.id === 'portfolio')!.state).toBe('open');
    s = go(s, { type: 'focusMode', on: false });
    for (const w of before.wins) {
      expect(s.wins.find((x) => x.id === w.id)!.slot, w.id).toEqual(w.slot);
      expect(s.wins.find((x) => x.id === w.id)!.state, w.id).toBe(w.state);
    }
  });
});
