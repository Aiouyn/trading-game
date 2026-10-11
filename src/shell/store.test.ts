import { describe, expect, it } from 'vitest';
import { makeWmCtx } from './ctx';
import { createShellStore } from './store';
import { initialShell, focusedId, type ShellState } from './wm';

const ctx = makeWmCtx('R3');
const shell0 = (): ShellState => initialShell({ w: 1920, h: 1080 }, ctx, 'HLCN');

describe('shell store', () => {
  it('applies an accepted action and reports it as settled', () => {
    const settled: ShellState[] = [];
    const store = createShellStore({ shell: shell0(), ctx }, { onSettled: (s) => settled.push(s) });
    const r = store.getState().dispatch({ type: 'open', app: 'ailab' });
    expect(r.ok).toBe(true);
    expect(focusedId(store.getState().shell)).toBe('ailab');
    expect(settled).toHaveLength(1);
  });

  it('leaves the state alone on a refusal and does not report it', () => {
    const settled: ShellState[] = [];
    const store = createShellStore({ shell: shell0(), ctx: makeWmCtx('R0') }, { onSettled: (s) => settled.push(s) });
    const before = store.getState().shell;
    const r = store.getState().dispatch({ type: 'open', app: 'research', props: { fileId: 'f1' } });
    expect(r).toEqual({ ok: false, reason: 'locked' });
    expect(store.getState().shell).toBe(before);
    expect(settled).toHaveLength(0);
  });

  it('does not persist intermediate pointer moves (settled: false)', () => {
    const settled: ShellState[] = [];
    const store = createShellStore({ shell: shell0(), ctx }, { onSettled: (s) => settled.push(s) });
    store.getState().dispatch({ type: 'open', app: 'calendar' });
    store.getState().dispatch({ type: 'move', id: 'calendar', rect: { x: 10, y: 10, w: 500, h: 400 } }, { settled: false });
    expect(settled).toHaveLength(1);
    expect(store.getState().shell.wins.find((w) => w.app === 'calendar')!.rect).toEqual({ x: 10, y: 10, w: 500, h: 400 });
  });

  it('replaces the context after a rank change, and replaces the state on load', () => {
    const store = createShellStore({ shell: shell0(), ctx });
    store.getState().setCtx(makeWmCtx('R0'));
    expect(store.getState().ctx.workspaces).toBe(2);
    const next = { ...shell0(), activeWs: 0 };
    store.getState().replace(next);
    expect(store.getState().shell).toBe(next);
  });
});
