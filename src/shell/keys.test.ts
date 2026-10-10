import { describe, expect, it } from 'vitest';
import type { AppId } from './apps';
import { type KeyEnv, type KeyEvt, SHORTCUTS, keyIntent } from './keys';

const SHELF: AppId[] = ['broker', 'portfolio', 'wire', 'messages', 'calendar'];

const env = (over: Partial<KeyEnv> = {}): KeyEnv => ({
  focused: 'broker-1',
  shelf: SHELF,
  activeWs: 0,
  workspaces: 3,
  textField: false,
  ...over,
});

/** A key event from its code and the modifiers held. */
const key = (code: string, mods: Partial<Pick<KeyEvt, 'ctrl' | 'shift' | 'alt' | 'meta'>> = {}): KeyEvt => ({
  code,
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
  ...mods,
});

describe('keyboard bindings (section I)', () => {
  it('Ctrl K opens the launcher and Escape is an escape intent', () => {
    expect(keyIntent(key('KeyK', { ctrl: true }), env())).toEqual({ kind: 'launcher' });
    expect(keyIntent(key('Escape'), env())).toEqual({ kind: 'escape' });
  });

  it('Ctrl . toggles focus mode on the active workspace', () => {
    expect(keyIntent(key('Period', { ctrl: true }), env())).toEqual({ kind: 'wm', action: { type: 'toggleFocusMode' } });
  });

  it('Ctrl M collapses the focused window, and does nothing with no focus', () => {
    expect(keyIntent(key('KeyM', { ctrl: true }), env())).toEqual({ kind: 'wm', action: { type: 'collapse', id: 'broker-1' } });
    expect(keyIntent(key('KeyM', { ctrl: true }), env({ focused: null }))).toBeNull();
  });

  it('Ctrl Shift Arrow snaps the focused window in that direction (DECISIONS: not Ctrl Alt)', () => {
    const dirs: Array<[string, string]> = [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowUp', 'up'], ['ArrowDown', 'down']];
    for (const [code, dir] of dirs) {
      expect(keyIntent(key(code, { ctrl: true, shift: true }), env())).toEqual({
        kind: 'wm',
        action: { type: 'snapCycle', id: 'broker-1', dir },
      });
    }
    expect(keyIntent(key('ArrowLeft', { ctrl: true, shift: true }), env({ focused: null }))).toBeNull();
  });

  it('Ctrl Alt Left and Right switch workspace inside the range, and do nothing past the ends', () => {
    expect(keyIntent(key('ArrowRight', { ctrl: true, alt: true }), env())).toEqual({ kind: 'wm', action: { type: 'switchWs', ws: 1 } });
    expect(keyIntent(key('ArrowLeft', { ctrl: true, alt: true }), env({ activeWs: 1 }))).toEqual({ kind: 'wm', action: { type: 'switchWs', ws: 0 } });
    expect(keyIntent(key('ArrowLeft', { ctrl: true, alt: true }), env())).toBeNull();
    expect(keyIntent(key('ArrowRight', { ctrl: true, alt: true }), env({ activeWs: 2 }))).toBeNull();
  });

  it('Alt Digit n opens the n-th shelf tile, by event.code so AZERTY works', () => {
    expect(keyIntent(key('Digit2', { alt: true }), env())).toEqual({ kind: 'wm', action: { type: 'open', app: 'portfolio' } });
    // key would be "é" on AZERTY for Digit2; the binding reads code only, so the result is the same.
    expect(keyIntent(key('Digit5', { alt: true }), env())).toEqual({ kind: 'wm', action: { type: 'open', app: 'calendar' } });
    expect(keyIntent(key('Digit9', { alt: true }), env())).toBeNull();
    expect(keyIntent(key('Digit0', { alt: true }), env())).toBeNull();
  });

  it('Alt N opens a new Broker', () => {
    expect(keyIntent(key('KeyN', { alt: true }), env())).toEqual({ kind: 'wm', action: { type: 'open', app: 'broker' } });
  });

  it('binds nothing a browser tab or the OS owns (P2-103, C-17)', () => {
    const never: KeyEvt[] = [
      key('KeyD', { alt: true }),
      key('KeyE', { alt: true }),
      key('KeyF', { alt: true }),
      key('F10'),
      key('KeyL', { ctrl: true }),
      key('F5'),
      key('KeyT', { ctrl: true }),
      key('KeyN', { ctrl: true }),
      key('KeyN', { ctrl: true, shift: true }),
      key('KeyW', { ctrl: true }),
      key('Tab', { ctrl: true }),
      key('KeyK', { meta: true, ctrl: true }),
    ];
    for (const e of never) expect(keyIntent(e, env()), `${e.code} ctrl=${e.ctrl} alt=${e.alt}`).toBeNull();
  });

  it('in a text field only Escape is bound (P2-101, P2-107)', () => {
    const typing = env({ textField: true });
    expect(keyIntent(key('ArrowLeft', { ctrl: true }), typing)).toBeNull();
    expect(keyIntent(key('KeyK', { ctrl: true }), typing)).toBeNull();
    expect(keyIntent(key('Escape'), typing)).toEqual({ kind: 'escape' });
  });

  it('the shortcut list for Settings names every binding once', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SHORTCUTS.map((s) => s.keys)).toContain('Ctrl Shift Arrow');
  });
});
