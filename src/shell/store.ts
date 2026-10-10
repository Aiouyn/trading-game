/**
 * Shell store (F:17, P2-006): a small zustand store around the pure reducer. It holds the
 * ShellState and the reducer context, dispatches actions, and reports settled changes so the
 * caller can persist them (P2-125: one write per settled change, never on pointer moves).
 * No React components here.
 */

import { create } from 'zustand';
import { type ShellState, type WmAction, type WmCtx, type WmResult, reduce } from './wm';

export interface ShellStore {
  shell: ShellState;
  ctx: WmCtx;
  /**
   * Applies an action. A refusal returns { ok: false } and leaves the state alone. `settled`
   * defaults to true. Pass false for intermediate pointer moves so they are not persisted.
   */
  dispatch: (action: WmAction, opts?: { settled?: boolean }) => WmResult;
  /** New context after the earned rank changes. The shell is not reshaped until normalize runs. */
  setCtx: (ctx: WmCtx) => void;
  /** Replaces the state, for example after loadShell. Does not persist. */
  replace: (shell: ShellState) => void;
}

export interface ShellStoreOptions {
  /** Called with the new state after every settled, accepted change. */
  onSettled?: (shell: ShellState) => void;
}

export function createShellStore(init: { shell: ShellState; ctx: WmCtx }, opts: ShellStoreOptions = {}) {
  return create<ShellStore>()((set, get) => ({
    shell: init.shell,
    ctx: init.ctx,
    dispatch: (action, o) => {
      const r = reduce(get().shell, action, get().ctx);
      if (!r.ok) return r;
      set({ shell: r.state });
      if ((o?.settled ?? true) && opts.onSettled) opts.onSettled(r.state);
      return r;
    },
    setCtx: (ctx) => set({ ctx }),
    replace: (shell) => set({ shell }),
  }));
}
