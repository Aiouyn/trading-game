/* eslint-disable @typescript-eslint/no-explicit-any -- hostile payloads are deliberately malformed */
import { describe, expect, it } from 'vitest';
import { APPS } from './apps';
import { makeWmCtx } from './ctx';
import {
  LEGACY_PREFS_KEY,
  LEGACY_TOKEN_KEY,
  PREFS_KEY,
  TOKEN_KEY,
  type KeyValueStore,
  defaultPrefs,
  loadShell,
  migrateLegacy,
  readPrefs,
  readToken,
  saveShell,
  updatePrefs,
  validateShell,
} from './prefs';
import { type ShellState, initialShell, focusedId } from './wm';

class MemKV implements KeyValueStore {
  data = new Map<string, string>();
  writes: string[] = [];
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.writes.push(k);
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const VP = { w: 1440, h: 900 };
const R3 = makeWmCtx('R3');
const R1 = makeWmCtx('R1');

describe('tg-prefs read', () => {
  it('gives the defaults when nothing is stored', () => {
    expect(readPrefs(new MemKV())).toEqual(defaultPrefs());
  });

  it('gives the defaults for corrupt JSON, arrays, and an oversized value, without throwing', () => {
    for (const bad of ['{nope', '[1,2]', '"str"', 'x'.repeat(600 * 1024)]) {
      const kv = new MemKV();
      kv.setItem(PREFS_KEY, bad);
      expect(readPrefs(kv), bad.slice(0, 10)).toEqual(defaultPrefs());
    }
  });

  it('drops an unknown palette and keeps a valid one', () => {
    const kv = new MemKV();
    kv.setItem(PREFS_KEY, JSON.stringify({ palette: 'neon' }));
    expect(readPrefs(kv).palette).toBe('ink-brass');
    kv.setItem(PREFS_KEY, JSON.stringify({ palette: 'phosphor' }));
    expect(readPrefs(kv).palette).toBe('phosphor');
  });

  it('survives a storage that throws', () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readPrefs(throwing)).toEqual(defaultPrefs());
    expect(() => updatePrefs(throwing, (p) => p)).not.toThrow();
    expect(readToken(throwing)).toBeNull();
  });
});

describe('tg-prefs write', () => {
  it('keeps the lang key that i18n writes into the same object', () => {
    const kv = new MemKV();
    kv.setItem(PREFS_KEY, JSON.stringify({ lang: 'fr' }));
    updatePrefs(kv, (p) => ({ ...p, palette: 'riviera' }));
    const raw = JSON.parse(kv.getItem(PREFS_KEY)!);
    expect(raw.lang).toBe('fr');
    expect(raw.palette).toBe('riviera');
    expect(raw.v).toBe(1);
  });

  it('replaces a corrupt stored value on the next write', () => {
    const kv = new MemKV();
    kv.setItem(PREFS_KEY, '{broken');
    updatePrefs(kv, (p) => ({ ...p, reducedTransparency: true }));
    expect(readPrefs(kv).reducedTransparency).toBe(true);
  });
});

describe('shell per save', () => {
  const ctx = R3;
  const fresh = (): ShellState => initialShell(VP, ctx, 'HLCN');

  it('round-trips a shell through tg-prefs for the same save', () => {
    const kv = new MemKV();
    const s = fresh();
    saveShell(kv, 'save-a', s);
    expect(loadShell(kv, 'save-a', ctx, VP)).toEqual(s);
  });

  it('keeps each save separate', () => {
    const kv = new MemKV();
    saveShell(kv, 'save-a', initialShell(VP, ctx, 'HLCN'));
    saveShell(kv, 'save-b', initialShell(VP, ctx, 'BRNT'));
    expect(loadShell(kv, 'save-b', ctx, VP).wins.find((w) => w.app === 'broker')!.props).toEqual({ ticker: 'BRNT' });
  });

  it('gives the Trade layout for a save without a shell', () => {
    const kv = new MemKV();
    expect(loadShell(kv, 'never-saved', ctx, VP, 'HLCN')).toEqual(initialShell(VP, ctx, 'HLCN'));
  });

  it('only ever uses the two allowed keys', () => {
    const kv = new MemKV();
    saveShell(kv, 'save-a', fresh());
    updatePrefs(kv, (p) => ({ ...p, palette: 'broadsheet' }));
    kv.setItem(TOKEN_KEY, 't');
    expect([...kv.data.keys()].sort()).toEqual([PREFS_KEY, TOKEN_KEY].sort());
    for (const k of kv.writes) expect([PREFS_KEY, TOKEN_KEY]).toContain(k);
  });

  it('ignores a save id that is not a safe key', () => {
    const kv = new MemKV();
    saveShell(kv, '__proto__', fresh());
    expect(Object.keys(readPrefs(kv).shells)).toEqual([]);
  });
});

