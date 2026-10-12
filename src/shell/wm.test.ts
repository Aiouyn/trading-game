import { describe, expect, it } from 'vitest';
import { APPS, APP_IDS, type AppId } from './apps';
import { makeWmCtx } from './ctx';
import { type Rect, openRect, slotRect, workArea, SLOT_NAMES, type SlotName } from './geometry';
import {
  type ShellState,
  type WmAction,
  type WmCtx,
  focusedId,
  initialShell,
  isFocused,
  normalize,
  project,
  reduce,
} from './wm';

// ---------------------------------------------------------------- helpers

const R3 = makeWmCtx('R3');
const R0 = makeWmCtx('R0');
const R2 = makeWmCtx('R2');
const R1 = makeWmCtx('R1');
const VP_1440 = { w: 1440, h: 900 };
const VP_1920 = { w: 1920, h: 1080 };
const VP_1000 = { w: 1000, h: 800 };
const VP_900 = { w: 900, h: 800 };
const VP_390 = { w: 390, h: 844 };

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

function fresh(vp = VP_1440, ctx: WmCtx = R3, ticker = 'HLCN'): ShellState {
  return deepFreeze(initialShell(vp, ctx, ticker));
}

/** Applies an action that must succeed. */
function go(s: ShellState, action: WmAction, ctx: WmCtx = R3): ShellState {
  const r = reduce(s, action, ctx);
  if (!r.ok) throw new Error(`refused ${action.type}: ${r.reason}`);
  return deepFreeze(r.state);
}

/** Applies an action that must be refused, and checks the input is unchanged. */
function refused(s: ShellState, action: WmAction, reason: string, ctx: WmCtx = R3): void {
  const before = JSON.stringify(s);
  const r = reduce(s, action, ctx);
  expect(r).toEqual({ ok: false, reason });
  expect(JSON.stringify(s)).toBe(before);
}

const brokers = (s: ShellState) => s.wins.filter((w) => w.app === 'broker');

function assertInvariants(s: ShellState, ctx: WmCtx): void {
  const ids = s.wins.map((w) => w.id);
  expect(new Set(ids).size, 'unique ids').toBe(ids.length);
  expect(brokers(s).length, 'broker cap').toBeLessThanOrEqual(4);
  const research = s.wins.filter((w) => w.app === 'research').map((w) => w.props.fileId);
  expect(new Set(research).size, 'one window per file').toBe(research.length);
  expect(s.activeWs).toBeGreaterThanOrEqual(0);
  expect(s.activeWs).toBeLessThan(ctx.workspaces);
  for (const w of s.wins) {
    expect(ctx.unlocked(w.app), `locked ${w.app}`).toBe(true);
    expect(w.ws).toBeLessThan(ctx.workspaces);
  }
  expect(s.layouts.length).toBeLessThanOrEqual(5);
  expect(s.shelf[0]).toBe('broker');
  // focus mode: sorted, unique, in range; every snapshot belongs to a workspace in focus mode
  expect(s.focusWs, 'focusWs sorted').toEqual([...new Set(s.focusWs)].sort((a, b) => a - b));
  for (const ws of s.focusWs) expect(ws, 'focusWs in range').toBeLessThan(ctx.workspaces);
  for (const snap of Object.values(s.focusRestore ?? {})) expect(s.focusWs, 'snapshot ws').toContain(snap.ws);
  // nothing shown is outside the work area
  const p = project(s);
  for (const id of Object.keys(p.rects)) {
    const r = p.rects[id]!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w, `${id} right`).toBeLessThanOrEqual(p.wa.w);
    expect(r.y + r.h, `${id} bottom`).toBeLessThanOrEqual(p.wa.h);
  }
}

/** Seeded PRNG (mulberry32) so the property runs are reproducible. */
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

// ---------------------------------------------------------------- start

describe('initial shell', () => {
  it('opens the Trade layout with the Broker focused on a fresh save (halves at 1440 x 900)', () => {
    const s = fresh(VP_1440);
    expect(s.wins.map((w) => [w.id, w.app, w.slot])).toEqual([
      ['wire', 'wire', 'TR'],
      ['portfolio', 'portfolio', 'BR'],
      ['broker-1', 'broker', 'L2'],
    ]);
    expect(focusedId(s)).toBe('broker-1');
    expect(s.wins.find((w) => w.app === 'broker')!.props).toEqual({ ticker: 'HLCN' });
    expect(s.activeWs).toBe(0);
    expect(s.focusWs).toEqual([]);
  });

  it('uses the thirds at 1920 x 1080', () => {
    const s = fresh(VP_1920);
    expect(s.wins.map((w) => w.slot)).toEqual(['R3T', 'R3B', 'L23']);
  });

  it('keeps the table shelf order with Broker first and no hidden apps', () => {
    const s = fresh();
    expect(s.shelf[0]).toBe('broker');
    expect(s.shelf).toContain('exchange');
    expect(s.shelf).toContain('launchpad');
    expect(s.shelf.indexOf('launchpad')).toBe(s.shelf.indexOf('exchange') + 1);
  });
});

// ---------------------------------------------------------------- open rules