describe('shell validation (corrupt payloads)', () => {
  const ctx = R3;
  const check = (name: string, raw: unknown, c = ctx): ShellState => {
    const s = validateShell(raw, c, VP, 'HLCN');
    const brokers = s.wins.filter((w) => w.app === 'broker').length;
    expect(brokers, `${name}: broker cap`).toBeLessThanOrEqual(4);
    expect(new Set(s.wins.map((w) => w.id)).size, `${name}: unique ids`).toBe(s.wins.length);
    expect(s.activeWs, `${name}: activeWs`).toBeLessThan(c.workspaces);
    expect(s.wins.every((w) => c.unlocked(w.app)), `${name}: locked`).toBe(true);
    expect(s.wins.every((w) => APPS[w.app].available), `${name}: hidden`).toBe(true);
    expect(s.vp).toEqual(VP);
    expect(s.shelf[0], `${name}: shelf`).toBe('broker');
    return s;
  };
  const base = () => JSON.parse(JSON.stringify(initialShell(VP, ctx, 'HLCN')));

  it('falls back to the Trade layout for non-shell values', () => {
    for (const bad of [null, 'x', 7, [], { v: 2, wins: [] }, { v: 1, wins: 'nope' }]) {
      expect(validateShell(bad, ctx, VP, 'HLCN')).toEqual(initialShell(VP, ctx, 'HLCN'));
    }
  });

  it('survives twelve hostile payloads, each keeping the invariants', () => {
    const payloads: Array<[string, (s: any) => void]> = [
      ['bad type on rect', (s) => (s.wins[0].rect = 'big')],
      ['NaN rect', (s) => (s.wins[0].rect = { x: NaN, y: 0, w: 10, h: 10 })],
      ['unknown app', (s) => s.wins.push({ id: 'zz', app: 'nope', ws: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, slot: null, state: 'open', filled: false, props: {} })],
      ['duplicate ids', (s) => s.wins.push({ ...s.wins[0] })],
      ['fifty brokers', (s) => { for (let i = 0; i < 50; i++) s.wins.push({ id: `broker-x${i}`, app: 'broker', ws: 0, rect: { x: 0, y: 0, w: 500, h: 500 }, slot: null, state: 'open', filled: false, props: { ticker: `T${i}` } }); }],
      ['activeWs nine', (s) => (s.activeWs = 9)],
      ['bad custom slot', (s) => (s.wins[0].slot = { custom: { x0: 0.9, y0: 0, x1: 0.1, y1: 1 } })],
      ['garbage slot name', (s) => (s.wins[0].slot = 'ZZ')],
      ['shelf garbage', (s) => (s.shelf = [1, 'nope', 'exchange', 'broker', 'broker'])],
      ['focus restore garbage', (s) => { s.focusMode = true; s.focusRestore = { 'broker-1': 'x', constructor: 3 }; }],
      ['five MB string in look', (s) => (s.look = 'x'.repeat(5 * 1024 * 1024))],
    ];
    for (const [name, mutate] of payloads) {
      const raw = base();
      mutate(raw);
      check(name, raw);
    }
  });

  it('drops a locked window from a save at a lower rank (Research below R3)', () => {
    const raw = base();
    raw.wins.push({ id: 'research-f1', app: 'research', ws: 0, rect: { x: 0, y: 0, w: 500, h: 400 }, slot: null, state: 'open', filled: false, props: { fileId: 'f1' } });
    const s = check('locked at R1', raw, R1);
    expect(s.wins.some((w) => w.app === 'research')).toBe(false);
  });

  it('drops a layout whose name is a built-in, and keeps a valid one', () => {
    const raw = base();
    raw.layouts = [
      { name: 'Trade', wins: [{ app: 'wire', slot: 'R2', rect: { x: 0, y: 0, w: 1, h: 1 }, props: {} }] },
      { name: 'mine', wins: [{ app: 'wire', slot: 'R2', rect: { x: 0, y: 0, w: 1, h: 1 }, props: {} }] },
    ];
    const s = check('layouts', raw);
    expect(s.layouts.map((l) => l.name)).toEqual(['mine']);
  });

  it('keeps a valid focus snapshot only while focus mode is on', () => {
    const raw = base();
    raw.focusMode = true;
    raw.focusRestore = { 'broker-1': { rect: { x: 1, y: 2, w: 500, h: 500 }, slot: 'L2', filled: false } };
    const s = check('focus', raw);
    expect(s.focusRestore).toEqual({ 'broker-1': { rect: { x: 1, y: 2, w: 500, h: 500 }, slot: 'L2', filled: false } });
    raw.focusMode = false;
    expect(check('focus off', raw).focusRestore).toBeNull();
  });

  it('moves a window off a workspace the rank no longer has and clamps activeWs', () => {
    const raw = base();
    raw.wins.push({ id: 'calendar', app: 'calendar', ws: 2, rect: { x: 0, y: 0, w: 500, h: 400 }, slot: null, state: 'open', filled: false, props: {} });
    raw.activeWs = 2;
    const s = check('lower rank', raw, R1);
    expect(s.wins.find((w) => w.id === 'calendar')!.ws).toBe(0);
    expect(s.activeWs).toBe(0);
  });

  it('a valid stored shell keeps its top window focused', () => {
    const raw = base();
    const s = check('stored', raw);
    expect(focusedId(s)).toBe(s.wins[s.wins.length - 1]!.id);
  });
});