describe('open', () => {
  it('focuses an app that is already open instead of opening a second one', () => {
    let s = fresh();
    s = go(s, { type: 'open', app: 'calendar' });
    expect(focusedId(s)).toBe('calendar');
    s = go(s, { type: 'open', app: 'wire' });
    expect(focusedId(s)).toBe('wire');
    expect(s.wins.filter((w) => w.app === 'wire')).toHaveLength(1);
  });

  it('caps Brokers at 4: a fifth switches the least-recently-focused Broker ticker, and no ticker is duplicated', () => {
    let s = fresh();
    for (const t of ['AAA', 'BBB', 'CCC']) s = go(s, { type: 'open', app: 'broker', props: { ticker: t } });
    expect(brokers(s)).toHaveLength(4);
    const lru = brokers(s)[0]!; // bottom-most Broker in z-order
    expect(lru.props.ticker).toBe('HLCN');
    s = go(s, { type: 'open', app: 'broker', props: { ticker: 'BRNT' } });
    expect(brokers(s)).toHaveLength(4);
    expect(brokers(s).map((w) => w.props.ticker).sort()).toEqual(['AAA', 'BBB', 'BRNT', 'CCC']);
    expect(focusedId(s)).toBe(lru.id);
  });

  it('refuses a fresh Broker at the cap and leaves every other window alone', () => {
    let s = fresh();
    for (const t of ['AAA', 'BBB', 'CCC']) s = go(s, { type: 'open', app: 'broker', props: { ticker: t } });
    expect(brokers(s)).toHaveLength(4);
    const before = JSON.stringify(s.wins);
    const r = reduce(s, { type: 'open', app: 'broker', props: { ticker: 'BRNT' }, fresh: true }, R3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('instance');
    expect(JSON.stringify(s.wins)).toBe(before);
  });

  it('focuses the existing Broker when the ticker already has one (C-12)', () => {
    let s = fresh();
    s = go(s, { type: 'open', app: 'broker', props: { ticker: 'AAA' } });
    s = go(s, { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    expect(brokers(s)).toHaveLength(2);
    expect(focusedId(s)).toBe('broker-1');
  });

  it('a fresh open makes a new Broker for a ticker that already has one (launcher Shift+Enter, New Broker)', () => {
    let s = fresh();
    s = go(s, { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    expect(brokers(s)).toHaveLength(1);
    s = go(s, { type: 'open', app: 'broker', props: { ticker: 'HLCN' }, fresh: true });
    expect(brokers(s)).toHaveLength(2);
    expect(brokers(s).map((w) => w.props.ticker)).toEqual(['HLCN', 'HLCN']);
    expect(focusedId(s)).toBe('broker-2');
  });

  it('opens one window per Research file and focuses it on a second open', () => {
    let s = fresh();
    s = go(s, { type: 'open', app: 'research', props: { fileId: 'f1' } });
    s = go(s, { type: 'open', app: 'research', props: { fileId: 'f2' } });
    s = go(s, { type: 'open', app: 'research', props: { fileId: 'f1' } });
    const files = s.wins.filter((w) => w.app === 'research');
    expect(files.map((w) => w.id)).toEqual(['research-f2', 'research-f1']);
    expect(focusedId(s)).toBe('research-f1');
  });

  it('refuses a locked app and leaves the state alone (layouts, links and hand edits too)', () => {
    const s = fresh();
    refused(s, { type: 'open', app: 'research', props: { fileId: 'f1' } }, 'locked', R2);
    refused(s, { type: 'open', app: 'ailab' }, 'locked', R1);
    refused(s, { type: 'open', app: 'company' }, 'locked', R1);
    expect(s.wins.some((w) => w.app === 'research')).toBe(false);
  });

  it('opens the Launchpad window from the shelf (Phase 5)', () => {
    const s = go(fresh(), { type: 'open', app: 'launchpad' });
    expect(s.wins.some((w) => w.app === 'launchpad')).toBe(true);
  });

  it('refuses malformed props and unknown ids', () => {
    const s = fresh();
    refused(s, { type: 'open', app: 'broker', props: { ticker: 'bad ticker!!' } }, 'bad-props');
    refused(s, { type: 'open', app: 'wire', props: { ticker: 'HLCN' } }, 'bad-props');
    refused(s, { type: 'open', app: 'lab' as AppId }, 'bad-props');
  });

  it('opens an app that is unlocked and places it on the active workspace, focused', () => {
    // On Trade with the Broker open, the app is a right side panel (UX stage 2), so it is placed and focused.
    const s = go(fresh(), { type: 'open', app: 'ailab' });
    const w = s.wins.find((x) => x.app === 'ailab')!;
    expect(w.ws).toBe(0);
    // UX stage 6: the default Trade quarters are not side panels, so the app tiles beside the Broker (R2) and the quarters collapse.
    expect(['R2', 'R3']).toContain(w.slot);
    expect(focusedId(s)).toBe('ailab');
    const off = go(emptyShell(VP_1440), { type: 'open', app: 'ailab' });
    expect(off.wins.find((x) => x.app === 'ailab')!.slot).toBeNull();
  });

  it('opens the Broker alone on an empty 1440 x 900 workspace on the left two thirds (defect A)', () => {
    const s = go(emptyShell(VP_1440), { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    const b = s.wins.find((w) => w.app === 'broker')!;
    expect(b.slot).toBe('L23');
    expect(b.filled).toBe(false);
    expect(project(s).rects[b.id]).toEqual(slotRect('L23', VP_1440, false));
  });

  it('fills the Broker opened alone below 1200 px instead of snapping it', () => {
    for (const vp of [VP_1000, { w: 1100, h: 800 }]) {
      const s = go(emptyShell(vp), { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
      const b = s.wins.find((w) => w.app === 'broker')!;
      expect(b.filled, `filled at ${vp.w}`).toBe(true);
      expect(b.slot).toBeNull();
    }
  });

  it('centres the first other window and cascades the next by 24 px (defect A)', () => {
    const wa = workArea(VP_1440, false);
    let s = go(emptyShell(VP_1440), { type: 'open', app: 'settings' });
    const first = s.wins.find((w) => w.app === 'settings')!.rect;
    expect(first).toEqual(openRect(APPS.settings, wa, 0));
    expect(first.x).toBe(Math.round((wa.w - first.w) / 2));
    s = go(s, { type: 'open', app: 'wire' });
    expect(s.wins.find((w) => w.app === 'wire')!.rect).toEqual(openRect(APPS.wire, wa, 1));
    s = go(s, { type: 'open', app: 'learn' });
    expect(s.wins.find((w) => w.app === 'learn')!.rect).toEqual(openRect(APPS.learn, wa, 2));
  });

  it('a Broker that opens beside another window tiles with it: the older window keeps the left half (UX 2)', () => {
    let s = go(emptyShell(VP_1440), { type: 'open', app: 'wire' });
    s = go(s, { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    expect(s.wins.find((w) => w.app === 'wire')!.slot).toBe('L2');
    expect(s.wins.find((w) => w.app === 'broker')!.slot).toBe('R2');
  });

  it('a later Broker on the same workspace retiles: the first Broker moves to the left half, the new one to the right', () => {
    let s = go(emptyShell(VP_1440), { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    s = go(s, { type: 'open', app: 'broker', props: { ticker: 'BRNT' }, fresh: true });
    expect(s.wins.find((w) => w.id === 'broker-1')!.slot).toBe('L2');
    expect(s.wins.find((w) => w.id === 'broker-2')!.slot).toBe('R2');
  });

  it('three windows tile as one large window plus two stacked; four as quarters (UX 2), on a non-Trade workspace', () => {
    // Empire (workspace 3) has no default app, so its windows tile from empty; Trade uses side panels (next test).
    let s = go(emptyShell(VP_1920), { type: 'switchWs', ws: 3 }, R3);
    s = go(s, { type: 'open', app: 'learn' }, R3);
    s = go(s, { type: 'open', app: 'calendar' }, R3);
    s = go(s, { type: 'open', app: 'settings' }, R3);
    expect(s.wins.find((w) => w.app === 'learn')!.slot).toBe('L23');
    expect(s.wins.find((w) => w.app === 'calendar')!.slot).toBe('R3T');
    expect(s.wins.find((w) => w.app === 'settings')!.slot).toBe('R3B');
    s = go(s, { type: 'open', app: 'ailab' }, R3);
    const slots = s.wins.filter((w) => w.ws === s.activeWs && w.state === 'open').map((w) => w.slot);
    expect(slots).toEqual(['TL', 'TR', 'BL', 'BR']);
  });

  it('on Trade, apps opened beside the Broker are right side panels, not tiles over the chart (UX stage 2)', () => {
    let s = go(emptyShell(VP_1920), { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    s = go(s, { type: 'open', app: 'wire' });
    s = go(s, { type: 'open', app: 'portfolio' });
    expect(s.wins.find((w) => w.app === 'broker')!.slot).toBe('L23');
    expect(s.wins.find((w) => w.app === 'wire')!.slot).toBe('R3');
    expect(s.wins.find((w) => w.app === 'portfolio')!.slot).toBe('R3T');
    s = go(s, { type: 'open', app: 'learn' });
    expect(s.wins.find((w) => w.app === 'learn')!.slot).toBe('R3B');
    expect(s.wins.find((w) => w.app === 'broker')!.slot).toBe('L23');
    // With every side slot taken, the oldest panel collapses to the shelf.
    s = go(s, { type: 'open', app: 'calendar' });
    expect(s.wins.find((w) => w.app === 'wire')!.state).toBe('collapsed');
    expect(s.wins.find((w) => w.app === 'calendar')!.slot).toBe('R3');
  });

  it('closing one of three tiled windows reflows the other two into halves (UX stage 2)', () => {
    let s = go(emptyShell(VP_1920), { type: 'switchWs', ws: 3 }, R3);
    s = go(s, { type: 'open', app: 'learn' }, R3);
    s = go(s, { type: 'open', app: 'calendar' }, R3);
    s = go(s, { type: 'open', app: 'settings' }, R3);
    expect(s.wins.find((w) => w.app === 'learn')!.slot).toBe('L23');
    s = go(s, { type: 'close', id: 'settings' }, R3);
    const slots = s.wins.filter((w) => w.ws === 3 && w.state === 'open').map((w) => w.slot);
    expect(slots).toEqual(['L2', 'R2']);
  });

  it('keeps a window opened on top visible in halves, even when a filled window is below it', () => {
    let s = go(emptyShell(VP_1000), { type: 'open', app: 'broker', props: { ticker: 'HLCN' } });
    s = go(s, { type: 'open', app: 'wire' });
    const p = project(s);
    expect(Object.keys(p.rects)).toContain('wire');
    expect(p.rects.wire).toEqual(slotRect('R2', VP_1000, false));
  });
});

/** An empty shell at a viewport: no windows, the Trade layout dropped. */
function emptyShell(vp: { w: number; h: number }): ShellState {
  return deepFreeze({ ...initialShell(vp, R3, 'HLCN'), wins: [] });
}

// ---------------------------------------------------------------- close, collapse, restore

describe('close, collapse and restore', () => {
  it('refuses a Broker close with a pending order and keeps the window; force closes it', () => {
    const ctx = makeWmCtx('R3', (t) => t === 'HLCN');
    const s = fresh();
    refused(s, { type: 'close', id: 'broker-1' }, 'confirm', ctx);
    const closed = go(s, { type: 'close', id: 'broker-1', force: true }, ctx);
    expect(closed.wins.some((w) => w.id === 'broker-1')).toBe(false);
  });

  it('closes a Broker freely when no order is pending', () => {
    const s = go(fresh(), { type: 'close', id: 'broker-1' });
    expect(s.wins.some((w) => w.app === 'broker')).toBe(false);
  });

  it('collapses a window to the shelf and focus moves to the next top window', () => {
    let s = fresh();
    s = go(s, { type: 'open', app: 'calendar' });
    s = go(s, { type: 'collapse', id: 'calendar' });
    expect(s.wins.find((w) => w.app === 'calendar')!.state).toBe('collapsed');
    expect(focusedId(s)).toBe('broker-1');
  });

  it('restores a collapsed window and focuses it', () => {
    let s = fresh();
    s = go(s, { type: 'collapse', id: 'wire' });
    s = go(s, { type: 'restore', id: 'wire' });
    expect(s.wins.find((w) => w.app === 'wire')!.state).toBe('open');
    expect(focusedId(s)).toBe('wire');
  });

  it('opening a collapsed app restores and focuses it', () => {
    let s = fresh();
    s = go(s, { type: 'collapse', id: 'wire' });
    s = go(s, { type: 'open', app: 'wire' });
    expect(s.wins.find((w) => w.app === 'wire')!.state).toBe('open');
    expect(focusedId(s)).toBe('wire');
  });

  it('refuses an action on a window that does not exist', () => {
    refused(fresh(), { type: 'focus', id: 'nope' }, 'no-window');
    refused(fresh(), { type: 'close', id: 'nope' }, 'no-window');
  });
});

// ---------------------------------------------------------------- snap

describe('snap', () => {
  it('snaps a window to a half at 1440 x 900 and the rect matches the slot exactly', () => {
    let s = go(fresh(VP_1440), { type: 'open', app: 'calendar' });
    s = go(s, { type: 'snap', id: 'calendar', slot: 'L2' });
    expect(project(s).rects.calendar).toEqual(slotRect('L2', VP_1440, false));
  });

  it('refuses thirds and quarters below 1200 and any snap below 768 (mode)', () => {
    const s = go(fresh(VP_1000), { type: 'open', app: 'calendar' }, R3);
    refused(s, { type: 'snap', id: 'calendar', slot: 'L23' }, 'mode');
    refused(s, { type: 'snap', id: 'calendar', slot: 'TL' }, 'mode');
    const single = go(fresh(VP_900), { type: 'open', app: 'calendar' }, R3);
    refused(single, { type: 'snap', id: 'calendar', slot: 'L2' }, 'mode');
  });

  it('refuses a snap that would drop a window under its minimum (C-26): Broker in a 468 px third at 1440', () => {
    const s = fresh(VP_1440);
    refused(s, { type: 'snap', id: 'broker-1', slot: 'R3' }, 'too-small');
  });

  it('refuses a Portfolio half at 1000 (488 px < 520) and allows Broker and Wire halves', () => {
    const s = go(fresh(VP_1000), { type: 'open', app: 'portfolio' });
    refused(s, { type: 'snap', id: 'portfolio', slot: 'R2' }, 'too-small');
    const ok = go(s, { type: 'snap', id: 'wire', slot: 'R2' });
    expect(ok.wins.find((w) => w.app === 'wire')!.slot).toBe('R2');
  });

  it('cycles Ctrl Left through 1/2, 1/3, 2/3 and back', () => {
    let s = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      s = go(s, { type: 'snapCycle', id: 'calendar', dir: 'left' });
      seen.push(s.wins.find((w) => w.app === 'calendar')!.slot);
    }
    expect(seen).toEqual(['L2', 'L3', 'L23', 'L2']);
  });

  it('cycles Ctrl Up to a quarter, then fill, and Ctrl Down un-fills then steps back down', () => {
    let s = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    s = go(s, { type: 'snap', id: 'calendar', slot: 'L2' });
    s = go(s, { type: 'snapCycle', id: 'calendar', dir: 'up' });
    expect(s.wins.find((w) => w.app === 'calendar')!.slot).toBe('TL');
    s = go(s, { type: 'snapCycle', id: 'calendar', dir: 'up' });
    expect(s.wins.find((w) => w.app === 'calendar')!.filled).toBe(true);
    s = go(s, { type: 'snapCycle', id: 'calendar', dir: 'down' });
    expect(s.wins.find((w) => w.app === 'calendar')!.filled).toBe(false);
    s = go(s, { type: 'snapCycle', id: 'calendar', dir: 'down' });
    expect(s.wins.find((w) => w.app === 'calendar')!.slot).toBe('L2');
  });

  it('fills and un-fills, and a filled window shows the whole work area', () => {
    let s = go(fresh(VP_1440), { type: 'open', app: 'calendar' });
    s = go(s, { type: 'fill', id: 'calendar' });
    const wa = workArea(VP_1440, false);
    expect(project(s).rects.calendar).toEqual({ x: 8, y: 8, w: 1440 - 16, h: wa.h - 16 });
    s = go(s, { type: 'fill', id: 'calendar' });
    expect(s.wins.find((w) => w.app === 'calendar')!.filled).toBe(false);
  });

  it('unsnap keeps the shown rect as the free rect', () => {
    let s = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    s = go(s, { type: 'snap', id: 'calendar', slot: 'L2' });
    const shown = project(s).rects.calendar!;
    s = go(s, { type: 'unsnap', id: 'calendar' });
    const w = s.wins.find((x) => x.app === 'calendar')!;
    expect(w.slot).toBeNull();
    expect(w.rect).toEqual(shown);
  });
});

// ---------------------------------------------------------------- free placement

describe('move and resize', () => {
  it('moves a window and clamps it fully into the work area', () => {
    let s = go(fresh(VP_1440), { type: 'open', app: 'calendar' });
    s = go(s, { type: 'move', id: 'calendar', rect: { x: 5000, y: -300, w: 500, h: 400 } });
    const wa = workArea(VP_1440, false);
    const w = s.wins.find((x) => x.app === 'calendar')!;
    expect(w.rect).toEqual({ x: wa.w - 500, y: 0, w: 500, h: 400 });
    expect(w.slot).toBeNull();
  });

  it('refuses a resize under the app minimum and a rect bigger than the work area', () => {
    const s = go(fresh(VP_1440), { type: 'open', app: 'calendar' });
    refused(s, { type: 'resize', id: 'calendar', rect: { x: 0, y: 0, w: 300, h: 300 } }, 'too-small');
    refused(s, { type: 'resize', id: 'calendar', rect: { x: 0, y: 0, w: 5000, h: 300 } }, 'too-large');
    refused(s, { type: 'resize', id: 'calendar', rect: { x: NaN, y: 0, w: 500, h: 300 } }, 'bad-rect');
  });

  it('refuses free placement below 1200 (mode)', () => {
    const s = go(fresh(VP_1000), { type: 'open', app: 'calendar' });
    refused(s, { type: 'move', id: 'calendar', rect: { x: 0, y: 0, w: 500, h: 400 } }, 'mode');
  });

  it('a shared-edge drag stores the split as a fraction on both windows', () => {
    const s = fresh(VP_1920);
    const t = go(s, { type: 'splitEdge', a: 'broker-1', b: 'wire', axis: 'x', at: 0.6 });
    const broker = t.wins.find((w) => w.app === 'broker')!;
    const wire = t.wins.find((w) => w.app === 'wire')!;
    expect(broker.slot).toEqual({ custom: { x0: 0, y0: 0, x1: 0.6, y1: 1 } });
    expect(wire.slot).toEqual({ custom: { x0: 0.6, y0: 0, x1: 1, y1: 0.5 } });
    const p = project(t);
    expect(p.rects['broker-1']!.x + p.rects['broker-1']!.w).toBeLessThan(p.rects.wire!.x);
  });

  it('refuses a shared-edge split that leaves a window under its minimum, and one without a shared edge', () => {
    const s = fresh(VP_1920);
    refused(s, { type: 'splitEdge', a: 'broker-1', b: 'wire', axis: 'x', at: 0.95 }, 'too-small');
    refused(s, { type: 'splitEdge', a: 'wire', b: 'portfolio', axis: 'x', at: 0.8 }, 'bad-edge');
    refused(fresh(VP_1000), { type: 'splitEdge', a: 'broker-1', b: 'wire', axis: 'x', at: 0.5 }, 'mode');
  });
});

// ---------------------------------------------------------------- workspaces, focus mode

describe('workspaces', () => {
  it('derives the workspace count from the earned rank: R0 and R1 Trade and News, R2 adds Portfolio, R3 adds Empire', () => {
    const s = fresh(VP_1440, R0);
    refused(s, { type: 'switchWs', ws: 2 }, 'no-workspace', R0);
    expect(go(s, { type: 'switchWs', ws: 0 }, R0)).toBe(s);
    const s2 = fresh(VP_1440, R2);
    expect(go(s2, { type: 'switchWs', ws: 1 }, R2).activeWs).toBe(1);
    expect(go(s2, { type: 'switchWs', ws: 2 }, R2).activeWs).toBe(2);
    refused(s2, { type: 'switchWs', ws: 3 }, 'no-workspace', R2);
  });

  it('a workspace with no windows opens its default app (Trade the Broker, News the Wire), once per visit', () => {
    const news = go(emptyShell(VP_1440), { type: 'switchWs', ws: 1 }, R0);
    expect(news.activeWs).toBe(1);
    expect(news.wins.filter((w) => w.ws === 1).map((w) => w.app)).toEqual(['wire']);
    expect(focusedId(news)).toBe('wire');
    const back = go(news, { type: 'switchWs', ws: 0 }, R0);
    expect(back.wins.filter((w) => w.ws === 0).map((w) => w.app)).toEqual(['broker']);
    // Switching again does not open a second copy: the workspace already holds its window.
    const again = go(go(back, { type: 'switchWs', ws: 1 }, R0), { type: 'switchWs', ws: 0 }, R0);
    expect(again.wins.filter((w) => w.ws === 0)).toHaveLength(1);
  });

  it('moves windows off a removed workspace to 0 on load, without losing any', () => {
    let s = go(fresh(VP_1440, R3), { type: 'switchWs', ws: 3 }, R3);
    s = go(s, { type: 'open', app: 'calendar' }, R3);
    expect(s.wins.every((w) => w.app === 'calendar' ? w.ws === 3 : true)).toBe(true);
    const lower = normalize({ ...s, activeWs: 3 }, R1);
    expect(lower.wins.length).toBe(s.wins.length);
    expect(lower.wins.find((w) => w.app === 'calendar')!.ws).toBe(0);
    expect(lower.activeWs).toBe(0);
  });

  it('moves a window to another workspace and refuses a locked one', () => {
    let s = go(fresh(VP_1440, R3), { type: 'open', app: 'research', props: { fileId: 'f9' } }, R3);
    s = go(s, { type: 'moveToWs', id: 'research-f9', ws: 1 }, R3);
    expect(s.wins.find((w) => w.app === 'research')!.ws).toBe(1);
    refused(s, { type: 'moveToWs', id: 'research-f9', ws: 1 }, 'locked', R0);
  });

  it('exits focus mode on the workspace a new window lands on', () => {
    let s = go(fresh(VP_1920), { type: 'focusMode', on: true });
    s = go(s, { type: 'open', app: 'ailab' });
    expect(s.focusWs).toEqual([]);
    expect(s.focusRestore).toBeNull();
  });

  it('keeps focus mode when a window already on screen is focused, and leaves it when a collapsed one is restored', () => {
    let s = go(fresh(VP_1920), { type: 'focusMode', on: true });
    s = go(s, { type: 'open', app: 'portfolio' });
    expect(s.focusWs).toEqual([0]);
    expect(focusedId(s)).toBe('portfolio');
    s = go(s, { type: 'collapse', id: 'portfolio' });
    s = go(s, { type: 'open', app: 'portfolio' });
    expect(s.focusWs).toEqual([]);
    expect(s.focusRestore).toBeNull();
    expect(focusedId(s)).toBe('portfolio');
  });

  it('focus mode is per workspace: a switch keeps each workspace its own mode', () => {
    let s = go(fresh(VP_1920, R2), { type: 'focusMode', on: true }, R2);
    s = go(s, { type: 'switchWs', ws: 2 }, R2);
    expect(s.focusWs).toEqual([0]);
    expect(isFocused(s)).toBe(false);
    s = go(s, { type: 'focusMode', on: true }, R2);
    expect(s.focusWs).toEqual([0, 2]);
    s = go(s, { type: 'switchWs', ws: 0 }, R2);
    expect(isFocused(s)).toBe(true);
    s = go(s, { type: 'focusMode', on: false }, R2);
    expect(s.focusWs).toEqual([2]);
  });

  it('opening a window on one workspace leaves the other workspace in focus mode', () => {
    let s = go(fresh(VP_1920, R2), { type: 'focusMode', on: true }, R2);
    s = go(s, { type: 'switchWs', ws: 2 }, R2);
    s = go(s, { type: 'focusMode', on: true }, R2);
    s = go(s, { type: 'open', app: 'calendar' }, R2);
    expect(s.focusWs).toEqual([0]);
    expect(s.wins.find((w) => w.app === 'calendar')!.ws).toBe(2);
  });

  it('leaving focus on one workspace restores its windows and not the other workspace', () => {
    const base = go(fresh(VP_1920, R2), { type: 'open', app: 'calendar' }, R2);
    let s = go(base, { type: 'focusMode', on: true }, R2);
    s = go(s, { type: 'switchWs', ws: 2 }, R2);
    s = go(s, { type: 'open', app: 'ailab' }, R2);
    s = go(s, { type: 'focusMode', on: true }, R2);
    s = go(s, { type: 'switchWs', ws: 0 }, R2);
    s = go(s, { type: 'focusMode', on: false }, R2);
    expect(s.focusWs).toEqual([2]);
    const back = (ws: ShellState['wins']) => ws.filter((w) => w.ws === 0).map((w) => [w.id, w.rect, w.slot, w.filled]);
    expect(back(s.wins)).toEqual(back(base.wins));
    expect(s.focusRestore && Object.values(s.focusRestore).every((x) => x.ws === 2)).toBe(true);
  });

  it('refuses a move into or out of a workspace in focus mode, and a close drops its snapshot', () => {
    let s = go(fresh(VP_1920, R2), { type: 'focusMode', on: true }, R2);
    refused(s, { type: 'moveToWs', id: 'wire', ws: 1 }, 'mode', R2);
    s = go(s, { type: 'close', id: 'wire', force: true }, R2);
    expect(s.focusRestore && 'wire' in s.focusRestore).toBe(false);
  });
});

describe('focus mode', () => {
  it('restores every rect, slot and fill exactly after random moves and snaps', () => {
    const before = fresh(VP_1920);
    let s = go(before, { type: 'focusMode', on: true });
    const rnd = rng(7);
    const ids = before.wins.map((w) => w.id);
    for (let i = 0; i < 50; i++) {
      const id = ids[Math.floor(rnd() * ids.length)]!;
      const roll = rnd();
      const act: WmAction =
        roll < 0.4
          ? { type: 'snap', id, slot: SLOT_NAMES[Math.floor(rnd() * SLOT_NAMES.length)] as SlotName }
          : roll < 0.7
            ? { type: 'move', id, rect: { x: Math.floor(rnd() * 300), y: 0, w: 500, h: 400 } }
            : { type: 'fill', id };
      const r = reduce(s, act, R3);
      if (r.ok) s = deepFreeze(r.state);
    }
    s = go(s, { type: 'focusMode', on: false });
    expect(s.focusRestore).toBeNull();
    // Windows may be raised by the random actions (z-order is not part of the snapshot); the
    // rect, slot and fill of every window must come back exactly.
    const byId = (ws: ShellState['wins']) =>
      Object.fromEntries(ws.map((w) => [w.id, { rect: w.rect, slot: w.slot, filled: w.filled }]));
    expect(byId(s.wins)).toEqual(byId(before.wins));
    expect(s.wins.map((w) => w.id).sort()).toEqual(before.wins.map((w) => w.id).sort());
  });

  it('takes the Trade slots on an unsnapped workspace at 1200+, and restores the free rects after', () => {
    const base = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    const free = { ...base, wins: base.wins.map((w) => ({ ...w, slot: null })) };
    const on = go(deepFreeze(free), { type: 'focusMode', on: true });
    expect(on.wins.find((w) => w.app === 'broker')!.slot).toBe('L23');
    expect(on.wins.find((w) => w.app === 'wire')!.slot).toBe('R3T');
    expect(on.wins.find((w) => w.app === 'portfolio')!.slot).toBe('R3B');
    const off = go(on, { type: 'focusMode', on: false });
    expect(off.wins).toEqual(free.wins);
  });

  it('uses a 1 px gutter and a 24 px strip while focused', () => {
    const s = go(fresh(VP_1440), { type: 'focusMode', on: true });
    expect(project(s).gutter).toBe(1);
    expect(project(s).wa.h).toBe(900 - 24);
  });
});

// ---------------------------------------------------------------- viewport and compact

describe('viewport', () => {
  it('round-trips 1440 -> 900 -> 1000 -> 390 -> 1440 to a deep-equal state', () => {
    const start = fresh(VP_1440);
    let s = start;
    for (const vp of [{ w: 900, h: 800 }, VP_1000, VP_390, VP_1440]) {
      s = go(s, { type: 'viewport', w: vp.w, h: vp.h });
    }
    expect(s).toEqual(start);
    expect(project(s).rects).toEqual(project(start).rects);
  });

  it('shows one window filled below 1000 and nothing on phone', () => {
    const s = fresh(VP_900);
    const p = project(s);
    expect(Object.keys(p.rects)).toEqual(['broker-1']);
    expect(p.rects['broker-1']).toEqual({ x: 8, y: 8, w: 900 - 16, h: workArea(VP_900, false).h - 16 });
    expect(Object.keys(project(fresh(VP_390)).rects)).toHaveLength(0);
  });

  it('shows the two windows on halves at 1000 (Broker and Wire), each exactly on its half', () => {
    const p = project(fresh(VP_1000));
    expect(Object.keys(p.rects).sort()).toEqual(['broker-1', 'wire'].sort());
    expect(p.rects['broker-1']).toEqual(slotRect('L2', VP_1000, false));
    expect(p.rects.wire).toEqual(slotRect('R2', VP_1000, false));
  });

  it('shows the Trade fallback at 1440 exactly on its halves: Broker left, Wire and Portfolio stacked right', () => {
    const p = project(fresh(VP_1440));
    expect(p.rects['broker-1']).toEqual(slotRect('L2', VP_1440, false));
    expect(p.rects.wire).toEqual(slotRect('TR', VP_1440, false));
    expect(p.rects.portfolio).toEqual(slotRect('BR', VP_1440, false));
  });

  it('refuses a non-positive viewport', () => {
    refused(fresh(), { type: 'viewport', w: 0, h: 800 }, 'bad-size');
    refused(fresh(), { type: 'viewport', w: NaN, h: 800 }, 'bad-size');
  });
});

// ---------------------------------------------------------------- layouts

describe('named layouts', () => {
  it('applies Trade on a wide screen and collapses windows the layout does not use', () => {
    let s = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    s = go(s, { type: 'applyLayout', name: 'trade', ticker: 'BRNT' });
    expect(s.wins.find((w) => w.app === 'calendar')!.state).toBe('collapsed');
    expect(s.wins.find((w) => w.app === 'broker')!.props).toEqual({ ticker: 'BRNT' });
    expect(focusedId(s)).toBe('broker-1');
  });

  it('refuses layouts below 1200 (V:42) and a missing custom layout', () => {
    refused(fresh(VP_1000), { type: 'applyLayout', name: 'trade' }, 'mode');
    refused(fresh(VP_1920), { type: 'applyLayout', name: 'mine' }, 'no-layout');
  });

  it('applies Trade without a ticker: the existing Broker is kept, not duplicated or blanked', () => {
    let s = go(fresh(VP_1920), { type: 'applyLayout', name: 'trade' });
    expect(brokers(s)).toHaveLength(1);
    expect(brokers(s)[0]!.props).toEqual({ ticker: 'HLCN' });
    s = go(s, { type: 'applyLayout', name: 'trade' });
    expect(brokers(s)).toHaveLength(1);
    expect(brokers(s)[0]!.props).toEqual({ ticker: 'HLCN' });
    expect(brokers(s)[0]!.state).toBe('open');
  });

  it('at the Broker cap, a Trade without a ticker keeps every ticker and does not collapse a Broker', () => {
    let s = fresh(VP_1920);
    for (const t of ['AAA', 'BBB', 'CCC']) s = go(s, { type: 'open', app: 'broker', props: { ticker: t } });
    const before = brokers(s).map((w) => [w.id, w.props.ticker]).sort();
    s = go(s, { type: 'applyLayout', name: 'trade' });
    expect(brokers(s)).toHaveLength(4);
    expect(brokers(s).map((w) => [w.id, w.props.ticker]).sort()).toEqual(before);
    // The layout's Broker is the top-most one on this workspace; the others go to the shelf.
    const open = brokers(s).filter((w) => w.state === 'open');
    expect(open).toHaveLength(1);
    expect(focusedId(s)).toBe(open[0]!.id);
  });

  it('applies Review as one Portfolio on the left and the Wire on the right, even with the journal view built (UX stage 2)', () => {
    const s = go(fresh(VP_1920), { type: 'applyLayout', name: 'review' });
    expect(s.wins.filter((w) => w.app === 'portfolio').map((w) => w.id)).toEqual(['portfolio']);
    expect(s.wins.find((w) => w.id === 'portfolio')!.slot).toBe('L2');
    expect(s.wins.find((w) => w.app === 'wire')!.slot).toBe('R2');
    expect(s.wins.some((w) => w.id === 'portfolio-2')).toBe(false);
  });

  it('applies Review after the Portfolio was closed: a plain Portfolio on the left and the Wire on the right', () => {
    let s = go(fresh(VP_1920), { type: 'close', id: 'portfolio' });
    s = go(s, { type: 'applyLayout', name: 'review' });
    const pf = s.wins.find((w) => w.id === 'portfolio')!;
    expect(pf.slot).toBe('L2');
    expect(pf.props).toEqual({});
    expect(s.wins.some((w) => w.id === 'portfolio-2')).toBe(false);
  });

  it('a user open of Portfolio opens the one Portfolio window again after Review closed it (the shelf never opens a second)', () => {
    let s = go(fresh(VP_1920), { type: 'applyLayout', name: 'review' });
    s = go(s, { type: 'close', id: 'portfolio' });
    s = go(s, { type: 'open', app: 'portfolio' });
    expect(s.wins.filter((w) => w.app === 'portfolio').map((w) => w.id)).toEqual(['portfolio']);
    expect(focusedId(s)).toBe('portfolio');
  });

  it('applies the Research layout with the open Research file, and without one skips the slot', () => {
    const none = go(fresh(VP_1920), { type: 'applyLayout', name: 'research' });
    expect(none.wins.some((w) => w.app === 'research')).toBe(false);
    expect(none.wins.find((w) => w.app === 'broker')!.slot).toBe('L23');
    let s = go(fresh(VP_1920), { type: 'open', app: 'research', props: { fileId: 'f7' } });
    s = go(s, { type: 'applyLayout', name: 'research' });
    expect(s.wins.find((w) => w.app === 'research')).toMatchObject({ id: 'research-f7', slot: 'L23', props: { fileId: 'f7' } });
    expect(focusedId(s)).toBe('research-f7');
  });

  it('opens the Research Desk as one window, and each file as its own window (Velvet: one per file)', () => {
    let s = go(fresh(VP_1920), { type: 'open', app: 'research' });
    expect(s.wins.filter((w) => w.app === 'research').map((w) => w.id)).toEqual(['research']);
    s = go(s, { type: 'open', app: 'research', props: {} });
    expect(s.wins.filter((w) => w.app === 'research')).toHaveLength(1);
    s = go(s, { type: 'open', app: 'research', props: { fileId: 'f1' } });
    expect(s.wins.filter((w) => w.app === 'research').map((w) => w.id).sort()).toEqual(['research', 'research-f1']);
    expect(focusedId(s)).toBe('research-f1');
  });

  it('applies a locked research layout by skipping the locked slot, not by refusing (C-25)', () => {
    const s = fresh(VP_1920, R0);
    const after = go(s, { type: 'applyLayout', name: 'research', ticker: 'BRNT' }, R0);
    expect(after.wins.some((w) => w.app === 'research')).toBe(false);
    expect(after.wins.find((w) => w.app === 'broker')!.slot).toBe('L23');
  });

  it('saves a custom layout, applies it back, and caps the count at five', () => {
    let s = go(fresh(VP_1920), { type: 'open', app: 'calendar' });
    s = go(s, { type: 'snap', id: 'calendar', slot: 'R3' });
    s = go(s, { type: 'saveLayout', name: 'mine' });
    expect(s.layouts[0]!.name).toBe('mine');
    s = go(s, { type: 'collapse', id: 'calendar' });
    s = go(s, { type: 'applyLayout', name: 'mine' });
    expect(s.wins.find((w) => w.app === 'calendar')!.state).toBe('open');
    expect(s.wins.find((w) => w.app === 'calendar')!.slot).toBe('R3');
    for (const n of ['a', 'b', 'c', 'd']) s = go(s, { type: 'saveLayout', name: n });
    expect(s.layouts).toHaveLength(5);
    refused(s, { type: 'saveLayout', name: 'overflow' }, 'layout-cap');
    refused(s, { type: 'saveLayout', name: 'Trade' }, 'reserved');
    refused(s, { type: 'saveLayout', name: '   ' }, 'bad-name');
  });

  it('keeps the shelf order with Broker first and refuses a bad order', () => {
    const s = fresh();
    const rest = s.shelf.slice(1).reverse();
    expect(go(s, { type: 'reorderShelf', order: ['broker', ...rest] }).shelf[0]).toBe('broker');
    refused(s, { type: 'reorderShelf', order: [...rest, 'broker'] }, 'broker-first');
    refused(s, { type: 'reorderShelf', order: ['broker'] }, 'bad-order');
  });
});

// ---------------------------------------------------------------- property runs

describe('reducer properties (seeded)', () => {
  const VPS = [VP_1440, VP_1920, VP_1000, VP_900, VP_390, { w: 1199, h: 800 }];
  const APP_POOL = APP_IDS.filter((a) => APPS[a].available);
  const SLOTS = SLOT_NAMES;

  /** The window an accepted action raises to the top, or null. */
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

  function randomAction(rnd: () => number, s: ShellState): WmAction {
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
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
            : app === 'portfolio' && rnd() < 0.3
              ? { view: 'journal' }
              : undefined;
      return { type: 'open', app, props };
    }
    if (roll < 0.24) return { type: 'focus', id };
    if (roll < 0.3) return { type: 'close', id, force: rnd() < 0.5 };
    if (roll < 0.34) return { type: 'collapse', id };
    if (roll < 0.38) return { type: 'restore', id };
    if (roll < 0.42) return { type: 'fill', id };
    if (roll < 0.5) return { type: 'snap', id, slot: pick(SLOTS) };
    if (roll < 0.56) return { type: 'snapCycle', id, dir: pick(['left', 'right', 'up', 'down'] as const) };
    if (roll < 0.6) return { type: 'unsnap', id };
    if (roll < 0.66) {
      return { type: 'move', id, rect: { x: Math.floor(rnd() * 1500) - 100, y: Math.floor(rnd() * 900) - 50, w: 400 + Math.floor(rnd() * 300), h: 300 + Math.floor(rnd() * 300) } };
    }
    if (roll < 0.7) return { type: 'resize', id, rect: { x: 0, y: 0, w: 300 + Math.floor(rnd() * 900), h: 200 + Math.floor(rnd() * 700) } };
    if (roll < 0.73) return { type: 'switchWs', ws: Math.floor(rnd() * 4) };
    if (roll < 0.76) return { type: 'moveToWs', id, ws: Math.floor(rnd() * 3) };
    if (roll < 0.79) return { type: 'focusMode', on: rnd() < 0.5 };
    if (roll < 0.83) return { type: 'viewport', ...pick(VPS) };
    if (roll < 0.87) return { type: 'applyLayout', name: pick(['trade', 'review', 'research']), ticker: rnd() < 0.5 ? undefined : 'HLCN' };
    if (roll < 0.9) return { type: 'saveLayout', name: pick(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']) };
    if (roll < 0.95) {
      const pair = s.wins.length >= 2 ? [s.wins[0]!.id, s.wins[1]!.id] : [id, id];
      return { type: 'splitEdge', a: pair[0]!, b: pair[1]!, axis: 'x', at: 0.3 + rnd() * 0.4 };
    }
    return { type: 'reorderShelf', order: [...s.shelf].reverse() };
  }

  it('keeps focus, caps, ids, work area and refusals consistent over 300 random runs', () => {
    const ctxs: WmCtx[] = [R0, R1, R2, R3];
    let accepted = 0;
    let refusedCount = 0;
    for (let run = 0; run < 300; run++) {
      const rnd = rng(1000 + run);
      const ctx = ctxs[run % ctxs.length]!;
      let s = deepFreeze(initialShell(VP_1440, ctx, 'HLCN'));
      for (let step = 0; step < 40; step++) {
        const action = randomAction(rnd, s);
        const before = JSON.stringify(s);
        const r = reduce(s, action, ctx);
        if (!r.ok) {
          refusedCount++;
          expect(JSON.stringify(s), `refusal changed state: ${action.type}`).toBe(before);
          continue;
        }
        accepted++;
        s = deepFreeze(r.state);
        assertInvariants(s, ctx);
        // What each accepted action must leave on top, read from the action itself rather than
        // from the rule in focusedId: a window the action raised is focused when it is open on the
        // active workspace; a collapsed or closed window is no longer focused.
        const raised = raisedBy(action);
        if (raised !== null) {
          const w = s.wins.find((x) => x.id === raised);
          if (w && w.state === 'open' && w.ws === s.activeWs) expect(focusedId(s), action.type).toBe(raised);
        }
        if (action.type === 'collapse' || action.type === 'close') {
          expect(focusedId(s), action.type).not.toBe(action.id);
        }
        if (action.type === 'open' && !['broker', 'research', 'portfolio'].includes(action.app)) {
          expect(focusedId(s), 'open').toBe(action.app);
        }
      }
    }
    expect(accepted).toBeGreaterThan(1000);
    expect(refusedCount).toBeGreaterThan(100);
  }, 30_000); // 300 seeded runs: the default 5 s is too tight on a loaded machine
});

// ---------------------------------------------------------------- snapshot helpers

describe('rect helpers', () => {
  it('reads the slot rect used in the projection at 1920 x 1080', () => {
    const s = fresh(VP_1920);
    const p = project(s);
    expect(p.rects['broker-1']).toEqual(slotRect('L23', VP_1920, false));
    expect(p.rects.wire).toEqual(slotRect('R3T', VP_1920, false));
    expect(p.rects.portfolio).toEqual(slotRect('R3B', VP_1920, false));
  });

  it('keeps each Rect typed with integer px at the default sizes', () => {
    const s = fresh(VP_1440);
    for (const r of Object.values(project(s).rects) as Rect[]) {
      expect(Number.isInteger(r.x) && Number.isInteger(r.w) && Number.isInteger(r.y) && Number.isInteger(r.h)).toBe(true);
    }
  });
});

describe('six windows on a workspace never cascade over each other (UX stage 6)', () => {
  it('on News at 1440, six opens leave the open windows tiled with no two overlapping; the rest collapse to the shelf', () => {
    let s = go(emptyShell(VP_1440), { type: 'switchWs', ws: 1 }, R3);
    for (const app of ['wire', 'messages', 'portfolio', 'exchange', 'launchpad', 'calendar'] as const) {
      s = go(s, { type: 'open', app }, R3);
    }
    const open = s.wins.filter((w) => w.ws === s.activeWs && w.state === 'open');
    const wa = workArea(s.vp, false);
    const rects = project(s).rects;
    expect(open.length).toBeGreaterThanOrEqual(2);
    expect(open.length).toBeLessThanOrEqual(4);
    expect(s.wins.some((w) => w.state === 'collapsed')).toBe(true);
    for (const a of open) {
      for (const b of open) {
        if (a === b) continue;
        const ra = rects[a.id]!;
        const rb = rects[b.id]!;
        const overlap = ra.x < rb.x + rb.w && rb.x < ra.x + ra.w && ra.y < rb.y + rb.h && rb.y < ra.y + ra.h;
        expect(overlap, `${a.app} over ${b.app}`).toBe(false);
      }
      expect(rects[a.id]!.x + rects[a.id]!.w).toBeLessThanOrEqual(wa.w);
    }
  });
});