describe('legacy migration', () => {
  it('moves tycoon.token to tg-token and removes the old key', () => {
    const kv = new MemKV();
    kv.setItem(LEGACY_TOKEN_KEY, 'abc');
    expect(migrateLegacy(kv)).toEqual(['token']);
    expect(readToken(kv)).toBe('abc');
    expect(kv.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it('keeps a token already stored under tg-token', () => {
    const kv = new MemKV();
    kv.setItem(TOKEN_KEY, 'new');
    kv.setItem(LEGACY_TOKEN_KEY, 'old');
    migrateLegacy(kv);
    expect(readToken(kv)).toBe('new');
    expect(kv.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it('moves tycoon.prefs (chart settings and last ticker) into tg-prefs, then removes it', () => {
    const kv = new MemKV();
    kv.setItem(LEGACY_PREFS_KEY, JSON.stringify({ indicators: ['ma', 'rsi'], range: '1M', chartMode: 'candle', selected: 'brnt' }));
    expect(migrateLegacy(kv)).toEqual(['prefs']);
    const p = readPrefs(kv);
    expect(p.chart).toEqual({ indicators: ['ma', 'rsi'], range: '1M', chartMode: 'candle' });
    expect(p.lastTicker).toBe('BRNT');
    expect(kv.getItem(LEGACY_PREFS_KEY)).toBeNull();
  });

  it('is a no-op the second time, and tolerates a corrupt old prefs value', () => {
    const kv = new MemKV();
    kv.setItem(LEGACY_PREFS_KEY, '{oops');
    expect(migrateLegacy(kv)).toEqual(['prefs']);
    expect(migrateLegacy(kv)).toEqual([]);
  });
});
